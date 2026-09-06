import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

const productionClient = new BedrockRuntimeClient({ region: "us-east-1" });
let client = productionClient;

// Dependency injection keeps automated tests offline while production retains
// the real Bedrock client by default.
export function setBedrockClientForTests(testClient) {
  client = testClient ?? productionClient;
}
const MODEL_ID = "openai.gpt-oss-20b-1:0";
const MAX_STEPS = 3;

const headers = {
  "Content-Type": "application/json",
};

function makeResponse(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function parseBody(event) {
  if (typeof event?.body === "string") return JSON.parse(event.body);
  if (event?.body && typeof event.body === "object") return event.body;
  return event ?? {};
}

const round = (n, d = 2) =>
  Number(Number(n || 0).toFixed(d));

const pctChange = (current, previous) =>
  Number(previous) === 0
    ? null
    : round(
        ((Number(current) - Number(previous)) /
          Math.abs(Number(previous))) *
          100,
        1
      );

const norm = (s) =>
  String(s ?? "").trim().toLowerCase();

function textFromResponse(response) {
  return (response.output?.message?.content ?? [])
    .filter((x) => typeof x.text === "string")
    .map((x) => x.text)
    .join("\n")
    .trim();
}

async function askModel(
  systemPrompt,
  userPrompt,
  maxTokens = 300,
  temperature = 0
) {
  const command = new ConverseCommand({
    modelId: MODEL_ID,

    system: [
      {
        text: systemPrompt,
      },
    ],

    messages: [
      {
        role: "user",
        content: [
          {
            text: userPrompt,
          },
        ],
      },
    ],

    inferenceConfig: {
      maxTokens,
      temperature,
    },
  });

  const response =
    await client.send(command);

  const text =
    textFromResponse(response);

  /*
   * IMPORTANT:
   *
   * GPT-OSS occasionally returns an
   * empty text response.
   *
   * Do NOT crash the entire
   * investigation.
   *
   * The planner / report layer will
   * use a deterministic fallback.
   */

  return text || "";
}

function parseJSON(text) {
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {}

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start >= 0 && end > start) {
    return JSON.parse(cleaned.slice(start, end + 1));
  }

  throw new Error(
    `Model did not return valid JSON: ${cleaned.slice(0, 200)}`
  );
}

function findProduct(data, requested) {
  const names = [
    ...new Set(
      (data?.investigation?.monthlyProducts ?? [])
        .map((x) => x.product)
        .filter(Boolean)
    ),
  ];

  const exact = names.find(
    (x) => norm(x) === norm(requested)
  );

  if (exact) return exact;

  const partial = names.find(
    (x) =>
      norm(x).includes(norm(requested)) ||
      norm(requested).includes(norm(x))
  );

  return partial ?? null;
}

/* 
   DETERMINISTIC INVESTIGATION TOOLS
    */

function productTrend(data, requestedProduct) {
  const product = findProduct(data, requestedProduct);

  if (!product) {
    return {
      title: `Analysed ${requestedProduct} sales trend`,
      summary: `No matching product was found for "${requestedProduct}".`,
      evidence: {
        requestedProduct,
        found: false,
      },
    };
  }

  const rows = (
    data.investigation?.monthlyProducts ?? []
  )
    .filter((x) => x.product === product)
    .sort((a, b) => a.month.localeCompare(b.month));

  const latest = rows.find(
    (x) => x.month === data.latestLabel
  );

  const previous = rows.find(
    (x) => x.month === data.previousLabel
  );

  if (!latest || !previous) {
    return {
      title: `Analysed ${product} sales trend`,
      summary:
        `There is not enough comparable monthly data for ${product}.`,
      evidence: {
        product,
        rows,
      },
    };
  }

  const unitsChange = pctChange(
    latest.units,
    previous.units
  );

  const revenueChange = pctChange(
    latest.revenue,
    previous.revenue
  );

  const profitChange = pctChange(
    latest.profit,
    previous.profit
  );

  return {
    title: `Analysed ${product} sales trend`,

    summary:
      unitsChange === null
        ? `${product} had no comparable previous-period unit baseline.`
        : `${product} units ${
            unitsChange < 0 ? "fell" : "rose"
          } ${Math.abs(unitsChange).toFixed(
            1
          )}%, from ${previous.units} to ${latest.units}.`,

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

function priceVsVolume(data, requestedProduct) {
  const product = findProduct(data, requestedProduct);

  if (!product) {
    return {
      title: `Checked ${requestedProduct} price vs volume`,
      summary: `No matching product was found for "${requestedProduct}".`,
      evidence: {
        requestedProduct,
        found: false,
      },
    };
  }

  const rows = (
    data.investigation?.monthlyProducts ?? []
  ).filter((x) => x.product === product);

  const latest = rows.find(
    (x) => x.month === data.latestLabel
  );

  const previous = rows.find(
    (x) => x.month === data.previousLabel
  );

  if (!latest || !previous) {
    return {
      title: `Checked ${product} price vs volume`,
      summary:
        `There is not enough comparable data for ${product}.`,
      evidence: { product },
    };
  }

  const priceChange = pctChange(
    latest.avgPrice,
    previous.avgPrice
  );

  const volumeChange = pctChange(
    latest.units,
    previous.units
  );

  let summary =
    "Observed average selling price and unit sales both changed.";

  if (
    priceChange !== null &&
    Math.abs(priceChange) < 1
  ) {
    summary =
      "Observed average selling price was essentially unchanged while unit sales changed.";
  } else if (
    priceChange !== null &&
    volumeChange !== null &&
    priceChange > 0 &&
    volumeChange < 0
  ) {
    summary =
      "Observed average selling price increased while units fell. The movements occurred together, but this does not establish causation.";
  } else if (
    priceChange !== null &&
    volumeChange !== null &&
    priceChange < 0 &&
    volumeChange < 0
  ) {
    summary =
      "Observed average selling price and units both fell. The data does not establish why either movement occurred.";
  }

  return {
    title: `Checked ${product} price vs volume`,
    summary,

    evidence: {
      product,

      previousPrice: previous.avgPrice,
      latestPrice: latest.avgPrice,
      priceChangePct: priceChange,

      previousUnits: previous.units,
      latestUnits: latest.units,
      volumeChangePct: volumeChange,

      limitation:
        "Average selling price is an observed revenue-per-unit measure and does not establish an intentional list-price change or causal effect on sales.",
    },
  };
}

function compareProducts(data, requestedProduct) {
  const product = findProduct(data, requestedProduct);

  if (!product) {
    return {
      title: `Compared ${requestedProduct} with other products`,
      summary:
        `No matching product was found for "${requestedProduct}".`,
      evidence: {
        requestedProduct,
        found: false,
      },
    };
  }

  const rows =
    data.investigation?.monthlyProducts ?? [];

  const latest = rows.filter(
    (x) => x.month === data.latestLabel
  );

  const previous = rows.filter(
    (x) => x.month === data.previousLabel
  );

  const names = [
    ...new Set(
      [...latest, ...previous].map(
        (x) => x.product
      )
    ),
  ];

  const comparisons = names
    .map((name) => {
      const now = latest.find(
        (x) => x.product === name
      );

      const before = previous.find(
        (x) => x.product === name
      );

      return {
        product: name,

        previousUnits:
          before?.units ?? 0,

        latestUnits:
          now?.units ?? 0,

        unitsChangePct:
          before && now
            ? pctChange(
                now.units,
                before.units
              )
            : null,

        previousRevenue:
          before?.revenue ?? 0,

        latestRevenue:
          now?.revenue ?? 0,

        revenueChangePct:
          before && now
            ? pctChange(
                now.revenue,
                before.revenue
              )
            : null,
      };
    })
    .sort(
      (a, b) =>
        b.latestRevenue - a.latestRevenue
    );

  const target = comparisons.find(
    (x) => x.product === product
  );

  const peers = comparisons
    .filter(
      (x) => x.product !== product
    )
    .slice(0, 5);

  return {
    title:
      `Compared ${product} with other products`,

    summary:
      target?.unitsChangePct == null
        ? `Compared ${product} against other menu items.`
        : `${product}'s unit movement was ${
            target.unitsChangePct >= 0
              ? "+"
              : ""
          }${target.unitsChangePct.toFixed(
            1
          )}%.`,

    evidence: {
      target,
      peers,
    },
  };
}

function channelBreakdown(data) {
  const rows = (
    data.investigation?.monthlyChannels ?? []
  ).filter(
    (x) =>
      x.month === data.latestLabel ||
      x.month === data.previousLabel
  );

  const channels = [
    ...new Set(
      rows.map((x) => x.channel)
    ),
  ];

  const result = channels
    .filter(
      (channel) => channel !== "Unknown"
    )
    .map((channel) => {
      const latest = rows.find(
        (x) =>
          x.month === data.latestLabel &&
          x.channel === channel
      );

      const previous = rows.find(
        (x) =>
          x.month === data.previousLabel &&
          x.channel === channel
      );

      return {
        channel,

        previousRevenue:
          previous?.revenue ?? 0,

        latestRevenue:
          latest?.revenue ?? 0,

        revenueChangePct:
          previous && latest
            ? pctChange(
                latest.revenue,
                previous.revenue
              )
            : null,

        previousUnits:
          previous?.units ?? 0,

        latestUnits:
          latest?.units ?? 0,
      };
    });

  return {
    title: "Analysed sales by channel",

    summary:
      result.length === 0
        ? "Channel information is not available in the uploaded dataset."
        : `Compared ${
            result.length
          } available sales channel${
            result.length === 1 ? "" : "s"
          }.`,

    evidence: {
      channels: result,

      limitation:
        "Current channel aggregates are business-wide and cannot isolate an individual product by channel.",
    },
  };
}

function discountRefundAnalysis(data) {
  const monthly =
    data.investigation?.monthlyDiscountRefunds ?? [];

  const previous = monthly.find(
    (x) => x.month === data.previousLabel
  );

  const latest = monthly.find(
    (x) => x.month === data.latestLabel
  );

  if (!previous || !latest) {
    return {
      title:
        "Analysed discounts and refunds",

      summary:
        "Discount and refund information was not available for both comparison periods.",

      evidence: {
        previousLabel:
          data.previousLabel,

        latestLabel:
          data.latestLabel,

        comparable: false,

        limitation:
          "Discount and refund changes cannot be compared without data for both periods.",
      },
    };
  }

  const previousDiscounts =
    Number(previous.discounts ?? 0);

  const latestDiscounts =
    Number(latest.discounts ?? 0);

  const previousRefunds =
    Number(previous.refunds ?? 0);

  const latestRefunds =
    Number(latest.refunds ?? 0);

  return {
    title:
      "Analysed discounts and refunds",

    summary:
      `Compared discounts and refunds between ${data.previousLabel} and ${data.latestLabel}.`,

    evidence: {
      comparable: true,

      previousLabel:
        data.previousLabel,

      latestLabel:
        data.latestLabel,

      previousDiscounts:
        round(previousDiscounts),

      latestDiscounts:
        round(latestDiscounts),

      discountChange:
        round(
          latestDiscounts -
            previousDiscounts
        ),

      previousRefunds:
        round(previousRefunds),

      latestRefunds:
        round(latestRefunds),

      refundChange:
        round(
          latestRefunds -
            previousRefunds
        ),

      limitation:
        "The analysis measures changes in discounts and refunds but does not establish that they caused changes in sales, orders or profit.",
    },
  };
}

function weekdayBreakdown(
  data,
  requestedProduct
) {
  const product = findProduct(
    data,
    requestedProduct
  );

  if (!product) {
    return {
      title:
        `Analysed ${requestedProduct} by day of week`,
      summary:
        `No matching product was found for "${requestedProduct}".`,
      evidence: {
        requestedProduct,
        found: false,
      },
    };
  }

  const rows = (
    data.investigation?.weekdayProducts ?? []
  ).filter(
    (x) =>
      x.product === product &&
      (x.month === data.latestLabel ||
        x.month === data.previousLabel)
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
      (x) =>
        x.month === data.latestLabel &&
        x.weekday === day
    );

    const previous = rows.find(
      (x) =>
        x.month === data.previousLabel &&
        x.weekday === day
    );

    return {
      weekday: day,

      previousUnits:
        previous?.units ?? 0,

      latestUnits:
        latest?.units ?? 0,

      unitsChangePct:
        previous && latest
          ? pctChange(
              latest.units,
              previous.units
            )
          : null,

      previousRevenue:
        previous?.revenue ?? 0,

      latestRevenue:
        latest?.revenue ?? 0,
    };
  });

  const comparable = result.filter(
    (x) =>
      x.previousUnits > 0 &&
      x.unitsChangePct !== null
  );

  const biggestDecline = [
    ...comparable,
  ].sort(
    (a, b) =>
      a.unitsChangePct -
      b.unitsChangePct
  )[0];

  return {
    title:
      `Analysed ${product} by day of week`,

    summary:
      biggestDecline
        ? `${biggestDecline.weekday} had the weakest comparable unit movement at ${
            biggestDecline.unitsChangePct >= 0
              ? "+"
              : ""
          }${biggestDecline.unitsChangePct.toFixed(
            1
          )}%.`
        : `No comparable weekday movement could be calculated for ${product}.`,

    evidence: {
      product,
      weekdays: result,
      biggestDecline:
        biggestDecline ?? null,
    },
  };
}

function outletBreakdown(data) {
  const rows = (
    data.investigation?.monthlyOutlets ?? []
  ).filter(
    (x) =>
      x.month === data.latestLabel ||
      x.month === data.previousLabel
  );

  const outlets = [
    ...new Set(
      rows.map((x) => x.outlet)
    ),
  ];

  const result = outlets
    .filter(
      (outlet) => outlet !== "Unknown"
    )
    .map((outlet) => {
      const latest = rows.find(
        (x) =>
          x.month === data.latestLabel &&
          x.outlet === outlet
      );

      const previous = rows.find(
        (x) =>
          x.month === data.previousLabel &&
          x.outlet === outlet
      );

      return {
        outlet,

        previousRevenue:
          previous?.revenue ?? 0,

        latestRevenue:
          latest?.revenue ?? 0,

        revenueChangePct:
          previous && latest
            ? pctChange(
                latest.revenue,
                previous.revenue
              )
            : null,

        previousProfit:
          previous?.profit ?? 0,

        latestProfit:
          latest?.profit ?? 0,

        profitChangePct:
          previous && latest
            ? pctChange(
                latest.profit,
                previous.profit
              )
            : null,
      };
    });

  const weakest = [...result]
    .filter(
      (x) =>
        x.revenueChangePct !== null
    )
    .sort(
      (a, b) =>
        a.revenueChangePct -
        b.revenueChangePct
    )[0];

  return {
    title:
      "Analysed performance by outlet",

    summary:
      result.length === 0
        ? "Outlet information is not available."
        : weakest
        ? `${weakest.outlet} had the weakest revenue movement at ${
            weakest.revenueChangePct >= 0
              ? "+"
              : ""
          }${weakest.revenueChangePct.toFixed(
            1
          )}%.`
        : "Compared performance across available outlets.",

    evidence: {
      outlets: result,
      weakest: weakest ?? null,
    },
  };
}

function profitability(
  data,
  requestedProduct
) {
  const product = findProduct(
    data,
    requestedProduct
  );

  if (!product) {
    return {
      title:
        `Checked ${requestedProduct} profitability`,
      summary:
        `No matching product was found for "${requestedProduct}".`,
      evidence: {
        requestedProduct,
        found: false,
      },
    };
  }

  const rows = (
    data.investigation?.monthlyProducts ?? []
  ).filter(
    (x) => x.product === product
  );

  const latest = rows.find(
    (x) => x.month === data.latestLabel
  );

  const previous = rows.find(
    (x) => x.month === data.previousLabel
  );

  if (!latest || !previous) {
    return {
      title:
        `Checked ${product} profitability`,
      summary:
        `There is not enough comparable profitability data for ${product}.`,
      evidence: { product },
    };
  }

  const latestMargin =
    latest.revenue === 0
      ? null
      : round(
          (latest.profit /
            latest.revenue) *
            100,
          1
        );

  const previousMargin =
    previous.revenue === 0
      ? null
      : round(
          (previous.profit /
            previous.revenue) *
            100,
          1
        );

  return {
    title:
      `Checked ${product} profitability`,

    summary:
      latestMargin === null
        ? `A margin could not be calculated for ${product}.`
        : `${product}'s ${
            data.metrics?.costsComplete
              ? "gross margin"
              : "estimated gross margin"
          } was ${latestMargin.toFixed(
            1
          )}% in ${data.latestLabel}.`,

    evidence: {
      product,

      previousRevenue:
        previous.revenue,

      latestRevenue:
        latest.revenue,

      previousProfit:
        previous.profit,

      latestProfit:
        latest.profit,

      profitChangePct:
        pctChange(
          latest.profit,
          previous.profit
        ),

      previousMarginPct:
        previousMargin,

      latestMarginPct:
        latestMargin,

      businessCostCoveragePct:
        round(
          data.metrics?.costCoverage ?? 0,
          1
        ),

      costsComplete:
        Boolean(
          data.metrics?.costsComplete
        ),

      limitation:
        data.metrics?.costsComplete
          ? null
          : "Some product costs are missing, so profit and margin figures are estimates.",
    },
  };
}

function periodComparison(data) {
  const latestLabel =
    data.latestLabel;

  const previousLabel =
    data.previousLabel;

  const monthlyProducts =
    data.investigation
      ?.monthlyProducts ?? [];

  const monthlyChannels =
    data.investigation
      ?.monthlyChannels ?? [];

  if (
    !latestLabel ||
    !previousLabel
  ) {
    return {
      title:
        "Compared business performance by period",

      summary:
        "There are not enough comparable periods to perform a month-over-month comparison.",

      evidence: {
        latestLabel,
        previousLabel,
        comparable: false,
      },
    };
  }

  const summarisePeriod = (
    month
  ) => {
    const productRows =
      monthlyProducts.filter(
        (x) =>
          x.month === month
      );

    const channelRows =
      monthlyChannels.filter(
        (x) =>
          x.month === month
      );

    const revenue =
      productRows.reduce(
        (sum, x) =>
          sum +
          Number(
            x.revenue ?? 0
          ),
        0
      );

    const units =
      productRows.reduce(
        (sum, x) =>
          sum +
          Number(
            x.units ?? 0
          ),
        0
      );

    /*
     * Product-level transaction
     * counts cannot be summed because
     * one order may contain multiple
     * products.
     *
     * Channels are business-wide
     * partitions, so use them for
     * the order count instead.
     */
    const transactions =
      channelRows.reduce(
        (sum, x) =>
          sum +
          Number(
            x.transactions ?? 0
          ),
        0
      );

    /*
     * Profit is only the covered
     * gross profit from rows whose
     * product cost is known.
     *
     * Missing costs must never be
     * treated as zero.
     */
    const coveredProfit =
      productRows.reduce(
        (sum, x) =>
          sum +
          Number(
            x.profit ?? 0
          ),
        0
      );

    const coveredRevenue =
      productRows.reduce(
        (sum, x) =>
          sum +
          Number(
            x.coveredRevenue ?? 0
          ),
        0
      );

    const costCoveragePct =
      revenue > 0
        ? round(
            (coveredRevenue /
              revenue) *
              100,
            2
          )
        : 0;

    const costsComplete =
      productRows.length > 0 &&
      productRows.every(
        (x) =>
          x.profitSupported !==
          false
      );

    const aov =
      transactions > 0
        ? revenue /
          transactions
        : 0;

    return {
      month,

      revenue:
        round(revenue),

      transactions:
        round(
          transactions
        ),

      units:
        round(units),

      aov:
        round(aov),

      coveredProfit:
        round(
          coveredProfit
        ),

      coveredRevenue:
        round(
          coveredRevenue
        ),

      costCoveragePct,

      costsComplete,
    };
  };

  const previous =
    summarisePeriod(
      previousLabel
    );

  const latest =
    summarisePeriod(
      latestLabel
    );

  return {
    title:
      `Compared ${latestLabel} with ${previousLabel}`,

    summary:
      `Compared business-wide sales, orders, units, average order value and covered gross profit between ${previousLabel} and ${latestLabel}.`,

    evidence: {
      comparable: true,

      previous,

      latest,

      revenueChangePct:
        pctChange(
          latest.revenue,
          previous.revenue
        ),

      transactionChangePct:
        pctChange(
          latest.transactions,
          previous.transactions
        ),

      unitsChangePct:
        pctChange(
          latest.units,
          previous.units
        ),

      aovChangePct:
        pctChange(
          latest.aov,
          previous.aov
        ),

      coveredProfitChangePct:
        pctChange(
          latest.coveredProfit,
          previous.coveredProfit
        ),

      costsComplete:
        previous.costsComplete &&
        latest.costsComplete,

      limitation:
        previous.costsComplete &&
        latest.costsComplete
          ? null
          : `Gross profit is based only on sales with known product costs. Cost coverage was ${previous.costCoveragePct}% in ${previousLabel} and ${latest.costCoveragePct}% in ${latestLabel}.`,
    },
  };
}

function productPerformance(data) {
  const current = Array.isArray(
    data?.investigation?.productPerformance
  )
    ? data.investigation.productPerformance
    : [];

  const monthly =
    data?.investigation?.monthlyProducts ?? [];

  if (!current.length) {
    return {
      title:
        "Compared menu product performance",
      summary:
        "No product performance aggregates were available.",
      evidence: {
        products: [],
      },
    };
  }

  const previousRows = monthly.filter(
    (x) =>
      x.month === data.previousLabel
  );

  const latestRows = monthly.filter(
    (x) =>
      x.month === data.latestLabel
  );

  const results = current.map((p) => {
    const previous =
      previousRows.find(
        (x) =>
          norm(x.product) ===
          norm(p.name)
      );

    const latest =
      latestRows.find(
        (x) =>
          norm(x.product) ===
          norm(p.name)
      );

    const marginPct =
      Number(p.revenue) === 0
        ? null
        : round(
            (Number(p.profit) /
              Number(p.revenue)) *
              100,
            1
          );

    return {
      product: p.name,

      units:
        round(p.units),

      revenue:
        round(p.revenue),

      profit:
        round(p.profit),

      avgPrice:
        round(p.price),

      marginPct,

      previousUnits:
        previous?.units ?? null,

      latestUnits:
        latest?.units ?? null,

      unitsChangePct:
        previous && latest
          ? pctChange(
              latest.units,
              previous.units
            )
          : null,

      previousRevenue:
        previous?.revenue ?? null,

      latestRevenue:
        latest?.revenue ?? null,

      revenueChangePct:
        previous && latest
          ? pctChange(
              latest.revenue,
              previous.revenue
            )
          : null,

      previousProfit:
        previous?.profit ?? null,

      latestProfit:
        latest?.profit ?? null,

      profitChangePct:
        previous && latest
          ? pctChange(
              latest.profit,
              previous.profit
            )
          : null,
    };
  });

  const byProfit = [
    ...results,
  ].sort(
    (a, b) =>
      a.profit - b.profit
  );

  const byRevenue = [
    ...results,
  ].sort(
    (a, b) =>
      a.revenue - b.revenue
  );

  const byUnits = [
    ...results,
  ].sort(
    (a, b) =>
      a.units - b.units
  );

  const byProfitChange = [
    ...results,
  ]
    .filter(
      (x) =>
        x.profitChangePct !== null
    )
    .sort(
      (a, b) =>
        a.profitChangePct -
        b.profitChangePct
    );

  return {
    title:
      "Compared menu product performance",

    summary:
      `Compared ${results.length} menu items across units sold, revenue, profit, margin and recent movement.`,

    evidence: {
      period:
        data.latestLabel,

      productCount:
        results.length,

      products:
        results,

      lowestProfit:
        byProfit[0] ?? null,

      lowestRevenue:
        byRevenue[0] ?? null,

      lowestUnits:
        byUnits[0] ?? null,

      weakestProfitMovement:
        byProfitChange[0] ?? null,

      costCoveragePct:
        round(
          data.metrics
            ?.costCoverage ?? 0,
          1
        ),

      costsComplete:
        Boolean(
          data.metrics
            ?.costsComplete
        ),

      limitation:
        data.metrics
          ?.costsComplete
          ? "Removal decisions are based on measured sales and financial performance. Strategic importance, preparation complexity, customer loyalty and other unmeasured factors were not examined."
          : "Some product costs are missing, so profit-based comparisons are estimates. Strategic importance, preparation complexity, customer loyalty and other unmeasured factors were not examined.",
    },
  };
}

function runTool(
  tool,
  data,
  product
) {
  switch (tool) {
  case "period_comparison":
    return periodComparison(
      data
    );

  case "product_performance":
    return productPerformance(
      data
    );

    case "product_trend":
      return productTrend(
        data,
        product
      );

    case "price_vs_volume":
      return priceVsVolume(
        data,
        product
      );

    case "compare_products":
      return compareProducts(
        data,
        product
      );

    case "channel_breakdown":
      return channelBreakdown(
        data
      );

      case "discount_refund_analysis":
  return discountRefundAnalysis(
    data
  );

    case "weekday_breakdown":
      return weekdayBreakdown(
        data,
        product
      );

    case "outlet_breakdown":
      return outletBreakdown(
        data
      );

    case "profitability":
      return profitability(
        data,
        product
      );

    default:
      throw new Error(
        `Unknown investigation tool: ${tool}`
      );
  }
}

/* 
   AGENT
    */

const AVAILABLE_TOOLS = [
  "period_comparison",
  "product_performance",
  "product_trend",
  "price_vs_volume",
  "compare_products",
  "channel_breakdown",
  "weekday_breakdown",
  "outlet_breakdown",
  "profitability",
  "discount_refund_analysis",
];

function buildContext(data) {
  const products = [
    ...new Set(
      (
        data.investigation
          ?.monthlyProducts ?? []
      )
        .map(
          (x) =>
            x.product
        )
        .filter(Boolean)
    ),
  ].slice(0, 100);

  const channels = [
    ...new Set(
      (
        data.investigation
          ?.monthlyChannels ?? []
      )
        .map(
          (x) =>
            x.channel
        )
        .filter(
          (x) =>
            x &&
            x !==
              "Unknown"
        )
    ),
  ];

  const outlets = [
    ...new Set(
      (
        data.investigation
          ?.monthlyOutlets ?? []
      )
        .map(
          (x) =>
            x.outlet
        )
        .filter(
          (x) =>
            x &&
            x !==
              "Unknown"
        )
    ),
  ];

  return {
    previousMonth:
      data.previousLabel,

    latestMonth:
      data.latestLabel,

    products,
    channels,
    outlets,

    latestLabel:
     data.latestLabel,
     
    previousLabel:
      data.previousLabel,

    businessMetrics:
      data.metrics,
  };
}

function namedProductFromQuestion(
  question,
  context
) {
  return (
    context.products ?? []
  ).find((product) =>
    norm(question).includes(
      norm(product)
    )
  ) ?? null;
}

/*
 * Detect questions that require
 * information Brewlytics does not
 * currently measure.
 *
 * IMPORTANT:
 * This prevents the AI from
 * pretending it can explain things
 * such as weather, competitors or
 * customer opinions.
 */
function classifyQuestion(
  question,
  context
) {
  const q = norm(question);

  const product =
    namedProductFromQuestion(
      question,
      context
    );

  const unsupportedTopics = [
    {
      words: [
        "weather",
        "rain",
        "rainy",
        "temperature",
      ],
      topic: "weather",
    },

    {
      words: [
        "competitor",
        "competition",
      ],
      topic:
        "competitor activity",
    },

    {
      words: [
        "customer preference",
        "customer preferences",
        "customers like",
        "customers dislike",
        "customers hate",
        "customer opinion",
        "customer opinions",
      ],
      topic:
        "customer preferences",
    },

    {
      words: [
        "why did i lower",
        "why did i raise",
        "why did we lower",
        "why did we raise",
        "management rationale",
        "rationale",
      ],
      topic:
        "management rationale",
    },

    {
      words: [
        "marketing",
        "advertising",
      ],
      topic:
        "marketing activity",
    },
  ];

  const unsupported =
    unsupportedTopics.find(
      (item) =>
        item.words.some(
          (word) =>
            q.includes(word)
        )
    );

  if (unsupported) {
    return {
      kind: "unsupported",
      topic:
        unsupported.topic,
      product,
    };
  }

  /*
 * Discounts and refunds are directly
 * measured in the uploaded sales data.
 *
 * Route these questions to the dedicated
 * deterministic analysis instead of the
 * generic period comparison.
 */
const asksDiscountRefund =
  q.includes("discount") ||
  q.includes("discounts") ||
  q.includes("refund") ||
  q.includes("refunds");

if (asksDiscountRefund) {
  return {
    kind: "discount_refund",
    product: null,
  };
}

  /*
   * Also detect a very important
   * supported question:
   *
   * "How did Iced Latte compare
   * with my other products?"
   *
   * This should use
   * compare_products, NOT the
   * menu-wide product_performance.
   */
  const comparisonWords = [
    "compared with",
    "compare with",
    "compared to",
    "compare to",
    "versus",
    " vs ",
    "other products",
    "other menu",
  ];

  if (
    product &&
    comparisonWords.some(
      (word) =>
        q.includes(word)
    )
  ) {
    return {
      kind:
        "named_product_comparison",
      product,
    };
  }

  return {
    kind: "normal",
    product,
  };
}

/*
 * Build a safe answer WITHOUT
 * asking Bedrock to invent an
 * explanation.
 *
 * We still give the café owner
 * useful next analyses that
 * Brewlytics CAN perform.
 */
function unsupportedAnswer(
  question,
  context,
  classification
) {
  const topic =
    classification.topic;

  const product =
    classification.product;

  const followUps = [];

  /*
   * If the unsupported question
   * mentioned a real product,
   * offer product analyses.
   */
  if (product) {
    followUps.push(
      {
        label:
          `Check ${product} trend`,

        question:
          `How has ${product} performed over the latest two months?`,
      },

      {
        label:
          "Compare with other products",

        question:
          `How did ${product} compare with other menu products?`,
      },

      {
        label:
          "Check weekday patterns",

        question:
          `How did ${product} perform across different weekdays?`,
      }
    );
  } else {
    /*
     * No product was named.
     * Offer business-wide analyses.
     */

    followUps.push({
      label:
        "Compare all products",

      question:
        "Compare the performance of all menu products.",
    });

    if (
      (
        context.channels
          ?.length ?? 0
      ) > 0
    ) {
      followUps.push({
        label:
          "Compare sales channels",

        question:
          "How did my sales channels perform compared with the previous month?",
      });
    }

    if (
      (
        context.outlets
          ?.length ?? 0
      ) > 0
    ) {
      followUps.push({
        label:
          "Compare outlets",

        question:
          "How did my outlets perform compared with the previous month?",
      });
    }
  }

  const topicLabel =
    topic.charAt(0).toUpperCase() +
    topic.slice(1);

  return {
    headline:
      `I can't determine whether ${topic} caused the change from the uploaded business data.`,

    overview:
      `The current Brewlytics analysis does not measure ${topic}, so it would be misleading to claim that it caused your sales movement. I can still investigate the change using evidence that is actually present in your data, such as product performance, month-to-month trends, weekdays, sales channels and outlets.`,

    metrics: [],

    findings: [
      {
        title:
          "Evidence boundary",

        text:
          `${topicLabel} was not measured in the executed business data, so Brewlytics cannot test it as a cause.`,
      },
    ],

    conclusion:
      `No causal conclusion about ${topic} can be made from the current data. The next useful step is to investigate where the recorded sales change occurred rather than inventing an explanation.`,

    limitations:
      `This answer deliberately stops at the evidence boundary because ${topic} was not measured.`,

    followUps:
      followUps.slice(
        0,
        3
      ),
  };
}

async function chooseNextAction(
  question,
  context,
  steps
) {
  const systemPrompt = `
You are the investigation planner for Brewlytics.

Your job is to decide what deterministic evidence Brewlytics should analyse next to answer the café owner's question.

You DO NOT calculate business figures yourself.
All calculations must come from deterministic tools.

The owner may ask:
- diagnostic questions
- comparison questions
- performance questions
- decision questions
- recommendation questions

Recommendations are allowed, but Brewlytics must analyse evidence before making one.

AVAILABLE TOOLS:

period_comparison
Compare BUSINESS-WIDE performance between the latest period and previous period.
It measures revenue, orders, units, average order value and covered gross profit.
Use for questions such as:
- What changed in August compared with July?
- How did the business perform this month compared with last month?
- What changed month over month?
- Did my business improve or decline?
- Compare this month with the previous month.
This tool is business-wide and does NOT require a product name.

IMPORTANT:
If the owner asks for an overall period or month comparison, use period_comparison before product-level tools.

product_performance
Compare ALL menu items across latest-period units, revenue, profit, margin and recent movement.
Use for menu-wide questions such as:
- What product should I remove?
- What is my weakest product?
- Which products are underperforming?
- Which product contributes least to profit?
- What are my best products?
This tool does NOT require a product name.

product_trend
Compare one named product across the latest two months.

price_vs_volume
Compare a named product's observed average selling price movement with its unit movement.

compare_products
Compare one named product against peer menu items.

weekday_breakdown
Compare one named product's performance by weekday.

profitability
Inspect one named product's estimated profit and margin.

channel_breakdown
Compare BUSINESS-WIDE sales channels.
This is not product-specific.

outlet_breakdown
Compare BUSINESS-WIDE outlets.
This is not product-specific.

RULES:
1. Choose only from the listed tools.
2. Never invent calculations.
3. Never invent causes.
4. Never claim a tool was run unless it appears in EXECUTED STEPS.
5. Do not repeat a tool already executed.
6. Choose the analysis that most directly answers the owner's actual question.
7. 7. For BUSINESS-WIDE period or month comparison questions, use period_comparison. Do not use product_performance unless the owner is specifically asking about menu products.
8. For menu-wide PRODUCT questions where the owner did not name a product, strongly prefer product_performance.
9. For recommendation or decision questions, gather comparative evidence first.
10. "What product should I remove?" requires product_performance before a recommendation can be made.
11. Recommendations must be qualified and based only on measured evidence.
12. Never invent customer preference, strategic importance, weather, competitors, promotions, management rationale, preparation complexity, ingredient usage, or other unmeasured factors.
13. For product-specific questions, use the exact product name from AVAILABLE CONTEXT whenever possible.
14. channel_breakdown and outlet_breakdown are business-wide only.
15. If enough evidence exists, choose "final".
16. Maximum investigation depth is small, so prioritise evidence that materially helps answer the question.
Return ONLY valid JSON.

To run a menu-wide tool:
{"action":"tool","tool":"product_performance"}

To run a product-specific tool:
{"action":"tool","tool":"product_trend","product":"Iced Latte"}

When enough evidence exists:
{"action":"final"}
`.trim();

  const userPrompt = `
CAFÉ OWNER QUESTION:
${question}

AVAILABLE CONTEXT:
${JSON.stringify(
  context
)}

EXECUTED STEPS:
${JSON.stringify(
  steps.map((x) => ({
    tool: x.tool,
    title: x.title,
    summary: x.summary,
    evidence: x.evidence,
  }))
)}

Choose the SINGLE best next action.

Return valid JSON only.
`.trim();

const text =
await askModel(
  systemPrompt,
  userPrompt,
  260,
  0
);

/*
* Bedrock occasionally returns
* an empty response.
*
* Tell the handler to use its
* deterministic fallback instead
* of crashing.
*/
if (!text) {
return {
  action: "fallback",
};
}

/*
* Bedrock may also return text
* that is not valid JSON.
*
* Again, fall back safely rather
* than failing the investigation.
*/
try {
return parseJSON(text);
} catch {
console.error(
  "Planner returned invalid JSON:",
  text
);

return {
  action: "fallback",
};
}
}

function buildSafeFollowUps(
  requested,
  context,
  executedTools
) {
  if (
    !Array.isArray(
      requested
    )
  ) {
    return [];
  }

  const alreadyUsed =
    new Set(
      executedTools
    );

  const result = [];

  for (
    const item of requested
  ) {
    if (
      !item ||
      typeof item.type !==
        "string"
    ) {
      continue;
    }

    const type =
      item.type;

    const product =
      item.product
        ? (
            context.products ??
            []
          ).find(
            (p) =>
              norm(p) ===
              norm(
                item.product
              )
          )
        : null;

    if (
      alreadyUsed.has(
        type
      )
    ) {
      continue;
    }

    if (
      type ===
      "product_performance"
    ) {
      result.push({
        label:
          "Compare all products",

        question:
          "Compare the performance of all menu products.",
      });
    } else if (
      type ===
        "product_trend" &&
      product
    ) {
      result.push({
        label:
          `Check ${product} trend`,

        question:
          `How has ${product} performed over the latest two months?`,
      });
    } else if (
      type ===
        "price_vs_volume" &&
      product
    ) {
      result.push({
        label:
          "Check price vs volume",

        question:
          `How did observed average selling price and sales volume change for ${product}?`,
      });
    } else if (
      type ===
        "compare_products" &&
      product
    ) {
      result.push({
        label:
          "Compare with other products",

        question:
          `How did ${product} compare with other menu products?`,
      });
    } else if (
      type ===
        "weekday_breakdown" &&
      product
    ) {
      result.push({
        label:
          "Check weekday patterns",

        question:
          `How did ${product} perform across different weekdays?`,
      });
    } else if (
      type ===
        "profitability" &&
      product
    ) {
      result.push({
        label:
          "Check profitability",

        question:
          `How profitable is ${product} compared with its previous performance?`,
      });
    } else if (
      type ===
        "channel_breakdown" &&
      (
        context.channels
          ?.length ?? 0
      ) > 0
    ) {
      result.push({
        label:
          "Compare sales channels",

        question:
          "How did my sales channels perform compared with the previous month?",
      });
    } else if (
      type ===
        "outlet_breakdown" &&
      (
        context.outlets
          ?.length ?? 0
      ) > 0
    ) {
      result.push({
        label:
          "Compare outlets",

        question:
          "How did my outlets perform compared with the previous month?",
      });
    }

    if (
      result.length >= 3
    ) {
      break;
    }
  }

  return result;
}

function deterministicAnswer(
  question,
  context,
  steps
) {
  const first = steps[0];

  if (!first) {
    return {
      headline:
        "I could not complete a reliable investigation.",

      overview:
        "No deterministic analysis was completed, so Brewlytics will not invent an answer.",

      metrics: [],

      findings: [],

      conclusion:
        "Try asking about product performance, trends, profitability, weekdays, channels or outlets.",

      limitations:
        "No executed evidence was available.",

      followUps: [],
    };
  }

  const evidence =
    first.evidence ?? {};

  /*
   * =====================================
   * NAMED PRODUCT COMPARISON
   * =====================================
   *
   * Example:
   * "How did Iced Latte compare with my
   * other products?"
   */
  if (
    first.tool ===
      "compare_products" &&
    evidence.target
  ) {
    const target =
      evidence.target;

    const peers =
      Array.isArray(
        evidence.peers
      )
        ? evidence.peers
        : [];

    /*
     * Rank target against the products
     * returned by compare_products.
     */
    const ranked = [
      target,
      ...peers,
    ].sort(
      (a, b) =>
        Number(
          b.latestRevenue || 0
        ) -
        Number(
          a.latestRevenue || 0
        )
    );

    const rank =
      ranked.findIndex(
        (x) =>
          x.product ===
          target.product
      ) + 1;

    const movement =
      target.unitsChangePct ==
      null
        ? "There was no comparable previous-period unit baseline."
        : `Unit sales ${
            target.unitsChangePct >= 0
              ? "rose"
              : "fell"
          } ${Math.abs(
            target.unitsChangePct
          ).toFixed(
            1
          )}% compared with the previous period.`;

    return {
      headline:
        `${target.product} ranked ${rank} of ${ranked.length} among the compared products by latest-period revenue.`,

      overview:
        `${target.product} recorded ${target.latestUnits} units and S$${round(
          target.latestRevenue
        ).toFixed(
          2
        )} in latest-period revenue. ${movement} Brewlytics compared this performance with the available peer products using recorded sales evidence rather than inferring an unmeasured cause.`,

      metrics: [
        {
          label:
            "Latest units",

          value:
            String(
              target.latestUnits
            ),

          detail:
            target.previousUnits !=
            null
              ? `Previous: ${target.previousUnits}`
              : "",
        },

        {
          label:
            "Latest revenue",

          value:
            `S$${round(
              target.latestRevenue
            ).toFixed(2)}`,

          detail:
            target.previousRevenue !=
            null
              ? `Previous: S$${round(
                  target.previousRevenue
                ).toFixed(2)}`
              : "",
        },

        ...(target.unitsChangePct ==
        null
          ? []
          : [
              {
                label:
                  "Unit sales change",

                value:
                  `${
                    target.unitsChangePct >=
                    0
                      ? "+"
                      : ""
                  }${target.unitsChangePct.toFixed(
                    1
                  )}%`,

                detail:
                  "Latest vs previous period",
              },
            ]),
      ].slice(0, 4),

      findings: [
        {
          title:
            "Relative product performance",

          text:
            `${target.product} was compared with ${peers.length} peer menu items using recorded units and revenue. Its latest-period revenue rank within this comparison was ${rank} of ${ranked.length}.`,
        },

        {
          title:
            "Recent sales movement",

          text:
            movement,
        },
      ],

      conclusion:
        `${target.product}'s relative performance can be assessed from its recorded units, revenue and recent movement. These figures show how it performed, but they do not establish why customers bought more or less of the product.`,

      limitations:
        "The comparison does not measure customer preferences, promotions, weather, competitor activity or other external causes.",

      followUps:
        buildSafeFollowUps(
          [
            {
              type:
                "product_trend",
              product:
                target.product,
            },

            {
              type:
                "profitability",
              product:
                target.product,
            },

            {
              type:
                "weekday_breakdown",
              product:
                target.product,
            },
          ],

          context,

          steps.map(
            (x) => x.tool
          )
        ),
    };
  }

  /*
   * =====================================
   * MENU-WIDE PRODUCT PERFORMANCE
   * =====================================
   *
   * Useful for:
   *
   * - What product should I remove?
   * - What should I improve?
   * - What is my weakest product?
   */
  if (
    first.tool ===
      "product_performance" &&
    Array.isArray(
      evidence.products
    ) &&
    evidence.products.length
  ) {
    const products =
      evidence.products;

    const byProfit = [
      ...products,
    ].sort(
      (a, b) =>
        Number(a.profit) -
        Number(b.profit)
    );

    const weakest =
      byProfit[0];

    const strongest =
      byProfit[
        byProfit.length - 1
      ];

    const profitLabel =
      evidence.costsComplete
        ? "profit"
        : "estimated profit";

    return {
      headline:
        `${weakest.product} is the weakest product by ${profitLabel} in the latest period.`,

      overview:
        `Brewlytics compared ${products.length} menu items using units sold, revenue, ${profitLabel}, margin and recent movement. ${weakest.product} recorded the lowest ${profitLabel} at S$${round(
          weakest.profit
        ).toFixed(
          2
        )}, while ${strongest.product} recorded the highest at S$${round(
          strongest.profit
        ).toFixed(
          2
        )}. This gives you a concrete product to investigate first instead of relying on a generic business recommendation.`,

      metrics: [
        {
          label:
            "Products compared",

          value:
            String(
              products.length
            ),

          detail:
            evidence.period ??
            "",
        },

        {
          label:
            `Lowest ${profitLabel}`,

          value:
            `S$${round(
              weakest.profit
            ).toFixed(2)}`,

          detail:
            weakest.product,
        },

        {
          label:
            `Highest ${profitLabel}`,

          value:
            `S$${round(
              strongest.profit
            ).toFixed(2)}`,

          detail:
            strongest.product,
        },

        {
          label:
            "Weakest-product units",

          value:
            String(
              weakest.units
            ),

          detail:
            weakest.product,
        },
      ],

      findings: [
        {
          title:
            `${weakest.product} deserves the closest review`,

          text:
            `${weakest.product} had the lowest ${profitLabel} among the compared menu items. It generated S$${round(
              weakest.revenue
            ).toFixed(
              2
            )} in revenue from ${weakest.units} units during the latest period.`,
        },

        {
          title:
            "This is a measured starting point",

          text:
            `The ranking is based on recorded sales and financial performance. It does not measure strategic importance, customer loyalty, preparation complexity or other operational considerations.`,
        },
      ],

      conclusion:
        `Based purely on the measured sales and financial data, ${weakest.product} is the first product I would investigate for improvement or possible removal. That is a qualified recommendation, not proof that removing it is the best overall business decision.`,

      limitations:
        evidence.limitation ??
        "Unmeasured business factors were not examined.",

      followUps:
        buildSafeFollowUps(
          [
            {
              type:
                "product_trend",

              product:
                weakest.product,
            },

            {
              type:
                "compare_products",

              product:
                weakest.product,
            },

            {
              type:
                "profitability",

              product:
                weakest.product,
            },
          ],

          context,

          steps.map(
            (x) => x.tool
          )
        ),
    };
  }

  /*
 * =====================================
 * BUSINESS-WIDE PERIOD COMPARISON
 * =====================================
 *
 * Used for questions such as:
 *
 * - What changed in August vs July?
 * - How did this month compare with last month?
 * - What changed month over month?
 */
if (
  first.tool ===
    "period_comparison" &&
  evidence.comparable === true
) {
  const previous =
    evidence.previous;

  const latest =
    evidence.latest;

  const money =
    (value) =>
      `S$${round(
        Number(value ?? 0)
      ).toFixed(2)}`;

  const pct =
    (value) => {
      const n =
        Number(value ?? 0);

      return `${
        n > 0 ? "+" : ""
      }${round(n).toFixed(
        2
      )}%`;
    };

  const profitLabel =
    evidence.costsComplete
      ? "Gross profit"
      : "Covered gross profit";

  return {
    headline:
      `${latest.month} recorded lower sales than ${previous.month}, with revenue down ${Math.abs(
        Number(
          evidence.revenueChangePct ??
            0
        )
      ).toFixed(
        2
      )}% and orders down ${Math.abs(
        Number(
          evidence.transactionChangePct ??
            0
        )
      ).toFixed(2)}%.`,

    overview:
      `Brewlytics compared business-wide performance between ${previous.month} and ${latest.month}. Revenue moved from ${money(
        previous.revenue
      )} to ${money(
        latest.revenue
      )}, while orders fell from ${previous.transactions} to ${latest.transactions}. Units sold also declined from ${previous.units} to ${latest.units}, and average order value moved from ${money(
        previous.aov
      )} to ${money(
        latest.aov
      )}. ${
        evidence.costsComplete
          ? "Gross profit was fully supported by the available cost data."
          : `Gross profit is only reported for sales with known product costs. Cost coverage was ${previous.costCoveragePct}% in ${previous.month} and ${latest.costCoveragePct}% in ${latest.month}.`
      }`,

    metrics: [
      {
        label:
          "Revenue",

        value:
          money(
            latest.revenue
          ),

        detail:
          `${money(
            previous.revenue
          )} → ${money(
            latest.revenue
          )} (${pct(
            evidence.revenueChangePct
          )})`,
      },

      {
        label:
          "Orders",

        value:
          String(
            latest.transactions
          ),

        detail:
          `${previous.transactions} → ${latest.transactions} (${pct(
            evidence.transactionChangePct
          )})`,
      },

      {
        label:
          "Units sold",

        value:
          String(
            latest.units
          ),

        detail:
          `${previous.units} → ${latest.units} (${pct(
            evidence.unitsChangePct
          )})`,
      },

      {
        label:
          "Average order value",

        value:
          money(
            latest.aov
          ),

        detail:
          `${money(
            previous.aov
          )} → ${money(
            latest.aov
          )} (${pct(
            evidence.aovChangePct
          )})`,
      },

      {
        label:
          profitLabel,

        value:
          money(
            latest.coveredProfit
          ),

        detail:
          `${money(
            previous.coveredProfit
          )} → ${money(
            latest.coveredProfit
          )} (${pct(
            evidence.coveredProfitChangePct
          )})`,
      },

      {
        label:
          "Cost coverage",

        value:
          `${latest.costCoveragePct}%`,

        detail:
          `${previous.costCoveragePct}% → ${latest.costCoveragePct}%`,
      },
    ],

    findings: [
      {
        title:
          "Sales activity declined",

        text:
          `Revenue decreased from ${money(
            previous.revenue
          )} in ${previous.month} to ${money(
            latest.revenue
          )} in ${latest.month}, a change of ${pct(
            evidence.revenueChangePct
          )}. Orders decreased from ${previous.transactions} to ${latest.transactions}, while units sold decreased from ${previous.units} to ${latest.units}.`,
      },

      {
        title:
          "Average order value also softened",

        text:
          `Average order value moved from ${money(
            previous.aov
          )} to ${money(
            latest.aov
          )}, a change of ${pct(
            evidence.aovChangePct
          )}. This describes the observed transaction value only; the evidence does not establish why it changed.`,
      },

      {
        title:
          evidence.costsComplete
            ? "Gross profit declined"
            : "Covered gross profit declined",

        text:
          `${profitLabel} moved from ${money(
            previous.coveredProfit
          )} to ${money(
            latest.coveredProfit
          )}, a change of ${pct(
            evidence.coveredProfitChangePct
          )}. ${
            evidence.costsComplete
              ? ""
              : `This figure excludes sales without known product costs. Cost coverage was ${previous.costCoveragePct}% in ${previous.month} and ${latest.costCoveragePct}% in ${latest.month}.`
          }`,
      },
    ],

    conclusion:
      `${latest.month} was weaker than ${previous.month} across revenue, orders and units sold. Average order value also decreased slightly. ${
        evidence.costsComplete
          ? `${profitLabel} also fell.`
          : `${profitLabel} also fell, but this profit comparison is limited to sales with known costs.`
      } The executed evidence shows the change in performance but does not establish the cause.`,

    limitations:
      evidence.limitation ??
      "Brewlytics does not infer causes that were not measured.",

    followUps: [],
  };
}

/*
 * DISCOUNT / REFUND ANALYSIS
 */
if (
  first.tool ===
  "discount_refund_analysis"
) {
  const evidence =
    first.evidence ?? {};

  const money = (value) =>
    `S$${Number(
      value ?? 0
    ).toFixed(2)}`;

  const signedMoney = (value) => {
    const n =
      Number(value ?? 0);

    return `${
      n > 0
        ? "+"
        : n < 0
          ? "−"
          : ""
    }S$${Math.abs(n).toFixed(2)}`;
  };

  if (
    evidence.comparable === false
  ) {
    return {
      headline:
        "Discounts and refunds could not be compared across both periods.",

      overview:
        first.summary,

      metrics: [],

      findings: [
        {
          title:
            "Insufficient comparison data",

          text:
            evidence.limitation ??
            "Discount and refund data was not available for both periods.",
        },
      ],

      conclusion:
        "Brewlytics could not calculate a period-to-period change in discounts and refunds.",

      limitations:
        evidence.limitation ??
        "Both periods are required for this comparison.",

      followUps: [],
    };
  }

  return {
    headline:
      `Discounts and refunds both increased from ${evidence.previousLabel} to ${evidence.latestLabel}.`,

    overview:
      `Brewlytics compared recorded discounts and refunds between ${evidence.previousLabel} and ${evidence.latestLabel}. Discounts increased from ${money(
        evidence.previousDiscounts
      )} to ${money(
        evidence.latestDiscounts
      )}, a change of ${signedMoney(
        evidence.discountChange
      )}. Refunds increased from ${money(
        evidence.previousRefunds
      )} to ${money(
        evidence.latestRefunds
      )}, a change of ${signedMoney(
        evidence.refundChange
      )}. These are observed movements in the uploaded sales data; they do not establish why overall sales changed.`,

    metrics: [
      {
        label:
          "Latest discounts",

        value:
          money(
            evidence.latestDiscounts
          ),

        detail:
          `${money(
            evidence.previousDiscounts
          )} → ${money(
            evidence.latestDiscounts
          )} (${signedMoney(
            evidence.discountChange
          )})`,
      },

      {
        label:
          "Latest refunds",

        value:
          money(
            evidence.latestRefunds
          ),

        detail:
          `${money(
            evidence.previousRefunds
          )} → ${money(
            evidence.latestRefunds
          )} (${signedMoney(
            evidence.refundChange
          )})`,
      },
    ],

    findings: [
      {
        title:
          "Discounts increased",

        text:
          `Recorded discounts rose from ${money(
            evidence.previousDiscounts
          )} in ${evidence.previousLabel} to ${money(
            evidence.latestDiscounts
          )} in ${evidence.latestLabel}, an increase of ${signedMoney(
            evidence.discountChange
          )}.`,
      },

      {
        title:
          "Refunds increased",

        text:
          `Recorded refunds rose from ${money(
            evidence.previousRefunds
          )} in ${evidence.previousLabel} to ${money(
            evidence.latestRefunds
          )} in ${evidence.latestLabel}, an increase of ${signedMoney(
            evidence.refundChange
          )}.`,
      },
    ],

    conclusion:
      `Discounts increased by ${signedMoney(
        evidence.discountChange
      )} and refunds increased by ${signedMoney(
        evidence.refundChange
      )} between ${evidence.previousLabel} and ${evidence.latestLabel}. The executed evidence shows that these movements occurred alongside the period's sales changes, but it does not establish that discounts or refunds caused those changes.`,

    limitations:
      evidence.limitation ??
      "The analysis measures discounts and refunds but does not establish causation.",

    followUps: [],
  };
}

  /*
   * 
   * GENERAL FALLBACK
   * 
   */

  return {
    headline:
      first.summary ||
      "Brewlytics completed the investigation.",

    overview:
      first.summary ||
      "The deterministic analysis completed successfully.",

    metrics: [],

    findings: [
      {
        title:
          first.title,

        text:
          first.summary,
      },
    ],

    conclusion:
      "The conclusion is limited to the executed evidence shown above.",

    limitations:
      "Brewlytics does not infer causes that were not measured.",

    followUps: [],
  };
}


async function writeFinalReport(
  question,
  context,
  steps
) {
  const systemPrompt = `
You are Brewlytics, a conversational AI business analytics investigator for small cafés.

A deterministic analytics engine has already performed the calculations.

Your job is to explain ONLY evidence from analyses that were actually executed.

EVIDENCE RULES:

1. Never recalculate, alter, or contradict supplied figures.

2. Never invent causes.

3. Never infer customer preferences, demand, weather, competitors, promotions, events, management rationale, or other external causes unless directly measured.

4. Never say something "caused", "led to", "resulted in", or was "due to" something unless the evidence establishes causation.

5. You may say patterns "coincided with", "were observed alongside", or "may be relevant".

6. Treat avgPrice as OBSERVED AVERAGE SELLING PRICE.

Do NOT call it:
- a deliberate price cut
- a deliberate price increase
- a pricing decision
- a list-price change

unless such information was actually measured.

7. Do not say a price movement stimulated demand, reduced demand, or caused a volume response.

8. Never infer stable costs or cost structures unless directly established.

9. MISSING COST DATA:

If costsComplete is false:

- Missing cost means UNKNOWN. It does NOT mean zero cost.
- Never describe a product with missing cost as having zero profit, zero margin, or costs equal to revenue.
- Never calculate or report an exact whole-business gross profit or gross margin from incomplete cost data.
- A profit figure calculated only from sales with known costs must be called "covered gross profit", not "gross profit".
- Clearly state that covered gross profit excludes sales whose product costs are unknown.
- Cost coverage means the percentage of sales revenue for which product cost data is known. It does NOT mean the percentage of revenue used to cover costs.

10. UNSUPPORTED FINANCIAL METRICS:

Never substitute one financial metric for another.

Gross profit is NOT net operating profit.

If the owner asks for net operating profit, operating profit, profit after rent, profit after salaries, profit after utilities, or another metric requiring expenses that were not included in the executed evidence:

- State that the requested metric cannot be calculated from the executed data.
- State which required expense categories were not examined.
- Do NOT substitute gross profit, covered gross profit, product profit, revenue, or another available metric as the answer.
- Do NOT invent, estimate, or assume the missing expenses.

11. UNMEASURED INFORMATION:

If information required to answer the question was not analysed or measured, explicitly say that the requested conclusion cannot be determined from the executed evidence.

Do not invent a value merely because a related metric exists.

12. Clearly distinguish observations from conclusions.

13. Stop where the evidence stops.

13. You MAY make a qualified recommendation when executed evidence supports a decision.

14. For decision questions, directly answer the decision.

15. Explain why a recommended option stands out relative to alternatives using executed evidence.

16. State important unmeasured decision factors, but do not let them prevent a useful qualified recommendation when measured evidence is sufficient.

GOOD RECOMMENDATION:

"Based purely on current sales and financial performance, X is the strongest candidate for removal."

BAD RECOMMENDATION:

"X should definitely be removed."

STYLE:

- Sound like a strong business analyst talking directly to a café owner.
- Be detailed enough to genuinely answer the question.
- Do not sound like an academic report.
- Connect findings rather than listing disconnected statistics.
- Prefer 2-4 substantive findings.
- Use S$ for monetary values.
- Avoid generic business advice.
- If the owner asks what they should do, answer directly after investigating.
- Do not use Markdown.
- Return valid JSON only.

RETURN EXACTLY THIS STRUCTURE:

{
  "headline": "A specific one-sentence finding",

  "overview": "A conversational overview of roughly 100-160 words.",

  "metrics": [
    {
      "label": "Metric name",
      "value": "Value",
      "detail": "Useful comparison"
    }
  ],

  "findings": [
    {
      "title": "Meaningful finding title",
      "text": "Detailed explanation using exact executed evidence."
    }
  ],

  "conclusion": "A synthesis that directly answers the owner's question while separating evidence from unknowns.",

  "limitations": "A concise evidence boundary.",

  "followUps": [
    {
      "type": "weekday_breakdown",
      "product": "Iced Latte"
    }
  ]
}

OUTPUT REQUIREMENTS:

- metrics: 3 to 4 useful metrics where supported.
- findings: 2 to 4 substantive findings.
- Do not create empty findings.
- Do not repeat identical information in every section.
- followUps: maximum 3.

FOLLOW-UP SAFETY:

You DO NOT write follow-up questions yourself.

You may ONLY request one of these exact analysis types:

- product_performance
- product_trend
- price_vs_volume
- compare_products
- weekday_breakdown
- profitability
- channel_breakdown
- outlet_breakdown

For:
- product_trend
- price_vs_volume
- compare_products
- weekday_breakdown
- profitability

you MUST include an exact product name from AVAILABLE CONTEXT.

Do not request a tool already executed.

Only request an analysis that would genuinely continue the current investigation.

NEVER suggest questions about:

- management rationale
- reasons for price changes
- customer opinions
- customer preferences
- weather
- competitors
- promotions
- marketing
- preparation complexity
- ingredient usage
- anything else the deterministic engine cannot analyse

The application will validate every requested follow-up and create the visible question itself.

Do not include an investigation trail.
`.trim();

  const executedEvidence =
    steps.map((x) => ({
      tool: x.tool,
      title: x.title,
      summary: x.summary,
      evidence: x.evidence,
    }));

  const executedTools =
    steps.map((x) => x.tool);

  const userPrompt = `
CAFÉ OWNER QUESTION:
${question}

BUSINESS CONTEXT:
${JSON.stringify(context)}

EXECUTED TOOLS:
${JSON.stringify(executedTools)}

EXECUTED INVESTIGATION EVIDENCE:
${JSON.stringify(
  executedEvidence,
  null,
  2
)}

Create a detailed conversational Brewlytics answer.

Important:

- Use only executed evidence.
- Never claim causation from correlation.
- Treat average selling price as observed, not necessarily a deliberate pricing change.
- Never infer why a price changed.
- Never infer stable costs.
- Recommendations must be qualified and evidence-backed.
- Follow-ups must only request an allowed deterministic analysis type.
- Do not write follow-up questions yourself.

Return valid JSON only.
`.trim();

let text = "";

try {
  text =
    await askModel(
      systemPrompt,
      userPrompt,
      1200,
      0
    );
} catch (error) {
  console.error(
    "Final synthesis model error:",
    error
  );

  return deterministicAnswer(
    question,
    context,
    steps
  );
}

/*
 * Empty Bedrock response?
 *
 * Do NOT fail the whole request.
 */
if (!text) {
  return deterministicAnswer(
    question,
    context,
    steps
  );
}

try {
  const parsed =
    parseJSON(text);

    return {
      headline:
        typeof parsed.headline ===
        "string"
          ? parsed.headline
          : "Brewlytics completed the investigation.",

      overview:
        typeof parsed.overview ===
        "string"
          ? parsed.overview
          : steps
              .map(
                (x) =>
                  x.summary
              )
              .join(" "),

      metrics:
        Array.isArray(
          parsed.metrics
        )
          ? parsed.metrics
              .filter(
                (x) =>
                  x &&
                  typeof x.label ===
                    "string" &&
                  typeof x.value ===
                    "string"
              )
              .slice(0, 4)
          : [],

      findings:
        Array.isArray(
          parsed.findings
        )
          ? parsed.findings
              .filter(
                (x) =>
                  x &&
                  typeof x.title ===
                    "string" &&
                  typeof x.text ===
                    "string" &&
                  x.title.trim() &&
                  x.text.trim()
              )
              .slice(0, 4)
          : [],

      conclusion:
        typeof parsed.conclusion ===
        "string"
          ? parsed.conclusion
          : steps
              .map(
                (x) =>
                  x.summary
              )
              .join(" "),

      limitations:
        typeof parsed.limitations ===
        "string"
          ? parsed.limitations
          : "The investigation identifies observed patterns, not unmeasured causes.",

      followUps:
        buildSafeFollowUps(
          parsed.followUps,
          context,
          executedTools
        ),
    };
  } catch {
    console.error(
      "Final JSON parsing failed:",
      text
    );
  
    /*
     * Bedrock responded, but the
     * response was malformed.
     *
     * We already have trustworthy
     * deterministic evidence, so
     * use that instead.
     */
    return deterministicAnswer(
      question,
      context,
      steps
    );
  }
}
      

/* =========================================================
   HANDLER
   ========================================================= */

export const handler =
  async (event) => {
    try {
      if (
        event
          ?.requestContext
          ?.http
          ?.method ===
          "OPTIONS" ||
        event?.httpMethod ===
          "OPTIONS"
      ) {
        return {
          statusCode: 204,
          headers,
          body: "",
        };
      }

      const body =
        parseBody(event);

      const question =
        body.question?.trim();

      const businessData =
        body.businessData ?? {};

      if (!question) {
        return makeResponse(
          400,
          {
            success: false,

            error:
              "MissingQuestion",

            message:
              "Please provide a question.",
          }
        );
      }

      if (
        !businessData
          ?.investigation
          ?.monthlyProducts
      ) {
        return makeResponse(
          400,
          {
            success: false,

            error:
              "MissingInvestigationData",

            message:
              "Brewlytics investigation aggregates were not provided.",
          }
        );
      }

      const dataSize =
        JSON.stringify(
          businessData
        ).length;

      if (
        dataSize > 100000
      ) {
        return makeResponse(
          400,
          {
            success: false,

            error:
              "BusinessDataTooLarge",

            message:
              "Investigation data is too large. Send aggregate analytics rather than raw transaction rows.",
          }
        );
      }

      const context =
  buildContext(
    businessData
  );

/*
 * First classify the owner's
 * question.
 *
 * This gives us a deterministic
 * safety layer before the LLM
 * planner is allowed to act.
 */
const classification =
  classifyQuestion(
    question,
    context
  );

/*
 * If the question depends on
 * something Brewlytics does not
 * measure, stop here.
 *
 * Do NOT send it through the
 * normal agent loop and do NOT
 * ask Bedrock to invent a cause.
 */
if (
  classification.kind ===
  "unsupported"
) {
  return makeResponse(
    200,
    {
      success: true,

      question,

      answer:
        unsupportedAnswer(
          question,
          context,
          classification
        ),

      /*
       * No investigation tool was
       * executed because the
       * requested causal variable
       * was not measured.
       */
      trail: [],

      evidence: [],

      model:
        MODEL_ID,

      investigationSteps: 0,
    }
  );
}

const steps = [];

const usedTools =
  new Set();

  /*
 * Deterministic routing for
 * discount/refund questions.
 *
 * These values are directly measured,
 * so do not rely on the LLM planner
 * to choose the correct tool.
 */
if (
  classification.kind ===
  "discount_refund"
) {
  const result =
    discountRefundAnalysis(
      businessData
    );

  usedTools.add(
    "discount_refund_analysis"
  );

  steps.push({
    step: 1,

    tool:
      "discount_refund_analysis",

    product: null,

    title:
      result.title,

    summary:
      result.summary,

    evidence:
      result.evidence,
  });
}

/*
 * IMPORTANT ROUTING FIX
 *
 * If the owner explicitly names
 * one product and asks to compare
 * it with other products, we
 * already know the correct
 * deterministic analysis.
 *
 * Example:
 *
 * "How did Iced Latte perform
 * compared with my other
 * products?"
 *
 * This should execute
 * compare_products.
 *
 * We do NOT use the menu-wide
 * product_performance tool first.
 */
if (
  classification.kind ===
    "named_product_comparison" &&
  classification.product
) {
  const result =
    compareProducts(
      businessData,
      classification.product
    );

  usedTools.add(
    "compare_products"
  );

  steps.push({
    step: 1,

    tool:
      "compare_products",

    product:
      classification.product,

    title:
      result.title,

    summary:
      result.summary,

    evidence:
      result.evidence,
  });
}

/*
 * Continue agentic investigation
 * after the deterministic first
 * step.
 *
 * Starting at steps.length means
 * the total investigation still
 * respects MAX_STEPS.
 */
for (
  let i = steps.length;
  i < MAX_STEPS;
  i++
) {
        let decision;

        try {
          decision =
            await chooseNextAction(
              question,
              context,
              steps
            );
        } catch (error) {
          console.error(
            "Planner error:",
            error
          );

          /*
           * Deterministic fallback.
           *
           * If the question explicitly
           * mentions a product, inspect
           * that product.
           *
           * Otherwise use menu-wide
           * product performance so
           * recommendation/comparison
           * questions still have useful
           * evidence.
           */

          if (
            steps.length === 0
          ) {

            const guessedProduct =
  context.products.find(
    (p) =>
      norm(
        question
      ).includes(
        norm(p)
      )
  );


            
            const q =
  norm(question);

const looksLikePeriodComparison =
  (
    q.includes(
      "compared with"
    ) ||
    q.includes(
      "compare"
    ) ||
    q.includes(
      "versus"
    ) ||
    q.includes(
      " vs "
    ) ||
    q.includes(
      "what changed"
    ) ||
    q.includes(
      "month over month"
    ) ||
    q.includes(
      "this month"
    ) ||
    q.includes(
      "last month"
    ) ||
    q.includes(
      "previous month"
    ) ||
    (
      context.latestLabel &&
      context.previousLabel &&
      q.includes(
        norm(
          context.latestLabel
        )
      ) &&
      q.includes(
        norm(
          context.previousLabel
        )
      )
    )
  );

decision =
  looksLikePeriodComparison
    ? {
        action:
          "tool",

        tool:
          "period_comparison",
      }
    : guessedProduct
      ? {
          action:
            "tool",

          tool:
            "product_trend",

          product:
            guessedProduct,
        }
      : {
          action:
            "tool",

          tool:
            "product_performance",
        };
          } else {
            decision = {
              action:
                "final",
            };
          }
        }

        if (
          decision.action ===
          "final"
        ) {
          break;
        }
        
        /*
         * If Bedrock returned no text or
         * invalid JSON, choose a safe
         * deterministic investigation
         * instead of crashing/giving up.
         */
        if (
          decision.action ===
          "fallback"
        ) {
          /*
           * If we already executed
           * evidence, we have enough to
           * proceed to the answer.
           */
          if (
            steps.length > 0
          ) {
            break;
          }
        
          /*
           * Named product:
           * investigate its trend.
           *
           * No named product:
           * compare menu performance.
           */
          decision =
            classification.product
              ? {
                  action: "tool",
        
                  tool:
                    "product_trend",
        
                  product:
                    classification.product,
                }
              : {
                  action: "tool",
        
                  tool:
                    "product_performance",
                };
        }
        
        if (
          decision.action !==
            "tool" ||
          !AVAILABLE_TOOLS.includes(
            decision.tool
          )
        ) {
          break;
        }

        if (
          usedTools.has(
            decision.tool
          )
        ) {
          break;
        }

        const needsProduct = [
          "product_trend",
          "price_vs_volume",
          "compare_products",
          "weekday_breakdown",
          "profitability",
        ].includes(
          decision.tool
        );

        let product =
          decision.product;

        if (
          needsProduct &&
          !product
        ) {
          product =
            context.products.find(
              (p) =>
                norm(
                  question
                ).includes(
                  norm(p)
                )
            );
        }

        if (
          needsProduct &&
          !product
        ) {
          break;
        }

        const result =
          runTool(
            decision.tool,
            businessData,
            product
          );

        usedTools.add(
          decision.tool
        );

        steps.push({
          step:
            steps.length +
            1,

          tool:
            decision.tool,

          product:
            product ?? null,

          title:
            result.title,

          summary:
            result.summary,

          evidence:
            result.evidence,
        });
      }

      /*
       * IMPORTANT GUARDRAIL:
       *
       * Never allow the final model
       * to answer with zero executed
       * evidence.
       */

      if (
        steps.length === 0
      ) {
        const product =
          context.products.find(
            (p) =>
              norm(
                question
              ).includes(
                norm(p)
              )
          );

        if (product) {
          const result =
            productTrend(
              businessData,
              product
            );

          steps.push({
            step: 1,

            tool:
              "product_trend",

            product,

            title:
              result.title,

            summary:
              result.summary,

            evidence:
              result.evidence,
          });
        } else {
          /*
           * No named product.
           *
           * Use menu-wide evidence
           * instead of giving up.
           */

          const result =
            productPerformance(
              businessData
            );

          steps.push({
            step: 1,

            tool:
              "product_performance",

            product: null,

            title:
              result.title,

            summary:
              result.summary,

            evidence:
              result.evidence,
          });
        }
      }

     /*
 * Deterministic financial evidence guard.
 *
 * Prevents the language model from inventing or substituting
 * unsupported financial metrics.
 */
const questionLower =
  String(question).toLowerCase();

const asksNetOperatingProfit =
  /\bnet operating profit\b/.test(questionLower) ||
  /\boperating profit\b/.test(questionLower) ||
  (
    /\bprofit\b/.test(questionLower) &&
    /\b(rent|salar(?:y|ies)|utilities|operating expenses?|overheads?)\b/.test(
      questionLower
    )
  );

const asksExactGrossProfit =
  /\bexact\b/.test(questionLower) &&
  /\bgross profit\b/.test(questionLower);

let answer;

if (asksNetOperatingProfit) {
  /*
   * The uploaded Brewlytics sales/product-cost evidence does
   * not establish net operating profit unless the required
   * operating expenses were actually analysed.
   *
   * Do not substitute gross profit for operating profit.
   */
  answer = {
    headline:
      "Net operating profit cannot be calculated from the executed data.",

    overview:
      "The available Brewlytics analysis does not include the rent, salaries, utilities and other operating expenses required to calculate net operating profit. Gross profit and product-level profitability are different financial measures, so Brewlytics will not substitute them for net operating profit.",

    metrics: [],

    findings: [
      {
        title:
          "Required operating expenses were not examined",

        text:
          "The executed evidence contains sales and product-cost information, but it does not contain the rent, salaries and utilities needed for the requested calculation.",
      },
      {
        title:
          "Gross profit cannot substitute for operating profit",

        text:
          "Any available gross-profit or covered-gross-profit figure is calculated before the missing operating expenses and therefore cannot answer this question.",
      },
    ],

    conclusion:
      "Net operating profit for the requested period cannot be determined from the executed evidence.",

    limitations:
      "Rent, salaries, utilities and other required operating expenses were not examined.",

    followUps: [],
  };
} else if (
  asksExactGrossProfit &&
  businessData?.metrics?.costsComplete === false
) {
  /*
   * Costs are incomplete, so whole-café gross profit is
   * unsupported. Surface only covered gross profit.
   */
  const comparison =
    periodComparison(businessData);

  const evidence =
    comparison?.evidence ?? {};

  const latest =
    evidence.latest ?? {};

  const coveredProfit =
    Number(latest.coveredProfit ?? 0);

  const coverage =
    Number(latest.costCoveragePct ?? 0);

  const month =
    latest.month ??
    businessData.latestLabel ??
    "the requested period";

  answer = {
    headline:
      `Exact whole-café gross profit for ${month} cannot be determined because product-cost data is incomplete.`,

    overview:
      `Brewlytics cannot report an exact whole-café gross profit because some sales do not have known product costs. For the portion of sales with known costs, covered gross profit was S$${coveredProfit.toFixed(
        2
      )}. Cost data was available for ${coverage.toFixed(
        2
      )}% of sales revenue.`,

    metrics: [
      {
        label:
          "Covered gross profit",

        value:
          `S$${coveredProfit.toFixed(2)}`,

        detail:
          "Includes only sales with known product costs",
      },
      {
        label:
          "Cost coverage",

        value:
          `${coverage.toFixed(2)}%`,

        detail:
          "Percentage of sales revenue with known product-cost data",
      },
    ],

    findings: [
      {
        title:
          "Whole-café gross profit is not fully supported",

        text:
          "Some product costs are missing, so Brewlytics cannot calculate an exact gross profit across all café sales.",
      },
      {
        title:
          "Covered gross profit is available",

        text:
          `Sales with known product costs generated S$${coveredProfit.toFixed(
            2
          )} in covered gross profit during ${month}.`,
      },
    ],

    conclusion:
      `Exact whole-café gross profit for ${month} cannot be determined from the current data. The supported figure is S$${coveredProfit.toFixed(
        2
      )} in covered gross profit, with ${coverage.toFixed(
        2
      )}% cost coverage.`,

    limitations:
      "Missing product costs are treated as unknown, not zero. Covered gross profit excludes sales whose product costs are unknown.",

    followUps: [],
  };
} else {
  answer =
    await writeFinalReport(
      question,
      context,
      steps
    );
}

      return makeResponse(
        200,
        {
          success: true,

          question,

          answer,

          trail:
            steps.map(
              (x) => ({
                step:
                  x.step,

                tool:
                  x.tool,

                title:
                  x.title,

                summary:
                  x.summary,
              })
            ),

          evidence:
            steps.map(
              (x) => ({
                step:
                  x.step,

                tool:
                  x.tool,

                evidence:
                  x.evidence,
              })
            ),

          model:
            MODEL_ID,

          investigationSteps:
            steps.length,
        }
      );
    } catch (error) {
      console.error(
        "Brewlytics Lambda error:",
        error
      );

      /*
       * IMPORTANT:
       *
       * Even Lambda errors return
       * JSON so the frontend does
       * not receive plain text
       * "Internal Server Error".
       */

      return makeResponse(
        500,
        {
          success: false,

          error:
            error?.name ??
            "UnknownError",

          message:
            error?.message ??
            "An unknown error occurred.",
        }
      );
    }
  };
