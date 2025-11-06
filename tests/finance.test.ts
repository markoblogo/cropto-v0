import { describe, it, expect } from '@jest/globals';
import {
  collateralPct,
  computeNotional,
  intrinsic,
  shouldTriggerMargin,
  calculateMarginCallAmount,
  calculateExercisePL,
} from '../server/utils/finance';

describe('Finance Utilities', () => {
  describe('collateralPct', () => {
    it('should return 5% for 1 month expiry', () => {
      expect(collateralPct(1)).toBe(0.05);
    });

    it('should return 5% for 3 months expiry', () => {
      expect(collateralPct(3)).toBe(0.05);
    });

    it('should return 10% for 6 months expiry', () => {
      expect(collateralPct(6)).toBe(0.10);
    });

    it('should return 20% for 12 months expiry', () => {
      expect(collateralPct(12)).toBe(0.20);
    });

    it('should return 10% for 4 months expiry (edge case)', () => {
      expect(collateralPct(4)).toBe(0.10);
    });

    it('should return 10% for 5 months expiry (edge case)', () => {
      expect(collateralPct(5)).toBe(0.10);
    });

    it('should return 20% for 7 months expiry (edge case)', () => {
      expect(collateralPct(7)).toBe(0.20);
    });

    it('should return 20% for 24 months expiry', () => {
      expect(collateralPct(24)).toBe(0.20);
    });

    it('should throw error for zero months', () => {
      expect(() => collateralPct(0)).toThrow('Expiry months must be positive');
    });

    it('should throw error for negative months', () => {
      expect(() => collateralPct(-1)).toThrow('Expiry months must be positive');
    });
  });

  describe('computeNotional', () => {
    it('should compute notional for strike 210, quantity 100', () => {
      expect(computeNotional(210, 100)).toBe(21000);
    });

    it('should compute notional for strike 100, quantity 50', () => {
      expect(computeNotional(100, 50)).toBe(5000);
    });

    it('should compute notional for strike 250.50, quantity 100', () => {
      expect(computeNotional(250.50, 100)).toBe(25050);
    });

    it('should return 0 for zero strike', () => {
      expect(computeNotional(0, 100)).toBe(0);
    });

    it('should return 0 for zero quantity', () => {
      expect(computeNotional(210, 0)).toBe(0);
    });

    it('should throw error for negative strike', () => {
      expect(() => computeNotional(-210, 100)).toThrow('Strike price and quantity must be non-negative');
    });

    it('should throw error for negative quantity', () => {
      expect(() => computeNotional(210, -100)).toThrow('Strike price and quantity must be non-negative');
    });
  });

  describe('intrinsic - CALL options', () => {
    it('should calculate intrinsic for in-the-money CALL (index 240, strike 210, qty 100)', () => {
      expect(intrinsic('CALL', 240, 210, 100)).toBe(3000);
    });

    it('should return 0 for at-the-money CALL', () => {
      expect(intrinsic('CALL', 210, 210, 100)).toBe(0);
    });

    it('should return 0 for out-of-the-money CALL', () => {
      expect(intrinsic('CALL', 200, 210, 100)).toBe(0);
    });

    it('should calculate intrinsic for deep in-the-money CALL', () => {
      expect(intrinsic('CALL', 300, 200, 50)).toBe(5000);
    });

    it('should handle decimal prices for CALL', () => {
      expect(intrinsic('CALL', 240.75, 210.25, 100)).toBe(3050);
    });
  });

  describe('intrinsic - PUT options', () => {
    it('should calculate intrinsic for in-the-money PUT (index 180, strike 200, qty 100)', () => {
      expect(intrinsic('PUT', 180, 200, 100)).toBe(2000);
    });

    it('should return 0 for at-the-money PUT', () => {
      expect(intrinsic('PUT', 200, 200, 100)).toBe(0);
    });

    it('should return 0 for out-of-the-money PUT', () => {
      expect(intrinsic('PUT', 220, 200, 100)).toBe(0);
    });

    it('should calculate intrinsic for deep in-the-money PUT', () => {
      expect(intrinsic('PUT', 150, 250, 50)).toBe(5000);
    });

    it('should handle decimal prices for PUT', () => {
      expect(intrinsic('PUT', 180.25, 200.75, 100)).toBe(2050);
    });
  });

  describe('intrinsic - error handling', () => {
    it('should throw error for invalid option type', () => {
      expect(() => intrinsic('INVALID' as any, 240, 210, 100)).toThrow('Option type must be CALL or PUT');
    });

    it('should throw error for negative index price', () => {
      expect(() => intrinsic('CALL', -240, 210, 100)).toThrow('All parameters must be non-negative');
    });

    it('should throw error for negative strike', () => {
      expect(() => intrinsic('CALL', 240, -210, 100)).toThrow('All parameters must be non-negative');
    });

    it('should throw error for negative quantity', () => {
      expect(() => intrinsic('CALL', 240, 210, -100)).toThrow('All parameters must be non-negative');
    });
  });

  describe('shouldTriggerMargin', () => {
    it('should trigger margin when intrinsic >= 80% of collateral (4500 >= 4000)', () => {
      const collateralAmount = 5000;
      const intrinsicValue = 4500;
      expect(shouldTriggerMargin(intrinsicValue, collateralAmount)).toBe(true);
    });

    it('should not trigger margin when intrinsic < 80% of collateral (3000 < 4000)', () => {
      const collateralAmount = 5000;
      const intrinsicValue = 3000;
      expect(shouldTriggerMargin(intrinsicValue, collateralAmount)).toBe(false);
    });

    it('should trigger margin at exactly 80% threshold', () => {
      const collateralAmount = 5000;
      const intrinsicValue = 4000; // exactly 80%
      expect(shouldTriggerMargin(intrinsicValue, collateralAmount)).toBe(true);
    });

    it('should trigger margin when intrinsic = 100% of collateral', () => {
      expect(shouldTriggerMargin(5000, 5000)).toBe(true);
    });

    it('should trigger margin when intrinsic > collateral', () => {
      expect(shouldTriggerMargin(6000, 5000)).toBe(true);
    });

    it('should handle negative intrinsic values (absolute value used)', () => {
      expect(shouldTriggerMargin(-4500, 5000)).toBe(true);
    });

    it('should not trigger margin for zero collateral', () => {
      expect(shouldTriggerMargin(1000, 0)).toBe(false);
    });

    it('should not trigger margin when intrinsic is zero', () => {
      expect(shouldTriggerMargin(0, 5000)).toBe(false);
    });
  });

  describe('calculateMarginCallAmount', () => {
    it('should calculate required amount when intrinsic > collateral', () => {
      expect(calculateMarginCallAmount(6000, 5000)).toBe(1000);
    });

    it('should return 0 when intrinsic < collateral', () => {
      expect(calculateMarginCallAmount(3000, 5000)).toBe(0);
    });

    it('should return 0 when intrinsic = collateral', () => {
      expect(calculateMarginCallAmount(5000, 5000)).toBe(0);
    });

    it('should handle negative intrinsic (absolute value)', () => {
      expect(calculateMarginCallAmount(-6000, 5000)).toBe(1000);
    });

    it('should return intrinsic amount when collateral is zero', () => {
      expect(calculateMarginCallAmount(1000, 0)).toBe(1000);
    });
  });

  describe('calculateExercisePL', () => {
    it('should calculate P&L for profitable CALL exercise', () => {
      const result = calculateExercisePL('CALL', 250, 200, 100, 5);
      expect(result.payout).toBe(5000); // (250-200)*100
      expect(result.profitLoss).toBe(4500); // 5000 - (5*100)
    });

    it('should calculate P&L for unprofitable CALL exercise', () => {
      const result = calculateExercisePL('CALL', 190, 200, 100, 5);
      expect(result.payout).toBe(0);
      expect(result.profitLoss).toBe(-500); // 0 - (5*100)
    });

    it('should calculate P&L for profitable PUT exercise', () => {
      const result = calculateExercisePL('PUT', 150, 200, 100, 5);
      expect(result.payout).toBe(5000); // (200-150)*100
      expect(result.profitLoss).toBe(4500); // 5000 - (5*100)
    });

    it('should calculate P&L for unprofitable PUT exercise', () => {
      const result = calculateExercisePL('PUT', 210, 200, 100, 5);
      expect(result.payout).toBe(0);
      expect(result.profitLoss).toBe(-500); // 0 - (5*100)
    });

    it('should calculate P&L for at-the-money exercise', () => {
      const result = calculateExercisePL('CALL', 200, 200, 100, 5);
      expect(result.payout).toBe(0);
      expect(result.profitLoss).toBe(-500);
    });

    it('should handle zero premium', () => {
      const result = calculateExercisePL('CALL', 250, 200, 100, 0);
      expect(result.payout).toBe(5000);
      expect(result.profitLoss).toBe(5000);
    });
  });

  describe('Integration tests - Margin scenarios', () => {
    it('should correctly identify margin call scenario for wheat option', () => {
      const strikePrice = 210;
      const quantity = 100;
      const indexPrice = 240;
      const expiryMonths = 3;
      
      // Calculate notional and collateral
      const notional = computeNotional(strikePrice, quantity);
      const collateralPct_val = collateralPct(expiryMonths);
      const collateral = notional * collateralPct_val;
      
      // Calculate intrinsic
      const intrinsicValue = intrinsic('CALL', indexPrice, strikePrice, quantity);
      
      // Check margin trigger
      const marginTriggered = shouldTriggerMargin(intrinsicValue, collateral);
      
      expect(notional).toBe(21000);
      expect(collateralPct_val).toBe(0.05);
      expect(collateral).toBe(1050);
      expect(intrinsicValue).toBe(3000);
      expect(marginTriggered).toBe(true); // 3000 > 0.8 * 1050
    });

    it('should handle full option lifecycle with P&L', () => {
      const strikePrice = 200;
      const quantity = 50;
      const premium = 10;
      const spotPrice = 250;
      
      // Exercise the option
      const pl = calculateExercisePL('CALL', spotPrice, strikePrice, quantity, premium);
      
      expect(pl.payout).toBe(2500); // (250-200)*50
      expect(pl.profitLoss).toBe(2000); // 2500 - (10*50)
    });
  });
});
