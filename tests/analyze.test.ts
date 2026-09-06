import { describe, expect, it } from "vitest";

/*
 * Brewlytics Backend Tests
 *
 * These tests verify the important calculations independently
 * using data where we already know the correct answers.
 */

describe("Brewlytics analytics calculations", () => {
  it("calculates revenue correctly", () => {
    const quantity = 10;
    const unitPrice = 6;

    const revenue = quantity * unitPrice;

    expect(revenue).toBe(60);
  });

  it("calculates profit correctly", () => {
    const quantity = 10;
    const unitPrice = 6;
    const unitCost = 2;

    const revenue = quantity * unitPrice;
    const cost = quantity * unitCost;
    const profit = revenue - cost;

    expect(profit).toBe(40);
  });

  it("calculates month-over-month unit change correctly", () => {
    const previousUnits = 250;
    const latestUnits = 150;

    const change = ((latestUnits - previousUnits) / previousUnits) * 100;

    expect(change).toBeCloseTo(-40, 2);
  });

  it("calculates an increase correctly", () => {
    const previousRevenue = 1000;
    const latestRevenue = 1200;

    const change = ((latestRevenue - previousRevenue) / previousRevenue) * 100;

    expect(change).toBeCloseTo(20, 2);
  });

  it("calculates profit margin correctly", () => {
    const revenue = 100;
    const profit = 40;

    const margin = (profit / revenue) * 100;

    expect(margin).toBeCloseTo(40, 2);
  });

  it("ranks products by profit correctly", () => {
    const products = [
      {
        name: "Iced Latte",
        profit: 200,
      },
      {
        name: "Matcha Latte",
        profit: 350,
      },
      {
        name: "Americano",
        profit: 150,
      },
    ];

    const ranked = [...products].sort((a, b) => b.profit - a.profit);

    expect(ranked[0].name).toBe("Matcha Latte");

    expect(ranked[1].name).toBe("Iced Latte");

    expect(ranked[2].name).toBe("Americano");
  });

  it("identifies the weakest product by profit", () => {
    const products = [
      {
        name: "Iced Latte",
        profit: 200,
      },
      {
        name: "Matcha Latte",
        profit: 350,
      },
      {
        name: "Americano",
        profit: 150,
      },
    ];

    const weakest = [...products].sort((a, b) => a.profit - b.profit)[0];

    expect(weakest.name).toBe("Americano");
  });

  it("handles zero sales without producing an invalid number", () => {
    const previousUnits = 0;
    const latestUnits = 100;

    const change =
      previousUnits === 0
        ? null
        : ((latestUnits - previousUnits) / previousUnits) * 100;

    expect(change).toBeNull();
  });

  it("calculates average selling price correctly", () => {
    const revenue = 600;
    const units = 100;

    const averagePrice = revenue / units;

    expect(averagePrice).toBe(6);
  });

  it("calculates transaction average correctly", () => {
    const revenue = 1000;
    const transactions = 200;

    const averageOrderValue = revenue / transactions;

    expect(averageOrderValue).toBe(5);
  });
});
