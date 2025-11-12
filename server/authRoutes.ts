import { Router } from 'express';
import { z } from 'zod';
import { fromError } from 'zod-validation-error';
import { ethers } from 'ethers';
import crypto from 'crypto';
import {
  createUser,
  findUserByEmail,
  verifyPassword,
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

const router = Router();

// Validation schemas
const registerSchema = z.object({
  email: z.string()
    .min(1, 'Email is required')
    .refine((email) => email.includes('@'), 'Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['farmer', 'trader', 'broker'], {
    errorMap: () => ({ message: 'Role must be farmer, trader, or broker' })
  }),
});

const loginSchema = z.object({
  email: z.string()
    .min(1, 'Email is required')
    .refine((email) => email.includes('@'), 'Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const validatedData = registerSchema.parse(req.body);
    
    const user = await createUser(
      validatedData.email,
      validatedData.password,
      validatedData.role
    );
    
    const token = generateToken(user.id, user.email, user.role);
    
    res.status(201).json({
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
    const validatedData = loginSchema.parse(req.body);
    
    const user = await findUserByEmail(validatedData.email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const isValidPassword = await verifyPassword(validatedData.password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
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
      role: z.enum(['farmer', 'trader', 'broker'], {
        errorMap: () => ({ message: 'Role must be farmer, trader, or broker' })
      }),
    });

    const validatedData = roleSchema.parse(req.body);
    const updatedUser = await updateUserRole(req.user.id, validatedData.role);

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
