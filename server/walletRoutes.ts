import { Router } from 'express';
import { z } from 'zod';
import { fromError } from 'zod-validation-error';
import {
  updateUserWallet,
  findUserById,
  optionalAuth,
  authenticateToken,
  hasAdminPermissions,
  AuthRequest
} from './auth';

const router = Router();

// Validation schema for wallet link
const walletLinkSchema = z.object({
  address: z.string().min(1, 'Wallet address is required'),
  network: z.string().optional().default('1'), // Default to mainnet if not provided
});

// POST /api/wallet/link - Link wallet to user account
// Supports both authenticated (saves to user) and anonymous (demo mode)
router.post('/link', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const validatedData = walletLinkSchema.parse(req.body);
    
    // If user is authenticated, save to their account
    if (req.user) {
      const updatedUser = await updateUserWallet(
        req.user.id,
        validatedData.address,
        validatedData.network
      );
      
      if (!updatedUser) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      return res.json({
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          role: updatedUser.role,
          walletAddress: updatedUser.walletAddress,
          network: updatedUser.network,
        },
      });
    }
    
    // Anonymous/demo mode - just echo back the wallet info
    res.json({
      address: validatedData.address,
      network: validatedData.network,
      demo: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = fromError(error);
      return res.status(400).json({ error: validationError.message });
    }
    
    console.error('Wallet link error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/wallet/me - Get current authenticated user's wallet info
router.get('/me', optionalAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const user = await findUserById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      walletAddress: user.walletAddress || null,
      network: user.network || null,
    });
  } catch (error) {
    console.error('Get wallet error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/wallet/:userId - Get user's wallet info
// Restricted to the user themself or an admin/broker operator.
router.get('/:userId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (req.user.id !== req.params.userId && !hasAdminPermissions(req.user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const user = await findUserById(req.params.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      walletAddress: user.walletAddress || null,
      network: user.network || null,
    });
  } catch (error) {
    console.error('Get wallet error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
