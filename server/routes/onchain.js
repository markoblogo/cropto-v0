import { Router } from 'express';
import { getBalance, mintTo } from '../services/onchain.js';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();
const TX_FILE = path.join(__dirname, '../db/onchain_tx.json');

const mintSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  amount: z.coerce.number().positive('Amount must be positive')
});

async function readTxs() {
  try {
    const data = await fs.readFile(TX_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function appendTx(tx) {
  const txs = await readTxs();
  txs.push(tx);
  await fs.mkdir(path.dirname(TX_FILE), { recursive: true });
  await fs.writeFile(TX_FILE, JSON.stringify(txs, null, 2));
}

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

    const tx = {
      id: Date.now().toString(),
      type: 'MINT',
      address,
      amount: amount.toString(),
      txHash,
      status: 'PENDING',
      timestamp: new Date().toISOString()
    };

    await appendTx(tx);

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
    const txs = await readTxs();
    res.json(txs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
