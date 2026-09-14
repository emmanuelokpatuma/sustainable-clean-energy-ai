import { describe, it, expect, vi } from "vitest";
import { AiAdvisorService } from "@/server/services/aiAdvisorService";
import { AiAdvisorAdapter } from "@/server/adapters/aiAdvisorAdapter";
import { AdapterError } from "@/server/adapters/types";

function mockAdapter(text = "an answer") {
  const adapter = new AiAdvisorAdapter();
  vi.spyOn(adapter, "fetch").mockResolvedValue({
    text,
    _meta: { source: "Anthropic API", retrievedAt: new Date(), isFixture: true },
  });
  return adapter;
}

describe("AiAdvisorService.ask — input validation", () => {
  it("rejects an empty question without calling the adapter", async () => {
    const adapter = mockAdapter();
    const fetchSpy = vi.spyOn(adapter, "fetch");
    const service = new AiAdvisorService(adapter);

    const result = await service.ask({ groundingContext: {}, question: "   " });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorKind).toBe("invalid_input");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a question over the length limit", async () => {
    const adapter = mockAdapter();
    const service = new AiAdvisorService(adapter);

    const result = await service.ask({ groundingContext: {}, question: "a".repeat(2001) });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/too long/i);
  });
});

describe("AiAdvisorService.ask — success and grounding summary", () => {
  it("returns the adapter's answer and an accurate grounding summary", async () => {
    const adapter = mockAdapter("Here is your answer.");
    const service = new AiAdvisorService(adapter);

    const result = await service.ask({
      groundingContext: {
        location: { postcodeOutward: "SW1A", region: "London", adminDistrict: "Westminster" },
        greenScore: null,
        solarScore: null,
        energyNow: null,
        recommendations: null,
      },
      question: "What should I do first?",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.answer).toBe("Here is your answer.");
      expect(result.data.isFixture).toBe(true); // Phase 11: must propagate, not be dropped
      expect(result.data.groundingSummary).toEqual({
        location: true,
        greenScore: false,
        solarScore: false,
        energyNow: false,
        recommendations: false,
      });
    }
  });
});

describe("AiAdvisorService.ask — conversation history minimisation", () => {
  it("caps history to the last 12 messages before calling the adapter", async () => {
    const adapter = mockAdapter();
    const fetchSpy = vi.spyOn(adapter, "fetch");
    const service = new AiAdvisorService(adapter);

    const longHistory = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as const,
      content: `message ${i}`,
    }));

    await service.ask({ groundingContext: {}, conversationHistory: longHistory, question: "latest question" });

    const callArgs = fetchSpy.mock.calls[0]![0];
    // 12 capped history messages + the new question = 13
    expect(callArgs.messages).toHaveLength(13);
    expect(callArgs.messages[callArgs.messages.length - 1]).toEqual({
      role: "user",
      content: "latest question",
    });
    // The oldest retained history message should be "message 8" (20 - 12 = 8 dropped from the front)
    expect(callArgs.messages[0]!.content).toBe("message 8");
  });

  it("truncates an over-length history message rather than rejecting the whole request", async () => {
    const adapter = mockAdapter();
    const fetchSpy = vi.spyOn(adapter, "fetch");
    const service = new AiAdvisorService(adapter);

    await service.ask({
      groundingContext: {},
      conversationHistory: [{ role: "user", content: "x".repeat(5000) }],
      question: "ok",
    });

    const callArgs = fetchSpy.mock.calls[0]![0];
    expect(callArgs.messages[0]!.content.length).toBe(2000);
  });
});

describe("AiAdvisorService.ask — error mapping", () => {
  it("maps a temporarily_unavailable AdapterError to errorKind 'unavailable'", async () => {
    const adapter = new AiAdvisorAdapter();
    vi.spyOn(adapter, "fetch").mockRejectedValue(
      new AdapterError({ kind: "temporarily_unavailable", source: "Anthropic API", message: "down" })
    );
    const service = new AiAdvisorService(adapter);

    const result = await service.ask({ groundingContext: {}, question: "hi" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorKind).toBe("unavailable");
  });

  it("maps an invalid_input AdapterError (e.g. missing API key) to a safe, non-leaky message", async () => {
    const adapter = new AiAdvisorAdapter();
    vi.spyOn(adapter, "fetch").mockRejectedValue(
      new AdapterError({ kind: "invalid_input", source: "Anthropic API", message: "No AI provider API key is configured." })
    );
    const service = new AiAdvisorService(adapter);

    const result = await service.ask({ groundingContext: {}, question: "hi" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorKind).toBe("invalid_input");
      // The internal "no API key configured" detail should not leak verbatim to the client.
      expect(result.message).not.toMatch(/api key/i);
    }
  });

  it("does not throw on an unexpected non-AdapterError", async () => {
    const adapter = new AiAdvisorAdapter();
    vi.spyOn(adapter, "fetch").mockRejectedValue(new Error("boom"));
    const service = new AiAdvisorService(adapter);

    const result = await service.ask({ groundingContext: {}, question: "hi" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorKind).toBe("unavailable");
  });
});
