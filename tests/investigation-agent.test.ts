import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { analyzeFiles, CleaningChoices } from "../app/analyze";

import {
  productTrend,
  priceVsVolume,
  compareProducts,
  channelBreakdown,
  weekdayBreakdown,
  outletBreakdown,
  profitability,
  runInvestigationTool,
} from "../app/investigation";

/* =========================================================
   HELPERS
========================================================= */

function makeExcelFile(
  rows: Record<string, unknown>[],
  name = "agent-test.xlsx",
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
 * CONTROLLED DATASET
 *
 * ICED LATTE
 *
 * July:
 * units   = 10
 * revenue = $60
 * cost    = $20
 * profit  = $40
 *
 * August:
 * units   = 6
 * revenue = $36
 * cost    = $12
 * profit  = $24
 *
 * Therefore:
 *
 * Units   ↓40%
 * Revenue ↓40%
 * Profit  ↓40%
 * Price   unchanged at $6
 */

function rows() {
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
      quantity: 3,
      unit_price: 7,
      unit_cost: 2.5,
      channel: "Dine In",
    },

    {
      date: "2026-07-10",
      order_id: "J005",
      outlet: "Outlet A",
      product: "Matcha Latte",
      quantity: 2,
      unit_price: 7,
      unit_cost: 2.5,
      channel: "Grab",
    },

    {
      date: "2026-07-17",
      order_id: "J006",
      outlet: "Outlet B",
      product: "Americano",
      quantity: 4,
      unit_price: 4,
      unit_cost: 1,
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
      product: "Matcha Latte",
      quantity: 3,
      unit_price: 7,
      unit_cost: 2.5,
      channel: "Grab",
    },

    {
      date: "2026-08-19",
      order_id: "A006",
      outlet: "Outlet B",
      product: "Americano",
      quantity: 5,
      unit_price: 4,
      unit_cost: 1,
      channel: "Dine In",
    },
  ];
}

/* =========================================================
   TESTS
========================================================= */

describe("Brewlytics Investigation Tools", () => {
  /* -------------------------------------------------------
     PRODUCT TREND
  ------------------------------------------------------- */

  it("productTrend detects the Iced Latte decline", async () => {
    const file = makeExcelFile(rows());

    const data = await analyzeFiles([file], choices);

    const result = productTrend(data, "Iced Latte");

    expect(result.tool).toBe("product_trend");

    expect(result.evidence.product).toBe("Iced Latte");

    expect(result.evidence.previousUnits).toBe(10);

    expect(result.evidence.latestUnits).toBe(6);

    expect(result.evidence.unitsChangePct).toBe(-40);

    expect(result.evidence.revenueChangePct).toBe(-40);

    expect(result.evidence.profitChangePct).toBe(-40);

    expect(result.summary).toContain("fell 40.0%");
  });

  /* -------------------------------------------------------
     PRODUCT NAME MATCHING
  ------------------------------------------------------- */

  it("matches product names case-insensitively", async () => {
    const file = makeExcelFile(rows());

    const data = await analyzeFiles([file], choices);

    const result = productTrend(data, "iced latte");

    expect(result.evidence.product).toBe("Iced Latte");

    expect(result.evidence.latestUnits).toBe(6);
  });

  it("supports partial product matching", async () => {
    const file = makeExcelFile(rows());

    const data = await analyzeFiles([file], choices);

    const result = productTrend(data, "iced");

    expect(result.evidence.product).toBe("Iced Latte");
  });

  /* -------------------------------------------------------
     PRICE VS VOLUME
  ------------------------------------------------------- */

  it("priceVsVolume identifies a volume-driven decline when price is unchanged", async () => {
    const file = makeExcelFile(rows());

    const data = await analyzeFiles([file], choices);

    const result = priceVsVolume(data, "Iced Latte");

    expect(result.tool).toBe("price_vs_volume");

    expect(result.evidence.previousPrice).toBe(6);

    expect(result.evidence.latestPrice).toBe(6);

    expect(result.evidence.priceChangePct).toBe(0);

    expect(result.evidence.volumeChangePct).toBe(-40);

    expect(result.summary).toContain("volume-driven");
  });

  /* -------------------------------------------------------
     PRODUCT COMPARISON
  ------------------------------------------------------- */

  it("compareProducts compares target against other menu products", async () => {
    const file = makeExcelFile(rows());

    const data = await analyzeFiles([file], choices);

    const result = compareProducts(data, "Iced Latte");

    expect(result.tool).toBe("compare_products");

    const target = result.evidence.target as {
      product: string;
      previousUnits: number;
      latestUnits: number;
      unitsChangePct: number;
    };

    expect(target.product).toBe("Iced Latte");

    expect(target.previousUnits).toBe(10);
    expect(target.latestUnits).toBe(6);
    expect(target.unitsChangePct).toBe(-40);

    const peers = result.evidence.peers as Array<{
      product: string;
    }>;

    expect(peers.length).toBeGreaterThan(0);

    expect(peers.some((p) => p.product === "Matcha Latte")).toBe(true);
  });

  /* -------------------------------------------------------
     CHANNEL BREAKDOWN
  ------------------------------------------------------- */

  it("channelBreakdown returns available channels", async () => {
    const file = makeExcelFile(rows());

    const data = await analyzeFiles([file], choices);

    const result = channelBreakdown(data, "Iced Latte");

    expect(result.tool).toBe("channel_breakdown");

    const channels = result.evidence.channels as Array<{
      channel: string;
    }>;

    expect(channels.some((x) => x.channel === "Dine In")).toBe(true);

    expect(channels.some((x) => x.channel === "Grab")).toBe(true);
  });

  /*
   * VERY IMPORTANT.
   *
   * Your current channel aggregates are business-wide,
   * not product × channel.
   *
   * Therefore the tool MUST expose that limitation
   * instead of pretending these are Iced Latte-only
   * channel numbers.
   */

  it("channelBreakdown clearly reports its product-level limitation", async () => {
    const file = makeExcelFile(rows());

    const data = await analyzeFiles([file], choices);

    const result = channelBreakdown(data, "Iced Latte");

    expect(result.evidence.limitation).toContain("business-wide");
  });

  /* -------------------------------------------------------
     WEEKDAY BREAKDOWN
  ------------------------------------------------------- */

  it("weekdayBreakdown analyses the selected product", async () => {
    const file = makeExcelFile(rows());

    const data = await analyzeFiles([file], choices);

    const result = weekdayBreakdown(data, "Iced Latte");

    expect(result.tool).toBe("weekday_breakdown");

    expect(result.evidence.product).toBe("Iced Latte");

    const weekdays = result.evidence.weekdays as Array<{
      weekday: string;
      previousUnits: number;
      latestUnits: number;
    }>;

    expect(weekdays).toHaveLength(7);

    expect(weekdays.some((x) => x.weekday === "Monday")).toBe(true);

    expect(weekdays.some((x) => x.weekday === "Sunday")).toBe(true);
  });

  /* -------------------------------------------------------
     OUTLET BREAKDOWN
  ------------------------------------------------------- */

  it("outletBreakdown compares available outlets", async () => {
    const file = makeExcelFile(rows());

    const data = await analyzeFiles([file], choices);

    const result = outletBreakdown(data);

    expect(result.tool).toBe("outlet_breakdown");

    const outlets = result.evidence.outlets as Array<{
      outlet: string;
    }>;

    expect(outlets.some((x) => x.outlet === "Outlet A")).toBe(true);

    expect(outlets.some((x) => x.outlet === "Outlet B")).toBe(true);
  });

  /* -------------------------------------------------------
     PROFITABILITY
  ------------------------------------------------------- */

  it("profitability calculates Iced Latte margin correctly", async () => {
    const file = makeExcelFile(rows());

    const data = await analyzeFiles([file], choices);

    const result = profitability(data, "Iced Latte");

    expect(result.tool).toBe("profitability");

    expect(result.evidence.previousProfit).toBe(40);

    expect(result.evidence.latestProfit).toBe(24);

    expect(result.evidence.profitChangePct).toBe(-40);

    /*
     * $24 profit / $36 revenue
     * = 66.7%
     */
    expect(result.evidence.latestMarginPct).toBe(66.7);
  });

  /* -------------------------------------------------------
     UNKNOWN PRODUCT
  ------------------------------------------------------- */

  it("does not invent evidence for a nonexistent product", async () => {
    const file = makeExcelFile(rows());

    const data = await analyzeFiles([file], choices);

    const result = productTrend(data, "Unicorn Frappuccino");

    expect(result.evidence.found).toBe(false);

    expect(result.summary).toContain("No matching product");
  });

  /* -------------------------------------------------------
     TOOL DISPATCHER
  ------------------------------------------------------- */

  it("runInvestigationTool dispatches product_trend correctly", async () => {
    const file = makeExcelFile(rows());

    const data = await analyzeFiles([file], choices);

    const result = runInvestigationTool("product_trend", data, "Iced Latte");

    expect(result.tool).toBe("product_trend");

    expect(result.evidence.product).toBe("Iced Latte");
  });

  it("runInvestigationTool dispatches price_vs_volume correctly", async () => {
    const file = makeExcelFile(rows());

    const data = await analyzeFiles([file], choices);

    const result = runInvestigationTool("price_vs_volume", data, "Iced Latte");

    expect(result.tool).toBe("price_vs_volume");

    expect(result.evidence.priceChangePct).toBe(0);
  });

  it("runInvestigationTool dispatches compare_products correctly", async () => {
    const file = makeExcelFile(rows());

    const data = await analyzeFiles([file], choices);

    const result = runInvestigationTool("compare_products", data, "Iced Latte");

    expect(result.tool).toBe("compare_products");
  });

  it("runInvestigationTool dispatches channel_breakdown correctly", async () => {
    const file = makeExcelFile(rows());

    const data = await analyzeFiles([file], choices);

    const result = runInvestigationTool(
      "channel_breakdown",
      data,
      "Iced Latte",
    );

    expect(result.tool).toBe("channel_breakdown");
  });

  it("runInvestigationTool dispatches weekday_breakdown correctly", async () => {
    const file = makeExcelFile(rows());

    const data = await analyzeFiles([file], choices);

    const result = runInvestigationTool(
      "weekday_breakdown",
      data,
      "Iced Latte",
    );

    expect(result.tool).toBe("weekday_breakdown");
  });

  it("runInvestigationTool dispatches outlet_breakdown correctly", async () => {
    const file = makeExcelFile(rows());

    const data = await analyzeFiles([file], choices);

    const result = runInvestigationTool("outlet_breakdown", data);

    expect(result.tool).toBe("outlet_breakdown");
  });

  it("runInvestigationTool dispatches profitability correctly", async () => {
    const file = makeExcelFile(rows());

    const data = await analyzeFiles([file], choices);

    const result = runInvestigationTool("profitability", data, "Iced Latte");

    expect(result.tool).toBe("profitability");
  });

  /* -------------------------------------------------------
     TRAIL INTEGRITY
  ------------------------------------------------------- */

  it("creates investigation steps from actual executed tools", async () => {
    const file = makeExcelFile(rows());

    const data = await analyzeFiles([file], choices);

    const tools = [
      "product_trend",
      "price_vs_volume",
      "compare_products",
      "weekday_breakdown",
      "profitability",
    ] as const;

    const trail = tools.map((tool) =>
      runInvestigationTool(tool, data, "Iced Latte"),
    );

    expect(trail).toHaveLength(5);

    expect(trail.map((x) => x.tool)).toEqual([
      "product_trend",
      "price_vs_volume",
      "compare_products",
      "weekday_breakdown",
      "profitability",
    ]);

    /*
     * Every visible trail step has real evidence.
     */
    for (const step of trail) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.summary.length).toBeGreaterThan(0);

      expect(Object.keys(step.evidence).length).toBeGreaterThan(0);
    }
  });
});
