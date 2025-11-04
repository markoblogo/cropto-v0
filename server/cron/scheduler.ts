import { db } from "../db";
import { marginCalls, options, notifications, transactions } from "@shared/schema";
import { eq, and, lte } from "drizzle-orm";

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
  
  const now = new Date();
  const results = {
    processedCount: 0,
    expiredMarginCalls: 0,
    processedOptions: [] as ProcessedOption[],
    errors: [] as ProcessError[],
  };

  try {
    const expiredMarginCalls = await db
      .select()
      .from(marginCalls)
      .where(
        and(
          eq(marginCalls.status, 'PENDING'),
          lte(marginCalls.deadline, now)
        )
      );

    results.expiredMarginCalls = expiredMarginCalls.length;
    console.log(`  📋 Found ${expiredMarginCalls.length} expired margin calls`);

    for (const marginCall of expiredMarginCalls) {
      try {
        const [option] = await db
          .select()
          .from(options)
          .where(eq(options.id, marginCall.optionId));

        if (!option) {
          throw new Error(`Option ${marginCall.optionId} not found`);
        }

        const reason = `Margin call deadline expired (${marginCall.deadline?.toISOString() || 'unknown'}). Collateral insufficient.`;
        const isDefaulted = true;
        const newStatus = "DEFAULTED";
        const payout = parseFloat(option.payoutAccumulated || "0");

        const [updatedOption] = await db
          .update(options)
          .set({ status: newStatus })
          .where(eq(options.id, marginCall.optionId))
          .returning();

        const [transaction] = await db
          .insert(transactions)
          .values({
            optionId: marginCall.optionId,
            type: "FORCE_SETTLE",
            fromUserId: option.issuerId || option.seller || null,
            toUserId: option.buyerId || option.buyer,
            amount: payout.toFixed(8),
            description: reason,
          })
          .returning();

        const createdNotifications = [];

        if (option.buyerId) {
          const [buyerNotification] = await db
            .insert(notifications)
            .values({
              userId: option.buyerId,
              type: "FORCE_SETTLE",
              message: `Option ${option.title} has been force-settled. Status: ${newStatus}. ${reason}`,
              relatedId: marginCall.optionId,
            })
            .returning();
          createdNotifications.push(buyerNotification);
        }

        const responsibleUserId = option.issuerId || option.seller;
        if (responsibleUserId && responsibleUserId !== option.buyerId) {
          const [issuerNotification] = await db
            .insert(notifications)
            .values({
              userId: responsibleUserId,
              type: "FORCE_SETTLE",
              message: `Option ${option.title} has been force-settled. Status: ${newStatus}. ${reason}`,
              relatedId: marginCall.optionId,
            })
            .returning();
          createdNotifications.push(issuerNotification);
        }

        const [updatedMarginCall] = await db
          .update(marginCalls)
          .set({ status: "LIQUIDATED" })
          .where(eq(marginCalls.id, marginCall.id))
          .returning();

        results.processedOptions.push({
          optionId: marginCall.optionId,
          marginCallId: marginCall.id,
          status: updatedOption.status,
          transactionId: transaction.id,
          notificationsCreated: createdNotifications.length,
        });

        results.processedCount++;
        console.log(`  ✅ Processed margin call ${marginCall.id} for option ${option.title}`);
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
