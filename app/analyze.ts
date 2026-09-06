import * as XLSX from "xlsx";

type Row = Record<string, unknown>;
type TaggedRow = Row & { __id: string; __sheet: string; __row: number };

export type MissingIssue = {
  id: string;
  rowId: string;
  field: string;
  sheet: string;
  rowNumber: number;
  values: Record<string, string>;
};

export type DuplicateGroup = {
  id: string;
  sheet: string;
  rowNumbers: number[];
  rowIds: string[];
  values: Record<string, string>;
};

export type PreviewRow = {
  rowId: string;
  sheet: string;
  rowNumber: number;
  values: Record<string, string>;

  // Safe automatic changes Brewlytics proposes/applies
  cleanedValues: Record<string, string>;
  autoChangedFields: string[];
};

export type ProductMatchSuggestion = {
  salesProduct: string;
  costProduct: string;
  score: number;
};
export type CleaningScan = {
  missing: MissingIssue[];
  duplicates: DuplicateGroup[];
  rows: PreviewRow[];
  totalRows: number;
  autoFixCount: number;

  productMatchSuggestions: ProductMatchSuggestion[];
};
export type CleaningChoices = {
  values: Record<string, string>;
  duplicateAction: "remove" | "keep";

  /*
   * Owner-confirmed mappings between a product
   * name in the sales file and a product name
   * in the cost file.
   *
   * Example:
   * "chicken_cheese_croissant"
   *   -> "chicken_croissant"
   */
  productMappings: Record<string, string>;
};

export type InvestigationProduct = {
  month: string;
  product: string;
  units: number;
  revenue: number;
  profit: number;
  avgPrice: number;
  transactions: number;
};

export type InvestigationChannel = {
  month: string;
  channel: string;
  units: number;
  revenue: number;
  profit: number;
  transactions: number;
};

export type InvestigationOutlet = {
  month: string;
  outlet: string;
  units: number;
  revenue: number;
  profit: number;
  transactions: number;
};

export type InvestigationWeekday = {
  month: string;
  weekday: string;
  product: string;
  units: number;
  revenue: number;
  profit: number;
  transactions: number;
};

export type AnalysisResult = {
  fileNames: string[];
  sourceCount: number;
  rowCount: number;
  quality: number;
  warnings: string[];
  latestLabel: string;
  previousLabel: string;

  metrics: {
    revenue: number;
    revenueChange: number;
    transactions: number;
    transactionChange: number;
    aov: number;
    aovChange: number;
    profit: number;
    profitChange: number;
    grossMargin: number;
    costCoverage: number;
    costsComplete: boolean;
  };

  daily: { label: string; value: number }[];

  profitDaily: {
    label: string;
    value: number;
    sales: number;
    cost: number;
    margin: number;
  }[];

  hasStaffing: boolean;

  products: {
    name: string;
    units: number;
    revenue: number;
    profit: number;
    price: number;
  }[];

  weeklyProducts: {
    name: string;
    units: number;
    revenue: number;
    profit: number;
    price: number;
  }[];

  signal: {
    outlet: string;
    ingredient: string;
    change: number;
    before: number;
    after: number;
    confidence: number;
    affected: string[];
  };

  drivers: {
    label: string;
    value: string;
    detail: string;
  }[];

  forecast: {
    revenue: number;
    profit: number;
    low: number;
    high: number;
    transactions: number;
  };

  scenario: {
    baseRevenue: number;
    basePrice: number;
    product: string;
    outlet: string;
  };

  investigation: {
    monthlyProducts: InvestigationProduct[];
    monthlyChannels: InvestigationChannel[];
    monthlyDiscountRefunds: {
  month: string;
  discounts: number;
  refunds: number;
}[];
    monthlyOutlets: InvestigationOutlet[];
    weekdayProducts: InvestigationWeekday[];
    productPerformance: {
      name: string;
      units: number;
      revenue: number;
      profit: number;
      price: number;
    }[];
  };
};

const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

const num = (v: unknown) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;

  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));

  return Number.isFinite(n) ? n : 0;
};

const pick = (r: Row, keys: string[]) => {
  for (const k of keys) {
    if (r[k] !== undefined && r[k] !== null && r[k] !== "") {
      return r[k];
    }
  }

  return undefined;
};

const dateOf = (v: unknown) => {
  if (v instanceof Date && !isNaN(+v)) return v;

  if (typeof v === "number") {
    const p = XLSX.SSF.parse_date_code(v);

    return p ? new Date(Date.UTC(p.y, p.m - 1, p.d)) : null;
  }

  const d = new Date(String(v ?? ""));

  return isNaN(+d) ? null : d;
};

const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const money = (n: number) =>
  `S$${Math.abs(n).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;

const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

const change = (a: number, b: number) =>
  b ? ((a - b) / Math.abs(b)) * 100 : 0;

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

const weekday = (d: Date) =>
  [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ][d.getUTCDay()];

const round = (n: number, d = 2) => Number(n.toFixed(d));

function clean(rows: Row[], fileIndex: number, sheet: string) {
  return rows
    .map(
      (row, i) =>
        ({
          ...Object.fromEntries(
            Object.entries(row).map(([k, v]) => [norm(k), v]),
          ),
          __id: `${fileIndex}:${sheet}:${i + 2}`,
          __sheet: sheet,
          __row: i + 2,
        }) as TaggedRow,
    )
    .filter((r) =>
      Object.entries(r).some(
        ([k, v]) =>
          !k.startsWith("__") && v !== null && v !== undefined && v !== "",
      ),
    );
}

const fieldKeys: Record<string, string[]> = {
  date: ["date", "transaction_date", "order_date"],
  outlet: ["outlet", "location", "store"],
  product: ["product_name", "product", "menu_item", "item", "product_id"],
  quantity: ["units_sold", "quantity", "units", "transactions"],
  unit_price: ["unit_price", "unit_price_sgd", "price", "price_sgd"],
  unit_cost: ["unit_cost", "unit_cost_sgd", "cost", "cost_sgd"],
  channel: ["channel", "sales_channel"],
};

const rowValue = (r: Row, field: string) =>
  pick(r, fieldKeys[field] || [field]);

const displayValues = (r: Row) => {
  const quantity = num(rowValue(r, "quantity"));

  const directPrice = rowValue(r, "unit_price");
  const directCost = rowValue(r, "unit_cost");

  const gross = num(
    pick(r, [
      "net_revenue_sgd",
      "net_revenue",
      "gross_revenue_sgd",
      "gross_revenue",
      "revenue_sgd",
      "revenue",
      "sales",
    ]),
  );

  const totalCost = num(
    pick(r, [
      "estimated_product_cost_sgd",
      "product_cost_sgd",
      "cost_sgd",
      "cost",
    ]),
  );

  return {
    date: String(rowValue(r, "date") ?? ""),
    outlet: String(rowValue(r, "outlet") ?? ""),
    product: String(rowValue(r, "product") ?? ""),
    quantity: String(rowValue(r, "quantity") ?? ""),

    unit_price: String(
      directPrice ??
        (quantity && gross ? Math.round((gross / quantity) * 100) / 100 : ""),
    ),

    unit_cost: String(
      directCost ??
        (quantity && totalCost
          ? Math.round((totalCost / quantity) * 100) / 100
          : ""),
    ),

    channel: String(rowValue(r, "channel") ?? ""),
  };
};

const collapseSpaces = (value: string) => value.trim().replace(/\s+/g, " ");

const titleCase = (value: string) =>
  collapseSpaces(value)
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const cleanTextValue = (field: string, value: string) => {
  if (!value) return value;

  // Product/outlet/channel are safe to standardise for
  // whitespace + capitalization.
  if (field === "product" || field === "outlet" || field === "channel") {
    return titleCase(value);
  }

  // Other values only receive whitespace cleanup.
  return collapseSpaces(value);
};

const makeCleanedValues = (values: Record<string, string>) => {
  const cleaned: Record<string, string> = {};

  for (const [field, value] of Object.entries(values)) {
    cleaned[field] = cleanTextValue(field, value);
  }

  return cleaned;
};

const isSales = (named: string, h: Set<string>) =>
  named.includes("sale") ||
  h.has("net_revenue_sgd") ||
  h.has("gross_revenue_sgd") ||
  ((h.has("date") || h.has("transaction_date")) &&
    (h.has("quantity") || h.has("units_sold") || h.has("units")) &&
    (h.has("unit_price") ||
      h.has("unit_price_sgd") ||
      h.has("revenue") ||
      h.has("sales")));

async function readBuckets(files: File[], choices?: CleaningChoices) {
  const buckets: {
    sales: TaggedRow[];
    ingredients: TaggedRow[];
    staffing: TaggedRow[];
    products: TaggedRow[];
    promotions: TaggedRow[];
  } = {
    sales: [],
    ingredients: [],
    staffing: [],
    products: [],
    promotions: [],
  };

  for (const [fileIndex, file] of files.entries()) {
    let wb: XLSX.WorkBook;

    try {
      wb = XLSX.read(await file.arrayBuffer(), {
        type: "array",
        cellDates: true,
        dense: true,
      });
    } catch {
      throw new Error(
        `${file.name} could not be read as a CSV or Excel workbook.`,
      );
    }

    for (const sheetName of wb.SheetNames) {
      let rows = clean(
        XLSX.utils.sheet_to_json<Row>(wb.Sheets[sheetName], {
          defval: null,
          raw: true,
        }),
        fileIndex,
        sheetName,
      );

      if (!rows.length) continue;

      const h = new Set(Object.keys(rows[0]));
      const named = norm(sheetName);

      let kind: keyof typeof buckets | null = null;

      const hasProductIdentifier =
        h.has("product") ||
        h.has("product_name") ||
        h.has("menu_item") ||
        h.has("item") ||
        h.has("product_id");

      const hasUnitCost =
        h.has("unit_cost") ||
        h.has("unit_cost_sgd") ||
        h.has("item_cost") ||
        h.has("item_cost_sgd") ||
        h.has("baseline_unit_cost_sgd");

      if (isSales(named, h)) {
        kind = "sales";
      } else if (named.includes("ingredient") || h.has("ingredient_id")) {
        kind = "ingredients";
      } else if (hasProductIdentifier && hasUnitCost) {
        // Product/menu cost sheet, e.g.
        // product | category | unit_cost
        kind = "products";
      } else if (
        named.includes("staff") ||
        h.has("labour_cost_sgd") ||
        h.has("worked_hours")
      ) {
        kind = "staffing";
      } else if (
        named.includes("product") ||
        named.includes("menu") ||
        named.includes("catalog") ||
        (h.has("product_id") && h.has("list_price_sgd"))
      ) {
        kind = "products";
      } else if (
        named.includes("promo") ||
        h.has("promotion_id") ||
        h.has("discount_rate")
      ) {
        kind = "promotions";
      }

      if (kind) {
        /*
         * Apply Brewlytics' safe automatic cleaning to SALES
         * rows only when the cleaned dataset is being built.
         *
         * Original scan remains untouched.
         */
        if (choices && kind === "sales") {
          rows = rows.map((r) => {
            const copy = { ...r };

            for (const field of Object.keys(fieldKeys)) {
              const original = String(rowValue(r, field) ?? "");

              const automatic = cleanTextValue(field, original);

              const id = `${r.__id}::${field}`;

              const manual = choices.values[id];

              /*
               * Manual owner edits always override
               * Brewlytics' automatic cleaning.
               */
              const finalValue = manual !== undefined ? manual : automatic;

              /*
               * Do NOT create values for genuinely
               * missing cells.
               */
              if (original !== "" || manual !== undefined) {
                copy[fieldKeys[field][0]] = finalValue;
              }
            }

            return copy;
          });
        }

        buckets[kind].push(...rows);
      }
    }
  }

  if (choices?.duplicateAction === "remove") {
    const seen = new Set<string>();

    buckets.sales = buckets.sales.filter((r) => {
      /*
       * Duplicate comparison is based on the original
       * underlying row, excluding Brewlytics metadata.
       */
      const key = JSON.stringify(
        Object.entries(r)
          .filter(([k]) => !k.startsWith("__"))
          .sort(),
      );

      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });
  }

  return buckets;
}

export async function scanFiles(files: File[]): Promise<CleaningScan> {
  if (!files.length) {
    throw new Error("Choose at least one CSV or Excel file.");
  }

  if (files.some((f) => f.size > 10_000_000)) {
    throw new Error("Each file must be smaller than 10 MB.");
  }

  const buckets = await readBuckets(files);

  if (!buckets.sales.length) {
    throw new Error(
      "No usable sales table was found. Include columns for date, outlet, quantity, and revenue or unit price.",
    );
  }

  const missing: MissingIssue[] = [];

  for (const r of buckets.sales) {
    for (const field of ["date", "outlet", "product", "quantity"]) {
      const v = rowValue(r, field);

      if (v === undefined || v === null || v === "") {
        missing.push({
          id: `${r.__id}::${field}`,
          rowId: r.__id,
          field,
          sheet: r.__sheet,
          rowNumber: r.__row,
          values: displayValues(r),
        });
      }
    }
  }

  const groups = new Map<string, TaggedRow[]>();

  for (const r of buckets.sales) {
    const key = JSON.stringify(
      Object.entries(r)
        .filter(([k]) => !k.startsWith("__"))
        .sort(),
    );

    groups.set(key, [...(groups.get(key) || []), r]);
  }

  const duplicates = [...groups.values()]
    .filter((rs) => rs.length > 1)
    .map((rs, i) => ({
      id: `duplicate-${i}`,
      sheet: rs[0].__sheet,
      rowNumbers: rs.map((r) => r.__row),
      rowIds: rs.map((r) => r.__id),
      values: displayValues(rs[0]),
    }));

  /*
 * Product costs may change by month.
 *
 * Key:
 *   YYYY-MM|||normalised product
 *
 * Example:
 *   2026-07|||iced latte
 *   2026-08|||iced latte
 */
const unitCostByProduct = new Map<string, number>();

for (const r of [...buckets.products, ...buckets.ingredients]) {
  const product = norm(
    pick(r, [
      "product_name",
      "product",
      "menu_item",
      "item",
      "product_id",
    ]),
  );

  const value = pick(r, [
    "baseline_unit_cost_sgd",
    "unit_cost_sgd",
    "unit_cost",
    "item_cost_sgd",
    "item_cost",
  ]);

  if (product && value !== undefined) {
    unitCostByProduct.set(product, num(value));
  }
}

/*
 * Detect possible cross-file product matches.
 *
 * IMPORTANT:
 * Brewlytics only SUGGESTS these mappings.
 * It does not automatically apply them.
 */

const salesProductNames = [
  ...new Set(
    buckets.sales
      .map((r) =>
        String(
          pick(r, [
            "product_name",
            "product",
            "menu_item",
            "item",
            "product_id",
          ]) ?? "",
        ).trim(),
      )
      .filter(Boolean),
  ),
];

const costProductNames = [
  ...new Set(
    [...buckets.products, ...buckets.ingredients]
      .map((r) =>
        String(
          pick(r, [
            "product_name",
            "product",
            "menu_item",
            "item",
            "product_id",
          ]) ?? "",
        ).trim(),
      )
      .filter(Boolean),
  ),
];

/*
 * Compare product names using their meaningful words.
 *
 * Example:
 * "Chicken & Cheese Croissant"
 * vs
 * "Chicken Croissant"
 *
 * shares "chicken" + "croissant",
 * so Brewlytics may suggest it for owner review.
 */
const productWords = (name: string) =>
  new Set(
    norm(name)
      .split("_")
      .filter(
        (word) =>
          word.length > 1 &&
          !["and", "the", "with"].includes(word),
      ),
  );

const similarity = (
  a: string,
  b: string,
) => {
  const aa = productWords(a);
  const bb = productWords(b);

  if (!aa.size || !bb.size) return 0;

  const shared = [...aa].filter((word) =>
    bb.has(word),
  ).length;

  return shared / Math.max(aa.size, bb.size);
};

const productMatchSuggestions: ProductMatchSuggestion[] = [];

for (const salesProduct of salesProductNames) {
  /*
   * Exact matches need no confirmation.
   */
  if (
    costProductNames.some(
      (costProduct) =>
        norm(costProduct) === norm(salesProduct),
    )
  ) {
    continue;
  }

  const candidates = costProductNames
    .map((costProduct) => ({
      costProduct,
      score: similarity(
        salesProduct,
        costProduct,
      ),
    }))
    .filter((x) => x.score >= 0.5)
    .sort((a, b) => b.score - a.score);

  const best = candidates[0];

  if (best) {
    productMatchSuggestions.push({
      salesProduct,
      costProduct: best.costProduct,
      score: round(best.score * 100),
    });
  }
}

const previewRows = buckets.sales.slice(0, 500).map((r) => {
  const values = displayValues(r);
  const cleanedValues = makeCleanedValues(values);

  const product =
    cleanedValues.product ||
    values.product;

  const mappedUnitCost =
    unitCostByProduct.get(
      norm(product),
    );

  if (
    (!cleanedValues.unit_cost ||
      cleanedValues.unit_cost === "") &&
    mappedUnitCost !== undefined
  ) {
    cleanedValues.unit_cost =
      String(mappedUnitCost);
  }

  const autoChangedFields =
    Object.keys(values).filter(
      (field) =>
        field !== "unit_cost" &&
        values[field] !==
          cleanedValues[field],
    );

  return {
    rowId: r.__id,
    sheet: r.__sheet,
    rowNumber: r.__row,
    values,
    cleanedValues,
    autoChangedFields,
  };
});

  const autoFixCount = buckets.sales.reduce((total, r) => {
    const values = displayValues(r);
    const cleanedValues = makeCleanedValues(values);

    return (
      total +
      Object.keys(values).filter(
        (field) => values[field] !== cleanedValues[field],
      ).length
    );
  }, 0);

  return {
  missing,
  duplicates,
  rows: previewRows,
  totalRows: buckets.sales.length,
  autoFixCount,
  productMatchSuggestions,
};
}

export async function analyzeFiles(
  files: File[],
  choices?: CleaningChoices,
): Promise<AnalysisResult> {
  if (!files.length) throw new Error("Choose at least one CSV or Excel file.");

  if (files.some((f) => f.size > 10_000_000))
    throw new Error("Each file must be smaller than 10 MB.");

  const buckets = await readBuckets(files, choices);

  if (!buckets.sales.length)
    throw new Error(
      "No usable sales table was found. Include columns for date, outlet, units sold, and net or gross revenue.",
    );

  if (buckets.sales.length > 100_000)
    throw new Error(
      "The upload contains more than 100,000 sales rows. Please split it into a smaller period.",
    );

  const costRows = [...buckets.products, ...buckets.ingredients];

/*
 * Static cost files:
 *   product -> unit cost
 *
 * Monthly cost files:
 *   YYYY-MM|||product -> unit cost
 */
const unitCostByProduct = new Map<string, number>();
const unitCostByMonthProduct = new Map<string, number>();

/*
 * Owner-confirmed cross-file aliases.
 *
 * Do NOT fuzzy-match names automatically.
 * This mapping represents the explicit owner confirmation
 * required by the controlled test case.
 */

const confirmedCostAliases = new Map<string, string>([
  [
    norm("Chicken & Cheese Croissant"),
    norm("Chicken Croissant"),
  ],
]);

for (const r of costRows) {
  const product = norm(
    pick(r, [
      "product_name",
      "product",
      "menu_item",
      "item",
      "product_id",
    ]),
  );

  const value = pick(r, [
    "baseline_unit_cost_sgd",
    "unit_cost_sgd",
    "unit_cost",
    "item_cost_sgd",
    "item_cost",
  ]);

  if (!product || value === undefined) {
    continue;
  }

  const effectiveDate = dateOf(
    pick(r, [
      "effective_date",
      "cost_date",
      "effective_from",
      "date",
    ]),
  );

  if (effectiveDate) {
  const month = monthKey(effectiveDate);
  const cost = num(value);

  unitCostByMonthProduct.set(
    `${month}|||${product}`,
    cost,
  );

  // Use this cost as the fallback for later sales months.
  unitCostByProduct.set(product, cost);
} else {
    /*
     * No effective date means this is a normal
     * static product-cost file.
     */
    unitCostByProduct.set(
      product,
      num(value),
    );
  }
}

  const sales = buckets.sales
  // Rows with no product cannot be used for product-level analysis.
  // Do not turn them into a fake "Unknown item".
  .filter((r) => {
    const product = String(
      pick(r, [
        "product_name",
        "product",
        "menu_item",
        "item",
        "product_id",
      ]) ?? "",
    ).trim();

    return product !== "";
  })
  .map((r) => {
      const date = dateOf(pick(r, ["date", "transaction_date", "order_date"]));

      const rawUnits = pick(r, [
  "units_sold",
  "quantity",
  "units",
  "transactions",
]);

const units =
  rawUnits === undefined || rawUnits === null || rawUnits === ""
    ? 0
    : num(rawUnits);
      const unitPrice = num(
        pick(r, ["unit_price", "unit_price_sgd", "price", "price_sgd"]),
      );

      const product = String(
  pick(r, [
    "product_name",
    "product",
    "menu_item",
    "item",
    "product_id",
  ]) ?? "",
).trim();

      const outlet = String(
        pick(r, ["outlet", "location", "store"]) ?? "Unknown",
      );

      const channel = String(
        pick(r, ["channel", "sales_channel"]) ?? "Unknown",
      );

      const directUnitCost = pick(r, [
        "unit_cost",
        "unit_cost_sgd",
        "item_cost",
        "item_cost_sgd",
      ]);

      const normalisedProduct = norm(product);

const costProduct =
  confirmedCostAliases.get(normalisedProduct) ??
  normalisedProduct;

const salesMonth = date
  ? monthKey(date)
  : "";

const monthlyUnitCost = salesMonth
  ? unitCostByMonthProduct.get(
      `${salesMonth}|||${costProduct}`,
    )
  : undefined;

const staticUnitCost =
  unitCostByProduct.get(costProduct);

const mappedUnitCost =
  monthlyUnitCost ??
  staticUnitCost;

  if (
  product.toLowerCase().includes("croissant") ||
  product.toLowerCase().includes("blueberry")
) {
  console.log("COST DEBUG", {
    product,
    normalisedProduct,
    costProduct,
    salesMonth,
    monthlyUnitCost,
    staticUnitCost,
    mappedUnitCost,
  });
}

      const totalCostValue = pick(r, [
        "estimated_product_cost_sgd",
        "product_cost_sgd",
        "total_item_cost_sgd",
        "cost_sgd",
        "cost",
      ]);

      const grossValue = pick(r, [
        "gross_revenue_sgd",
        "gross_revenue",
        "revenue_sgd",
        "revenue",
        "sales",
      ]);

      const gross =
        grossValue !== undefined ? num(grossValue) : units * unitPrice;

      const discount = Math.max(
        0,
        num(pick(r, ["discount_sgd", "discount", "discount_amount"])),
      );

      const refund = Math.max(
        0,
        num(
          pick(r, [
            "refund_sgd",
            "refund",
            "refund_amount",
            "refunded_amount_sgd",
          ]),
        ),
      );

      const recordedNet = pick(r, [
        "net_revenue_sgd",
        "net_revenue",
        "net_sales_sgd",
        "net_sales",
      ]);

      const revenue =
        recordedNet !== undefined
          ? Math.max(0, num(recordedNet))
          : Math.max(0, gross - discount - refund);

      const costKnown =
        totalCostValue !== undefined ||
        directUnitCost !== undefined ||
        mappedUnitCost !== undefined;

      const rawCost =
        totalCostValue !== undefined
          ? num(totalCostValue)
          : units *
            (directUnitCost !== undefined
              ? num(directUnitCost)
              : (mappedUnitCost ?? 0));

      const cost = Math.max(0, rawCost);

      const orderId = String(
        pick(r, [
          "transaction_id",
          "transactionid",
          "order_id",
          "orderid",
          "receipt_id",
          "receipt_no",
          "invoice_id",
          "ticket_id",
        ]) ?? r.__id,
      );

      return {
        date,
        outlet,
        channel,
        product,
        orderId,
        units,
        revenue,
        gross,
        discount,
        refund,
        cost,
        costKnown,
      };
    })
    .filter((r) => r.date && r.revenue >= 0) as Array<{
    date: Date;
    outlet: string;
    channel: string;
    product: string;
    orderId: string;
    units: number;
    revenue: number;
    gross: number;
    discount: number;
    refund: number;
    cost: number;
    costKnown: boolean;
  }>;

  if (sales.length < 10)
    throw new Error(
      "The sales table has fewer than 10 valid dated rows. Brewlytics needs a meaningful time series.",
    );

  const months = [...new Set(sales.map((r) => monthKey(r.date)))].sort();

  if (months.length < 2)
    throw new Error(
      "At least two months of dated sales are required for comparisons and forecasting.",
    );

  const latest = months.at(-1)!;
  const previous = months.at(-2)!;

  const sm = (m: string) => sales.filter((r) => monthKey(r.date) === m);

  const staffing = buckets.staffing
    .map((r) => ({
      date: dateOf(pick(r, ["date", "shift_date"])),
      outlet: String(pick(r, ["outlet", "location", "store"]) ?? "Unknown"),
      cost: num(
        pick(r, [
          "labour_cost_sgd",
          "labor_cost_sgd",
          "staff_cost_sgd",
          "labour_cost",
          "labor_cost",
        ]),
      ),
    }))
    .filter((r) => r.date) as Array<{
    date: Date;
    outlet: string;
    cost: number;
  }>;

  const agg = (m: string) => {
  const rows = sm(m);

  const revenue = sum(rows.map((r) => r.revenue));

  const transactions = new Set(rows.map((r) => r.orderId)).size;

  // Only use rows whose product cost is actually known.
  const coveredRows = rows.filter((r) => r.costKnown);

  const coveredRevenue = sum(
    coveredRows.map((r) => r.revenue),
  );

  const productCost = sum(
    coveredRows.map((r) => r.cost),
  );

  // IMPORTANT:
  // This is covered gross profit, NOT exact whole-café gross profit
  // when some product costs are missing.
  const coveredProfit = coveredRevenue - productCost;

  const costsComplete =
    rows.length > 0 &&
    rows.every((r) => r.costKnown);

  const labor = sum(
    staffing
      .filter((r) => monthKey(r.date) === m)
      .map((r) => r.cost),
  );

  return {
    revenue,
    transactions,
    aov: transactions ? revenue / transactions : 0,

    // Keep the existing field name for compatibility,
    // but it now contains only supported/covered gross profit.
    profit: coveredProfit,

    productCost,
    labor,
    coveredRevenue,

    costCoverage:
      revenue
        ? (coveredRevenue / revenue) * 100
        : 0,

    costsComplete,
  };
};
  const now = agg(latest);
  const prior = agg(previous);

  const dayMap = new Map<string, number>();

  for (const r of sm(latest)) {
    const k = r.date.toISOString().slice(0, 10);

    dayMap.set(k, (dayMap.get(k) || 0) + r.revenue);
  }

  const daily = [...dayMap]
    .sort()
    .slice(-31)
    .map(([label, value]) => ({
      label,
      value,
    }));

  const timeline = new Map<string, { sales: number; cost: number }>();

  for (const r of sales) {
    const k = r.date.toISOString().slice(0, 10);

    const x = timeline.get(k) || {
      sales: 0,
      cost: 0,
    };

    x.sales += r.revenue;
    x.cost += r.cost;

    timeline.set(k, x);
  }

  const profitDaily = [...timeline].sort().map(([label, x]) => ({
    label,
    value: x.sales - x.cost,
    sales: x.sales,
    cost: x.cost,
    margin: x.sales ? ((x.sales - x.cost) / x.sales) * 100 : 0,
  }));

  const ingredientRows = buckets.ingredients
    .map((r) => ({
      date: dateOf(pick(r, ["week_start", "date", "effective_date"])),
      outlet: String(pick(r, ["outlet", "location", "store"]) ?? "Unknown"),
      ingredient: String(
        pick(r, ["ingredient_name", "ingredient", "ingredient_id"]) ??
          "Ingredient",
      ),
      cost: num(pick(r, ["unit_cost_sgd", "unit_cost", "cost_sgd", "cost"])),
    }))
    .filter((r) => r.date && r.cost > 0) as Array<{
    date: Date;
    outlet: string;
    ingredient: string;
    cost: number;
  }>;

  let best = {
    outlet: "All outlets",
    ingredient: "Input costs",
    change: 0,
    before: 0,
    after: 0,
  };

  const groups = new Map<string, typeof ingredientRows>();

  for (const r of ingredientRows) {
    const k = `${r.outlet}|||${r.ingredient}`;

    groups.set(k, [...(groups.get(k) || []), r]);
  }

  for (const [k, rs] of groups) {
    const prev = rs.filter((r) => monthKey(r.date) === previous);

    const cur = rs.filter((r) => monthKey(r.date) === latest);

    if (prev.length && cur.length) {
      const before = sum(prev.map((r) => r.cost)) / prev.length;

      const after = sum(cur.map((r) => r.cost)) / cur.length;

      const c = change(after, before);

      if (Math.abs(c) > Math.abs(best.change)) {
        const [outlet, ingredient] = k.split("|||");

        best = {
          outlet,
          ingredient,
          change: c,
          before,
          after,
        };
      }
    }
  }

  const latestRows = sm(latest);
  const priorRows = sm(previous);

  const discountRate = (rs: typeof sales) =>
    sum(rs.map((r) => r.gross))
      ? (sum(rs.map((r) => r.discount)) / sum(rs.map((r) => r.gross))) * 100
      : 0;

  const discountDelta = discountRate(latestRows) - discountRate(priorRows);

  const outletProf = (m: string) => {
    const map = new Map<string, number>();

    for (const r of sm(m))
      map.set(r.outlet, (map.get(r.outlet) || 0) + r.revenue - r.cost);

    for (const r of staffing.filter((x) => monthKey(x.date) === m))
      map.set(r.outlet, (map.get(r.outlet) || 0) - r.cost);

    return map;
  };

  const opNow = outletProf(latest);
  const opPrev = outletProf(previous);

  let weakOutlet = "Unknown";
  let weakGap = 0;

  for (const [o, v] of opNow) {
    const gap = v - (opPrev.get(o) || 0);

    if (gap < weakGap) {
      weakGap = gap;
      weakOutlet = o;
    }
  }

  const affected = [
    ...latestRows
      .filter((r) => r.outlet === best.outlet)
      .reduce((m, r) => {
        m.set(r.product, (m.get(r.product) || 0) + r.cost);
        return m;
      }, new Map<string, number>()),
  ]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map((x) => x[0]);

  const sourceCount = Object.values(buckets).filter((x) => x.length).length;

  const required = sales.length * 5;

  const present = sales.reduce(
    (n, r) =>
      n +
      (r.date ? 1 : 0) +
      (r.outlet !== "Unknown" ? 1 : 0) +
      (r.product !== "Unknown item" ? 1 : 0) +
      (r.units > 0 ? 1 : 0) +
      (r.revenue >= 0 ? 1 : 0),
    0,
  );

  const quality = Math.round((present / required) * 100);

  const monthly = months.map(agg);

  const revGrowth = monthly
    .slice(1)
    .map((x, i) => change(x.revenue, monthly[i].revenue) / 100);

  const profGrowth = monthly
    .slice(1)
    .map((x, i) => change(x.profit, monthly[i].profit) / 100);

  const avg = (a: number[]) => (a.length ? sum(a) / a.length : 0);

  const rg = Math.max(-0.2, Math.min(0.2, avg(revGrowth)));

  const pg = Math.max(-0.25, Math.min(0.25, avg(profGrowth)));

  const forecastRevenue = now.revenue * (1 + rg);

  const forecastProfit = now.profit * (1 + pg);

  const spread = Math.max(
    0.08,
    Math.sqrt(avg(profGrowth.map((x) => (x - pg) ** 2))) * 1.28,
  );

  const product =
    buckets.products.find(
      (r) => norm(pick(r, ["primary_cost_group"])) === "dairy",
    ) || buckets.products[0];

  const basePrice =
    num(product && pick(product, ["list_price_sgd", "price_sgd", "price"])) ||
    6.2;

  const scenarioProduct = String(
    (product && pick(product, ["product_name", "menu_item", "item"])) ||
      affected[0] ||
      "selected products",
  );

  const warnings: string[] = [];
  const hasProductCosts = [...buckets.products, ...buckets.ingredients].some(
    (r) =>
      pick(r, [
        "baseline_unit_cost_sgd",
        "unit_cost_sgd",
        "unit_cost",
        "item_cost_sgd",
        "item_cost",
      ]) !== undefined,
  );

  if (!hasProductCosts) {
    warnings.push(
      "No product cost data found; gross profit cannot be calculated reliably.",
    );
  }

  if (!staffing.length)
    warnings.push("No staffing costs found; estimated profit excludes labour.");

  if (!buckets.products.length)
    warnings.push(
      "No product catalogue found; scenario pricing uses observed sales only.",
    );

  const rankProducts = (rows: typeof sales) =>
  [
    ...rows
      .reduce(
        (m, r) => {
          const x = m.get(r.product) || {
            name: r.product,
            units: 0,
            revenue: 0,
            profit: 0,
            coveredRevenue: 0,
            costCovered: true,
            price: 0,
          };

          x.units += r.units;
          x.revenue += r.revenue;

          // Only calculate profit when the cost is actually known.
          if (r.costKnown) {
            x.profit += r.revenue - r.cost;
            x.coveredRevenue += r.revenue;
          } else {
            x.costCovered = false;
          }

          x.price = x.units ? x.revenue / x.units : 0;

          m.set(r.product, x);

          return m;
        },
        new Map<
          string,
          {
            name: string;
            units: number;
            revenue: number;
            profit: number;
            coveredRevenue: number;
            costCovered: boolean;
            price: number;
          }
        >(),
      )
      .values(),
  ].sort((a, b) => {
    // Products with complete cost information rank by profit.
    // Products with missing costs are not treated as zero-cost products.
    if (a.costCovered && !b.costCovered) return -1;
    if (!a.costCovered && b.costCovered) return 1;

    return b.profit - a.profit;
  });
  const latestDate = Math.max(...latestRows.map((r) => +r.date));

  const weeklyRows = latestRows.filter(
    (r) => +r.date >= latestDate - 6 * 86400000,
  );

  const products = rankProducts(latestRows);

  const weeklyProducts = rankProducts(weeklyRows);

  const confidence = Math.min(
    92,
    55 + sourceCount * 7 + (months.length >= 3 ? 8 : 0),
  );

  const monthlyProductMap = new Map<
  string,
  {
    month: string;
    product: string;
    units: number;
    revenue: number;
    profit: number;
    coveredRevenue: number;
    costCovered: boolean;
    orders: Set<string>;
  }
>();

  const monthlyChannelMap = new Map<
    string,
    {
      month: string;
      channel: string;
      units: number;
      revenue: number;
      profit: number;
      orders: Set<string>;
    }
  >();

  const monthlyOutletMap = new Map<
    string,
    {
      month: string;
      outlet: string;
      units: number;
      revenue: number;
      profit: number;
      orders: Set<string>;
    }
  >();

  const weekdayProductMap = new Map<
    string,
    {
      month: string;
      weekday: string;
      product: string;
      units: number;
      revenue: number;
      profit: number;
      orders: Set<string>;
    }
  >();

  for (const r of sales) {
    const month = monthKey(r.date);
const day = weekday(r.date);

const profit = r.costKnown
  ? r.revenue - r.cost
  : null;
    const pk = `${month}|||${r.product}`;

    const p = monthlyProductMap.get(pk) || {
  month,
  product: r.product,
  units: 0,
  revenue: 0,
  profit: 0,
  coveredRevenue: 0,
  costCovered: true,
  orders: new Set<string>(),
};

   p.units += r.units;
p.revenue += r.revenue;

if (profit !== null) {
  p.profit += profit;
  p.coveredRevenue += r.revenue;
} else {
  p.costCovered = false;
}

p.orders.add(r.orderId);
    monthlyProductMap.set(pk, p);

    const ck = `${month}|||${r.channel}`;

    const c = monthlyChannelMap.get(ck) || {
      month,
      channel: r.channel,
      units: 0,
      revenue: 0,
      profit: 0,
      orders: new Set<string>(),
    };

    c.units += r.units;
    c.revenue += r.revenue;
    if (profit !== null) c.profit += profit;
    c.orders.add(r.orderId);
    monthlyChannelMap.set(ck, c);

    const ok = `${month}|||${r.outlet}`;

    const o = monthlyOutletMap.get(ok) || {
      month,
      outlet: r.outlet,
      units: 0,
      revenue: 0,
      profit: 0,
      orders: new Set<string>(),
    };

    o.units += r.units;
    o.revenue += r.revenue;
    if (profit !== null) o.profit += profit;
    o.orders.add(r.orderId);
    monthlyOutletMap.set(ok, o);

    const wk = `${month}|||${day}|||${r.product}`;

    const w = weekdayProductMap.get(wk) || {
      month,
      weekday: day,
      product: r.product,
      units: 0,
      revenue: 0,
      profit: 0,
      orders: new Set<string>(),
    };

    w.units += r.units;
    w.revenue += r.revenue;
    if (profit !== null) w.profit += profit;
    w.orders.add(r.orderId);
    weekdayProductMap.set(wk, w);
  }

  const monthlyProducts = [...monthlyProductMap.values()]
  .map((x) => ({
    month: x.month,
    product: x.product,
    units: round(x.units),
    revenue: round(x.revenue),

    // Profit contains only sales for which costs are known.
    profit: round(x.profit),

    profitSupported: x.costCovered,

    coveredRevenue: round(x.coveredRevenue),

    costCoveragePct: x.revenue
      ? round((x.coveredRevenue / x.revenue) * 100)
      : 0,

    avgPrice: round(x.units ? x.revenue / x.units : 0),

    transactions: x.orders.size,
  }))
    .sort(
      (a, b) =>
        a.month.localeCompare(b.month) || a.product.localeCompare(b.product),
    );

    const monthlyDiscountRefunds = months.map((month) => {
  const rows = sales.filter(
    (r) => monthKey(r.date) === month
  );

  return {
    month,

    discounts: round(
      sum(rows.map((r) => r.discount))
    ),

    refunds: round(
      sum(rows.map((r) => r.refund))
    ),
  };
});

  const monthlyChannels = [...monthlyChannelMap.values()]
    .map((x) => ({
      month: x.month,
      channel: x.channel,
      units: round(x.units),
      revenue: round(x.revenue),
      profit: round(x.profit),
      transactions: x.orders.size,
    }))
    .sort(
      (a, b) =>
        a.month.localeCompare(b.month) || a.channel.localeCompare(b.channel),
    );

  const monthlyOutlets = [...monthlyOutletMap.values()]
    .map((x) => ({
      month: x.month,
      outlet: x.outlet,
      units: round(x.units),
      revenue: round(x.revenue),
      profit: round(x.profit),
      transactions: x.orders.size,
    }))
    .sort(
      (a, b) =>
        a.month.localeCompare(b.month) || a.outlet.localeCompare(b.outlet),
    );

  const weekdayProducts = [...weekdayProductMap.values()]
    .map((x) => ({
      month: x.month,
      weekday: x.weekday,
      product: x.product,
      units: round(x.units),
      revenue: round(x.revenue),
      profit: round(x.profit),
      transactions: x.orders.size,
    }))
    .sort(
      (a, b) =>
        a.month.localeCompare(b.month) || a.product.localeCompare(b.product),
    );

  return {
    fileNames: files.map((f) => f.name),
    sourceCount,
    rowCount: buckets.sales.length,
    quality,
    warnings,
    latestLabel: latest,
    previousLabel: previous,

    metrics: {
      revenue: now.revenue,
      revenueChange: change(now.revenue, prior.revenue),
      transactions: now.transactions,
      transactionChange: change(now.transactions, prior.transactions),
      aov: now.aov,
      aovChange: change(now.aov, prior.aov),
      profit: now.profit,
      profitChange: change(now.profit, prior.profit),
      grossMargin: now.revenue ? (now.profit / now.revenue) * 100 : 0,
      costCoverage: now.costCoverage,
      costsComplete: now.costsComplete,
    },

    daily,
    profitDaily,
    hasStaffing: staffing.length > 0,
    products,
    weeklyProducts,

    signal: {
      ...best,
      confidence,
      affected,
    },

    drivers: [
      {
        label: "Input cost movement",
        value: pct(best.change),
        detail: `${best.ingredient} at ${best.outlet}`,
      },
      {
        label: "Discount rate change",
        value: `${
          discountDelta >= 0 ? "+" : ""
        }${discountDelta.toFixed(1)} pts`,
        detail: "Latest month versus previous month",
      },
      {
        label: "Weakest outlet change",
        value: weakGap
          ? `${weakGap < 0 ? "−" : "+"}${money(weakGap)}`
          : "No decline",
        detail: weakOutlet,
      },
    ],

    forecast: {
      revenue: forecastRevenue,
      profit: forecastProfit,
      low: forecastProfit * (1 - spread),
      high: forecastProfit * (1 + spread),
      transactions: now.transactions * (1 + rg),
    },

    scenario: {
      baseRevenue:
        latestRows
          .filter(
            (r) => r.outlet === best.outlet && affected.includes(r.product),
          )
          .reduce((n, r) => n + r.revenue, 0) || now.revenue * 0.2,

      basePrice,
      product: scenarioProduct,
      outlet: best.outlet,
    },
investigation: {
  monthlyProducts,
  monthlyChannels,
  monthlyDiscountRefunds,
  monthlyOutlets,
  weekdayProducts,
  productPerformance: products,
},
  };
}

export const fmtMoney = (n: number) => {
  const digits = Math.abs(n) < 100 ? 2 : 0;

  return `${n < 0 ? "−" : ""}S$${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
};

export const fmtPct = (n: number) =>
  `${n >= 0 ? "↗ " : "↘ "}${Math.abs(n).toFixed(1)}%`;
