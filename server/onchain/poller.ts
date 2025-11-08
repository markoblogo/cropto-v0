import { eq } from "drizzle-orm";
import { db } from "../db";
import { onchainTransactions } from "@shared/schema";
import { ethers } from "ethers";

const POLL_INTERVAL = 15000;
let pollerInterval: NodeJS.Timeout | null = null;

export function startTransactionPoller() {
  if (pollerInterval) {
    console.log("Transaction poller already running");
    return;
  }

  console.log("Starting transaction status poller...");
  
  pollerInterval = setInterval(async () => {
    try {
      await updatePendingTransactions();
    } catch (error) {
      console.error("Error in transaction poller:", error);
    }
  }, POLL_INTERVAL);

  updatePendingTransactions();
}

export function stopTransactionPoller() {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
    console.log("Transaction poller stopped");
  }
}

async function updatePendingTransactions() {
  if (!process.env.POLYGON_AMOY_RPC_URL) {
    return;
  }

  const provider = new ethers.JsonRpcProvider(process.env.POLYGON_AMOY_RPC_URL);
  
  const pendingTxs = await db
    .select()
    .from(onchainTransactions)
    .where(eq(onchainTransactions.status, "PENDING"));

  for (const tx of pendingTxs) {
    if (!tx.txHash) continue;

    try {
      const receipt = await provider.getTransactionReceipt(tx.txHash);
      
      if (receipt) {
        const status = receipt.status === 1 ? "CONFIRMED" : "FAILED";
        
        await db
          .update(onchainTransactions)
          .set({
            status,
            blockNumber: receipt.blockNumber,
            confirmedAt: new Date(),
          })
          .where(eq(onchainTransactions.id, tx.id));

        console.log(`Transaction ${tx.txHash} ${status} at block ${receipt.blockNumber}`);
      }
    } catch (error) {
      console.error(`Error checking transaction ${tx.txHash}:`, error);
    }
  }
}
