import { describe, expect, it } from "vitest";
import { analyzeFiles } from "../app/analyze";

/*
 * REAL BREWLYTICS INTEGRATION TEST
 *
 * This creates a fake CSV, gives it to the actual
 * analyzeFiles() function, and checks Brewlytics'
 * real output.
 */

function createSalesFile() {
  const rows = [
    "date,outlet,product,quantity,unit_price,unit_cost,channel",

    // JULY
    "2026-07-01,Orchard,Iced Latte,10,6,2,Walk-in",
    "2026-07-02,Orchard,Iced Latte,10,6,2,Walk-in",
    "2026-07-03,Orchard,Iced Latte,10,6,2,Delivery",
    "2026-07-04,Orchard,Iced Latte,10,6,2,Walk-in",
    "2026-07-05,Orchard,Iced Latte,10,6,2,Delivery",

    "2026-07-06,Orchard,Matcha Latte,10,7,2,Walk-in",
    "2026-07-07,Orchard,Matcha Latte,10,7,2,Walk-in",
    "2026-07-08,Orchard,Matcha Latte,10,7,2,Delivery",
    "2026-07-09,Orchard,Matcha Latte,10,7,2,Walk-in",
    "2026-07-10,Orchard,Matcha Latte,10,7,2,Delivery",

    // AUGUST
    "2026-08-01,Orchard,Iced Latte,5,6,2,Walk-in",
    "2026-08-02,Orchard,Iced Latte,5,6,2,Walk-in",
    "2026-08-03,Orchard,Iced Latte,5,6,2,Delivery",
    "2026-08-04,Orchard,Iced Latte,5,6,2,Walk-in",
    "2026-08-05,Orchard,Iced Latte,5,6,2,Delivery",

    "2026-08-06,Orchard,Matcha Latte,10,7,2,Walk-in",
    "2026-08-07,Orchard,Matcha Latte,10,7,2,Walk-in",
    "2026-08-08,Orchard,Matcha Latte,10,7,2,Delivery",
    "2026-08-09,Orchard,Matcha Latte,10,7,2,Walk-in",
    "2026-08-10,Orchard,Matcha Latte,10,7,2,Delivery",
  ];

  const csv = rows.join("\n");

  return new File([csv], "sales.csv", { type: "text/csv" });
}

describe("Actual Brewlytics analyzeFiles()", () => {
  it("identifies the correct latest and previous months", async () => {
    const result = await analyzeFiles([createSalesFile()]);

    expect(result.latestLabel).toBe("2026-08");
    expect(result.previousLabel).toBe("2026-07");
  });

  it("calculates latest-month revenue correctly", async () => {
    const result = await analyzeFiles([createSalesFile()]);

    /*
     * August:
     *
     * Iced Latte:
     * 25 units × $6 = $150
     *
     * Matcha Latte:
     * 50 units × $7 = $350
     *
     * Total = $500
     */

    expect(result.metrics.revenue).toBe(500);
  });

  it("calculates previous-month revenue change correctly", async () => {
    const result = await analyzeFiles([createSalesFile()]);

    /*
     * July:
     * Iced Latte = 50 × $6 = $300
     * Matcha = 50 × $7 = $350
     * Total = $650
     *
     * August = $500
     *
     * Change:
     * (500 - 650) / 650 × 100
     * = -23.0769%
     */

    expect(result.metrics.revenueChange).toBeCloseTo(-23.08, 2);
  });

  it("calculates latest-month profit correctly", async () => {
    const result = await analyzeFiles([createSalesFile()]);

    /*
     * Iced Latte:
     * revenue = $150
     * cost = 25 × $2 = $50
     * profit = $100
     *
     * Matcha:
     * revenue = $350
     * cost = 50 × $2 = $100
     * profit = $250
     *
     * Total profit = $350
     */

    expect(result.metrics.profit).toBe(350);
  });

  it("calculates gross margin correctly", async () => {
    const result = await analyzeFiles([createSalesFile()]);

    /*
     * Profit = 350
     * Revenue = 500
     *
     * Margin = 70%
     */

    expect(result.metrics.grossMargin).toBeCloseTo(70, 2);
  });

  it("recognises that all product costs are available", async () => {
    const result = await analyzeFiles([createSalesFile()]);

    expect(result.metrics.costsComplete).toBe(true);

    expect(result.metrics.costCoverage).toBeCloseTo(100, 2);
  });

  it("calculates Iced Latte performance correctly", async () => {
    const result = await analyzeFiles([createSalesFile()]);

    const icedLatte = result.products.find((p) => p.name === "Iced Latte");

    expect(icedLatte).toBeDefined();

    expect(icedLatte!.units).toBe(25);
    expect(icedLatte!.revenue).toBe(150);
    expect(icedLatte!.profit).toBe(100);
    expect(icedLatte!.price).toBe(6);
  });

  it("calculates Matcha Latte performance correctly", async () => {
    const result = await analyzeFiles([createSalesFile()]);

    const matcha = result.products.find((p) => p.name === "Matcha Latte");

    expect(matcha).toBeDefined();

    expect(matcha!.units).toBe(50);
    expect(matcha!.revenue).toBe(350);
    expect(matcha!.profit).toBe(250);
    expect(matcha!.price).toBe(7);
  });

  it("ranks Matcha Latte above Iced Latte by profit", async () => {
    const result = await analyzeFiles([createSalesFile()]);

    expect(result.products[0].name).toBe("Matcha Latte");

    expect(result.products[1].name).toBe("Iced Latte");
  });

  it("detects the Iced Latte decline through overall revenue", async () => {
    const result = await analyzeFiles([createSalesFile()]);

    /*
     * Matcha stays exactly the same.
     * Iced Latte falls from:
     *
     * 50 units → 25 units
     *
     * Therefore the business-level decline
     * should also be reflected in revenue.
     */

    expect(result.metrics.revenueChange).toBeLessThan(0);
  });
});
