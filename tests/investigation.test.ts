import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { analyzeFiles, CleaningChoices } from "../app/analyze";

/*
 * These tests verify the deterministic evidence
 * that gets sent to the Investigation Agent.
 *
 * The LLM should NEVER be responsible for calculating
 * these numbers itself.
 */

function makeExcelFile(
  rows: Record<string, unknown>[],
  name = "investigation-test.xlsx",
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
 * Controlled dataset
 *
 * JULY
 * Iced Latte:
 *   units = 10
 *   revenue = 60
 *   cost = 20
 *   profit = 40
 *
 * AUGUST
 * Iced Latte:
 *   units = 6
 *   revenue = 36
 *   cost = 12
 *   profit = 24
 *
 * So:
 *   units ↓40%
 *   revenue ↓40%
 *   profit ↓40%
 *   price stays S$6
 */

function investigationRows() {
  return [
    // =========================
    // JULY
    // =========================

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

    // =========================
    // AUGUST
    // =========================

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

describe("Brewlytics Investigation Agent deterministic evidence", () => {
  /*
   * PRODUCT TREND
   */
  it("calculates monthly product performance correctly", async () => {
    const file = makeExcelFile(investigationRows());

    const result = await analyzeFiles([file], choices);

    const july = result.investigation.monthlyProducts.find(
      (x) => x.month === "2026-07" && x.product === "Iced Latte",
    );

    const august = result.investigation.monthlyProducts.find(
      (x) => x.month === "2026-08" && x.product === "Iced Latte",
    );

    expect(july).toBeDefined();
    expect(august).toBeDefined();

    expect(july!.units).toBe(10);
    expect(july!.revenue).toBe(60);
    expect(july!.profit).toBe(40);
    expect(july!.avgPrice).toBe(6);
    expect(july!.transactions).toBe(3);

    expect(august!.units).toBe(6);
    expect(august!.revenue).toBe(36);
    expect(august!.profit).toBe(24);
    expect(august!.avgPrice).toBe(6);
    expect(august!.transactions).toBe(3);
  });

  /*
   * PRICE VS VOLUME
   *
   * Important for questions like:
   * "Did Iced Latte sales fall because I raised
   * the price?"
   */
  it("provides correct price and volume evidence", async () => {
    const file = makeExcelFile(investigationRows());

    const result = await analyzeFiles([file], choices);

    const rows = result.investigation.monthlyProducts.filter(
      (x) => x.product === "Iced Latte",
    );

    const july = rows.find((x) => x.month === "2026-07");

    const august = rows.find((x) => x.month === "2026-08");

    expect(july).toBeDefined();
    expect(august).toBeDefined();

    // Price unchanged
    expect(july!.avgPrice).toBe(6);
    expect(august!.avgPrice).toBe(6);

    // Volume fell
    expect(july!.units).toBe(10);
    expect(august!.units).toBe(6);

    const volumeChange = ((august!.units - july!.units) / july!.units) * 100;

    const priceChange =
      ((august!.avgPrice - july!.avgPrice) / july!.avgPrice) * 100;

    expect(volumeChange).toBe(-40);
    expect(priceChange).toBe(0);
  });

  /*
   * PRODUCT COMPARISON
   */
  it("allows products to be compared in the same month", async () => {
    const file = makeExcelFile(investigationRows());

    const result = await analyzeFiles([file], choices);

    const august = result.investigation.monthlyProducts.filter(
      (x) => x.month === "2026-08",
    );

    const icedLatte = august.find((x) => x.product === "Iced Latte");

    const matcha = august.find((x) => x.product === "Matcha Latte");

    expect(icedLatte).toBeDefined();
    expect(matcha).toBeDefined();

    expect(icedLatte!.units).toBe(6);
    expect(matcha!.units).toBe(7);

    expect(icedLatte!.revenue).toBe(36);
    expect(matcha!.revenue).toBe(49);
  });

  /*
   * CHANNEL BREAKDOWN
   */
  it("calculates monthly channel performance correctly", async () => {
    const file = makeExcelFile(investigationRows());

    const result = await analyzeFiles([file], choices);

    const augustDineIn = result.investigation.monthlyChannels.find(
      (x) => x.month === "2026-08" && x.channel === "Dine In",
    );

    const augustGrab = result.investigation.monthlyChannels.find(
      (x) => x.month === "2026-08" && x.channel === "Grab",
    );

    expect(augustDineIn).toBeDefined();
    expect(augustGrab).toBeDefined();

    /*
     * Dine In:
     *
     * Iced Latte = 2 + 3 units = $30
     * Matcha      = 4 units     = $28
     * Americano   = 5 units     = $20
     *
     * Revenue = $78
     */

    expect(augustDineIn!.units).toBe(14);
    expect(augustDineIn!.revenue).toBe(78);

    /*
     * Grab:
     *
     * Iced Latte = 1 unit = $6
     * Matcha     = 3 units = $21
     *
     * Revenue = $27
     */

    expect(augustGrab!.units).toBe(4);
    expect(augustGrab!.revenue).toBe(27);
  });

  /*
   * OUTLET BREAKDOWN
   */
  it("calculates monthly outlet performance correctly", async () => {
    const file = makeExcelFile(investigationRows());

    const result = await analyzeFiles([file], choices);

    const outletA = result.investigation.monthlyOutlets.find(
      (x) => x.month === "2026-08" && x.outlet === "Outlet A",
    );

    const outletB = result.investigation.monthlyOutlets.find(
      (x) => x.month === "2026-08" && x.outlet === "Outlet B",
    );

    expect(outletA).toBeDefined();
    expect(outletB).toBeDefined();

    /*
     * Outlet A:
     * Iced Latte = 3 units, $18
     * Matcha     = 7 units, $49
     *
     * total = 10 units, $67
     */

    expect(outletA!.units).toBe(10);
    expect(outletA!.revenue).toBe(67);

    /*
     * Outlet B:
     * Iced Latte = 3 units, $18
     * Americano  = 5 units, $20
     *
     * total = 8 units, $38
     */

    expect(outletB!.units).toBe(8);
    expect(outletB!.revenue).toBe(38);
  });

  /*
   * PROFITABILITY
   */
  it("calculates product profit correctly", async () => {
    const file = makeExcelFile(investigationRows());

    const result = await analyzeFiles([file], choices);

    const icedLatte = result.investigation.monthlyProducts.find(
      (x) => x.month === "2026-08" && x.product === "Iced Latte",
    );

    /*
     * 6 units
     * Revenue = 6 × $6 = $36
     * Cost    = 6 × $2 = $12
     * Profit  = $24
     */

    expect(icedLatte).toBeDefined();
    expect(icedLatte!.revenue).toBe(36);
    expect(icedLatte!.profit).toBe(24);
  });

  /*
   * TRANSACTION COUNTING
   */
  it("counts unique orders instead of treating units as transactions", async () => {
    const file = makeExcelFile(investigationRows());

    const result = await analyzeFiles([file], choices);

    const icedLatte = result.investigation.monthlyProducts.find(
      (x) => x.month === "2026-07" && x.product === "Iced Latte",
    );

    /*
     * 10 units were sold across only THREE orders.
     */

    expect(icedLatte!.units).toBe(10);
    expect(icedLatte!.transactions).toBe(3);
  });

  /*
   * WEEKDAY ANALYSIS
   */
  it("creates weekday-level product evidence", async () => {
    const file = makeExcelFile(investigationRows());

    const result = await analyzeFiles([file], choices);

    const icedLatteRows = result.investigation.weekdayProducts.filter(
      (x) => x.month === "2026-08" && x.product === "Iced Latte",
    );

    expect(icedLatteRows.length).toBeGreaterThan(0);

    expect(icedLatteRows.reduce((total, row) => total + row.units, 0)).toBe(6);

    expect(icedLatteRows.reduce((total, row) => total + row.revenue, 0)).toBe(
      36,
    );
  });

  /*
   * CROSS-CHECK
   *
   * Product totals and channel totals should reconcile
   * to the same August revenue.
   */
  it("reconciles investigation evidence across dimensions", async () => {
    const file = makeExcelFile(investigationRows());

    const result = await analyzeFiles([file], choices);

    const productRevenue = result.investigation.monthlyProducts
      .filter((x) => x.month === "2026-08")
      .reduce((total, row) => total + row.revenue, 0);

    const channelRevenue = result.investigation.monthlyChannels
      .filter((x) => x.month === "2026-08")
      .reduce((total, row) => total + row.revenue, 0);

    const outletRevenue = result.investigation.monthlyOutlets
      .filter((x) => x.month === "2026-08")
      .reduce((total, row) => total + row.revenue, 0);

    expect(productRevenue).toBe(105);
    expect(channelRevenue).toBe(105);
    expect(outletRevenue).toBe(105);

    expect(productRevenue).toBe(result.metrics.revenue);
  });

  /*
   * CLEANING → INVESTIGATION INTEGRATION
   */
  it("uses cleaned product names in investigation evidence", async () => {
    const rows = investigationRows();

    rows[6].product = " iced   latte ";
    rows[7].product = "ICED LATTE";

    const file = makeExcelFile(rows);

    const result = await analyzeFiles([file], choices);

    const augustIcedLatte = result.investigation.monthlyProducts.filter(
      (x) => x.month === "2026-08" && x.product === "Iced Latte",
    );

    expect(augustIcedLatte).toHaveLength(1);

    expect(augustIcedLatte[0].units).toBe(6);
  });
});
