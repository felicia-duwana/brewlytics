import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { scanFiles, analyzeFiles, CleaningChoices } from "../app/analyze";

/* ---------------------------------------------------------
   Helper: create an Excel File entirely in memory
--------------------------------------------------------- */

function makeExcelFile(rows: Record<string, unknown>[], name = "test.xlsx") {
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

/* ---------------------------------------------------------
   We need >= 10 rows and >= 2 months because analyzeFiles()
   validates the dataset before analysing it.
--------------------------------------------------------- */

function baseRows() {
  return [
    {
      date: "2026-07-01",
      order_id: "ORD001",
      outlet: "Outlet A",
      product: "Americano",
      quantity: 2,
      unit_price: 4,
      unit_cost: 1,
      channel: "Dine In",
    },
    {
      date: "2026-07-03",
      order_id: "ORD002",
      outlet: "Outlet A",
      product: "Latte",
      quantity: 1,
      unit_price: 6,
      unit_cost: 2,
      channel: "Dine In",
    },
    {
      date: "2026-07-05",
      order_id: "ORD003",
      outlet: "Outlet A",
      product: "Mocha",
      quantity: 2,
      unit_price: 6,
      unit_cost: 2,
      channel: "Grab",
    },
    {
      date: "2026-07-07",
      order_id: "ORD004",
      outlet: "Outlet A",
      product: "Tea",
      quantity: 1,
      unit_price: 4,
      unit_cost: 1,
      channel: "Grab",
    },
    {
      date: "2026-07-09",
      order_id: "ORD005",
      outlet: "Outlet A",
      product: "Espresso",
      quantity: 1,
      unit_price: 4,
      unit_cost: 1,
      channel: "Dine In",
    },

    {
      date: "2026-08-01",
      order_id: "ORD006",
      outlet: "Outlet A",
      product: "Americano",
      quantity: 1,
      unit_price: 4,
      unit_cost: 1,
      channel: "Dine In",
    },
    {
      date: "2026-08-03",
      order_id: "ORD007",
      outlet: "Outlet A",
      product: "Latte",
      quantity: 1,
      unit_price: 6,
      unit_cost: 2,
      channel: "Dine In",
    },
    {
      date: "2026-08-05",
      order_id: "ORD008",
      outlet: "Outlet A",
      product: "Mocha",
      quantity: 1,
      unit_price: 6,
      unit_cost: 2,
      channel: "Grab",
    },
    {
      date: "2026-08-07",
      order_id: "ORD009",
      outlet: "Outlet A",
      product: "Tea",
      quantity: 1,
      unit_price: 4,
      unit_cost: 1,
      channel: "Grab",
    },
    {
      date: "2026-08-09",
      order_id: "ORD010",
      outlet: "Outlet A",
      product: "Espresso",
      quantity: 1,
      unit_price: 4,
      unit_cost: 1,
      channel: "Dine In",
    },
  ];
}

const defaultChoices: CleaningChoices = {
  values: {},
  duplicateAction: "remove",
};

/* =========================================================
   TESTS
========================================================= */

describe("Brewlytics automatic cleaning", () => {
  it("automatically capitalises product names", async () => {
    const rows = baseRows();

    rows[0].product = "matcha latte";

    const file = makeExcelFile(rows);

    const scan = await scanFiles([file]);

    expect(scan.rows[0].values.product).toBe("matcha latte");

    expect(scan.rows[0].cleanedValues.product).toBe("Matcha Latte");

    expect(scan.rows[0].autoChangedFields).toContain("product");
  });

  it("removes leading, trailing and repeated spaces", async () => {
    const rows = baseRows();

    rows[0].product = "   Matcha    Latte   ";

    const file = makeExcelFile(rows);

    const scan = await scanFiles([file]);

    expect(scan.rows[0].values.product).toBe("   Matcha    Latte   ");

    expect(scan.rows[0].cleanedValues.product).toBe("Matcha Latte");
  });

  it("preserves the original uploaded value", async () => {
    const rows = baseRows();

    rows[0].product = "matcha latte";

    const file = makeExcelFile(rows);

    const scan = await scanFiles([file]);

    // Original MUST remain untouched
    expect(scan.rows[0].values.product).toBe("matcha latte");

    // Cleaned copy can be different
    expect(scan.rows[0].cleanedValues.product).toBe("Matcha Latte");
  });

  it("does not invent a missing product value", async () => {
    const rows = baseRows();

    rows[0].product = "";

    const file = makeExcelFile(rows);

    const scan = await scanFiles([file]);

    expect(scan.rows[0].values.product).toBe("");

    expect(scan.rows[0].cleanedValues.product).toBe("");

    expect(
      scan.missing.some(
        (issue) =>
          issue.rowId === scan.rows[0].rowId && issue.field === "product",
      ),
    ).toBe(true);
  });

  it("automatically standardises outlet names", async () => {
    const rows = baseRows();

    rows[0].outlet = "   outlet   a   ";

    const file = makeExcelFile(rows);

    const scan = await scanFiles([file]);

    expect(scan.rows[0].values.outlet).toBe("   outlet   a   ");

    expect(scan.rows[0].cleanedValues.outlet).toBe("Outlet A");
  });

  it("automatically standardises channel names", async () => {
    const rows = baseRows();

    rows[0].channel = "GRAB";

    const file = makeExcelFile(rows);

    const scan = await scanFiles([file]);

    expect(scan.rows[0].values.channel).toBe("GRAB");

    expect(scan.rows[0].cleanedValues.channel).toBe("Grab");
  });

  it("manual owner edits override automatic cleaning", async () => {
    const rows = baseRows();

    rows[5].product = "matcha latte";

    const file = makeExcelFile(rows);

    const scan = await scanFiles([file]);

    const rowId = scan.rows[5].rowId;

    const choices: CleaningChoices = {
      values: {
        [`${rowId}::product`]: "Matcha Oat Latte",
      },
      duplicateAction: "remove",
    };

    const result = await analyzeFiles([file], choices);

    expect(result.products.some((p) => p.name === "Matcha Oat Latte")).toBe(
      true,
    );

    expect(result.products.some((p) => p.name === "Matcha Latte")).toBe(false);
  });

  it("merges differently-cased product names after cleaning", async () => {
    const rows = baseRows();

    /*
     * Put both variants in the latest month so they
     * should become one product in result.products.
     */
    rows[5].product = "matcha latte";
    rows[6].product = "Matcha Latte";

    const file = makeExcelFile(rows);

    const result = await analyzeFiles([file], defaultChoices);

    const matchaProducts = result.products.filter(
      (p) => p.name === "Matcha Latte",
    );

    expect(matchaProducts).toHaveLength(1);

    expect(matchaProducts[0].units).toBe(2);
  });

  it("detects exact duplicate rows", async () => {
    const rows = baseRows();

    rows.push({
      ...rows[9],
    });

    const file = makeExcelFile(rows);

    const scan = await scanFiles([file]);

    expect(scan.duplicates.length).toBe(1);

    expect(scan.duplicates[0].rowIds.length).toBe(2);
  });

  it("removes exact duplicates when owner selects remove", async () => {
    const rows = baseRows();

    rows.push({
      ...rows[9],
    });

    const file = makeExcelFile(rows);

    const result = await analyzeFiles([file], {
      values: {},
      duplicateAction: "remove",
    });

    /*
     * Latest month originally contains 5 orders.
     * The duplicate must NOT create a sixth transaction.
     */
    expect(result.metrics.transactions).toBe(5);
  });

  it("keeps exact duplicates when owner selects keep", async () => {
    const rows = baseRows();

    /*
     * Exact duplicate row has same order_id, so
     * transactions would still be deduplicated by
     * order ID. Therefore test revenue instead.
     */
    rows.push({
      ...rows[9],
    });

    const file = makeExcelFile(rows);

    const removed = await analyzeFiles([file], {
      values: {},
      duplicateAction: "remove",
    });

    const kept = await analyzeFiles([file], {
      values: {},
      duplicateAction: "keep",
    });

    expect(kept.metrics.revenue).toBeGreaterThan(removed.metrics.revenue);

    expect(kept.metrics.revenue - removed.metrics.revenue).toBe(4);
  });

  it("does not remove separate transactions that become identical after text cleaning", async () => {
    const rows = baseRows();

    /*
     * These are TWO real transactions with different order IDs.
     * Their text becomes identical after cleaning.
     */
    rows[5] = {
      ...rows[5],
      order_id: "ORD006",
      product: "matcha latte",
      outlet: "outlet a",
      channel: "grab",
    };

    rows[6] = {
      ...rows[5],
      order_id: "ORD007",
      product: "Matcha Latte",
      outlet: "Outlet A",
      channel: "Grab",
    };

    const file = makeExcelFile(rows);

    const result = await analyzeFiles([file], {
      values: {},
      duplicateAction: "remove",
    });

    const matcha = result.products.find((p) => p.name === "Matcha Latte");

    /*
     * Both transactions must survive.
     * Cleaning should standardise their text,
     * NOT mistake one transaction for a duplicate.
     */
    expect(matcha).toBeDefined();
    expect(matcha!.units).toBe(2);

    expect(result.metrics.transactions).toBe(5);
  });
});
