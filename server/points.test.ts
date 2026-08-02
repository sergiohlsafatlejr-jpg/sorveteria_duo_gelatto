import { describe, expect, it } from "vitest";

describe("Points calculation logic", () => {
  it("calculates correct points based on purchase amount and rules", () => {
    const amount = 55.50; // R$ 55,50 spent
    const rule = {
      purchaseAmount: 10, // R$ 10 per points set
      pointsEarned: 1,    // 1 point per set
    };
    const pointsEarned = Math.floor(amount / rule.purchaseAmount) * rule.pointsEarned;
    expect(pointsEarned).toBe(5);
  });

  it("calculates correct points with custom rule multiplier", () => {
    const amount = 105.00; // R$ 105 spent
    const rule = {
      purchaseAmount: 20, // R$ 20 per points set
      pointsEarned: 3,    // 3 points per set
    };
    const pointsEarned = Math.floor(amount / rule.purchaseAmount) * rule.pointsEarned;
    expect(pointsEarned).toBe(15); // 5 * 3 = 15 points
  });

  it("calculates 0 points if amount is less than rule purchaseAmount", () => {
    const amount = 8.50; // spent less than R$ 10
    const rule = {
      purchaseAmount: 10,
      pointsEarned: 2,
    };
    const pointsEarned = Math.floor(amount / rule.purchaseAmount) * rule.pointsEarned;
    expect(pointsEarned).toBe(0);
  });
});
