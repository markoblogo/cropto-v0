import { storage } from "../storage";
import { db } from "../db";
import { indexes, commodityIndexPrices, options } from "../../shared/schema";
import { eq, desc, or } from "drizzle-orm";
import { shouldTriggerMargin, calculateMarginCallAmount, computeIntrinsicValueUSDCorrected } from "../utils/finance";

interface ProcessedOption {
  optionId: string;
  marginCallId?: string;
  status: string;
  transactionId?: string;
  notificationsCreated: number;
}

interface ProcessError {
  marginCallId?: string;
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

    // Process expired options
    const expiredOptions = await storage.getExpiredOptions();
    console.log(`  📋 Found ${expiredOptions.length} expired options`);

    for (const option of expiredOptions) {
      try {
        // Get current price for the underlying commodity
        let currentPricePerTon = 0;
        if (option.commodity) {
          const [index] = await db
            .select()
            .from(indexes)
            .where(eq(indexes.slug, option.commodity.toLowerCase()))
            .limit(1);

          if (index) {
            const [latestPrice] = await db
              .select()
              .from(commodityIndexPrices)
              .where(eq(commodityIndexPrices.indexId, index.id))
              .orderBy(desc(commodityIndexPrices.timestamp))
              .limit(1);

            if (latestPrice) {
              currentPricePerTon = parseFloat(latestPrice.price);
            }
          }
        }

        // Auto-settle the option using the same exercise logic
        const settlement = await storage.exerciseOption(
          option.id,
          "system",
          currentPricePerTon.toString()
        );

        // Update option status to EXPIRED if no intrinsic value, otherwise SETTLED
        const strikePerTon = parseFloat(option.strike);
        const quantityTons = parseFloat(option.qty);
        const intrinsicValue = option.type === "CALL"
          ? Math.max(0, (currentPricePerTon - strikePerTon) * quantityTons)
          : Math.max(0, (strikePerTon - currentPricePerTon) * quantityTons);

        const finalStatus = intrinsicValue > 0 ? "SETTLED" : "EXPIRED";
        await storage.updateOption(option.id, {
          status: finalStatus,
          lastUpdated: new Date(),
        });

        results.processedOptions.push({
          optionId: option.id,
          status: finalStatus,
          notificationsCreated: 0,
        });

        results.processedCount++;
        console.log(`  ✅ Auto-settled option ${option.id}: ${finalStatus}, payout=${parseFloat(settlement.payout).toFixed(2)}`);
      } catch (error: any) {
        console.error(`  ❌ Error auto-settling option ${option.id}:`, error);
        results.errors.push({
          optionId: option.id,
          error: error?.message || 'Unknown error',
        });
      }
    }

    // Check for margin calls on active SHORT positions
    // Filter for options with issuerId and collateralAmount (SHORT positions)
    // Note: We filter in code instead of SQL to avoid sql template issues
    const allActiveOptions = await db
      .select()
      .from(options)
      .where(
        or(
          eq(options.status, "OPEN"),
          eq(options.status, "FILLED"),
          eq(options.status, "MARGIN_CALL")
        )
      );
    
    // Filter in code to ensure issuerId and collateralAmount are present
    const activeOptions = allActiveOptions.filter(
      opt => opt.issuerId && opt.collateralAmount
    );

    console.log(`  📋 Checking ${activeOptions.length} active options for margin calls`);

    for (const option of activeOptions) {
      try {
        // Only check SHORT positions (seller/writer)
        if (!option.issuerId || !option.commodity || !option.collateralAmount) {
          continue;
        }

        // Get current price
        let currentPricePerTon = 0;
        const [index] = await db
          .select()
          .from(indexes)
          .where(eq(indexes.slug, option.commodity.toLowerCase()))
          .limit(1);

        if (index) {
          const [latestPrice] = await db
            .select()
            .from(commodityIndexPrices)
            .where(eq(commodityIndexPrices.indexId, index.id))
            .orderBy(desc(commodityIndexPrices.timestamp))
            .limit(1);

          if (latestPrice) {
            currentPricePerTon = parseFloat(latestPrice.price);
          }
        }

        if (currentPricePerTon === 0) {
          continue; // Skip if no price available
        }

        const strikePerTon = parseFloat(option.strike);
        const quantityTons = parseFloat(option.qty);
        const collateral = parseFloat(option.collateralAmount);

        // Calculate intrinsic value
        const intrinsicValue = computeIntrinsicValueUSDCorrected(
          option.type,
          strikePerTon,
          currentPricePerTon,
          quantityTons
        );

        // Check if margin call should be triggered
        if (shouldTriggerMargin(intrinsicValue, collateral)) {
          // Check if margin call already exists
          const existingMarginCalls = await storage.getMarginCallsByUser(option.issuerId);
          const existingCall = existingMarginCalls.find(mc => 
            mc.optionId === option.id && 
            (mc.status === "PENDING" || mc.status === "OPEN")
          );

          if (!existingCall) {
            // Create new margin call
            const marginCallAmount = calculateMarginCallAmount(intrinsicValue, collateral);
            const deadline = new Date();
            deadline.setHours(deadline.getHours() + 24); // 24 hours deadline

            await storage.createMarginCall({
              optionId: option.id,
              userId: option.issuerId,
              amountRequired: marginCallAmount.toFixed(8),
              intrinsicValue: intrinsicValue.toFixed(8),
              collateralAmount: collateral.toFixed(8),
              status: "PENDING",
              deadline: deadline,
            });

            // Update option status to MARGIN_CALL if not already
            if (option.status !== "MARGIN_CALL") {
              await storage.updateOption(option.id, {
                status: "MARGIN_CALL",
                lastUpdated: new Date(),
              });
            }

            console.log(`  ⚠️  Created margin call for option ${option.id} (seller: ${option.issuerId})`);
          }
        }
      } catch (error: any) {
        console.error(`  ❌ Error checking margin call for option ${option.id}:`, error);
      }
    }

    console.log(`✅ Deadline processing complete. Processed ${results.processedCount} items (${results.expiredMarginCalls} margin calls + ${expiredOptions.length} expired options)`);
    return results;
  } catch (error) {
    console.error('❌ Error in deadline processing:', error);
    throw error;
  }
}
