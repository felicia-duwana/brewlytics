# Brewlytics

**Evidence-led performance intelligence for small, single-outlet cafés.**

Brewlytics turns POS sales and item-cost exports into a cleaned decision dashboard. Café owners can then ask an AI investigation agent why performance changed and receive an answer grounded in their uploaded data.

The application combines deterministic business calculations with Amazon Bedrock. It separates measured evidence from assumptions and states when the available data cannot support a conclusion.

## Problem

Independent café owners already have valuable sales and cost data sitting in their POS exports. Yet, despite 77% of SMEs in the Food, Beverage & Tobacco industry expressing interest in sending staff for data analytics training, only 7.5% have adopted data analytics tools. This gap exists alongside a broader shortage of dedicated data-analysis capabilities among SMEs, with many businesses outsourcing as a way to keep up with their IT functions. (Koh et al., 2020)

The problem, therefore, is not a lack of data rather it is the recurring gap between having the numbers and knowing what they mean. As cafés operate across increasingly fragmented information environments, business records remain scattered across systems and rarely translate into clear, timely decisions. Over time, these gaps in managerial understanding can compound quietly, only becoming visible when they surface as cash-flow pressure or reduced operational flexibility (Lee, 2026). But by then it would have been too late for the cafes to solve the issue. 

Hence, we want the data to explain itself to anyone, even those without a data analytics background. There is a need for solution that turns the records cafés already collect into understandable insights, while an AI agent determines what is actually worth the owner's attention — helping ensure that valuable business data does not simply sit unused.

Brewlytics provides one workflow to:

1. Import and validate CSV or Excel POS exports.
2. Review missing values and duplicates before analysis.
3. Calculate net sales, total orders, average order value, gross profit, gross margin, product rankings, and period-over-period changes.
4. Explore bounded pricing scenarios and forecasts with visible assumptions.
5. Ask an AI agent a business question and view the evidence and analytical tools used to produce its answer.

## Solution workflow

<img width="446" height="636" alt="Screenshot 2026-09-06 at 3 24 31 PM" src="https://github.com/user-attachments/assets/f9541182-36bc-4f38-8432-be5dcb041432" />



## Why the system is agentic

The investigation service follows a bounded **plan–act–observe–report** loop instead of generating an immediate, unsupported response.


<img width="580" height="550" alt="Screenshot 2026-09-06 at 3 33 16 PM" src="https://github.com/user-attachments/assets/7a3fe5b7-6422-4e23-855f-aa01bd083caf" />

* **Plan:** Amazon Bedrock selects the next useful analysis from a constrained tool set.
* **Act:** Deterministic tools analyse product, price-volume, channel, weekday, and profitability trends.
* **Observe and adapt:** Each tool result is added to the investigation context before the next step, for a maximum of three steps.
* **Report:** The system returns findings, supporting metrics, limitations, suggested follow-up questions, and a visible tool trail.
* **Stay grounded:** When the uploaded fields cannot support a causal explanation, the system states the limitation instead of inventing a cause.

## Key features

* Browser-side parsing of `.csv`, `.xlsx`, and `.xls` files
* Up to two uploaded files, with a maximum size of 10 MB each
* Content-based sheet detection and flexible column-name mapping
* Editable cleaning preview for missing values and duplicates
* Net sales, order count, average order value, gross profit, gross margin, and data-quality metrics
* Weekly and monthly product-profitability rankings
* Analysis across time periods, products, menu categories, sales channels, and weekdays
* Interactive menu-price scenario modelling with an explicit elasticity assumption
* Next-month forecast with an 80% model interval
* AWS Lambda investigation agent powered by Amazon Bedrock
* Structured answers with evidence, limitations, suggested actions, and an investigation trail
* Privacy-conscious processing: raw uploaded files remain in the browser, while only calculated aggregates are sent to the investigation endpoint

## Dashboard metrics

The main dashboard focuses on four headline measures:

| Metric              | Definition                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| Net sales           | Sales after discounts and refunds                                                                     |
| Total orders        | Number of distinct order or transaction IDs; for aggregated reports, the sum of the order-count field |
| Average order value | Net sales divided by total orders                                                                     |
| Gross profit        | Net sales minus total item cost                                                                       |

Gross margin is displayed with gross profit and is calculated as:

```text
Gross margin = Gross profit / Net sales × 100%
```

Gross profit is not the café’s final net profit because POS sales and item-cost data do not include every operating expense, such as rent, salaries, utilities, or financing costs.

If item-cost coverage is incomplete, the application labels the result as estimated and reports the available cost coverage.

## Architecture

<img width="577" height="647" alt="Screenshot 2026-09-06 at 3 40 01 PM" src="https://github.com/user-attachments/assets/aec42fde-b4e1-4c28-a156-0dc6039183e5" />



| Layer                  | Technology                         | Purpose                                                   |
| ---------------------- | ---------------------------------- | --------------------------------------------------------- |
| Web application        | React 19, Next.js 16, TypeScript   | Upload, cleaning, dashboard, scenario, and chat interface |
| Build and runtime      | Vinext, Vite 8, Cloudflare tooling | Local development and production build                    |
| Spreadsheet processing | SheetJS (`xlsx`)                   | Parse CSV and Excel workbooks in the browser              |
| Agent service          | AWS Lambda, Node.js 22             | Validate requests and orchestrate bounded investigations  |
| AI model               | Amazon Bedrock, GPT-OSS 20B        | Select investigation steps and compose grounded reports   |

## Prerequisites

* [Git](https://git-scm.com/)
* [Node.js](https://nodejs.org/) 22.13.0 or newer
* npm, which is included with Node.js

The project uses TypeScript and Node.js. Its dependencies are declared in `package.json` and locked in `package-lock.json`; a Python `requirements.txt` file is therefore not required.

## Run locally

Clone the repository and install its dependencies:

```bash
git clone https://github.com/zxtan689/fake-hackathon-.git
cd fake-hackathon-
npm install
```

Start the development server:

```bash
npm run dev
```

Open the URL shown in the terminal, normally http://localhost:3000.

The dashboard and browser-side analytics work locally without AWS credentials. The AI investigation feature also requires the configured Lambda endpoint to be online and to allow requests from the local web-app origin.

## Environment and API configuration

The current prototype defines the investigation endpoint through the `API_URL` value in `app/page.tsx`. Set it to the deployed Lambda Function URL before using the AI investigation feature.

For a production-ready configuration, replace the source-code constant with a public environment variable:

```env
NEXT_PUBLIC_BREWLYTICS_API_URL=https://your-lambda-url.example
```

Store the real value in `.env.local`, keep that file out of Git, and commit only an `.env.example` containing a placeholder.

The frontend should read the value as:

```typescript
process.env.NEXT_PUBLIC_BREWLYTICS_API_URL
```

Do not place AWS access keys in the browser, source code, or repository. The Lambda function should access Amazon Bedrock through its IAM execution role.

## Available commands

```bash
npm run dev      # Start the development server
npm run build    # Create a production build
npm run start    # Serve the production build
npm run lint     # Run ESLint
```

## How to use Brewlytics

1. Open the web application.
2. Upload one or two supported POS sales or item-cost files.
3. Review the detected fields, missing values, and duplicate rows.
4. Correct the previewed data where necessary.
5. Select **Accept → Analyse** to confirm the cleaned dataset.
6. Review the KPI cards, trend charts, and menu-item performance.
7. Use the price-scenario or forecast views if required.
8. Ask the investigation agent a question, such as:

   * Why did gross profit fall this month?
   * Which menu items contributed most to the decline?
   * Which items have high margins but low sales?
   * Are discounts reducing gross profit?
   * Which days or channels are underperforming?
9. Review the answer’s evidence, assumptions, limitations, and tool trail before acting on it.

## Input data

Brewlytics detects relevant sheets from their contents rather than relying only on filenames. For meaningful month-over-month analysis, provide at least two months of dated sales data.

Recognised headings include common variations of the following fields:

| Canonical field                    | Example headings                                                 |
| ---------------------------------- | ---------------------------------------------------------------- |
| Date                               | `date`, `transaction_date`, `order_date`                         |
| Product                            | `product_name`, `product`, `menu_item`, `item`, `product_id`     |
| Order ID                           | `transaction_id`, `order_id`, `receipt_id`                       |
| Quantity sold                      | `units_sold`, `quantity`, `units`                                |
| Order count for aggregated exports | `transactions`, `orders`, `ticket_count`                         |
| Unit price or revenue              | `unit_price`, `price_sgd`, `net_revenue_sgd`, `revenue`, `sales` |
| Item cost                          | `unit_cost`, `cost_sgd`, `estimated_product_cost_sgd`            |
| Channel                            | `channel`, `sales_channel`                                       |

An outlet field may be retained for future scalability, but the current prototype is designed for one café outlet and does not depend on outlet comparison.

The application rejects files that are empty, unreadable, unrelated, or lack usable dated sales data. Missing item costs reduce the displayed cost-coverage and profit-confidence indicators instead of being silently treated as complete data.

### Sample dataset

A fictional sample workbook is provided for testing and demonstrating Brewlytics:

- [`Brewlytics_POS_Unit_Cost_Sample.xlsx`](sample-data/Brewlytics_POS_Unit_Cost_Sample.xlsx)

The workbook contains two sheets:

- `POS` — transaction-level café sales data
- `Unit Costs` — product-level unit-cost data

Upload this workbook to Brewlytics, review the detected data-quality issues, and select **Accept → Analyse**.

The dataset represents a single café outlet in Tiong Bahru and contains fictional data only. It also includes controlled data-quality issues to demonstrate the application’s cleaning and validation workflow.

## AWS investigation agent deployment

The frontend can use the team’s deployed Lambda Function URL. To deploy a separate backend:

1. Create a Node.js 22 AWS Lambda function in `us-east-1`.
2. The Lambda backend imports `@aws-sdk/client-bedrock-runtime`. Ensure this dependency is available through the Lambda runtime, a Lambda layer, or a backend deployment package before deploying.
3. Set the Lambda handler to the `handler` exported by that module.
4. Grant the Lambda execution role CloudWatch Logs permissions and least-privilege `bedrock:InvokeModel` access to `openai.gpt-oss-20b-1:0`.
5. If the model is unavailable or not enabled in the selected region, update `MODEL_ID` to an available Bedrock model.
6. Expose the function through a Lambda Function URL or API Gateway.
7. Configure CORS to allow the web application’s origin.
8. Configure the frontend investigation endpoint as described above.

The request sent to Lambda contains the owner’s question together with calculated metrics and investigation aggregates, not the original workbook rows.

The handler rejects:

* Missing questions
* Missing investigation data
* `businessData` whose JSON string exceeds 100,000 characters

See `AWS_BACKEND_GUIDE.md` for additional AWS architecture, API, security, and deployment notes.

## Repository structure

| Path                                    | Purpose                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `app/page.tsx`                          | Main client workflow for upload, cleaning review, dashboard, price scenarios, investigations, and chat              |
| `app/analyze.ts`                        | Workbook parsing, schema mapping, validation, cleaning scan, metrics, rankings, forecasts, and aggregate generation |
| `app/investigation.ts`                  | Browser-side deterministic investigation tools and shared investigation types                                       |
| `app/layout.tsx`                        | Root layout and page metadata                                                                                       |
| `app/globals.css`                       | Application, responsive, cleaning, dashboard, and chat styles                                                       |
| `app/chart.css`                         | Chart and visualisation styles                                                                                      |
| `backend/investigation-agent/index.mjs` | Lambda handler, guardrails, tool routing, Bedrock calls, fallbacks, and structured report generation                |
| `AWS_BACKEND_GUIDE.md`                  | Additional AWS architecture, API, security, and deployment guidance                                                 |
| `build_cafe_dataset.mjs`                | Utility used to build the café demonstration data                                                                   |
| `public/favicon.svg`                    | Browser icon                                                                                                        |
| `package.json`                          | Project metadata, dependencies, and npm scripts                                                                     |
| `package-lock.json`                     | Locked dependency versions for reproducible installation                                                            |
| `vite.config.ts`                        | Vite configuration                                                                                                  |
| `next.config.ts`                        | Next.js configuration                                                                                               |
| `tsconfig.json`                         | TypeScript configuration                                                                                            |
| `eslint.config.mjs`                     | ESLint configuration                                                                                                |
| `.openai/`                              | OpenAI Sites project configuration                                                                                  |

Generated directories such as `.next/`, `.vinext/`, `dist/`, `.wrangler/`, and `site-package-stage-*` are build or deployment artefacts rather than core application source files.

## Calculations and evidence boundaries

* Net sales, order count, average order value, gross profit, gross margin, and rankings are calculated deterministically from the accepted data.
* Total orders are counted from distinct order IDs when transaction-level data is available.
* For aggregated reports, order counts are summed from the dedicated order-count field.
* Quantity sold and total orders are separate measures and are not treated as interchangeable.
* Gross profit is calculated only from net sales and item cost.
* Gross profit does not include rent, labour, utilities, or other operating expenses.
* Relationships observed in the uploaded data are associations and do not prove causation.
* Forecasts and price scenarios are estimates rather than guaranteed outcomes.
* The price scenario currently assumes a demand elasticity of 0.8; users should validate this assumption using actual experiments or historical pricing data.
* The agent answers only from fields represented in the uploaded data and explicitly reports unsupported questions or missing evidence.

## Privacy and security

* Raw uploaded workbook rows are processed in the browser.
* Only calculated metrics and investigation aggregates are sent to the Lambda investigation endpoint.
* AWS credentials are not required or stored in the browser.
* The Lambda function should use a least-privilege IAM execution role.
* Secrets and real environment values must not be committed to Git.

Before public production use, the prototype still requires authentication, rate limiting, restricted CORS, AWS WAF, monitoring, budget alerts, persistence controls, and broader automated testing.

## Testing and evaluation
<img width="278" height="517" alt="Screenshot 2026-09-06 at 3 41 40 PM" src="https://github.com/user-attachments/assets/018dcc27-d87e-4d9b-830f-88eaa304d2d8" />

The current automated suite has **96 passing tests**: 94 Vitest tests across eight files and two Playwright browser tests.


Run the checks with:

```bash
npm test              # all 94 unit, integration, safety and Lambda-handler tests
npm run test:unit     # 86 application unit and integration tests
npm run test:lambda   # 8 direct tests of the real Lambda handler
npm run test:e2e      # 2 Chromium end-to-end browser tests
npm run lint
npm run build
```

Before running Playwright locally for the first time, install its Chromium browser:

```bash
npx playwright install chromium
```

The application tests cover upload parsing, automatic and manual cleaning, duplicate handling, KPI calculations, distinct-order counting, cost coverage, deterministic investigation tools and evidence-safety rules. The Lambda tests execute `backend/investigation-agent/index.mjs` directly and cover CORS preflight, request validation, oversized aggregates, successful response structure, Bedrock failures, and empty or malformed model responses.

The Playwright suite uses public, deterministic CSV fixtures to exercise the single-outlet flow from upload through cleaning, dashboard KPIs and an AI investigation. It also verifies that an invalid upload is rejected. Both the browser investigation endpoint and the Lambda Bedrock client are mocked during automated testing, so tests require no AWS credentials and incur no Bedrock charges.

GitHub Actions runs these checks on pushes and pull requests to `main`. Live Bedrock behaviour and subjective AI-response quality still require human evaluation; no completed manual quality evaluation is claimed here.

## Limitations

* The prototype analyses a single café outlet.
* Full net profit cannot be calculated using POS sales and item-cost data alone.
* Gross-profit accuracy depends on the completeness and correctness of item-cost data.
* Forecast quality depends on the amount and representativeness of the uploaded historical data.
* Price-response estimates depend on an assumed elasticity and should not be treated as guaranteed customer behaviour.
* The system identifies evidence-backed contributors and associations, not verified causal effects.
* The current prototype is not hardened for unrestricted public production use.

## Suggested demonstration flow

1. Upload the demonstration POS sales and cost files.
2. Show a detected duplicate or missing value, make a correction, and accept the cleaned dataset.
3. Explain the KPI changes and menu-item rankings using the uploaded evidence.
4. Test a menu-price change and state the elasticity assumption.
5. Ask the agent a product, channel, weekday, or profitability question.
6. Open the investigation trail to show the tools and evidence used.
7. Ask an unsupported causal question to demonstrate the evidence boundary.

## Judging-criteria alignment

| Criterion         | Evidence in Brewlytics                                                                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Benefits          | Reduces manual spreadsheet preparation and turns POS records into decision-ready metrics and investigations                                                                       |
| Originality       | Combines an editable data-quality gate, deterministic café analytics, bounded agent planning, and an auditable tool trail                                                         |
| Effectiveness     | Covers the workflow from raw exports to cleaning, descriptive analysis, investigation, forecasting, scenario testing, and owner-facing recommendations                            |
| Technical quality | Uses a functional TypeScript prototype, browser-side data processing, explicit evidence boundaries, request validation, deterministic fallbacks, and a least-privilege AWS design |
| Presentation      | Supports a clear problem-to-evidence-to-action demonstration flow                                                                                                                 |

## Prototype status

The web application and AWS investigation flow are functional proof-of-concept components. Authentication, persistence, rate limiting, observability, broader automated test coverage, and configurable deployment remain future work.

## License

No licence has been specified. Unless the repository owner adds one, all rights are reserved.


## Citations : 
Lee, Namsuk. (2026). Financial Literacy and Small Business Sustainability in Owner-Operated Café and Restaurant Businesses A Preventive Operational Awareness Framework. 

Koh, S. K., Perdana, A., Arisandi, D., & Lee, H. H., Tan, A., ISCA (2020). DATA ANALYTICS ADOPTION IN SINGAPORE SMEs. SIT 

