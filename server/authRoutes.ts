import { Router, type Request } from 'express';
import { z } from 'zod';
import { fromError } from 'zod-validation-error';
import { ethers } from 'ethers';
import crypto from 'crypto';
import {
  createUser,
  findUserByEmail,
  verifyPassword,
  hashPassword,
  generateToken,
  findUserById,
  authenticateToken,
  AuthRequest,
  findOrCreateUserByWallet,
  updateUserRole
} from './auth';
import { db } from './db';
import { nonces } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { storage } from './storage';
import { emailService } from './utils/emailMock';
import { isSupabaseConfigured, getSupabaseClient } from './db/supabase';

const router = Router();
const EMAIL_VERIFY_TOKEN_PREFIX = "email_verify_token:";
const EMAIL_VERIFIED_PREFIX = "email_verified:";
const EMAIL_VERIFY_TTL_MS = 1000 * 60 * 60 * 24; // 24h

// Validation schemas
const registerSchema = z.object({
  email: z.string()
    .min(1, 'Email is required')
    .refine((email) => email.includes('@'), 'Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  // Role is optional - defaults to USER if not provided.
  // Accept both legacy uppercase and UI lowercase values.
  role: z
    .enum([
      'USER',
      'ADMIN',
      'SUPER_ADMIN',
      'BROKER',
      'farmer',
      'trader',
      'broker',
      'admin',
      'super_admin',
      'user',
    ])
    .optional(),
});

const loginSchema = z.object({
  email: z.string()
    .min(1, 'Email is required')
    .refine((email) => email.includes('@'), 'Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

const resendVerificationSchema = z.object({
  email: z.string()
    .min(1, 'Email is required')
    .refine((email) => email.includes('@'), 'Invalid email format'),
});

function emailVerifyTokenKey(token: string): string {
  return `${EMAIL_VERIFY_TOKEN_PREFIX}${token}`;
}

function emailVerifiedKey(userId: string): string {
  return `${EMAIL_VERIFIED_PREFIX}${userId}`;
}

function getBaseUrl(req: Request): string {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/+$/, "");
  }
  const protocol = req.protocol || "http";
  const host = req.get("host") || "localhost:5000";
  return `${protocol}://${host}`;
}

async function isEmailVerified(userId: string): Promise<boolean> {
  const setting = await storage.getAppSetting(emailVerifiedKey(userId));
  // Backward compatibility: if no setting exists, treat as verified.
  if (!setting) return true;
  return setting.value === "true";
}

async function queueVerificationEmail(userId: string, email: string, baseUrl: string): Promise<void> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + EMAIL_VERIFY_TTL_MS).toISOString();

  await storage.upsertAppSetting(
    emailVerifyTokenKey(token),
    JSON.stringify({ userId, email, expiresAt, usedAt: null })
  );
  await storage.upsertAppSetting(emailVerifiedKey(userId), "false");

  const verifyLink = `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  await emailService.sendEmail(
    email,
    "Cropto: verify your email",
    `Please verify your email by clicking this link:\n\n${verifyLink}\n\nThis link expires in 24 hours.\nIf you did not create this account, you can ignore this email.`
  );
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const validatedData = registerSchema.parse(req.body);

    // Normalize incoming role to current backend role model.
    // We keep FARMER/TRADER as USER for now and preserve BROKER.
    const normalizeIncomingRole = (role?: string): 'USER' | 'ADMIN' | 'SUPER_ADMIN' | 'BROKER' => {
      const raw = (role || 'USER').toLowerCase();
      if (raw === 'broker') return 'BROKER';
      if (raw === 'admin') return 'ADMIN';
      if (raw === 'super_admin') return 'SUPER_ADMIN';
      if (raw === 'farmer' || raw === 'trader' || raw === 'user') return 'USER';
      return 'USER';
    };

    const normalizedRole = normalizeIncomingRole(validatedData.role);
    const user = await createUser(
      validatedData.email,
      validatedData.password,
      normalizedRole // Default to USER role
    );

    try {
      await queueVerificationEmail(user.id, user.email, getBaseUrl(req));
    } catch (emailError) {
      console.error("[Register] failed to send verification email:", emailError);
    }
    
    res.status(201).json({
      message: "Account created. Please verify your email before login.",
      requiresEmailVerification: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        walletAddress: user.walletAddress,
        network: user.network,
      },
    });
  } catch (error) {
    console.error("[REGISTER_ERROR]", error);
    if (error instanceof z.ZodError) {
      const validationError = fromError(error);
      return res.status(400).json({ error: validationError.message });
    }
    
    if (error instanceof Error && error.message === 'User already exists') {
      return res.status(409).json({ error: 'User already exists' });
    }
    
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    // Log Supabase env variables status (keys only, no values)
    const supabaseEnvKeys = [];
    if (process.env.SUPABASE_URL) supabaseEnvKeys.push('SUPABASE_URL');
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) supabaseEnvKeys.push('SUPABASE_SERVICE_ROLE_KEY');
    if (process.env.SUPABASE_ANON_KEY) supabaseEnvKeys.push('SUPABASE_ANON_KEY');
    console.log(`[AUTH] Supabase env keys present: ${supabaseEnvKeys.length > 0 ? supabaseEnvKeys.join(', ') : 'none'}`);
    
    const validatedData = loginSchema.parse(req.body);
    
    const user = await findUserByEmail(validatedData.email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const isValidPassword = await verifyPassword(validatedData.password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const verified = await isEmailVerified(user.id);
    if (!verified) {
      return res.status(403).json({ error: "Email not verified. Please check your inbox and confirm your email." });
    }
    
    const token = generateToken(user.id, user.email, user.role);
    
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        walletAddress: user.walletAddress,
        network: user.network,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = fromError(error);
      return res.status(400).json({ error: validationError.message });
    }
    
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/status - public minimal auth/backend status (no secrets)
router.get("/status", async (_req, res) => {
  const allowAnonFallback = process.env.ALLOW_SUPABASE_ANON_BACKEND === "true";
  res.json({
    supabase: {
      configured: isSupabaseConfigured(),
      hasUrl: Boolean(process.env.SUPABASE_URL),
      hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      allowAnonFallback,
      hasAnonKey: Boolean(process.env.SUPABASE_ANON_KEY),
    },
    emailVerification: {
      enabled: true,
      ttlHours: Math.floor(EMAIL_VERIFY_TTL_MS / (1000 * 60 * 60)),
    },
  });
});

// POST /api/auth/bootstrap-admin - emergency admin account upsert (requires env secret)
router.post("/bootstrap-admin", async (req, res) => {
  const secret = process.env.ADMIN_BOOTSTRAP_SECRET;
  if (!secret) return res.status(404).json({ error: "Not found" });
  const header = String(req.headers["x-bootstrap-secret"] || "");
  if (header !== secret) return res.status(403).json({ error: "Forbidden" });

  const schema = z.object({
    email: z.string().min(1).refine((e) => e.includes("@")),
    password: z.string().min(6),
    role: z.enum(["USER", "ADMIN", "SUPER_ADMIN", "BROKER"]).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  if (!isSupabaseConfigured()) return res.status(500).json({ error: "Supabase is not configured" });

  const email = parsed.data.email.trim().toLowerCase();
  const role = parsed.data.role || "BROKER";

  try {
    const passwordHash = await hashPassword(parsed.data.password);
    const client = getSupabaseClient();

    const { data: existing } = await client.from("users").select("*").ilike("email", email).limit(1);
    if (existing && existing.length > 0) {
      await client.from("users").update({ password_hash: passwordHash, role } as any).ilike("email", email);
    } else {
      await client.from("users").insert({
        id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        email,
        password_hash: passwordHash,
        role,
        created_at: new Date().toISOString(),
      } as any);
    }

    return res.json({ ok: true, email, role });
  } catch (error: any) {
    console.error("[bootstrap-admin] failed:", error?.message || error);
    return res.status(500).json({ error: error?.message || "Failed to bootstrap admin" });
  }
});

router.get("/verify-email", async (req, res) => {
  try {
    const token = String(req.query.token || "").trim();
    if (!token) {
      return res.status(400).send("Verification token is required.");
    }

    const tokenRecord = await storage.getAppSetting(emailVerifyTokenKey(token));
    if (!tokenRecord) {
      return res.status(400).send("Invalid or expired verification token.");
    }

    let payload: { userId: string; email: string; expiresAt: string; usedAt?: string | null };
    try {
      payload = JSON.parse(tokenRecord.value);
    } catch {
      return res.status(400).send("Invalid verification token payload.");
    }

    if (payload.usedAt) {
      return res.status(400).send("This verification link has already been used.");
    }
    if (Date.now() > new Date(payload.expiresAt).getTime()) {
      return res.status(400).send("Verification link expired. Request a new one.");
    }

    const user = await findUserById(payload.userId);
    if (!user || user.email.toLowerCase() !== payload.email.toLowerCase()) {
      return res.status(400).send("Invalid verification token.");
    }

    await storage.upsertAppSetting(emailVerifiedKey(payload.userId), "true");
    await storage.upsertAppSetting(
      emailVerifyTokenKey(token),
      JSON.stringify({ ...payload, usedAt: new Date().toISOString() })
    );

    const loginUrl = `${process.env.APP_BASE_URL || "http://localhost:5173"}/login?verified=success`;
    return res.status(200).send(`
<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Email verified</title></head>
  <body style="font-family: sans-serif; padding: 24px;">
    <h2>Email verified successfully.</h2>
    <p>You can now log in to Cropto.</p>
    <a href="${loginUrl}">Go to login</a>
  </body>
</html>`);
  } catch (error) {
    console.error("Verify email error:", error);
    return res.status(500).send("Failed to verify email.");
  }
});

router.post("/resend-verification", async (req, res) => {
  try {
    const parsed = resendVerificationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request payload" });
    }

    const email = parsed.data.email.toLowerCase().trim();
    const user = await findUserByEmail(email);
    if (!user) {
      return res.json({ message: "If this account exists, a verification email has been sent." });
    }

    const verified = await isEmailVerified(user.id);
    if (verified) {
      return res.json({ message: "Email is already verified." });
    }

    try {
      await queueVerificationEmail(user.id, user.email, getBaseUrl(req));
    } catch (emailError) {
      console.error("[ResendVerification] failed to send verification email:", emailError);
    }

    return res.json({ message: "If this account exists, a verification email has been sent." });
  } catch (error) {
    console.error("Resend verification error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const user = await findUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        walletAddress: user.walletAddress,
        network: user.network,
      },
    });
  } catch (error) {
    console.error('Me error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/nonce - Generate nonce for wallet signature
router.get('/nonce', async (req, res) => {
  try {
    const { address } = req.query;
    
    if (!address || typeof address !== 'string') {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    const walletAddress = address.toLowerCase();
    
    // Generate new nonce
    const nonceValue = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Upsert nonce
    await db.delete(nonces).where(eq(nonces.walletAddress, walletAddress));
    await db.insert(nonces).values({
      walletAddress,
      nonce: nonceValue,
      expiresAt,
    });

    res.json({ nonce: nonceValue });
  } catch (error) {
    console.error('Nonce generation error:', error);
    res.status(500).json({ error: 'Failed to generate nonce' });
  }
});

// POST /api/auth/wallet-login - Verify signature and log in with wallet
router.post('/wallet-login', async (req, res) => {
  try {
    const { address, signature, message } = req.body;
    
    if (!address || !signature || !message) {
      return res.status(400).json({ error: 'Address, signature, and message are required' });
    }

    const walletAddress = address.toLowerCase();

    // 1. Get stored nonce
    const [storedNonce] = await db.select()
      .from(nonces)
      .where(eq(nonces.walletAddress, walletAddress))
      .limit(1);

    if (!storedNonce) {
      return res.status(400).json({ error: 'No nonce found. Please request a new nonce.' });
    }

    // 2. Check nonce expiry
    if (new Date() > storedNonce.expiresAt) {
      await db.delete(nonces).where(eq(nonces.walletAddress, walletAddress));
      return res.status(400).json({ error: 'Nonce expired. Please request a new nonce.' });
    }

    // 3. Verify nonce in message
    if (!message.includes(storedNonce.nonce)) {
      return res.status(400).json({ error: 'Invalid message format' });
    }

    // 4. Verify signature using ethers
    let recoveredAddress: string;
    try {
      recoveredAddress = ethers.verifyMessage(message, signature);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    if (recoveredAddress.toLowerCase() !== walletAddress) {
      return res.status(401).json({ error: 'Signature verification failed' });
    }

    // 5. Delete used nonce (one-time use)
    await db.delete(nonces).where(eq(nonces.walletAddress, walletAddress));

    // 6. Find or create user
    const { user, isNewUser } = await findOrCreateUserByWallet(walletAddress);

    // 7. Generate JWT
    const token = generateToken(user.id, user.email, user.role);

    res.json({
      token,
      new_user: isNewUser,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        walletAddress: user.walletAddress,
        network: user.network,
      },
    });
  } catch (error) {
    console.error('Wallet login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/auth/update-role - Update user role (onboarding)
router.put('/update-role', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const roleSchema = z.object({
      // Accept UI role values and map to backend role model.
      role: z.enum([
        'USER',
        'ADMIN',
        'SUPER_ADMIN',
        'BROKER',
        'farmer',
        'trader',
        'broker',
        'admin',
        'super_admin',
        'user',
      ], {
        errorMap: () => ({ message: 'Role must be one of USER, ADMIN, SUPER_ADMIN, BROKER, farmer, trader, broker' }),
      }),
    });

    const validatedData = roleSchema.parse(req.body);
    const normalizedRole = (() => {
      const raw = (validatedData.role || 'USER').toLowerCase();
      if (raw === 'broker') return 'BROKER' as const;
      if (raw === 'admin') return 'ADMIN' as const;
      if (raw === 'super_admin') return 'SUPER_ADMIN' as const;
      return 'USER' as const;
    })();
    const updatedUser = await updateUserRole(req.user.id, normalizedRole);

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        role: updatedUser.role,
        createdAt: updatedUser.createdAt,
        walletAddress: updatedUser.walletAddress,
        network: updatedUser.network,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = fromError(error);
      return res.status(400).json({ error: validationError.message });
    }
    
    console.error('Update role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
