import { beforeEach, describe, expect, it } from "vitest";
import { handler, setBedrockClientForTests } from "../backend/investigation-agent/index.mjs";

let sendCalls = 0;
let sendImpl: () => unknown;
const testClient = { send: () => { sendCalls += 1; return sendImpl(); } };

const invoke = (body: unknown, method = "POST") =>
  handler({ requestContext: { http: { method } }, body: JSON.stringify(body) });

const businessData = {
  latestLabel: "2026-08",
  previousLabel: "2026-07",
  metrics: { revenue: 60, profit: 36, costsComplete: true, costCoverage: 100 },
  investigation: {
    monthlyProducts: [
      { month: "2026-07", product: "Iced Latte", units: 10, revenue: 50, profit: 30, avgPrice: 5 },
      { month: "2026-08", product: "Iced Latte", units: 12, revenue: 60, profit: 36, avgPrice: 5 },
    ],
    monthlyChannels: [],
    monthlyOutlets: [],
    weekdayProducts: [],
    productPerformance: [],
  },
};

const parsed = (response: { body: string }) => JSON.parse(response.body);

describe("real Lambda investigation handler", () => {
  beforeEach(() => {
    sendCalls = 0;
    sendImpl = () => ({ output: { message: { content: [] } } });
    setBedrockClientForTests(testClient);
  });

  it("handles a CORS preflight request", async () => {
    const response = await invoke({}, "OPTIONS");
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
  });

  it("rejects a missing question", async () => {
    const response = await invoke({ businessData });
    expect(response.statusCode).toBe(400);
    expect(parsed(response)).toMatchObject({ success: false, error: "MissingQuestion" });
  });

  it("rejects missing businessData investigation aggregates", async () => {
    const response = await invoke({ question: "What changed?" });
    expect(response.statusCode).toBe(400);
    expect(parsed(response)).toMatchObject({ success: false, error: "MissingInvestigationData" });
  });

  it("rejects businessData over 100,000 JSON characters", async () => {
    const response = await invoke({
      question: "What changed?",
      businessData: { ...businessData, padding: "x".repeat(100_001) },
    });
    expect(response.statusCode).toBe(400);
    expect(parsed(response)).toMatchObject({ success: false, error: "BusinessDataTooLarge" });
  });

  it("accepts a valid request and returns the documented response structure", async () => {
    const response = await invoke({ question: "Did weather cause the change?", businessData });
    const body = parsed(response);
    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({ success: true, question: "Did weather cause the change?", investigationSteps: 0 });
    expect(body.answer).toEqual(expect.objectContaining({ headline: expect.any(String), limitations: expect.any(String) }));
    expect(body.trail).toEqual([]);
    expect(sendCalls).toBe(0);
  });

  it("returns a deterministic structured fallback when Bedrock is unavailable", async () => {
    sendImpl = () => {
      throw new Error("Bedrock unavailable");
    };
    const response = await invoke({ question: "Which products changed the most?", businessData });
    const body = parsed(response);
    expect(response.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.answer).toEqual(expect.objectContaining({ headline: expect.any(String), findings: expect.any(Array) }));
    expect(body.investigationSteps).toBeGreaterThan(0);
  });

  it.each(["", "not valid JSON"])(
    "handles an empty or malformed model response: %j",
    async (text) => {
      sendImpl = () => ({ output: { message: { content: text ? [{ text }] : [] } } });
      const response = await invoke({ question: "How did Iced Latte perform?", businessData });
      const body = parsed(response);
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.answer).toEqual(expect.objectContaining({ headline: expect.any(String), overview: expect.any(String) }));
    },
  );
});
