import { z } from "zod";
import { AdapterError, shouldUseFixtures, type DataAdapter } from "./types";
import { getEnv } from "../lib/env";
import { logger } from "../lib/logger";
import fixtureResponse from "../../../tests/fixtures/ai-advisor/sample-response.json";

const SOURCE_NAME = "Anthropic API";

/**
 * This is architecturally the same shape as the other adapters (one file
 * that owns a third-party request/response shape, timeout + retry + typed
 * errors, a fixture mode) — the "external data source" here just happens to
 * be an AI provider rather than PVGIS or NESO. It doesn't reuse
 * `fetchJsonWithRetry` from httpClient.ts: that helper is GET-only with no
 * request body or headers, and this call is an authenticated POST with a
 * JSON body — different enough to warrant its own implementation rather
 * than forcing a mismatched shape through the existing helper (the same
 * judgement call already made for `PostcodesIoAdapter` vs. the Phase 2/3
 * adapters — see httpClient.ts's own doc comment).
 */

export interface AdvisorMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiAdvisorInput {
  systemPrompt: string;
  messages: AdvisorMessage[];
}

export interface AiAdvisorOutput {
  text: string;
}

const AnthropicResponseSchema = z.object({
  content: z.array(
    z.object({
      type: z.string(),
      text: z.string().optional(),
    })
  ),
});

export class AiAdvisorAdapter implements DataAdapter<AiAdvisorInput, AiAdvisorOutput> {
  readonly sourceName = SOURCE_NAME;

  async fetch(input: AiAdvisorInput) {
    const json = shouldUseFixtures() ? fixtureResponse : await this.callAnthropic(input);

    const parsed = AnthropicResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new AdapterError({
        kind: "unexpected_response_shape",
        source: SOURCE_NAME,
        message: "The AI provider returned a response we couldn't parse.",
        cause: parsed.error,
      });
    }

    const textBlock = parsed.data.content.find((block) => block.type === "text" && block.text);
    if (!textBlock?.text) {
      throw new AdapterError({
        kind: "unexpected_response_shape",
        source: SOURCE_NAME,
        message: "The AI provider's response did not contain a text answer.",
      });
    }

    return {
      text: textBlock.text,
      _meta: {
        source: SOURCE_NAME,
        retrievedAt: new Date(),
        isFixture: shouldUseFixtures(),
      },
    };
  }

  private async callAnthropic(input: AiAdvisorInput): Promise<unknown> {
    const env = getEnv();
    if (!env.ANTHROPIC_API_KEY) {
      throw new AdapterError({
        kind: "invalid_input",
        source: SOURCE_NAME,
        message: "No AI provider API key is configured.",
      });
    }

    const timeoutMs = 20000; // LLM calls legitimately take longer than a data-lookup adapter
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          // Verify this against Anthropic's current API docs before relying
          // on it in production — API versions and model identifiers move;
          // this project has no way to check that from this environment
          // (see DATA_SOURCES.md's verification caveat, same principle).
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: env.ANTHROPIC_MODEL,
          max_tokens: 1024,
          system: input.systemPrompt,
          messages: input.messages,
        }),
      });
    } catch (err) {
      clearTimeout(timeout);
      logger.error("AI Advisor request failed", { err: String(err) });
      throw new AdapterError({
        kind: "temporarily_unavailable",
        source: SOURCE_NAME,
        message: "Could not reach the AI provider. Please try again shortly.",
        cause: err,
      });
    }
    clearTimeout(timeout);

    if (response.status === 429) {
      throw new AdapterError({
        kind: "rate_limited",
        source: SOURCE_NAME,
        message: "The AI provider is temporarily rate-limiting requests.",
      });
    }
    if (!response.ok) {
      throw new AdapterError({
        kind: response.status >= 500 ? "temporarily_unavailable" : "invalid_input",
        source: SOURCE_NAME,
        message: `The AI provider returned an unexpected status: ${response.status}`,
      });
    }

    try {
      return await response.json();
    } catch (err) {
      throw new AdapterError({
        kind: "unexpected_response_shape",
        source: SOURCE_NAME,
        message: "The AI provider returned a response we couldn't parse.",
        cause: err,
      });
    }
  }
}
