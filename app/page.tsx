"use client";
import { useRef, useState } from "react";
import {
  analyzeFiles,
  scanFiles,
  AnalysisResult,
  CleaningScan,
  CleaningChoices,
  fmtMoney,
  fmtPct,
} from "./analyze";
import "./chart.css";

type View =
  "welcome" | "loading" | "cleaning" | "dashboard" | "analysis" | "chatbot";
type Mode = "signal" | "root" | "forecast" | "scenario" | "custom";
const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-SG", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

export default function Home() {
  const [view, setView] = useState<View>("welcome"),
    [mode, setMode] = useState<Mode>("root"),
    [files, setFiles] = useState<File[]>([]),
    [data, setData] = useState<AnalysisResult | null>(null),
    [scan, setScan] = useState<CleaningScan | null>(null),
    [cleaning, setCleaning] = useState<CleaningChoices>({
  values: {},
  duplicateAction: "remove",
  productMappings: {},
}),
    [error, setError] = useState(""),
    [question, setQuestion] = useState(""),
    [scenario, setScenario] = useState(3);
  const input = useRef<HTMLInputElement>(null);
  const add = (list: FileList | null) => {
    if (!list) return;

    const incoming = Array.from(list);

    setFiles((current) => {
      // Keep files already selected and add the newly selected files.
      // Avoid adding the exact same file twice.
      const combined = [...current];

      for (const file of incoming) {
        const alreadyAdded = combined.some(
          (existing) =>
            existing.name === file.name &&
            existing.size === file.size &&
            existing.lastModified === file.lastModified,
        );

        if (!alreadyAdded) {
          combined.push(file);
        }
      }

      if (combined.length > 2) {
        setError(
          "Brewlytics accepts a maximum of two files: POS sales and item costs.",
        );
      } else {
        setError("");
      }

      return combined.slice(0, 2);
    });

    // Allows the same file to be selected again after removal.
    if (input.current) {
      input.current.value = "";
    }
  };
  const load = async () => {
    setError("");
    setView("loading");
    try {
      const review = await scanFiles(files);
      setScan(review);
      setTimeout(() => setView("cleaning"), 450);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The files could not be analysed.",
      );
      setView("welcome");
    }
  };
  const finishCleaning = async () => {
    setError("");
    setView("loading");
    try {
      const result = await analyzeFiles(files, cleaning);
      setData(result);
      setTimeout(() => setView("dashboard"), 450);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The files could not be analysed.",
      );
      setView("cleaning");
    }
  };
  const open = (m: Mode) => {
    setMode(m);
    setView("analysis");
  };
  if (view === "welcome" || view === "loading")
    return (
      <main className="onboard">
        <header className="brand">
          <div className="mark">B</div>
          <span>Brewlytics</span>
          <small>Performance intelligence for cafés</small>
        </header>
        <section className="hero">
          <p className="eyebrow">TWO FILES · ONE DECISION VIEW</p>
          <h1>
            Connect sales and costs.
            <br />
            <em>Clean them before analysis.</em>
          </h1>
          <p>
            Import up to two files: your POS sales export and an Excel or CSV
            item-cost sheet. Brewlytics lets you review and edit the cleaned
            rows before calculation.
          </p>
        </section>
        {view === "loading" ? (
          <Processing />
        ) : (
          <section className="upload-card">
            <div className="stepper">
              <span className="done">1</span>
              <b>Import 2 files</b>
              <i />
              <span>2</span>
              <b>Review cleaned data</b>
              <i />
              <span>3</span>
              <b>Analyse</b>
            </div>
            <div
              className="drop"
              onClick={() => input.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                add(e.dataTransfer.files);
              }}
            >
              <input
                ref={input}
                type="file"
                multiple
                accept=".csv,.xlsx,.xls"
                onChange={(e) => add(e.target.files)}
              />
              <span>⇧</span>
              <h2>Add POS sales + item costs</h2>
              <p>Maximum 2 CSV/Excel files · 10 MB each</p>
              <button>Choose files</button>
            </div>
            {files.length > 0 && (
              <div className="file-list">
                {files.map((f, i) => (
                  <div key={f.name}>
                    <span>{i === 0 ? "POS" : "COST"}</span>
                    <b>{f.name}</b>
                    <small>{(f.size / 1024).toFixed(0)} KB</small>
                    <button
                      type="button"
                      className="remove-file"
                      aria-label={`Remove ${f.name}`}
                      title={`Remove ${f.name}`}
                      onClick={() => {
                        setFiles(files.filter((_, index) => index !== i));
                        setError("");

                        if (input.current) {
                          input.current.value = "";
                        }
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            {error && (
              <div className="upload-error">
                <b>Check your files</b>
                <p>{error}</p>
              </div>
            )}
            <div className="upload-actions">
              <span className="schema-hint">
                POS needs ≥2 months of dated sales
              </span>
              <button
                className="primary"
                disabled={!files.length}
                onClick={load}
              >
                Clean and preview →
              </button>
            </div>
            <p className="privacy">
              ● Processing happens in your browser. Files are not stored by
              Brewlytics.
            </p>
          </section>
        )}
        <footer>
          Garbage, empty and unrelated files are rejected before a dashboard is
          created.
        </footer>
      </main>
    );
  if (view === "cleaning" && scan)
    return (
      <CleaningReview
        scan={scan}
        choices={cleaning}
        setChoices={setCleaning}
        error={error}
        cancel={() => setView("welcome")}
        submit={finishCleaning}
      />
    );
  if (!data) return null;
  const titles: Record<Mode, string> = {
    signal: "Signal evidence",
    root: "Why did performance change?",
    forecast: `Forecast after ${monthLabel(data.latestLabel)}`,
    scenario: "Price scenario lab",
    custom: question || "Custom analysis",
  };
  return (
    <main className="shell">
      <section className="workspace">
        <div className="menu-bar">
          <b>Brewlytics</b>
          <button
            className={view === "dashboard" ? "active" : ""}
            onClick={() => setView("dashboard")}
          >
            Overview
          </button>
          <button
            className={view === "chatbot" ? "active" : ""}
            onClick={() => setView("chatbot")}
          >
            ChatBot
          </button>
          <button onClick={() => open("forecast")}>Forecast</button>
          <span />
          <button onClick={() => setView("welcome")}>＋ Import data</button>
        </div>
        <header className="topbar">
          <div>
            <p className="eyebrow">
              Brewlytics /{" "}
              {view === "dashboard"
                ? "Performance overview"
                : view === "chatbot"
                  ? "Prescriptive analysis"
                  : "Analysis workspace"}
            </p>
            <h1>
              {view === "dashboard"
                ? `Results for ${monthLabel(data.latestLabel)}`
                : view === "chatbot"
                  ? "Ask Brewlytics"
                  : titles[mode]}
            </h1>
          </div>
          <div className="top-actions">
            <button className="quiet">
              {data.rowCount.toLocaleString()} rows
            </button>
            <button className="primary" onClick={() => setView("welcome")}>
              ＋ New analysis
            </button>
          </div>
        </header>
        {view === "dashboard" ? (
          <Dashboard
            data={data}
            open={open}
            question={question}
            setQuestion={setQuestion}
          />
        ) : view === "chatbot" ? (
          <Chatbot data={data} />
        ) : (
          <Analysis
            data={data}
            mode={mode}
            question={question}
            scenario={scenario}
            setScenario={setScenario}
            back={() => setView("dashboard")}
          />
        )}
      </section>
    </main>
  );
}
function CleaningReview({
  scan,
  choices,
  setChoices,
  error,
  cancel,
  submit,
}: {
  scan: CleaningScan;
  choices: CleaningChoices;
  setChoices: (c: CleaningChoices) => void;
  error: string;
  cancel: () => void;
  submit: () => void;
}) {
  const [editing, setEditing] = useState(false);

  const originalScroll = useRef<HTMLDivElement>(null);
  const cleanedScroll = useRef<HTMLDivElement>(null);
  const syncingScroll = useRef(false);

  const syncScroll = (
    source: HTMLDivElement,
    target: HTMLDivElement | null,
  ) => {
    if (!target || syncingScroll.current) return;

    syncingScroll.current = true;
    target.scrollTop = source.scrollTop;

    requestAnimationFrame(() => {
      syncingScroll.current = false;
    });
  };

  const cols = [
    "date",
    "outlet",
    "product",
    "quantity",
    "unit_price",
    "unit_cost",
    "channel",
  ];

  /*
   * Every duplicate after the first is considered the
   * duplicate copy that Brewlytics can remove.
   */
  const duplicateRowIds = new Set(
    scan.duplicates.flatMap((group) => group.rowIds.slice(1)),
  );

  const allDuplicateRowIds = new Set(
    scan.duplicates.flatMap((group) => group.rowIds),
  );

  /*
   * IMPORTANT:
   *
   * Original always displays scan.rows.
   *
   * Cleaned removes duplicate copies only when
   * duplicateAction === "remove".
   */
  const originalRows = scan.rows;

  const cleanedRows =
    choices.duplicateAction === "remove"
      ? scan.rows.filter((row) => !duplicateRowIds.has(row.rowId))
      : scan.rows;

  const cleanedRowCount =
    choices.duplicateAction === "remove"
      ? scan.totalRows -
        scan.duplicates.reduce(
          (total, group) => total + Math.max(0, group.rowIds.length - 1),
          0,
        )
      : scan.totalRows;

  const getCleanedValue = (row: (typeof scan.rows)[number], col: string) => {
    const id = `${row.rowId}::${col}`;

    /*
     * Owner edits have highest priority.
     *
     * Otherwise use Brewlytics' automatically
     * cleaned value.
     */
    return (
      choices.values[id] ?? row.cleanedValues[col] ?? row.values[col] ?? ""
    );
  };

  const isAutoChanged = (row: (typeof scan.rows)[number], col: string) => {
    const id = `${row.rowId}::${col}`;

    /*
     * Once the owner manually changes this cell,
     * it is no longer labelled as an automatic fix.
     */
    if (choices.values[id] !== undefined) {
      return false;
    }

    return row.autoChangedFields.includes(col);
  };

  const isMissing = (rowId: string, col: string) =>
    scan.missing.some((issue) => issue.rowId === rowId && issue.field === col);

  return (
    <main className="clean-page">
      <header className="brand">
        <div className="mark">B</div>
        <span>Brewlytics</span>
        <small>Cleaned dataset review</small>
      </header>

      <section className="clean-wrap">
        {/* HEADER */}

        <div className="clean-head">
          <div>
            <p className="eyebrow">STEP 2 OF 3 · REVIEW BEFORE ANALYSIS</p>

            <h1>Review your cleaned dataset</h1>

            <p>
              Brewlytics has prepared a cleaned version of your sales data.
              Compare it with your original upload and make any corrections
              before analysis.
            </p>
          </div>

          <span className="issue-count">
            {cleanedRowCount.toLocaleString()} cleaned rows
          </span>
        </div>

        {/* AUTOMATIC CLEANING DISCLAIMER */}

        <div className="cleaning-disclaimer">
          <span className="disclaimer-icon">✨</span>

          <div>
            <b>Brewlytics automatically applies safe cleaning fixes.</b>

            <p>
              ✨ marks an automatic change. Your original data is never
              modified, and you can edit the cleaned version before analysis.
              Missing values are never guessed.
            </p>
          </div>
        </div>

        {/* SUMMARY */}

        <div className="clean-summary">
          <span>
            <b>{scan.autoFixCount}</b>
            automatic fix(es) ✨
          </span>

          <span>
            <b>{scan.missing.length}</b>
            missing value(s) ⚠️
          </span>

          <span>
            <b>{scan.duplicates.length}</b>
            duplicate group(s)
          </span>

          <span>
            <b>{choices.duplicateAction === "remove" ? "Remove" : "Keep"}</b>
            duplicate choice
          </span>
        </div>

        {/* DUPLICATES */}

        {scan.duplicates.length > 0 && (
          <section className="clean-section compact">
            <div>
              <h2>🗑️ Possible duplicates detected</h2>

              <p>
                Brewlytics removes exact duplicate copies from the cleaned
                dataset by default. Your original dataset always remains
                unchanged.
              </p>
            </div>

            <div className="duplicate-actions">
              <label>
                <input
                  type="radio"
                  checked={choices.duplicateAction === "remove"}
                  onChange={() =>
                    setChoices({
                      ...choices,
                      duplicateAction: "remove",
                    })
                  }
                />
                Remove duplicate copies
              </label>

              <label>
                <input
                  type="radio"
                  checked={choices.duplicateAction === "keep"}
                  onChange={() =>
                    setChoices({
                      ...choices,
                      duplicateAction: "keep",
                    })
                  }
                />
                Keep all rows
              </label>
            </div>
          </section>
                )}

        {/* PRODUCT COST MATCHING */}

        {scan.productMatchSuggestions.length > 0 && (
          <section className="match-review-card">
            <div className="match-review-head">
              <div>
                <p className="eyebrow">PRODUCT COST MATCHING</p>

                <h2>Review possible product matches</h2>

                <p>
                  Brewlytics found product names that look similar across your
                  sales and cost files. Confirm them before costs are linked.
                </p>
              </div>
            </div>

            <div className="match-list">
              {scan.productMatchSuggestions.map((match) => {
                const current =
                  choices.productMappings[match.salesProduct];

                const approved =
                  current === match.costProduct;

                const rejected =
                  current === "__KEEP_SEPARATE__";

                return (
                  <div
                    className="match-item"
                    key={`${match.salesProduct}::${match.costProduct}`}
                  >
                    <div className="match-names">
                      <div>
                        <span>Sales file</span>
                        <strong>{match.salesProduct}</strong>
                      </div>

                      <div className="match-arrow">→</div>

                      <div>
                        <span>Cost file</span>
                        <strong>{match.costProduct}</strong>
                      </div>
                    </div>

                    <p className="match-score">
                      Suggested match · {match.score}% similarity
                    </p>

                    <div className="match-actions">
                      <button
                        type="button"
                        className={approved ? "active" : ""}
                        onClick={() =>
                          setChoices({
                            ...choices,
                            productMappings: {
                              ...choices.productMappings,
                              [match.salesProduct]: match.costProduct,
                            },
                          })
                        }
                      >
                        Yes, match them
                      </button>

                      <button
                        type="button"
                        className={rejected ? "active" : ""}
                        onClick={() =>
                          setChoices({
                            ...choices,
                            productMappings: {
                              ...choices.productMappings,
                              [match.salesProduct]:
                                "__KEEP_SEPARATE__",
                            },
                          })
                        }
                      >
                        No, keep separate
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* COMPARISON */}

        <section className="comparison-section">
          <div className="comparison-heading">
            <div>
              <p className="eyebrow">DATA COMPARISON</p>

              <h2>Original vs cleaned</h2>

              <p>
                Original stays untouched. Cleaned shows the version Brewlytics
                will use for analysis.
              </p>
            </div>

            <div className="cleaning-legend">
              <span>✨ Auto-cleaned</span>
              <span>🗑️ Duplicate</span>
              <span>⚠️ Missing</span>
            </div>
          </div>

          <div className="dataset-comparison">
            {}

            <section className="dataset-panel original-panel">
              <div className="dataset-panel-head">
                <div>
                  <div className="dataset-label">ORIGINAL DATA</div>

                  <h3>Your uploaded dataset</h3>

                  <p>
                    {scan.totalRows.toLocaleString()} original rows · preserved
                    for comparison.
                  </p>
                </div>

                <span className="readonly-badge">🔒 Read only</span>
              </div>

              <div
                ref={originalScroll}
                className="table-scroll comparison-table"
                onScroll={(e) =>
                  syncScroll(e.currentTarget, cleanedScroll.current)
                }
              >
                <table>
                  <thead>
                    <tr>
                      <th>Row</th>

                      {cols.map((c) => (
                        <th key={c}>{c.replace("_", " ")}</th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {originalRows.map((row) => {
                      const duplicate = allDuplicateRowIds.has(row.rowId);

                      const removedDuplicate = duplicateRowIds.has(row.rowId);

                      return (
                        <tr
                          key={row.rowId}
                          className={duplicate ? "duplicate-row" : ""}
                        >
                          <td>
                            <div className="row-number-cell">
                              <span>{row.rowNumber}</span>

                              {removedDuplicate && (
                                <span
                                  className="duplicate-badge"
                                  title="This duplicate copy is removed from the cleaned dataset"
                                >
                                  🗑️
                                </span>
                              )}

                              {duplicate && !removedDuplicate && (
                                <span
                                  className="duplicate-badge"
                                  title="Possible duplicate group"
                                >
                                  ⚠
                                </span>
                              )}
                            </div>
                          </td>
                          {cols.map((col) => {
                            const value = row.values[col] ?? "";

                            const missing = isMissing(row.rowId, col);

                            const providedSeparately =
                              col === "unit_cost" &&
                              !value &&
                              Boolean(row.cleanedValues[col]);

                            const separateValue = providedSeparately
                              ? row.cleanedValues[col]
                              : "";

                            return (
                              <td
                                key={col}
                                className={
                                  missing && !providedSeparately
                                    ? "missing-original-cell"
                                    : ""
                                }
                              >
                                {value ? (
                                  value
                                ) : providedSeparately ? (
                                  <span className="provided-separately">
                                    {Number(separateValue).toFixed(1)} · from
                                    cost file
                                  </span>
                                ) : (
                                  <span className="blank-value">
                                    ⚠️ Missing
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {}

            <section className="dataset-panel cleaned-panel">
              <div className="dataset-panel-head">
                <div>
                  <div className="dataset-label cleaned">CLEANED DATA</div>

                  <h3>Ready for analysis</h3>

                  <p>
                    {editing
                      ? "Editing is on. Make any corrections below."
                      : `${cleanedRowCount.toLocaleString()} rows will be analysed.`}
                  </p>
                </div>

                <button className="quiet" onClick={() => setEditing(!editing)}>
                  {editing ? "✓ Finish editing" : "✎ Edit dataset"}
                </button>
              </div>

              <div
                ref={cleanedScroll}
                className="table-scroll comparison-table"
                onScroll={(e) =>
                  syncScroll(e.currentTarget, originalScroll.current)
                }
              >
                <table>
                  <thead>
                    <tr>
                      <th>Row</th>

                      {cols.map((c) => (
                        <th key={c}>{c.replace("_", " ")}</th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {cleanedRows.map((row) => (
                      <tr key={row.rowId}>
                        <td>{row.rowNumber}</td>

                        {cols.map((col) => {
                          const id = `${row.rowId}::${col}`;

                          const value = getCleanedValue(row, col);

                          const missing = isMissing(row.rowId, col);

                          const autoChanged = isAutoChanged(row, col);

                          return (
                            <td
                              key={col}
                              className={
                                autoChanged
                                  ? "auto-cleaned-cell"
                                  : missing && !value
                                    ? "missing-cleaned-cell"
                                    : ""
                              }
                            >
                              {editing ? (
                                <div className="editable-cell-wrap">
                                  <input
                                    className={
                                      missing && !value
                                        ? "missing-cell"
                                        : autoChanged
                                          ? "auto-clean-input"
                                          : ""
                                    }
                                    aria-label={`${col} for row ${row.rowNumber}`}
                                    value={value}
                                    placeholder={missing ? "Missing" : ""}
                                    onChange={(e) =>
                                      setChoices({
                                        ...choices,
                                        values: {
                                          ...choices.values,
                                          [id]: e.target.value,
                                        },
                                      })
                                    }
                                  />

                                  {autoChanged && (
                                    <span
                                      className="auto-fix-icon"
                                      title="Automatically cleaned by Brewlytics"
                                    >
                                      ✨
                                    </span>
                                  )}
                                </div>
                              ) : value ? (
                                <span className="cleaned-value">
                                  {value}

                                  {autoChanged && (
                                    <span
                                      className="auto-fix-icon"
                                      title={`Original: ${
                                        row.values[col] || ""
                                      }`}
                                    >
                                      ✨
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="blank-value">⚠️ Missing</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </section>

        {error && (
          <div className="upload-error">
            <b>Analysis stopped</b>
            <p>{error}</p>
          </div>
        )}

        <div className="clean-actions">
          <button className="quiet" onClick={cancel}>
            ← Go back
          </button>

          <button
            className="quiet edit-action"
            onClick={() => setEditing(true)}
          >
            ✎ Edit cleaned data
          </button>

          <button className="primary" onClick={submit}>
            Accept → Analyse
          </button>
        </div>
      </section>
    </main>
  );
}

function Processing() {
  return (
    <section className="processing">
      <div className="agent-orbit">
        <span>✦</span>
      </div>
      <h2>Reading your records</h2>
      <p>Brewlytics is validating content—not filenames.</p>
      <div className="agent-steps">
        {[
          "Parsing workbook sheets",
          "Mapping café data columns",
          "Checking dates and missing fields",
          "Calculating evidence and uncertainty",
        ].map((s, i) => (
          <div key={s} style={{ animationDelay: `${i * 0.12}s` }}>
            <b>✓</b>
            {s}
          </div>
        ))}
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  delta,
  detail,
}: {
  label: string;
  value: string;
  delta: number;
  detail?: string;
}) {
  return (
    <article>
      <p>{label}</p>
      <h2>{value}</h2>
      {detail && <b className="metric-detail">{detail}</b>}
      <div>
        <span className={delta >= 0 ? "up" : "down"}>
          {delta >= 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(1)}%
        </span>
        <small>{label} vs previous month</small>
      </div>
    </article>
  );
}
function Dashboard({
  data,
}: {
  data: AnalysisResult;
  open: (m: Mode) => void;
  question: string;
  setQuestion: (s: string) => void;
}) {
  const m = data.metrics,
    profitLabel = m.costsComplete ? "Gross Profit" : "Estimated Gross Profit";
  return (
    <>
      <div className="notice">
        <span className="pulse" />
        <strong>Calculated from cleaned data</strong>
        <span>
          {data.sourceCount} sources · {data.quality}% completeness ·{" "}
          {data.rowCount.toLocaleString()} rows
        </span>
        <button>
          {data.warnings.length
            ? `${data.warnings.length} warning(s)`
            : "Validation passed"}
        </button>
      </div>
      {data.warnings.length > 0 && (
        <div className="data-warnings">
          {data.warnings.map((w) => (
            <span key={w}>⚠ {w}</span>
          ))}
        </div>
      )}
      <section className="metrics">
        <Metric
          label="Net Sales"
          value={fmtMoney(m.revenue)}
          delta={m.revenueChange}
        />
        <Metric
          label="Total Orders"
          value={Math.round(m.transactions).toLocaleString()}
          delta={m.transactionChange}
        />
        <Metric
          label="Average Order Value"
          value={`S$${m.aov.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          delta={m.aovChange}
        />
        <Metric
          label={profitLabel}
          value={fmtMoney(m.profit)}
          delta={m.profitChange}
          detail={`Gross margin: ${m.grossMargin.toFixed(1)}%${m.costsComplete ? "" : ` · Cost coverage: ${m.costCoverage.toFixed(1)}%`}`}
        />
      </section>
      <section className="analytics-grid">
        <ProfitLine data={data} />
        <ProductRanking data={data} />
      </section>
      <PriceLab data={data} />
    </>
  );
}

function ProfitLine({ data }: { data: AnalysisResult }) {
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">(
    "daily",
  );
  const grouped = new Map<
    string,
    { label: string; sales: number; cost: number }
  >();
  for (const p of data.profitDaily) {
    const d = new Date(`${p.label}T00:00:00Z`);
    let key = p.label,
      label = p.label;
    if (frequency === "daily" && p.label.slice(0, 7) !== data.latestLabel)
      continue;
    if (frequency === "weekly") {
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      key = d.toISOString().slice(0, 10);
      label = `Week of ${d.toLocaleDateString("en-SG", { day: "numeric", month: "short", timeZone: "UTC" })}`;
    }
    if (frequency === "monthly") {
      key = p.label.slice(0, 7);
      label = new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-SG", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
    }
    const x = grouped.get(key) || { label, sales: 0, cost: 0 };
    x.sales += p.sales;
    x.cost += p.cost;
    grouped.set(key, x);
  }
  const limit = frequency === "daily" ? 31 : frequency === "weekly" ? 26 : 12;
  const series = [...grouped]
    .sort()
    .slice(-limit)
    .map(([, x]) => ({
      ...x,
      value: x.sales - x.cost,
      margin: x.sales ? ((x.sales - x.cost) / x.sales) * 100 : 0,
    }));
  const values = series.map((x) => x.value),
    rawMax = Math.max(...values, 0),
    rawMin = Math.min(...values, 0),
    pad = Math.max((rawMax - rawMin) * 0.12, 1),
    max = rawMax + pad,
    min = rawMin - pad,
    span = max - min || 1;
  const points = series
    .map(
      (p, i) =>
        `${(i / Math.max(series.length - 1, 1)) * 100},${92 - ((p.value - min) / span) * 82}`,
    )
    .join(" ");
  const ticks = [0, 1, 2, 3, 4].map((i) => max - (span * i) / 4);
  const xIndexes = [0, 0.25, 0.5, 0.75, 1].map((x) =>
    Math.round(x * Math.max(series.length - 1, 0)),
  );
  const title = data.metrics.costsComplete
    ? "Gross profit trend"
    : "Estimated gross profit trend";
  const axisLabel = data.metrics.costsComplete
    ? "Gross profit (S$)"
    : "Estimated gross profit (S$)";
  const summary =
    data.metrics.profit < 0
      ? `Gross loss ${fmtMoney(Math.abs(data.metrics.profit))} this month`
      : `${fmtMoney(data.metrics.profit)} gross profit this month`;
  return (
    <article className="card profit-card">
      <div className="card-head">
        <div>
          <p className="kicker">PROFIT TREND</p>
          <h3>{title}</h3>
          <p className="chart-summary">
            {summary} · {data.metrics.profitChange >= 0 ? "↑" : "↓"}{" "}
            {Math.abs(data.metrics.profitChange).toFixed(1)}% compared with last
            month
          </p>
        </div>
        <div className="period-toggle">
          <button
            className={frequency === "daily" ? "active" : ""}
            onClick={() => setFrequency("daily")}
          >
            Daily
          </button>
          <button
            className={frequency === "weekly" ? "active" : ""}
            onClick={() => setFrequency("weekly")}
          >
            Weekly
          </button>
          <button
            className={frequency === "monthly" ? "active" : ""}
            onClick={() => setFrequency("monthly")}
          >
            Monthly
          </button>
        </div>
      </div>
      <div className="profit-chart-wrap">
        <span className="y-title">{axisLabel}</span>
        <div className="y-ticks">
          {ticks.map((v) => (
            <span key={v}>
              {Math.abs(v) >= 1000
                ? `${v < 0 ? "−" : ""}S$${Math.abs(v / 1000).toFixed(0)}k`
                : `${v < 0 ? "−" : ""}S$${Math.abs(v).toFixed(0)}`}
            </span>
          ))}
        </div>
        <svg
          className="line-chart"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-label={`${title}, ${frequency} view`}
        >
          <defs>
            <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2f7d5e" stopOpacity=".32" />
              <stop offset="1" stopColor="#2f7d5e" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((_, i) => (
            <line
              key={i}
              x1="0"
              x2="100"
              y1={10 + i * 20.5}
              y2={10 + i * 20.5}
              stroke="#e6ebe7"
              strokeWidth=".45"
            />
          ))}
          <polygon points={`0,92 ${points} 100,92`} fill="url(#profitFill)" />
          <polyline
            points={points}
            fill="none"
            stroke="#174f3d"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          {series.map((p, i) => (
            <circle
              key={`${p.label}-${i}`}
              cx={(i / Math.max(series.length - 1, 1)) * 100}
              cy={92 - ((p.value - min) / span) * 82}
              r="1.25"
              fill="#174f3d"
              vectorEffect="non-scaling-stroke"
            >
              <title>{`${p.label}\nSales: ${fmtMoney(p.sales)}\nItem & staffing cost: ${fmtMoney(p.cost)}\n${axisLabel}: ${fmtMoney(p.value)}\nMargin: ${p.margin.toFixed(1)}%`}</title>
            </circle>
          ))}
        </svg>
        <div className="x-ticks">
          {xIndexes.map((i, n) => (
            <span key={`${i}-${n}`}>{series[i]?.label || ""}</span>
          ))}
        </div>
        <b className="x-title">
          {frequency === "daily"
            ? "Date"
            : frequency === "weekly"
              ? "Week"
              : "Month"}
        </b>
      </div>
    </article>
  );
}

function ProductRanking({ data }: { data: AnalysisResult }) {
  const [period, setPeriod] = useState<"monthly" | "weekly">("monthly");
  const items = period === "monthly" ? data.products : data.weeklyProducts,
    top = items.slice(0, 10),
    bottom = [...items].reverse().slice(0, 10);
  return (
    <article className="card ranking-card">
      <div className="card-head">
        <div>
          <p className="kicker">MENU PERFORMANCE</p>
          <h3>Top & bottom products</h3>
        </div>
        <div className="period-toggle">
          <button
            className={period === "weekly" ? "active" : ""}
            onClick={() => setPeriod("weekly")}
          >
            Weekly
          </button>
          <button
            className={period === "monthly" ? "active" : ""}
            onClick={() => setPeriod("monthly")}
          >
            Monthly
          </button>
        </div>
      </div>
      <div className="rank-columns">
        <div>
          <h4>Top {Math.min(10, top.length)}</h4>
          {top.map((x, i) => (
            <div className="rank-row" key={x.name}>
              <b>{i + 1}</b>
              <span>
                {x.name}
                <small>{x.units.toLocaleString()} sold</small>
              </span>
              <strong>{fmtMoney(x.profit)}</strong>
            </div>
          ))}
        </div>
        <div>
          <h4>Bottom {Math.min(10, bottom.length)}</h4>
          {bottom.map((x, i) => (
            <div className="rank-row bottom" key={x.name}>
              <b>{i + 1}</b>
              <span>
                {x.name}
                <small>{x.units.toLocaleString()} sold</small>
              </span>
              <strong>{fmtMoney(x.profit)}</strong>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function PriceLab({ data }: { data: AnalysisResult }) {
  const products = data.products.length
    ? data.products
    : [{ name: "Menu item", units: 0, revenue: 0, profit: 0, price: 0 }];
  const [name, setName] = useState(products[0].name),
    [change, setChange] = useState(0);
  const item = products.find((x) => x.name === name) || products[0],
    newPrice = Math.max(0, item.price + change),
    unitResponse = item.price ? -(change / item.price) * 0.8 : 0,
    newUnits = Math.max(0, item.units * (1 + unitResponse)),
    newRevenue = newUnits * newPrice,
    impact = newRevenue - item.revenue;
  return (
    <section className="price-lab">
      <div>
        <p className="kicker">LIVE PRICE TEST</p>
        <h2>Test a menu price</h2>
        <p>
          Choose an item and move the slider by an absolute dollar amount. The
          model updates instantly using an elasticity assumption of 0.8.
        </p>
        <label>
          Menu item
          <select value={name} onChange={(e) => setName(e.target.value)}>
            {products.map((x) => (
              <option key={x.name}>{x.name}</option>
            ))}
          </select>
        </label>
        <label>
          Price adjustment{" "}
          <strong>
            {change >= 0 ? "+" : ""}
            {fmtMoney(change)}
          </strong>
        </label>
        <input
          type="range"
          min="-2"
          max="2"
          step="0.1"
          value={change}
          onChange={(e) => setChange(+e.target.value)}
        />
        <div className="scenario-scale">
          <span>−S$2.00</span>
          <span>No change</span>
          <span>+S$2.00</span>
        </div>
      </div>
      <div className="live-impact">
        <span>
          Current price<strong>{fmtMoney(item.price)}</strong>
        </span>
        <span>
          Test price<strong>{fmtMoney(newPrice)}</strong>
        </span>
        <span>
          Modelled revenue change
          <strong className={impact >= 0 ? "positive" : "negative"}>
            {impact >= 0 ? "+" : ""}
            {fmtMoney(impact)}
          </strong>
        </span>
        <span>
          Modelled units<strong>{Math.round(newUnits).toLocaleString()}</strong>
        </span>
      </div>
    </section>
  );
}
function Chatbot({ data }: { data: AnalysisResult }) {
  const API_URL =
    "https://qjubtiodi3nhykyc4yia5th34u0utxdp.lambda-url.us-east-1.on.aws/";

  type TrailStep = {
    step: number;
    tool: string;
    title: string;
    summary: string;
  };

  type Metric = {
    label: string;
    value: string;
    detail?: string;
  };

  type Finding = {
    title: string;
    text: string;
  };

  type FollowUp = {
    label: string;
    question: string;
  };

  type Answer = {
    headline: string;
    overview: string;
    metrics: Metric[];
    findings: Finding[];
    conclusion: string;
    limitations: string;
    followUps: FollowUp[];
  };

  type Message = {
    role: "user" | "ai";
    text?: string;
    answer?: Answer;
    trail?: TrailStep[];
    loading?: boolean;
    error?: boolean;
  };

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "ai",
      text: "Ask me about a change in your café's performance. I'll investigate the data, run the relevant analyses, and explain what I find.",
    },
  ]);

  const send = async (prompt = input) => {
    const question = prompt.trim();

    if (!question || busy) return;

    setInput("");
    setBusy(true);

    setMessages((prev) => [
      ...prev,
      { role: "user", text: question },
      {
        role: "ai",
        text: "Investigating your data…",
        loading: true,
      },
    ]);

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question,
          businessData: {
            latestLabel: data.latestLabel,
            previousLabel: data.previousLabel,
            metrics: data.metrics,
            investigation: data.investigation,
          },
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Brewlytics could not complete the investigation.",
        );
      }

      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          role: "ai",
          answer: result.answer,
          trail: Array.isArray(result.trail) ? result.trail : [],
        },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          role: "ai",
          error: true,
          text: `Investigation failed: ${
            e instanceof Error ? e.message : "Unknown error"
          }`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat-page">
      <div className="chat-intro">
        <span>✦</span>

        <div>
          <p className="kicker">INVESTIGATION AGENT</p>

          <h2>Ask Brewlytics</h2>

          <p>
            Ask what changed in your business. Brewlytics decides what to
            investigate, runs the calculations, and explains the evidence.
          </p>
        </div>
      </div>

      <div className="quick-prompts">
        {[
          `Why did ${data.products[0]?.name || "my top product"} performance change?`,
          "What drove the change in profit?",
          "Which products changed the most?",
        ].map((q) => (
          <button key={q} disabled={busy} onClick={() => send(q)}>
            {q}
          </button>
        ))}
      </div>

      <section className="chat-window">
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.role}`}>
            <b className="message-author">
              {m.role === "ai" ? "Brewlytics" : "You"}
            </b>

            {m.loading && (
              <div className="investigating-state">
                <div className="agent-thinking">
                  <span>✦</span>

                  <div>
                    <strong>Investigating your question</strong>

                    <small>
                      Planning analysis → running tools → checking evidence
                    </small>
                  </div>
                </div>
              </div>
            )}

            {!m.loading && m.text && (
              <p className={m.error ? "chat-error" : ""}>{m.text}</p>
            )}

            {!m.loading && m.answer && (
              <div className="agent-answer">
                {/* HEADLINE */}

                <section className="answer-lead">
                  <span className="answer-icon">✦</span>

                  <div>
                    <h3>{m.answer.headline}</h3>

                    <p>{m.answer.overview}</p>
                  </div>
                </section>

                {/* METRICS */}

                {m.answer.metrics?.length > 0 && (
                  <section className="answer-metrics">
                    {m.answer.metrics.map((metric, j) => (
                      <article key={`${metric.label}-${j}`}>
                        <span>{metric.label}</span>

                        <strong>{metric.value}</strong>

                        {metric.detail && <small>{metric.detail}</small>}
                      </article>
                    ))}
                  </section>
                )}

                {/* FINDINGS */}

                {m.answer.findings?.length > 0 && (
                  <section className="answer-findings">
                    <div className="findings-heading">
                      <span>ANALYSIS</span>

                      <h4>What I found</h4>
                    </div>

                    {m.answer.findings.map((finding, j) => (
                      <article
                        className="finding-block"
                        key={`${finding.title}-${j}`}
                      >
                        <div className="finding-number">{j + 1}</div>

                        <div>
                          <h4>{finding.title}</h4>

                          <p>{finding.text}</p>
                        </div>
                      </article>
                    ))}
                  </section>
                )}

                {/* CONCLUSION */}

                {m.answer.conclusion && (
                  <section className="answer-conclusion">
                    <p className="kicker">WHAT THIS MEANS</p>

                    <p>{m.answer.conclusion}</p>
                  </section>
                )}

                {/* EVIDENCE BOUNDARY */}

                {m.answer.limitations && (
                  <div className="answer-boundary">
                    <span>ⓘ</span>

                    <p>
                      <b>Evidence boundary</b>
                      <br />
                      {m.answer.limitations}
                    </p>
                  </div>
                )}

                {/* REAL AGENT TRAIL */}

                {m.trail && m.trail.length > 0 && (
                  <details className="investigation-trail">
                    <summary>
                      <span>Investigation Trail</span>

                      <small>{m.trail.length} analyses</small>
                    </summary>

                    <div className="trail-list">
                      {m.trail.map((step) => (
                        <div
                          className="trail-step"
                          key={`${step.step}-${step.tool}`}
                        >
                          <span className="trail-check">✓</span>

                          <div>
                            <b>{step.title}</b>

                            <small>{step.summary}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {/* FOLLOW UPS */}

                {m.answer.followUps?.length > 0 && (
                  <section className="follow-up-section">
                    <div>
                      <span className="follow-up-label">
                        CONTINUE INVESTIGATING
                      </span>

                      <h4>Want me to dig deeper?</h4>
                    </div>

                    <div className="follow-up-buttons">
                      {m.answer.followUps.map((follow, j) => (
                        <button
                          key={`${follow.label}-${j}`}
                          disabled={busy}
                          onClick={() => send(follow.question)}
                        >
                          {follow.label}
                          <span>→</span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        ))}
      </section>

      <div className="chat-composer">
        <input
          value={input}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) {
              send();
            }
          }}
          placeholder={
            busy
              ? "Brewlytics is investigating…"
              : "Ask a question about your business…"
          }
        />

        <button disabled={busy || !input.trim()} onClick={() => send()}>
          {busy ? "Investigating…" : "Send →"}
        </button>
      </div>

      <p className="chat-note">
        Answers are grounded in analyses executed on your uploaded data.
      </p>
    </div>
  );
}

function Strip({
  title,
  detail,
  count,
}: {
  title: string;
  detail: string;
  count: string;
}) {
  return (
    <div className="agent-strip">
      <span>✦</span>
      <div>
        <b>{title}</b>
        <small>{detail}</small>
      </div>
      <em>{count}</em>
    </div>
  );
}
function Cards({
  items,
}: {
  items: { label: string; value: string; detail: string }[];
}) {
  return (
    <section className="evidence-grid">
      {items.map((x) => (
        <article key={x.label}>
          <span>{x.label}</span>
          <h3>{x.detail}</h3>
          <strong>{x.value}</strong>
        </article>
      ))}
    </section>
  );
}
function Analysis({
  data,
  mode,
  question,
  scenario,
  setScenario,
  back,
}: {
  data: AnalysisResult;
  mode: Mode;
  question: string;
  scenario: number;
  setScenario: (n: number) => void;
  back: () => void;
}) {
  return (
    <div className="investigation-page">
      <button className="back" onClick={back}>
        ← Back to overview
      </button>
      {mode === "signal" ? (
        <Signal data={data} />
      ) : mode === "root" ? (
        <Root data={data} />
      ) : mode === "forecast" ? (
        <Forecast data={data} />
      ) : mode === "scenario" ? (
        <Scenario data={data} value={scenario} setValue={setScenario} />
      ) : (
        <Custom data={data} question={question} />
      )}
      <div className="boundary">
        <b>Evidence boundary</b>
        <p>
          Results are computed from the uploaded records. Associations and
          forecasts are estimates, not causal proof or guaranteed outcomes.
        </p>
      </div>
    </div>
  );
}
function Signal({ data }: { data: AnalysisResult }) {
  const s = data.signal;
  return (
    <>
      <Strip
        title="Evidence calculation complete"
        detail="Ingredient history → outlet comparison → affected products"
        count={`${s.confidence}% confidence`}
      />
      <section className="finding">
        <div>
          <p className="kicker">LARGEST COST MOVEMENT</p>
          <h2>
            {s.ingredient} changed {Math.abs(s.change).toFixed(1)}% at{" "}
            {s.outlet}.
          </h2>
          <p>
            Average observed unit cost moved from {fmtMoney(s.before)} to{" "}
            {fmtMoney(s.after)} between the two latest months.
          </p>
        </div>
        <div className="score">
          <strong>{Math.abs(s.change).toFixed(1)}%</strong>
          <span>{s.change >= 0 ? "increase" : "decrease"}</span>
          <small>Uploaded records</small>
        </div>
      </section>
      <Cards
        items={(s.affected.length ? s.affected : ["No product mapping"]).map(
          (x, i) => ({
            label: `AFFECTED ${i + 1}`,
            value: x,
            detail: "High related product cost",
          }),
        )}
      />
    </>
  );
}
function Root({ data }: { data: AnalysisResult }) {
  return (
    <>
      <Strip
        title="Driver ranking complete"
        detail="Costs → discounts → outlet performance"
        count={`${data.sourceCount} sources`}
      />
      <section className="finding">
        <div>
          <p className="kicker">EVIDENCE-BASED SUMMARY</p>
          <h2>
            {data.metrics.profitChange < 0
              ? "Estimated profit declined"
              : "Estimated profit improved"}{" "}
            {Math.abs(data.metrics.profitChange).toFixed(1)}%.
          </h2>
          <p>
            The factors below are ranked by observed movement and relevance.
            They are associations, not asserted causes.
          </p>
        </div>
        <div className="score">
          <strong>{data.signal.confidence}%</strong>
          <span>coverage score</span>
          <small>{data.rowCount.toLocaleString()} rows checked</small>
        </div>
      </section>
      <Cards items={data.drivers} />
    </>
  );
}
function Forecast({ data }: { data: AnalysisResult }) {
  const f = data.forecast;
  return (
    <>
      <Strip
        title="Forecast calculated"
        detail="Monthly trend → bounded growth → empirical uncertainty"
        count="80% interval"
      />
      <section className="finding">
        <div>
          <p className="kicker">NEXT-MONTH OUTLOOK</p>
          <h2>Estimated profit: {fmtMoney(f.profit)}</h2>
          <p>
            80% model interval:{" "}
            <strong>
              {fmtMoney(f.low)}–{fmtMoney(f.high)}
            </strong>
            . More history will improve stability.
          </p>
        </div>
        <div className="score">
          <strong>{fmtMoney(f.revenue)}</strong>
          <span>revenue estimate</span>
          <small>{Math.round(f.transactions).toLocaleString()} units</small>
        </div>
      </section>
      <Cards
        items={[
          {
            label: "LOW CASE",
            value: fmtMoney(f.low),
            detail: "10th percentile",
          },
          {
            label: "CENTRAL",
            value: fmtMoney(f.profit),
            detail: "Trend estimate",
          },
          {
            label: "HIGH CASE",
            value: fmtMoney(f.high),
            detail: "90th percentile",
          },
        ]}
      />
    </>
  );
}
function Scenario({
  data,
  value,
  setValue,
}: {
  data: AnalysisResult;
  value: number;
  setValue: (n: number) => void;
}) {
  const s = data.scenario,
    elasticity = 0.8,
    unitDrop = (value * elasticity) / 100,
    gain = s.baseRevenue * ((1 + value / 100) * (1 - unitDrop) - 1);
  return (
    <>
      <Strip
        title="Scenario recalculated"
        detail="Observed affected revenue → price change → elasticity assumption"
        count="Interactive"
      />
      <section className="scenario scenario-full">
        <div>
          <p className="kicker">PRICE SCENARIO LAB</p>
          <h2>
            {s.product} at {s.outlet}
          </h2>
          <p>
            Uses {fmtMoney(s.baseRevenue)} of observed latest-month affected
            revenue and a stated elasticity assumption of 0.8.
          </p>
          <label>
            Price change <strong>+{value}%</strong>
          </label>
          <input
            type="range"
            min="0"
            max="10"
            value={value}
            onChange={(e) => setValue(+e.target.value)}
          />
          <div className="scenario-scale">
            <span>0%</span>
            <span>+5%</span>
            <span>+10%</span>
          </div>
        </div>
        <div className="impact">
          <p>Modelled revenue impact</p>
          <h2>
            {gain >= 0 ? "+" : "−"}
            {fmtMoney(gain)}
          </h2>
          <span>Estimated unit response: −{(unitDrop * 100).toFixed(1)}%</span>
          <hr />
          <p>Illustrative new price</p>
          <h3>{fmtMoney(s.basePrice * (1 + value / 100))}</h3>
        </div>
      </section>
    </>
  );
}
function Custom({
  data,
  question,
}: {
  data: AnalysisResult;
  question: string;
}) {
  const q = question.toLowerCase();
  const answer = q.includes("forecast")
    ? `The calculated next-month profit estimate is ${fmtMoney(data.forecast.profit)}, with an 80% interval of ${fmtMoney(data.forecast.low)}–${fmtMoney(data.forecast.high)}.`
    : q.includes("revenue")
      ? `Latest-month revenue is ${fmtMoney(data.metrics.revenue)}, ${fmtPct(data.metrics.revenueChange)} versus the previous month.`
      : q.includes("profit")
        ? `Estimated profit is ${fmtMoney(data.metrics.profit)}, ${fmtPct(data.metrics.profitChange)} versus the previous month.`
        : `The largest mapped signal is ${data.signal.ingredient} at ${data.signal.outlet}, moving ${fmtPct(data.signal.change)} between the latest two months.`;
  return (
    <>
      <Strip
        title="Question routed to calculated metrics"
        detail="Keyword intent → uploaded-data result"
        count="Deterministic"
      />
      <section className="finding">
        <div>
          <p className="kicker">YOUR QUESTION</p>
          <h2>{question}</h2>
          <p>{answer}</p>
        </div>
        <div className="score">
          <strong>{data.quality}%</strong>
          <span>data completeness</span>
          <small>{data.sourceCount} mapped sources</small>
        </div>
      </section>
    </>
  );
}
