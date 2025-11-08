import { eq } from 'drizzle-orm';
import { db } from '../db';
import { onchainTransactions } from '../../shared/schema';
import { getProvider } from '../services/onchain';

const RECONCILE_INTERVAL = parseInt(process.env.RECONCILE_INTERVAL || '90000', 10);
const MIN_AGE_MS = 15000;

let reconcilerInterval: NodeJS.Timeout | null = null;

async function reconcilePendingTransactions() {
  try {
    const provider = getProvider();
    
    const pendingTxs = await db
      .select()
      .from(onchainTransactions)
      .where(eq(onchainTransactions.status, 'PENDING'));

    if (pendingTxs.length === 0) {
      return;
    }

    const now = Date.now();
    
    for (const tx of pendingTxs) {
      if (!tx.txHash) continue;

      const ageMs = now - new Date(tx.createdAt).getTime();
      if (ageMs < MIN_AGE_MS) continue;

      try {
        const receipt = await provider.getTransactionReceipt(tx.txHash);
        
        if (receipt !== null) {
          await db
            .update(onchainTransactions)
            .set({
              status: receipt.status === 1 ? 'CONFIRMED' : 'FAILED',
              blockNumber: receipt.blockNumber,
              confirmedAt: new Date()
            })
            .where(eq(onchainTransactions.id, tx.id));
        }
      } catch (error: any) {
        console.error(`[Reconciler] Error checking tx ${tx.txHash}:`, error.message);
      }
    }
  } catch (error: any) {
    console.error('[Reconciler] Error in reconcile cycle:', error.message);
  }
}

export function startReconciler() {
  if (reconcilerInterval) {
    return;
  }

  if (!process.env.POLYGON_AMOY_RPC_URL || !process.env.CROPT_CONTRACT_ADDRESS) {
    console.log('[Reconciler] Blockchain not configured, skipping reconciler');
    return;
  }

  console.log(`[Reconciler] Starting with ${RECONCILE_INTERVAL}ms interval`);
  
  reconcilePendingTransactions();
  
  reconcilerInterval = setInterval(reconcilePendingTransactions, RECONCILE_INTERVAL);
}

export function stopReconciler() {
  if (reconcilerInterval) {
    clearInterval(reconcilerInterval);
    reconcilerInterval = null;
    console.log('[Reconciler] Stopped');
  }
}
