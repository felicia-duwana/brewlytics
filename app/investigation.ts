import type { AnalysisResult } from "./analyze";

export type InvestigationTool =
  | "product_trend"
  | "compare_products"
  | "price_vs_volume"
  | "channel_breakdown"
  | "weekday_breakdown"
  | "outlet_breakdown"
  | "profitability";

export type InvestigationStep = {
  tool: InvestigationTool;
  title: string;
  summary: string;
  evidence: Record<string, unknown>;
};

const round = (n: number, d = 2) => Number(n.toFixed(d));

const change = (current: number, previous: number): number | null =>
  previous === 0
    ? null
    : round(((current - previous) / Math.abs(previous)) * 100, 1);

const normalise = (s: string) => s.trim().toLowerCase();

const findProduct = (data: AnalysisResult, requested: string) => {
  const names = [
    ...new Set(data.investigation.monthlyProducts.map((x) => x.product)),
  ];

  const exact = names.find((x) => normalise(x) === normalise(requested));
  if (exact) return exact;

  const partial = names.find(
    (x) =>
      normalise(x).includes(normalise(requested)) ||
      normalise(requested).includes(normalise(x)),
  );

  return partial ?? null;
};

export function productTrend(
  data: AnalysisResult,
  requestedProduct: string,
): InvestigationStep {
  const product = findProduct(data, requestedProduct);

  if (!product) {
    return {
      tool: "product_trend",
      title: `Analysed ${requestedProduct} sales trend`,
      summary: `No matching product was found for "${requestedProduct}".`,
      evidence: { requestedProduct, found: false },
    };
  }

  const rows = data.investigation.monthlyProducts
    .filter((x) => x.product === product)
    .sort((a, b) => a.month.localeCompare(b.month));

  const latest = rows.find((x) => x.month === data.latestLabel);
  const previous = rows.find((x) => x.month === data.previousLabel);

  if (!latest || !previous) {
    return {
      tool: "product_trend",
      title: `Analysed ${product} sales trend`,
      summary: `There is not enough comparable monthly data for ${product}.`,
      evidence: { product, rows },
    };
  }

  const unitsChange = change(latest.units, previous.units);
  const revenueChange = change(latest.revenue, previous.revenue);
  const profitChange = change(latest.profit, previous.profit);

  return {
    tool: "product_trend",
    title: `Analysed ${product} sales trend`,
    summary:
      unitsChange === null
        ? `${product} recorded ${latest.units} units in ${data.latestLabel}, but the previous period had no comparable sales.`
        : `${product} units ${unitsChange < 0 ? "fell" : "rose"} ${Math.abs(
            unitsChange,
          ).toFixed(1)}% from ${previous.units} to ${latest.units}.`,
    evidence: {
      product,
      previousMonth: data.previousLabel,
      latestMonth: data.latestLabel,
      previousUnits: previous.units,
      latestUnits: latest.units,
      unitsChangePct: unitsChange,
      previousRevenue: previous.revenue,
      latestRevenue: latest.revenue,
      revenueChangePct: revenueChange,
      previousProfit: previous.profit,
      latestProfit: latest.profit,
      profitChangePct: profitChange,
    },
  };
}

export function priceVsVolume(
  data: AnalysisResult,
  requestedProduct: string,
): InvestigationStep {
  const product = findProduct(data, requestedProduct);

  if (!product) {
    return {
      tool: "price_vs_volume",
      title: `Checked ${requestedProduct} pricing`,
      summary: `No matching product was found for "${requestedProduct}".`,
      evidence: { requestedProduct, found: false },
    };
  }

  const rows = data.investigation.monthlyProducts.filter(
    (x) => x.product === product,
  );
  const latest = rows.find((x) => x.month === data.latestLabel);
  const previous = rows.find((x) => x.month === data.previousLabel);

  if (!latest || !previous) {
    return {
      tool: "price_vs_volume",
      title: `Checked ${product} pricing`,
      summary: `There is not enough comparable pricing data for ${product}.`,
      evidence: { product },
    };
  }

  const priceChange = change(latest.avgPrice, previous.avgPrice);
  const volumeChange = change(latest.units, previous.units);

  let interpretation = "Price and volume both changed.";

  if (priceChange !== null && Math.abs(priceChange) < 1)
    interpretation =
      "Average selling price was essentially unchanged, so the sales movement was primarily volume-driven.";
  else if (
    priceChange !== null &&
    volumeChange !== null &&
    priceChange > 0 &&
    volumeChange < 0
  )
    interpretation =
      "Average selling price increased while units fell. Pricing may be relevant, but this does not prove causation.";
  else if (
    priceChange !== null &&
    volumeChange !== null &&
    priceChange < 0 &&
    volumeChange < 0
  )
    interpretation =
      "Units fell despite a lower average selling price, so a price increase does not explain the decline.";

  return {
    tool: "price_vs_volume",
    title: `Checked ${product} price vs volume`,
    summary: interpretation,
    evidence: {
      product,
      previousPrice: previous.avgPrice,
      latestPrice: latest.avgPrice,
      priceChangePct: priceChange,
      previousUnits: previous.units,
      latestUnits: latest.units,
      volumeChangePct: volumeChange,
    },
  };
}

export function compareProducts(
  data: AnalysisResult,
  requestedProduct: string,
): InvestigationStep {
  const product = findProduct(data, requestedProduct);

  if (!product) {
    return {
      tool: "compare_products",
      title: `Compared ${requestedProduct} with other products`,
      summary: `No matching product was found for "${requestedProduct}".`,
      evidence: { requestedProduct, found: false },
    };
  }

  const latest = data.investigation.monthlyProducts.filter(
    (x) => x.month === data.latestLabel,
  );

  const previous = data.investigation.monthlyProducts.filter(
    (x) => x.month === data.previousLabel,
  );

  const comparisons = [
    ...new Set([...latest, ...previous].map((x) => x.product)),
  ]
    .map((name) => {
      const now = latest.find((x) => x.product === name);
      const before = previous.find((x) => x.product === name);

      return {
        product: name,
        previousUnits: before?.units ?? 0,
        latestUnits: now?.units ?? 0,
        unitsChangePct: before && now ? change(now.units, before.units) : null,
        previousRevenue: before?.revenue ?? 0,
        latestRevenue: now?.revenue ?? 0,
        revenueChangePct:
          before && now ? change(now.revenue, before.revenue) : null,
      };
    })
    .sort((a, b) => b.latestRevenue - a.latestRevenue);

  const target = comparisons.find((x) => x.product === product);

  const peers = comparisons.filter((x) => x.product !== product).slice(0, 5);

  return {
    tool: "compare_products",
    title: `Compared ${product} with other products`,
    summary:
      target?.unitsChangePct == null
        ? `Compared ${product} against other menu items.`
        : `${product}'s unit change was ${target.unitsChangePct >= 0 ? "+" : ""}${target.unitsChangePct.toFixed(
            1,
          )}% versus other leading products.`,
    evidence: {
      target,
      peers,
    },
  };
}

export function channelBreakdown(
  data: AnalysisResult,
  requestedProduct?: string,
): InvestigationStep {
  const product = requestedProduct ? findProduct(data, requestedProduct) : null;

  const salesRows = data.investigation.monthlyProducts.filter(
    (x) => !product || x.product === product,
  );

  if (product && !salesRows.length) {
    return {
      tool: "channel_breakdown",
      title: `Analysed ${product} sales by channel`,
      summary: `No sales data was available for ${product}.`,
      evidence: { product },
    };
  }

  const rows = data.investigation.monthlyChannels.filter(
    (x) => x.month === data.latestLabel || x.month === data.previousLabel,
  );

  const channels = [...new Set(rows.map((x) => x.channel))];

  const result = channels.map((channel) => {
    const latest = rows.find(
      (x) => x.month === data.latestLabel && x.channel === channel,
    );

    const previous = rows.find(
      (x) => x.month === data.previousLabel && x.channel === channel,
    );

    return {
      channel,
      previousRevenue: previous?.revenue ?? 0,
      latestRevenue: latest?.revenue ?? 0,
      revenueChangePct:
        previous && latest ? change(latest.revenue, previous.revenue) : null,
      previousUnits: previous?.units ?? 0,
      latestUnits: latest?.units ?? 0,
    };
  });

  const meaningful = result.filter((x) => x.channel !== "Unknown");

  return {
    tool: "channel_breakdown",
    title: product
      ? `Analysed ${product} sales by channel`
      : "Analysed sales by channel",
    summary:
      meaningful.length === 0
        ? "Channel information is not available in the uploaded dataset."
        : `Compared ${meaningful.length} sales channel${
            meaningful.length === 1 ? "" : "s"
          } across the latest two months.`,
    evidence: {
      product,
      channels: meaningful,
      limitation: product
        ? "Current channel aggregates are business-wide, so they cannot yet isolate the selected product by channel."
        : null,
    },
  };
}

export function weekdayBreakdown(
  data: AnalysisResult,
  requestedProduct: string,
): InvestigationStep {
  const product = findProduct(data, requestedProduct);

  if (!product) {
    return {
      tool: "weekday_breakdown",
      title: `Analysed ${requestedProduct} by day of week`,
      summary: `No matching product was found for "${requestedProduct}".`,
      evidence: { requestedProduct, found: false },
    };
  }

  const rows = data.investigation.weekdayProducts.filter(
    (x) =>
      x.product === product &&
      (x.month === data.latestLabel || x.month === data.previousLabel),
  );

  const days = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  const result = days.map((day) => {
    const latest = rows.find(
      (x) => x.month === data.latestLabel && x.weekday === day,
    );

    const previous = rows.find(
      (x) => x.month === data.previousLabel && x.weekday === day,
    );

    return {
      weekday: day,
      previousUnits: previous?.units ?? 0,
      latestUnits: latest?.units ?? 0,
      unitsChangePct:
        previous && latest ? change(latest.units, previous.units) : null,
      previousRevenue: previous?.revenue ?? 0,
      latestRevenue: latest?.revenue ?? 0,
    };
  });

  const biggestDecline = [...result]
    .filter((x) => x.previousUnits > 0)
    .sort((a, b) => (a.unitsChangePct ?? 0) - (b.unitsChangePct ?? 0))[0];

  return {
    tool: "weekday_breakdown",
    title: `Analysed ${product} by day of week`,
    summary: biggestDecline
      ? `${biggestDecline.weekday} showed the largest comparable unit decline at ${Math.abs(
          biggestDecline.unitsChangePct ?? 0,
        ).toFixed(1)}%.`
      : `No comparable weekday decline could be calculated for ${product}.`,
    evidence: {
      product,
      weekdays: result,
      biggestDecline,
    },
  };
}

export function outletBreakdown(data: AnalysisResult): InvestigationStep {
  const rows = data.investigation.monthlyOutlets.filter(
    (x) => x.month === data.latestLabel || x.month === data.previousLabel,
  );

  const outlets = [...new Set(rows.map((x) => x.outlet))];

  const result = outlets.map((outlet) => {
    const latest = rows.find(
      (x) => x.month === data.latestLabel && x.outlet === outlet,
    );

    const previous = rows.find(
      (x) => x.month === data.previousLabel && x.outlet === outlet,
    );

    return {
      outlet,
      previousRevenue: previous?.revenue ?? 0,
      latestRevenue: latest?.revenue ?? 0,
      revenueChangePct:
        previous && latest ? change(latest.revenue, previous.revenue) : null,
      previousProfit: previous?.profit ?? 0,
      latestProfit: latest?.profit ?? 0,
      profitChangePct:
        previous && latest ? change(latest.profit, previous.profit) : null,
    };
  });

  const meaningful = result.filter((x) => x.outlet !== "Unknown");

  const weakest = [...meaningful]
    .filter((x) => x.revenueChangePct !== null)
    .sort((a, b) => (a.revenueChangePct ?? 0) - (b.revenueChangePct ?? 0))[0];

  return {
    tool: "outlet_breakdown",
    title: "Analysed performance by outlet",
    summary:
      meaningful.length === 0
        ? "Outlet information is not available."
        : weakest
          ? `${weakest.outlet} had the weakest revenue movement at ${
              weakest.revenueChangePct! >= 0 ? "+" : ""
            }${weakest.revenueChangePct!.toFixed(1)}%.`
          : "Compared performance across available outlets.",
    evidence: {
      outlets: meaningful,
      weakest,
    },
  };
}

export function profitability(
  data: AnalysisResult,
  requestedProduct: string,
): InvestigationStep {
  const product = findProduct(data, requestedProduct);

  if (!product) {
    return {
      tool: "profitability",
      title: `Checked ${requestedProduct} profitability`,
      summary: `No matching product was found for "${requestedProduct}".`,
      evidence: { requestedProduct, found: false },
    };
  }

  const rows = data.investigation.monthlyProducts.filter(
    (x) => x.product === product,
  );

  const latest = rows.find((x) => x.month === data.latestLabel);
  const previous = rows.find((x) => x.month === data.previousLabel);

  if (!latest || !previous) {
    return {
      tool: "profitability",
      title: `Checked ${product} profitability`,
      summary: `There is not enough comparable profitability data for ${product}.`,
      evidence: { product },
    };
  }

  const latestMargin =
    latest.revenue === 0
      ? null
      : round((latest.profit / latest.revenue) * 100, 1);

  const previousMargin =
    previous.revenue === 0
      ? null
      : round((previous.profit / previous.revenue) * 100, 1);

  return {
    tool: "profitability",
    title: `Checked ${product} profitability`,
    summary:
      latestMargin === null
        ? `A margin could not be calculated for ${product}.`
        : `${product}'s estimated gross margin was ${latestMargin.toFixed(
            1,
          )}% in ${data.latestLabel}.`,
    evidence: {
      product,
      previousRevenue: previous.revenue,
      latestRevenue: latest.revenue,
      previousProfit: previous.profit,
      latestProfit: latest.profit,
      profitChangePct: change(latest.profit, previous.profit),
      previousMarginPct: previousMargin,
      latestMarginPct: latestMargin,
      businessCostCoveragePct: round(data.metrics.costCoverage, 1),
      costsComplete: data.metrics.costsComplete,
      limitation: data.metrics.costsComplete
        ? null
        : "Some product costs are missing, so profit and margin figures are estimates.",
    },
  };
}

export function runInvestigationTool(
  tool: InvestigationTool,
  data: AnalysisResult,
  product?: string,
): InvestigationStep {
  switch (tool) {
    case "product_trend":
      return productTrend(data, product ?? "");
    case "compare_products":
      return compareProducts(data, product ?? "");
    case "price_vs_volume":
      return priceVsVolume(data, product ?? "");
    case "channel_breakdown":
      return channelBreakdown(data, product);
    case "weekday_breakdown":
      return weekdayBreakdown(data, product ?? "");
    case "outlet_breakdown":
      return outletBreakdown(data);
    case "profitability":
      return profitability(data, product ?? "");
  }
}
