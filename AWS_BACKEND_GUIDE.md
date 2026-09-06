# Brewlytics AWS backend integration

The current Brewlytics site analyses files locally in the browser. Add the AWS backend in a second phase so the existing upload and dashboard remain usable while the chatbot gains server-side LLM responses.

## Recommended architecture

1. **Amazon API Gateway** exposes `POST /recommendations` over HTTPS.
2. **AWS Lambda** validates the request, calculates a compact business summary, and calls Amazon Bedrock.
3. **Amazon Bedrock** generates prescriptive recommendations from summary metrics and ranked product data. Start with a model available in your AWS region, such as an Anthropic Claude model through Bedrock.
4. **Amazon S3** is optional for encrypted source-file storage. Do not store uploads by default; keep the current browser-only parsing unless report history is required.
5. **Amazon DynamoDB** is optional for saved analysis sessions and conversation history.
6. **Amazon Cognito** is optional when café owners need accounts and private saved reports.

## API contract

Request:

```json
{
  "question": "How can I improve profit next month?",
  "analysis": {
    "period": "2026-08",
    "revenue": 2521,
    "profit": 1824,
    "profitChangePct": 15.0,
    "topProducts": [{"name": "Flat White", "units": 120, "profit": 420}],
    "bottomProducts": [{"name": "Kopi O", "units": 80, "profit": 90}],
    "warnings": []
  }
}
```

Response:

```json
{
  "answer": "Prioritise Flat White promotion while reviewing Kopi O margin...",
  "confidence": 0.78,
  "evidence": ["Flat White contributed S$420", "Profit rose 15.0%"],
  "disclaimer": "Recommendation, not a guaranteed outcome."
}
```

## Lambda implementation steps

1. Create a Node.js 22 Lambda function.
2. Give its execution role only `bedrock:InvokeModel` for the selected model ARN and CloudWatch Logs permissions.
3. Validate request size, required metrics, and allowed origins.
4. Send only aggregated metrics to Bedrock—not entire POS rows or customer-level data.
5. Use a system prompt that requires evidence citations from the supplied metrics, uncertainty language, and no guaranteed claims.
6. Return JSON containing `answer`, `confidence`, `evidence`, and `disclaimer`.
7. Add API Gateway throttling, request limits, and AWS WAF before public use.

## Connect the web app

Add a hosted environment variable named `NEXT_PUBLIC_BREWLYTICS_API_URL`, then replace the local response function in the `Chatbot` component with:

```ts
const response = await fetch(`${process.env.NEXT_PUBLIC_BREWLYTICS_API_URL}/recommendations`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ question: prompt, analysis: compactAnalysis }),
});
if (!response.ok) throw new Error("Recommendation service unavailable");
const result = await response.json();
```

Keep the current deterministic response as a fallback when the AWS endpoint is unavailable.

## Security checklist

- Never place AWS access keys in browser code.
- Use Lambda IAM roles and Secrets Manager for server-side secrets.
- Encrypt S3 and DynamoDB with AWS KMS if storage is enabled.
- Strip customer names, phone numbers, order IDs, and other personal data before LLM requests.
- Configure API Gateway CORS for the Brewlytics production domain only.
- Log request IDs and errors, but not raw POS records or prompts containing sensitive data.
- Add monthly Bedrock budget alerts and API throttling before demonstrations.
