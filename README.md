# Brewlytics

**Evidence-led performance intelligence for small, 1-3 outlet cafés.**
For cafe owners with no analyst on staff,  our decision-support AI  automatically turns scattered sales records into a clear answer on business drivers across operations.

Brewlytics turns POS sales and item-cost exports into a cleaned decision dashboard. Café owners can then ask an AI investigation agent why performance changed and receive an answer grounded in their uploaded data.

The application combines deterministic business calculations with Amazon Bedrock. It separates measured evidence from assumptions and states when the available data cannot support a conclusion.

## Problem

Independent café owners with 1-3 outlets already have valuable sales and cost data sitting in their POS exports. Yet, despite 77% of SMEs in the Food, Beverage & Tobacco industry expressing interest in sending staff for data analytics training, only 7.5% have adopted data analytics tools. This gap exists alongside a broader shortage of dedicated data-analysis capabilities among SMEs, with many businesses outsourcing as a way to keep up with their IT functions. (Koh et al., 2020)

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
git clone https://github.com/felicia-duwana/brewlytics
cd brewlytics
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
<img width="382" height="576" alt="Screenshot 2026-09-06 at 9 47 51 PM" src="https://github.com/user-attachments/assets/9f976435-c303-41b0-ba94-ca9ec63bd9c7" />

The current automated suite has 96 passing tests: 94 Vitest tests across eight files and two Playwright browser tests.

Run the checks with:

npm test              # all 94 unit, integration, safety and Lambda-handler tests
npm run test:unit     # 86 application unit and integration tests
npm run test:lambda   # 8 direct tests of the real Lambda handler
npm run test:e2e      # 2 Chromium end-to-end browser tests
npm run lint
npm run build

Before running Playwright locally for the first time, install its Chromium browser:


npx playwright install chromium

The automated tests cover:

- File upload and workbook parsing
- Automatic and manual data cleaning
- Missing-value handling
- Duplicate detection and removal
- Product-name standardisation
- KPI calculations
- Distinct-order counting
- Cost coverage
- Deterministic investigation tools
- Evidence-safety rules
- Lambda request validation and response handling
- Bedrock failure and malformed-response handling
- End-to-end browser behaviour

The Lambda tests execute backend/investigation-agent/index.mjs directly and cover CORS preflight, request validation, oversized aggregates, successful response structure, Bedrock failures, and empty or malformed model responses.

The Playwright suite uses public, deterministic CSV fixtures to exercise the single-outlet workflow from upload through cleaning, dashboard KPIs and an AI investigation. It also verifies that an invalid upload is rejected.

Both the browser investigation endpoint and Lambda Bedrock client are mocked during automated testing, so the automated suite requires no AWS credentials and incurs no Bedrock charges.

GitHub Actions runs the automated checks on pushes and pull requests to main.

### Controlled manual testing

In addition to automated tests, Brewlytics was evaluated using a controlled manual test protocol with specially constructed POS sales and unit-cost workbooks.

The manual evaluation was designed to test behaviour that cannot be fully assessed through conventional unit tests, particularly:

- Owner interaction with data-quality problems
- Ambiguous cross-file product matching
- Incomplete cost coverage
- Dashboard accuracy against independently calculated ground truth
- AI numerical accuracy
- AI evidence grounding
- AI handling of missing information
- Unsupported causal questions
- Unsupported financial calculations
- Evidence-backed recommendations

The test dataset contained controlled data-quality conditions including:

- One exact duplicate POS row
- One missing product name
- One missing sales channel
- Iced Latte case and whitespace variations
- Matcha Latte case variations
- An ambiguous cross-file croissant product name requiring owner confirmation
- Blueberry Muffin sales with no corresponding unit cost
- A cost-only Seasonal Tart with no sales
- Product costs that change between July and August

Ambiguous mappings were not silently inferred. For example, the POS item Chicken & Cheese Croissant required owner confirmation before being linked to the cost-file item Chicken Croissant.

Missing product cost was also treated as unknown rather than zero, allowing Brewlytics to report cost coverage and covered gross profit without presenting an unsupported whole-café gross-profit figure.

### Manual dashboard validation

Ten upload, cleaning and dashboard test cases were executed.

Result: 10/10 passed.

The dashboard was checked against independently calculated July and August ground truth.

| Metric | July 2026 | August 2026 | Change |
|---|---:|---:|---:|
| Net sales | S$4,013.00 | S$3,577.50 | −10.85% |
| Total orders | 598 | 546 | −8.70% |
| Units sold | 656 | 596 | −9.15% |
| Average order value | S$6.71 | S$6.55 | ≈ −2.4% |
| Sales with valid cost coverage | S$3,565.00 | S$3,125.50 | — |
| Item cost on covered sales | S$1,569.30 | S$1,558.30 | — |
| Covered gross profit | S$1,995.70 | S$1,567.20 | −21.47% |
| Cost coverage | 88.84% | 87.37% | −1.47 pp |
| Discounts | S$15.50 | S$51.50 | +S$36.00 |
| Refunds | S$0.00 | S$6.00 | +S$6.00 |

Because Blueberry Muffin has no unit cost, the evaluation deliberately does not treat S$1,567.20 as an exact whole-café gross-profit figure. It represents gross profit only for sales with known product costs.

### Manual AI evaluation

The live investigation agent was evaluated using 10 predefined business questions after the controlled dataset had been cleaned and accepted.

Each response was scored out of eight points:

| Criterion | Maximum |
| --- | ---: |
| Numerical accuracy | 2 |
| Evidence grounding | 2 |
| Correct conclusion | 2 |
| Limitation handling | 1 |
| Clarity and usefulness | 1 |
| Total | 8 |

A response required at least 6/8, the correct main conclusion, and no fabricated evidence or unsupported causal claim to pass.

| Test | Investigation | Score | Result |
| --- | --- | ---: | --- |
| AI-01 | Overall performance change | 8/8 | Pass |
| AI-02 | Largest gross-profit decline contributor | 7/8 | Pass |
| AI-03 | High-margin, lower-volume opportunity | 8/8 | Pass |
| AI-04 | Popular low-margin product | 6/8 | Pass |
| AI-05 | Discount and refund evidence | 8/8 | Pass |
| AI-06 | Channel performance | 8/8 | Pass |
| AI-07 | Missing-cost limitation | 8/8 | Pass |
| AI-08 | Unsupported weather causation | 8/8 | Pass |
| AI-09 | Unsupported net operating profit | 8/8 | Pass |
| AI-10 | Evidence-backed recommendation | 7/8 | Pass |

Manual AI result: 10/10 test cases passed, with a total score of 76/80 (95%).

The evaluation included both answerable and deliberately unsupported questions. For example, the agent was expected to refuse to attribute the August sales decline to bad weather because weather data was not uploaded. It was also expected to state that net operating profit could not be calculated without rent, salaries, utilities and other operating-expense data.

### Key AI evaluation findings

The investigation agent successfully:

- Identified the August decline in sales and orders
- Identified Iced Latte as the largest contributor to the decline in covered gross profit, at approximately S$377.20
- Identified Matcha Latte as a relatively high-margin, lower-volume opportunity
- Identified Chicken & Cheese Croissant as a popular but comparatively low-margin product
- Correctly quantified the increase in discounts and refunds
- Identified Dine-in as the highest-sales August channel
- Refused to provide an unsupported exact whole-café gross-profit figure when product costs were incomplete
- Refused to infer weather causation without weather evidence
- Refused to substitute gross profit for net operating profit
- Produced evidence-backed recommendations without guaranteeing business outcomes

### Limitation discovered during testing

Manual evaluation also exposed an important remaining edge case.

In some product-level responses, a product with missing cost data, such as Blueberry Muffin, can be represented as having S$0 profit or a 0% margin. The correct interpretation is that its profit and margin are unknown because its cost is unavailable.

Aggregate financial reporting already qualifies incomplete cost coverage, but this product-level representation remains an identified limitation for future improvement.

### Overall test result

| Evaluation | Result |
| --- | ---: |
| Vitest automated tests | 94 passed |
| Playwright end-to-end tests | 2 passed |
| Total automated tests | 96 passed |
| Manual upload/cleaning/dashboard tests | 10/10 passed |
| Manual AI test cases | 10/10 passed |
| Manual AI evaluation score | 76/80 (95%) |




The application tests cover upload parsing, automatic and manual cleaning, duplicate handling, KPI calculations, distinct-order counting, cost coverage, deterministic investigation tools and evidence-safety rules. The Lambda tests execute `backend/investigation-agent/index.mjs` directly and cover CORS preflight, request validation, oversized aggregates, successful response structure, Bedrock failures, and empty or malformed model responses.

The Playwright suite uses public, deterministic CSV fixtures to exercise the single-outlet flow from upload through cleaning, dashboard KPIs and an AI investigation. It also verifies that an invalid upload is rejected. Both the browser investigation endpoint and the Lambda Bedrock client are mocked during automated testing, so tests require no AWS credentials and incur no Bedrock charges.

GitHub Actions runs these checks on pushes and pull requests to `main`. Live Bedrock behaviour and subjective AI-response quality still require human evaluation; no completed manual quality evaluation is claimed here.

## Limitations


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

