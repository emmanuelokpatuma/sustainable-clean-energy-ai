import { AiAdvisorAdapter, type AdvisorMessage } from "../adapters/aiAdvisorAdapter";
import { AdapterError } from "../adapters/types";
import { renderGroundingContext, type GroundingContextInput } from "../advisor/groundingContext";
import { ADVISOR_SYSTEM_PROMPT, wrapGroundingContext } from "../advisor/systemPrompt";
import { logger } from "../lib/logger";

// PRODUCT_SPEC.md, Phase 7: "Store only the minimum necessary conversation
// data." Enforced here at the service boundary, not left to the caller —
// even if a client sent a longer history, this is the actual limit applied.
const MAX_HISTORY_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 2000;

export interface AskAdvisorInput {
  groundingContext: GroundingContextInput;
  conversationHistory?: AdvisorMessage[];
  question: string;
}

export interface AskAdvisorOutput {
  answer: string;
  /** Which grounding sections were actually available, for UI transparency — not the raw context text. */
  groundingSummary: {
    location: boolean;
    greenScore: boolean;
    solarScore: boolean;
    energyNow: boolean;
    recommendations: boolean;
  };
}

export type AskAdvisorResult =
  | { ok: true; data: AskAdvisorOutput }
  | { ok: false; errorKind: "invalid_input" | "unavailable"; message: string };

/**
 * The single entry point for asking the AI Advisor a question. Same shape as
 * every other Phase 1–3 service: translate adapter errors into a safe
 * Result, never let an AdapterError escape to a route handler.
 */
export class AiAdvisorService {
  private readonly adapter: AiAdvisorAdapter;

  constructor(adapter: AiAdvisorAdapter = new AiAdvisorAdapter()) {
    this.adapter = adapter;
  }

  async ask(input: AskAdvisorInput): Promise<AskAdvisorResult> {
    const question = input.question?.trim();
    if (!question) {
      return { ok: false, errorKind: "invalid_input", message: "A question is required." };
    }
    if (question.length > MAX_MESSAGE_LENGTH) {
      return {
        ok: false,
        errorKind: "invalid_input",
        message: `Question is too long (max ${MAX_MESSAGE_LENGTH} characters).`,
      };
    }

    const history = minimiseHistory(input.conversationHistory ?? []);

    const renderedContext = renderGroundingContext(input.groundingContext);
    const systemPrompt = `${ADVISOR_SYSTEM_PROMPT}\n\n${wrapGroundingContext(renderedContext)}`;

    const messages: AdvisorMessage[] = [...history, { role: "user", content: question }];

    try {
      const result = await this.adapter.fetch({ systemPrompt, messages });
      return {
        ok: true,
        data: {
          answer: result.text,
          groundingSummary: {
            location: !!input.groundingContext.location,
            greenScore: !!input.groundingContext.greenScore,
            solarScore: !!input.groundingContext.solarScore,
            energyNow: !!input.groundingContext.energyNow,
            recommendations: !!(
              input.groundingContext.recommendations && input.groundingContext.recommendations.length > 0
            ),
          },
        },
      };
    } catch (err) {
      if (err instanceof AdapterError) {
        logger.warn("AI Advisor unavailable", { kind: err.kind, source: err.source });
        if (err.kind === "invalid_input") {
          return {
            ok: false,
            errorKind: "invalid_input",
            message: "The AI Advisor is not configured correctly. Please try again later.",
          };
        }
        return {
          ok: false,
          errorKind: "unavailable",
          message: "The AI Advisor is temporarily unavailable. Please try again shortly.",
        };
      }
      logger.error("Unexpected error calling the AI Advisor", { err: String(err) });
      return {
        ok: false,
        errorKind: "unavailable",
        message: "Something went wrong reaching the AI Advisor.",
      };
    }
  }
}

/** Caps history length and per-message length — never trust the caller's own limits. */
function minimiseHistory(history: AdvisorMessage[]): AdvisorMessage[] {
  return history
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_LENGTH) }));
}
