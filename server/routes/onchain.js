import { Router } from 'express';
import { getBalance, mintTo } from '../services/onchain';
import { z } from 'zod';
import { db } from '../db';
import { onchainTransactions } from '../../shared/schema';
import { desc } from 'drizzle-orm';

const router = Router();

const mintSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  amount: z.coerce.number().positive('Amount must be positive')
});

router.post('/mint', async (req, res) => {
  try {
    if (process.env.ENABLE_MINT !== 'true') {
      return res.status(403).json({ error: 'Minting is disabled' });
    }

    const validation = mintSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.error.errors 
      });
    }

    const { address, amount } = validation.data;

    const txHash = await mintTo(address, amount);

    const [tx] = await db
      .insert(onchainTransactions)
      .values({
        userId: 'system',
        type: 'MINT',
        toAddress: address,
        amount: amount.toString(),
        txHash
      })
      .returning();

    res.json({ 
      success: true, 
      txHash,
      tx 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/balance/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({ error: 'Invalid Ethereum address' });
    }

    const balance = await getBalance(address);

    res.json({ 
      address,
      balance,
      symbol: 'CROPT'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/txs', async (req, res) => {
  try {
    const txs = await db
      .select()
      .from(onchainTransactions)
      .orderBy(desc(onchainTransactions.createdAt));
    res.json(txs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
