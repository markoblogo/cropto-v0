import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import fs from 'fs/promises';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'server', 'db.json');

// JWT_SECRET validation will happen at server startup in server/index.ts
function getJWTSecret(): string {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required. Please add it to your Replit Secrets.');
  }
  return process.env.JWT_SECRET;
}

let JWT_SECRET: string;

interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: 'farmer' | 'trader' | 'broker';
  createdAt: string;
}

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
  const db = await readDB();
  return db.users.find(u => u.email === email) || null;
}

// Create user
export async function createUser(
  email: string,
  password: string,
  role: 'farmer' | 'trader' | 'broker'
): Promise<User> {
  const db = await readDB();
  
  // Check if user exists
  if (db.users.find(u => u.email === email)) {
    throw new Error('User already exists');
  }
  
  const user: User = {
    id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    email,
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
  const db = await readDB();
  return db.users.find(u => u.id === id) || null;
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
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
  
  req.user = user;
  next();
}
