import { Router } from 'express';
import { z } from 'zod';
import { fromError } from 'zod-validation-error';
import {
  createUser,
  findUserByEmail,
  verifyPassword,
  generateToken,
  findUserById,
  authenticateToken,
  AuthRequest
} from './auth';

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

export default router;
