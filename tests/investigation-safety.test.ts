import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { analyzeFiles, CleaningChoices } from "../app/analyze";

import {
  productTrend,
  priceVsVolume,
  channelBreakdown,
  weekdayBreakdown,
  profitability,
  runInvestigationTool,
} from "../app/investigation";

/* =========================================================
   HELPERS
========================================================= */

function makeExcelFile(
  rows: Record<string, unknown>[],
  name = "investigation-safety.xlsx",
) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Sales");

  const buffer = XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
  });

  return new File([buffer], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

const choices: CleaningChoices = {
  values: {},
  duplicateAction: "remove",
};

/*
 * Normal valid dataset.
 *
 * Iced Latte:
 * July   = 10 units
 * August = 6 units
 *
 * The dataset proves sales declined.
 *
 * It DOES NOT prove:
 * - weather caused it
 * - customers disliked it
 * - a competitor caused it
 * - social media trends caused it
 */

function normalRows() {
  return [
    /* JULY */

    {
      date: "2026-07-01",
      order_id: "J001",
      outlet: "Outlet A",
      product: "Iced Latte",
      quantity: 4,
      unit_price: 6,
      unit_cost: 2,
      channel: "Dine In",
    },

    {
      date: "2026-07-08",
      order_id: "J002",
      outlet: "Outlet A",
      product: "Iced Latte",
      quantity: 3,
      unit_price: 6,
      unit_cost: 2,
      channel: "Grab",
    },

    {
      date: "2026-07-15",
      order_id: "J003",
      outlet: "Outlet B",
      product: "Iced Latte",
      quantity: 3,
      unit_price: 6,
      unit_cost: 2,
      channel: "Dine In",
    },

    {
      date: "2026-07-03",
      order_id: "J004",
      outlet: "Outlet A",
      product: "Matcha Latte",
      quantity: 2,
      unit_price: 7,
      unit_cost: 2.5,
      channel: "Dine In",
    },

    {
      date: "2026-07-10",
      order_id: "J005",
      outlet: "Outlet A",
      product: "Americano",
      quantity: 3,
      unit_price: 4,
      unit_cost: 1,
      channel: "Grab",
    },

    {
      date: "2026-07-17",
      order_id: "J006",
      outlet: "Outlet B",
      product: "Mocha",
      quantity: 2,
      unit_price: 6,
      unit_cost: 2,
      channel: "Dine In",
    },

    /* AUGUST */

    {
      date: "2026-08-03",
      order_id: "A001",
      outlet: "Outlet A",
      product: "Iced Latte",
      quantity: 2,
      unit_price: 6,
      unit_cost: 2,
      channel: "Dine In",
    },

    {
      date: "2026-08-10",
      order_id: "A002",
      outlet: "Outlet A",
      product: "Iced Latte",
      quantity: 1,
      unit_price: 6,
      unit_cost: 2,
      channel: "Grab",
    },

    {
      date: "2026-08-17",
      order_id: "A003",
      outlet: "Outlet B",
      product: "Iced Latte",
      quantity: 3,
      unit_price: 6,
      unit_cost: 2,
      channel: "Dine In",
    },

    {
      date: "2026-08-05",
      order_id: "A004",
      outlet: "Outlet A",
      product: "Matcha Latte",
      quantity: 4,
      unit_price: 7,
      unit_cost: 2.5,
      channel: "Dine In",
    },

    {
      date: "2026-08-12",
      order_id: "A005",
      outlet: "Outlet A",
      product: "Americano",
      quantity: 4,
      unit_price: 4,
      unit_cost: 1,
      channel: "Grab",
    },

    {
      date: "2026-08-19",
      order_id: "A006",
      outlet: "Outlet B",
      product: "Mocha",
      quantity: 2,
      unit_price: 6,
      unit_cost: 2,
      channel: "Dine In",
    },
  ];
}

/* =========================================================
   SAFETY TESTS
========================================================= */

describe("Brewlytics Investigation Safety", () => {
  /* -------------------------------------------------------
     1. UNKNOWN PRODUCT
  ------------------------------------------------------- */

  it("does not fabricate a product that does not exist", async () => {
    const file = makeExcelFile(normalRows());

    const data = await analyzeFiles([file], choices);

    const result = productTrend(data, "Unicorn Coffee");

    expect(result.evidence.found).toBe(false);

    expect(result.summary).toContain("No matching product");

    /*
     * There should be no fake sales numbers.
     */
    expect(result.evidence.latestUnits).toBeUndefined();

    expect(result.evidence.previousUnits).toBeUndefined();
  });

  /* -------------------------------------------------------
     2. UNKNOWN PRODUCT — PRICE
  ------------------------------------------------------- */

  it("does not fabricate pricing evidence for an unknown product", async () => {
    const file = makeExcelFile(normalRows());

    const data = await analyzeFiles([file], choices);

    const result = priceVsVolume(data, "Unicorn Coffee");

    expect(result.evidence.found).toBe(false);

    expect(result.evidence.latestPrice).toBeUndefined();

    expect(result.evidence.priceChangePct).toBeUndefined();
  });

  /* -------------------------------------------------------
     3. UNKNOWN PRODUCT — WEEKDAY
  ------------------------------------------------------- */

  it("does not fabricate weekday evidence for an unknown product", async () => {
    const file = makeExcelFile(normalRows());

    const data = await analyzeFiles([file], choices);

    const result = weekdayBreakdown(data, "Unicorn Coffee");

    expect(result.evidence.found).toBe(false);

    expect(result.evidence.weekdays).toBeUndefined();
  });

  /* -------------------------------------------------------
     4. MISSING CHANNEL DATA
  ------------------------------------------------------- */

  it("reports when channel information is unavailable", async () => {
    const rows = normalRows().map((row) => {
      const copy = { ...row };
      delete copy.channel;
      return copy;
    });

    const file = makeExcelFile(rows);

    const data = await analyzeFiles([file], choices);

    const result = channelBreakdown(data);

    expect(result.tool).toBe("channel_breakdown");

    expect(result.summary).toContain("not available");

    const channels = result.evidence.channels as unknown[];

    expect(channels).toHaveLength(0);
  });

  /* -------------------------------------------------------
     5. PRODUCT CHANNEL LIMITATION
  ------------------------------------------------------- */

  it("does not pretend business-wide channel data is product-specific", async () => {
    const file = makeExcelFile(normalRows());

    const data = await analyzeFiles([file], choices);

    const result = channelBreakdown(data, "Iced Latte");

    expect(result.evidence.limitation).toBeTruthy();

    expect(String(result.evidence.limitation)).toContain("business-wide");

    expect(String(result.evidence.limitation)).toContain("cannot yet isolate");
  });

  /* -------------------------------------------------------
     6. MISSING COST DATA
  ------------------------------------------------------- */

  it("reports incomplete cost coverage instead of presenting estimated profit as fully reliable", async () => {
    const rows = normalRows();

    /*
     * Remove the cost from one August Iced Latte row.
     */
    delete rows[6].unit_cost;

    const file = makeExcelFile(rows);

    const data = await analyzeFiles([file], choices);

    const result = profitability(data, "Iced Latte");

    expect(result.evidence.costsComplete).toBe(false);

    expect(result.evidence.businessCostCoveragePct).toBeLessThan(100);

    expect(result.evidence.limitation).toContain("costs are missing");
  });

  /* -------------------------------------------------------
     7. COMPLETE COST DATA
  ------------------------------------------------------- */

  it("removes the profitability limitation when costs are complete", async () => {
    const file = makeExcelFile(normalRows());

    const data = await analyzeFiles([file], choices);

    const result = profitability(data, "Iced Latte");

    expect(result.evidence.costsComplete).toBe(true);

    expect(result.evidence.limitation).toBeNull();
  });

  /* -------------------------------------------------------
     8. PRICE ≠ CAUSATION
  ------------------------------------------------------- */

  it("does not claim price caused a decline merely because price increased", async () => {
    const rows = normalRows();

    /*
     * July Iced Latte price = $6
     * August Iced Latte price = $7
     *
     * Units still fall.
     */

    rows[6].unit_price = 7;
    rows[7].unit_price = 7;
    rows[8].unit_price = 7;

    const file = makeExcelFile(rows);

    const data = await analyzeFiles([file], choices);

    const result = priceVsVolume(data, "Iced Latte");

    expect(result.evidence.priceChangePct).toBeGreaterThan(0);

    expect(result.evidence.volumeChangePct).toBeLessThan(0);

    /*
     * The wording should be cautious.
     */
    expect(result.summary).toContain("may be relevant");

    expect(result.summary).toContain("does not prove causation");

    /*
     * It should NOT say price definitely caused it.
     */
    expect(result.summary.toLowerCase()).not.toContain("price caused");
  });

  /* -------------------------------------------------------
     9. PRICE UNCHANGED
  ------------------------------------------------------- */

  it("does not blame price when price was unchanged", async () => {
    const file = makeExcelFile(normalRows());

    const data = await analyzeFiles([file], choices);

    const result = priceVsVolume(data, "Iced Latte");

    expect(result.evidence.priceChangePct).toBe(0);

    expect(result.evidence.volumeChangePct).toBe(-40);

    expect(result.summary).toContain("volume-driven");
  });

  /* -------------------------------------------------------
     10. ZERO PREVIOUS SALES
  ------------------------------------------------------- */

  it("does not calculate a fake percentage when the previous value is zero", async () => {
    const rows = normalRows();

    /*
     * New product appears only in August.
     */

    rows.push({
      date: "2026-08-21",
      order_id: "A007",
      outlet: "Outlet A",
      product: "Strawberry Latte",
      quantity: 2,
      unit_price: 7,
      unit_cost: 2.5,
      channel: "Dine In",
    });

    const file = makeExcelFile(rows);

    const data = await analyzeFiles([file], choices);

    const result = productTrend(data, "Strawberry Latte");

    /*
     * Current implementation treats this as
     * insufficient comparable monthly data.
     */
    expect(result.summary).toContain("not enough comparable");

    expect(result.evidence.unitsChangePct).toBeUndefined();
  });

  /* -------------------------------------------------------
     11. PROFITABILITY — UNKNOWN PRODUCT
  ------------------------------------------------------- */

  it("does not fabricate profitability for a nonexistent product", async () => {
    const file = makeExcelFile(normalRows());

    const data = await analyzeFiles([file], choices);

    const result = profitability(data, "Dragon Coffee");

    expect(result.evidence.found).toBe(false);

    expect(result.evidence.latestProfit).toBeUndefined();

    expect(result.evidence.latestMarginPct).toBeUndefined();
  });

  /* -------------------------------------------------------
     12. DISPATCHER PRESERVES FAILURE
  ------------------------------------------------------- */

  it("dispatcher preserves the product-not-found result", async () => {
    const file = makeExcelFile(normalRows());

    const data = await analyzeFiles([file], choices);

    const result = runInvestigationTool(
      "product_trend",
      data,
      "Definitely Not On Menu",
    );

    expect(result.tool).toBe("product_trend");

    expect(result.evidence.found).toBe(false);

    expect(result.summary).toContain("No matching product");
  });

  /* -------------------------------------------------------
     13. TRAIL MUST CONTAIN REAL EVIDENCE
  ------------------------------------------------------- */

  it("every executed investigation step contains evidence", async () => {
    const file = makeExcelFile(normalRows());

    const data = await analyzeFiles([file], choices);

    const tools = [
      "product_trend",
      "price_vs_volume",
      "compare_products",
      "channel_breakdown",
      "weekday_breakdown",
      "outlet_breakdown",
      "profitability",
    ] as const;

    const trail = tools.map((tool) =>
      runInvestigationTool(tool, data, "Iced Latte"),
    );

    expect(trail).toHaveLength(7);

    for (const step of trail) {
      expect(step.tool).toBeTruthy();

      expect(step.title.length).toBeGreaterThan(0);

      expect(step.summary.length).toBeGreaterThan(0);

      expect(Object.keys(step.evidence).length).toBeGreaterThan(0);
    }
  });

  /* -------------------------------------------------------
     14. EVIDENCE SHOULD RECONCILE
  ------------------------------------------------------- */

  it("trend evidence matches the deterministic analytics data", async () => {
    const file = makeExcelFile(normalRows());

    const data = await analyzeFiles([file], choices);

    const toolResult = productTrend(data, "Iced Latte");

    const august = data.investigation.monthlyProducts.find(
      (x) => x.month === data.latestLabel && x.product === "Iced Latte",
    );

    const july = data.investigation.monthlyProducts.find(
      (x) => x.month === data.previousLabel && x.product === "Iced Latte",
    );

    expect(august).toBeDefined();
    expect(july).toBeDefined();

    expect(toolResult.evidence.latestUnits).toBe(august!.units);

    expect(toolResult.evidence.previousUnits).toBe(july!.units);

    expect(toolResult.evidence.latestRevenue).toBe(august!.revenue);

    expect(toolResult.evidence.previousRevenue).toBe(july!.revenue);
  });
});
