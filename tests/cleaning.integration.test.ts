import { describe, expect, it } from "vitest";
import { analyzeFiles, scanFiles } from "../app/analyze";

function makeCSV(rows: string[]) {
  const csv = [
    "date,outlet,product,quantity,unit_price,unit_cost,channel",
    ...rows,
  ].join("\n");

  return new File([csv], "sales.csv", {
    type: "text/csv",
  });
}

const validRows = [
  // JULY
  "2026-07-01,Orchard,Iced Latte,10,6,2,Walk-in",
  "2026-07-02,Orchard,Iced Latte,10,6,2,Walk-in",
  "2026-07-03,Orchard,Matcha Latte,10,7,2,Delivery",
  "2026-07-04,Orchard,Matcha Latte,10,7,2,Walk-in",
  "2026-07-05,Orchard,Americano,10,5,1,Walk-in",

  // AUGUST
  "2026-08-01,Orchard,Iced Latte,10,6,2,Walk-in",
  "2026-08-02,Orchard,Iced Latte,10,6,2,Walk-in",
  "2026-08-03,Orchard,Matcha Latte,10,7,2,Delivery",
  "2026-08-04,Orchard,Matcha Latte,10,7,2,Walk-in",
  "2026-08-05,Orchard,Americano,10,5,1,Walk-in",
];

describe("Brewlytics cleaning pipeline", () => {
  it("accepts a valid two-month sales dataset", async () => {
    const file = makeCSV(validRows);

    const scan = await scanFiles([file]);

    expect(scan.totalRows).toBe(10);
    expect(scan.missing).toHaveLength(0);
    expect(scan.duplicates).toHaveLength(0);
  });

  it("detects a missing product value", async () => {
    const rows = [...validRows];

    rows[1] = "2026-07-02,Orchard,,10,6,2,Walk-in";

    const file = makeCSV(rows);
    const scan = await scanFiles([file]);

    const productIssues = scan.missing.filter(
      (issue) => issue.field === "product",
    );

    expect(productIssues).toHaveLength(1);
    expect(productIssues[0].rowNumber).toBe(3);
  });

  it("detects a missing outlet value", async () => {
    const rows = [...validRows];

    rows[2] = "2026-07-03,,Matcha Latte,10,7,2,Delivery";

    const file = makeCSV(rows);
    const scan = await scanFiles([file]);

    const outletIssues = scan.missing.filter(
      (issue) => issue.field === "outlet",
    );

    expect(outletIssues).toHaveLength(1);
  });

  it("detects a missing quantity value", async () => {
    const rows = [...validRows];

    rows[3] = "2026-07-04,Orchard,Matcha Latte,,7,2,Walk-in";

    const file = makeCSV(rows);
    const scan = await scanFiles([file]);

    const quantityIssues = scan.missing.filter(
      (issue) => issue.field === "quantity",
    );

    expect(quantityIssues).toHaveLength(1);
  });

  it("detects duplicate sales rows", async () => {
    const duplicate = "2026-08-05,Orchard,Americano,10,5,1,Walk-in";

    const file = makeCSV([...validRows, duplicate]);

    const scan = await scanFiles([file]);

    expect(scan.totalRows).toBe(11);
    expect(scan.duplicates).toHaveLength(1);

    expect(scan.duplicates[0].rowIds).toHaveLength(2);
  });

  it("keeps duplicates when the owner chooses keep", async () => {
    const duplicate = "2026-08-05,Orchard,Americano,10,5,1,Walk-in";

    const file = makeCSV([...validRows, duplicate]);

    const result = await analyzeFiles([file], {
      values: {},
      duplicateAction: "keep",
    });

    /*
     * August normally:
     *
     * Iced Latte = 20 × $6 = $120
     * Matcha      = 20 × $7 = $140
     * Americano   = 10 × $5 = $50
     *
     * Revenue = $310
     *
     * Duplicate Americano adds $50
     *
     * Revenue = $360
     */

    expect(result.metrics.revenue).toBe(360);
  });

  it("removes duplicates when the owner chooses remove", async () => {
    const duplicate = "2026-08-05,Orchard,Americano,10,5,1,Walk-in";

    const file = makeCSV([...validRows, duplicate]);

    const result = await analyzeFiles([file], {
      values: {},
      duplicateAction: "remove",
    });

    expect(result.metrics.revenue).toBe(310);
  });

  it("uses an owner-edited cleaned value", async () => {
    const file = makeCSV(validRows);

    const scan = await scanFiles([file]);

    /*
     * Find August 1 Iced Latte.
     */

    const row = scan.rows.find(
      (r) => r.values.product === "Iced Latte" && r.rowNumber === 7,
    );

    expect(row).toBeDefined();

    /*
     * Owner changes quantity:
     *
     * Original = 10
     * Cleaned  = 20
     *
     * This adds another:
     * 10 × $6 = $60 revenue
     *
     * Original August revenue = $310
     * New revenue = $370
     */

    const result = await analyzeFiles([file], {
      values: {
        [`${row!.rowId}::quantity`]: "20",
      },
      duplicateAction: "keep",
    });

    expect(result.metrics.revenue).toBe(370);

    const icedLatte = result.products.find((p) => p.name === "Iced Latte");

    expect(icedLatte?.units).toBe(30);
  });

  it("rejects a dataset containing only one month", async () => {
    const oneMonthRows = [
      "2026-08-01,Orchard,Iced Latte,10,6,2,Walk-in",
      "2026-08-02,Orchard,Iced Latte,10,6,2,Walk-in",
      "2026-08-03,Orchard,Iced Latte,10,6,2,Walk-in",
      "2026-08-04,Orchard,Iced Latte,10,6,2,Walk-in",
      "2026-08-05,Orchard,Iced Latte,10,6,2,Walk-in",
      "2026-08-06,Orchard,Iced Latte,10,6,2,Walk-in",
      "2026-08-07,Orchard,Iced Latte,10,6,2,Walk-in",
      "2026-08-08,Orchard,Iced Latte,10,6,2,Walk-in",
      "2026-08-09,Orchard,Iced Latte,10,6,2,Walk-in",
      "2026-08-10,Orchard,Iced Latte,10,6,2,Walk-in",
    ];

    const file = makeCSV(oneMonthRows);

    await expect(analyzeFiles([file])).rejects.toThrow(/At least two months/i);
  });

  it("rejects a dataset with too few valid sales rows", async () => {
    const rows = [
      "2026-07-01,Orchard,Iced Latte,10,6,2,Walk-in",
      "2026-07-02,Orchard,Iced Latte,10,6,2,Walk-in",
      "2026-07-03,Orchard,Iced Latte,10,6,2,Walk-in",
      "2026-07-04,Orchard,Iced Latte,10,6,2,Walk-in",

      "2026-08-01,Orchard,Iced Latte,10,6,2,Walk-in",
      "2026-08-02,Orchard,Iced Latte,10,6,2,Walk-in",
      "2026-08-03,Orchard,Iced Latte,10,6,2,Walk-in",
      "2026-08-04,Orchard,Iced Latte,10,6,2,Walk-in",
    ];

    const file = makeCSV(rows);

    await expect(analyzeFiles([file])).rejects.toThrow(
      /fewer than 10 valid dated rows/i,
    );
  });

  it("rejects an empty upload", async () => {
    await expect(analyzeFiles([])).rejects.toThrow(/Choose at least one/i);
  });
});
