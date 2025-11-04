import { storage } from "../storage";

interface ProcessedOption {
  optionId: string;
  marginCallId: string;
  status: string;
  transactionId: string;
  notificationsCreated: number;
}

interface ProcessError {
  marginCallId: string;
  optionId: string;
  error: string;
}

export async function processDeadlines() {
  console.log('🕐 Starting deadline processing...');
  
  const results = {
    processedCount: 0,
    expiredMarginCalls: 0,
    processedOptions: [] as ProcessedOption[],
    errors: [] as ProcessError[],
  };

  try {
    const expiredMarginCalls = await storage.getExpiredMarginCalls();
    results.expiredMarginCalls = expiredMarginCalls.length;
    console.log(`  📋 Found ${expiredMarginCalls.length} expired margin calls`);

    for (const marginCall of expiredMarginCalls) {
      try {
        const reason = `Margin call deadline expired (${marginCall.deadline?.toISOString() || 'unknown'}). Collateral insufficient.`;
        
        const result = await storage.forceSettleOption(
          marginCall.optionId,
          "system",
          reason
        );
        
        await storage.updateMarginCall(marginCall.id, {
          status: "LIQUIDATED",
        });

        results.processedOptions.push({
          optionId: marginCall.optionId,
          marginCallId: marginCall.id,
          status: result.option.status,
          transactionId: result.transaction.id,
          notificationsCreated: result.notifications.length,
        });

        results.processedCount++;
        console.log(`  ✅ Processed margin call ${marginCall.id} for option ${result.option.title}`);
      } catch (error: any) {
        console.error(`  ❌ Error processing margin call ${marginCall.id}:`, error);
        results.errors.push({
          marginCallId: marginCall.id,
          optionId: marginCall.optionId,
          error: error?.message || 'Unknown error',
        });
      }
    }

    console.log(`✅ Deadline processing complete. Processed ${results.processedCount}/${results.expiredMarginCalls} margin calls`);
    return results;
  } catch (error) {
    console.error('❌ Error in deadline processing:', error);
    throw error;
  }
}
