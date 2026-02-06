import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { 
  isSupabaseConfigured, 
  findUserByEmailSupabase, 
  createUserSupabase,
  updateUserSupabase,
  getAllUsersSupabase,
  type SupabaseUser 
} from './db/supabase';

const DB_PATH = path.join(process.cwd(), 'server', 'db.json');

// DB_MODE: Use Supabase if configured, otherwise use file-based DB
function useSupabase(): boolean {
  return isSupabaseConfigured();
}

// JWT_SECRET validation will happen at server startup in server/index.ts
function getJWTSecret(): string {
  if (!process.env.JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET is required in production');
    }
    const generatedSecret = crypto.randomBytes(32).toString('hex');
    console.warn('⚠️  JWT_SECRET not found - auto-generated (development fallback).');
    return generatedSecret;
  }
  return process.env.JWT_SECRET;
}

let JWT_SECRET: string;

export type UserRole = 'USER' | 'ADMIN' | 'SUPER_ADMIN' | 'BROKER';

interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
  walletAddress?: string;
  network?: string;
}

export type PublicUser = {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
  walletAddress?: string;
  network?: string;
};

interface DB {
  users: User[];
}

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

// Role helpers
export function hasBrokerPermissions(roleOrUser: { role?: string } | string | null | undefined): boolean {
  const role = typeof roleOrUser === "string" ? roleOrUser : roleOrUser?.role;
  if (!role) return false;
  const normalized = role.toLowerCase();
  return normalized === "broker" || normalized === "super_admin" || normalized === "admin";
}

export function hasAdminPermissions(roleOrUser: { role?: string } | string | null | undefined): boolean {
  const role = typeof roleOrUser === "string" ? roleOrUser : roleOrUser?.role;
  if (!role) return false;
  const normalized = role.toLowerCase();
  return normalized === "admin" || normalized === "broker" || normalized === "super_admin";
}

// Read database
async function readDB(): Promise<DB> {
  try {
    const data = await fs.readFile(DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { users: [] };
  }
}

// Write database
async function writeDB(db: DB): Promise<void> {
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));
}

// Hash password
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// Verify password
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Initialize JWT secret - call this before using any auth functions
export function initializeAuth() {
  JWT_SECRET = getJWTSecret();
}

// Generate JWT token
export function generateToken(userId: string, email: string, role: string): string {
  return jwt.sign(
    { id: userId, email, role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Verify JWT token
export function verifyToken(token: string): { id: string; email: string; role: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { id: string; email: string; role: string };
  } catch {
    return null;
  }
}

// Find user by email
export async function findUserByEmail(email: string): Promise<User | null> {
  const normalizedEmail = email.trim().toLowerCase();

  if (useSupabase()) {
    console.log("[AUTH] Using Supabase for users lookup");
    try {
      const supabaseUser = await findUserByEmailSupabase(normalizedEmail);
      if (!supabaseUser) {
        console.log("[AUTH] User not found in Supabase, checking local DB fallback");
      } else {
        console.log("[AUTH] User found in Supabase:", supabaseUser.email);
        const resolvedPasswordHash =
          (supabaseUser as any).password_hash ||
          (supabaseUser as any).passwordHash ||
          (supabaseUser as any).password ||
          "";
        return {
          id: supabaseUser.id,
          email: supabaseUser.email,
          passwordHash: resolvedPasswordHash,
          role: supabaseUser.role,
          createdAt: supabaseUser.created_at,
          walletAddress: supabaseUser.wallet_address,
          network: supabaseUser.network,
        };
      }
    } catch (error) {
      console.error("[AUTH] Supabase lookup failed, falling back to local DB:", (error as any)?.message || error);
      console.log("[AUTH] FALLBACK: using file DB for users");
    }
  } else {
    console.log("[AUTH] Supabase not configured, using file DB for users");
  }
  
  const db = await readDB();
  return db.users.find(u => u.email.trim().toLowerCase() === normalizedEmail) || null;
}

// Create user
export async function createUser(
  email: string,
  password: string,
  role: UserRole = 'USER'
): Promise<User> {
  const normalizedEmail = email.trim().toLowerCase();

  if (useSupabase()) {
    // Check if user exists
    const existing = await findUserByEmailSupabase(normalizedEmail);
    if (existing) {
      throw new Error('User already exists');
    }
    
    const passwordHash = await hashPassword(password);
    const supabaseUser = await createUserSupabase(normalizedEmail, passwordHash, role);
    
    return {
      id: supabaseUser.id,
      email: supabaseUser.email,
      passwordHash:
        (supabaseUser as any).password_hash ||
        (supabaseUser as any).passwordHash ||
        (supabaseUser as any).password ||
        "",
      role: supabaseUser.role,
      createdAt: supabaseUser.created_at,
      walletAddress: supabaseUser.wallet_address,
      network: supabaseUser.network,
    };
  }
  
  const db = await readDB();
  
  // Check if user exists
  if (db.users.find(u => u.email.trim().toLowerCase() === normalizedEmail)) {
    throw new Error('User already exists');
  }
  
  const user: User = {
    id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    email: normalizedEmail,
    passwordHash: await hashPassword(password),
    role,
    createdAt: new Date().toISOString(),
  };
  
  db.users.push(user);
  await writeDB(db);
  
  return user;
}

// Find user by ID
export async function findUserById(id: string): Promise<User | null> {
  if (useSupabase()) {
    const allUsers = await getAllUsersSupabase();
    const supabaseUser = allUsers.find(u => u.id === id);
    if (!supabaseUser) return null;
    
    return {
      id: supabaseUser.id,
      email: supabaseUser.email,
      passwordHash:
        (supabaseUser as any).password_hash ||
        (supabaseUser as any).passwordHash ||
        (supabaseUser as any).password ||
        "",
      role: supabaseUser.role,
      createdAt: supabaseUser.created_at,
      walletAddress: supabaseUser.wallet_address,
      network: supabaseUser.network,
    };
  }
  
  const db = await readDB();
  return db.users.find(u => u.id === id) || null;
}

// Update user wallet
export async function updateUserWallet(
  userId: string,
  walletAddress: string,
  network: string
): Promise<User | null> {
  if (useSupabase()) {
    const user = await findUserById(userId);
    if (!user) return null;
    
    const supabaseUser = await updateUserSupabase(user.email, {
      wallet_address: walletAddress,
      network: network,
    });
    
    return {
      id: supabaseUser.id,
      email: supabaseUser.email,
      passwordHash: supabaseUser.password_hash,
      role: supabaseUser.role,
      createdAt: supabaseUser.created_at,
      walletAddress: supabaseUser.wallet_address,
      network: supabaseUser.network,
    };
  }
  
  const db = await readDB();
  const userIndex = db.users.findIndex(u => u.id === userId);
  
  if (userIndex === -1) {
    return null;
  }
  
  db.users[userIndex].walletAddress = walletAddress;
  db.users[userIndex].network = network;
  
  await writeDB(db);
  return db.users[userIndex];
}

// Find or create user by wallet address
export async function findOrCreateUserByWallet(
  walletAddress: string
): Promise<{ user: User; isNewUser: boolean }> {
  const lowerAddress = walletAddress.toLowerCase();
  
  if (useSupabase()) {
    // Try to find existing user by wallet address
    const allUsers = await getAllUsersSupabase();
    const existingUser = allUsers.find(u => u.wallet_address?.toLowerCase() === lowerAddress);
    
    if (existingUser) {
      return {
        user: {
          id: existingUser.id,
          email: existingUser.email,
          passwordHash:
            (existingUser as any).password_hash ||
            (existingUser as any).passwordHash ||
            (existingUser as any).password ||
            "",
          role: existingUser.role,
          createdAt: existingUser.created_at,
          walletAddress: existingUser.wallet_address,
          network: existingUser.network,
        },
        isNewUser: false,
      };
    }
    
    // Create new user with wallet
    const email = `${lowerAddress}@wallet.local`;
    const tempPassword = crypto.randomBytes(32).toString('hex');
    const passwordHash = await hashPassword(tempPassword);
    
    const supabaseUser = await createUserSupabase(
      email,
      passwordHash,
      'USER' // Default role for new wallet users
    );
    
    // Update with wallet address
    const updatedUser = await updateUserSupabase(email, {
      wallet_address: lowerAddress,
    });
    
    return {
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        passwordHash:
          (updatedUser as any).password_hash ||
          (updatedUser as any).passwordHash ||
          (updatedUser as any).password ||
          "",
        role: updatedUser.role,
        createdAt: updatedUser.created_at,
        walletAddress: updatedUser.wallet_address,
        network: updatedUser.network,
      },
      isNewUser: true,
    };
  }
  
  // File-based storage
  const db = await readDB();
  const existingUser = db.users.find(u => u.walletAddress?.toLowerCase() === lowerAddress);
  
  if (existingUser) {
    return {
      user: existingUser,
      isNewUser: false,
    };
  }
  
  // Create new user
  const newUser: User = {
    id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    email: `${lowerAddress}@wallet.local`,
    passwordHash: await hashPassword(crypto.randomBytes(32).toString('hex')),
    role: 'USER', // Default role
    createdAt: new Date().toISOString(),
    walletAddress: lowerAddress,
  };
  
  db.users.push(newUser);
  await writeDB(db);
  
  return {
    user: newUser,
    isNewUser: true,
  };
}

// Update user role
export async function updateUserRole(
  userId: string,
  role: UserRole
): Promise<User | null> {
  if (useSupabase()) {
    const user = await findUserById(userId);
    if (!user) return null;
    
    const supabaseUser = await updateUserSupabase(user.email, {
      role,
    });
    
    return {
      id: supabaseUser.id,
      email: supabaseUser.email,
      passwordHash:
        (supabaseUser as any).password_hash ||
        (supabaseUser as any).passwordHash ||
        (supabaseUser as any).password ||
        "",
      role: supabaseUser.role,
      createdAt: supabaseUser.created_at,
      walletAddress: supabaseUser.wallet_address,
      network: supabaseUser.network,
    };
  }
  
  const db = await readDB();
  const userIndex = db.users.findIndex(u => u.id === userId);
  
  if (userIndex === -1) {
    return null;
  }
  
  db.users[userIndex].role = role;
  
  await writeDB(db);
  return db.users[userIndex];
}

export async function listUsers(): Promise<PublicUser[]> {
  if (useSupabase()) {
    const allUsers = await getAllUsersSupabase();
    return allUsers.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      createdAt: u.created_at,
      walletAddress: u.wallet_address,
      network: u.network,
    }));
  }

  const localDb = await readDB();
  return localDb.users.map((u) => ({
    id: u.id,
    email: u.email,
    role: u.role,
    createdAt: u.createdAt,
    walletAddress: u.walletAddress,
    network: u.network,
  }));
}

// Auth middleware
export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  const user = verifyToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  
  req.user = user;
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/9954e01e-166a-402a-b350-ebd5f6863d16',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'run1',hypothesisId:'H1-auth-role',location:'auth.ts:authenticateToken',message:'auth user set',data:{id:user.id,email:user.email,role:user.role},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  next();
}

// Optional auth middleware - doesn't fail if token is missing
export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token) {
    const user = verifyToken(token);
    if (user) {
      req.user = user;
    }
  }
  
  next();
}

// RBAC Middleware
// Require any authenticated user (USER, ADMIN, or SUPER_ADMIN)
export function requireUser(req: AuthRequest, res: Response, next: NextFunction) {
  return authenticateToken(req, res, next);
}

// Require ADMIN or SUPER_ADMIN role
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  authenticateToken(req, res, () => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    next();
  });
}

// Require SUPER_ADMIN role only
export function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  authenticateToken(req, res, () => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Super admin access required' });
    }
    
    next();
  });
}
