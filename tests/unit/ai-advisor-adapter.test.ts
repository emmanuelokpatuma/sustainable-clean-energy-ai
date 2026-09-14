import { describe, it, expect, afterEach, vi } from "vitest";
import { AiAdvisorAdapter } from "@/server/adapters/aiAdvisorAdapter";
import { AdapterError } from "@/server/adapters/types";

describe("AiAdvisorAdapter", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns the fixture's text when USE_FIXTURE_DATA is true", async () => {
    process.env.USE_FIXTURE_DATA = "true";
    const adapter = new AiAdvisorAdapter();

    const result = await adapter.fetch({ systemPrompt: "system", messages: [{ role: "user", content: "hi" }] });

    expect(result.text).toContain("GreenScore of 74/100");
    expect(result._meta.source).toBe("Anthropic API");
    expect(result._meta.isFixture).toBe(true);
  });

  it("throws invalid_input when no API key is configured", async () => {
    process.env.USE_FIXTURE_DATA = "false";
    delete process.env.ANTHROPIC_API_KEY;

    const adapter = new AiAdvisorAdapter();
    await expect(
      adapter.fetch({ systemPrompt: "s", messages: [{ role: "user", content: "hi" }] })
    ).rejects.toMatchObject({ kind: "invalid_input" } satisfies Partial<AdapterError>);
  });

  it("throws temporarily_unavailable when the network call fails", async () => {
    process.env.USE_FIXTURE_DATA = "false";
    process.env.ANTHROPIC_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const adapter = new AiAdvisorAdapter();
    await expect(
      adapter.fetch({ systemPrompt: "s", messages: [{ role: "user", content: "hi" }] })
    ).rejects.toMatchObject({ kind: "temporarily_unavailable" });
  });

  it("throws rate_limited on a 429", async () => {
    process.env.USE_FIXTURE_DATA = "false";
    process.env.ANTHROPIC_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) } as unknown as Response)
    );

    const adapter = new AiAdvisorAdapter();
    await expect(
      adapter.fetch({ systemPrompt: "s", messages: [{ role: "user", content: "hi" }] })
    ).rejects.toMatchObject({ kind: "rate_limited" });
  });

  it("throws unexpected_response_shape when the response has no text block", async () => {
    process.env.USE_FIXTURE_DATA = "false";
    process.env.ANTHROPIC_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ content: [{ type: "tool_use" }] }),
      } as unknown as Response)
    );

    const adapter = new AiAdvisorAdapter();
    await expect(
      adapter.fetch({ systemPrompt: "s", messages: [{ role: "user", content: "hi" }] })
    ).rejects.toMatchObject({ kind: "unexpected_response_shape" });
  });

  it("sends the API key and model in the request, never in a client-visible field", async () => {
    process.env.USE_FIXTURE_DATA = "false";
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.ANTHROPIC_MODEL = "claude-test-model";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: "text", text: "answer" }] }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new AiAdvisorAdapter();
    await adapter.fetch({ systemPrompt: "sys", messages: [{ role: "user", content: "hi" }] });

    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((options.headers as Record<string, string>)["x-api-key"]).toBe("test-key");
    const body = JSON.parse(options.body as string);
    expect(body.model).toBe("claude-test-model");
    expect(body.system).toBe("sys");
  });
});
