/**
 * Runs `advisor-eval-dataset.ts` against the REAL AiAdvisorService (a real
 * model call — this deliberately does NOT set USE_FIXTURE_DATA, since
 * fixture mode would just replay one canned answer and tell us nothing
 * about actual model behaviour).
 *
 * THIS HAS NOT BEEN RUN in this environment — no network access, no live
 * ANTHROPIC_API_KEY. See PROGRESS.md's Phase 7 entry. Run it yourself once
 * you have both:
 *
 *   ANTHROPIC_API_KEY=sk-... npx tsx tests/eval/run-advisor-eval.ts
 *
 * WHAT THIS SCRIPT CAN AND CANNOT TELL YOU
 * The automated checks below (substring presence/absence, a heuristic
 * number-leakage scan) are a first-pass net, not a substitute for actually
 * reading the transcripts. A case can pass every automated check and still
 * be a bad answer (e.g. technically containing "estimate" while still
 * reading as a confident promise) — and a case can fail an automated check
 * for a harmless reason (e.g. writing "£1.0k" instead of "£1,000", which the
 * number-leakage check isn't sophisticated enough to parse). Treat a run of
 * this script as a starting point for review, not a certificate.
 *
 * PRODUCT_SPEC.md is explicit that the AI Advisor should not be considered
 * complete until this evaluation has actually been run — do that before
 * shipping any advisor-facing feature built on top of Phase 7.
 */

import { ADVISOR_EVAL_DATASET, type AdvisorEvalCase } from "./advisor-eval-dataset";
import { AiAdvisorService } from "../../src/server/services/aiAdvisorService";

interface CaseResult {
  id: string;
  category: string;
  question: string;
  passed: boolean;
  failures: string[];
  answer: string | null;
  error?: string;
}

/** Extracts standalone numeric tokens (ignoring ones embedded in words) for the leakage heuristic. */
function extractNumbers(text: string): string[] {
  return (text.match(/\d[\d,]*\.?\d*/g) ?? []).map((n) => n.replace(/,/g, ""));
}

function renderContextNumbersForComparison(caseItem: AdvisorEvalCase): Set<string> {
  // Cheap and deliberately permissive: stringify the whole grounding context
  // and pull every number out of it. A number in the model's answer that
  // doesn't appear ANYWHERE in this set is worth a human's attention — it
  // is a heuristic flag, not proof of fabrication (percentages, list
  // indices, and re-derived arithmetic can legitimately appear here too).
  const json = JSON.stringify(caseItem.groundingContext);
  return new Set(extractNumbers(json));
}

function evaluateCase(caseItem: AdvisorEvalCase, answer: string): string[] {
  const failures: string[] = [];
  const lower = answer.toLowerCase();

  for (const phrase of caseItem.expected.mustMentionAll ?? []) {
    if (!lower.includes(phrase.toLowerCase())) {
      failures.push(`missing required phrase: "${phrase}"`);
    }
  }

  if (caseItem.expected.mustMentionAny && caseItem.expected.mustMentionAny.length > 0) {
    const found = caseItem.expected.mustMentionAny.some((p) => lower.includes(p.toLowerCase()));
    if (!found) {
      failures.push(`none of the acceptable phrases found: ${caseItem.expected.mustMentionAny.join(" / ")}`);
    }
  }

  for (const phrase of caseItem.expected.mustNotMention ?? []) {
    if (lower.includes(phrase.toLowerCase())) {
      failures.push(`forbidden phrase present: "${phrase}"`);
    }
  }

  if (caseItem.expected.mustRecommendProfessional) {
    const professionalTerms = ["professional", "qualified", "certified", "installer", "engineer", "electrician"];
    if (!professionalTerms.some((t) => lower.includes(t))) {
      failures.push("expected a professional/qualified-installer recommendation but found none");
    }
  }

  if (caseItem.expected.checkNumberGrounding) {
    const contextNumbers = renderContextNumbersForComparison(caseItem);
    const answerNumbers = extractNumbers(answer);
    for (const n of answerNumbers) {
      // Ignore tiny numbers (1, 2, 3...) — almost always list markers or
      // ordinary language ("first", "a couple"), not fabricated data points.
      if (n.length <= 1) continue;
      if (!contextNumbers.has(n)) {
        failures.push(`possible ungrounded number in answer: "${n}" (not found anywhere in the supplied context — verify by hand)`);
      }
    }
  }

  return failures;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "ANTHROPIC_API_KEY is not set. This script calls the real Anthropic API and needs a real key — refusing to run against fixtures, since that would prove nothing about actual model behaviour."
    );
    process.exit(1);
  }
  if (process.env.USE_FIXTURE_DATA === "true") {
    console.error("USE_FIXTURE_DATA=true is set — unset it. This eval must run against the live model.");
    process.exit(1);
  }

  const service = new AiAdvisorService();
  const results: CaseResult[] = [];

  for (const caseItem of ADVISOR_EVAL_DATASET) {
    process.stdout.write(`Running ${caseItem.id}... `);
    const outcome = await service.ask({
      groundingContext: caseItem.groundingContext,
      conversationHistory: caseItem.conversationHistory,
      question: caseItem.question,
    });

    if (!outcome.ok) {
      results.push({
        id: caseItem.id,
        category: caseItem.category,
        question: caseItem.question,
        passed: false,
        failures: [`service call failed: ${outcome.message}`],
        answer: null,
        error: outcome.message,
      });
      console.log("ERROR");
      continue;
    }

    const failures = evaluateCase(caseItem, outcome.data.answer);
    results.push({
      id: caseItem.id,
      category: caseItem.category,
      question: caseItem.question,
      passed: failures.length === 0,
      failures,
      answer: outcome.data.answer,
    });
    console.log(failures.length === 0 ? "PASS" : `FLAGGED (${failures.length})`);
  }

  const passCount = results.filter((r) => r.passed).length;
  console.log(`\n${passCount}/${results.length} cases passed automated checks.\n`);

  const flagged = results.filter((r) => !r.passed);
  if (flagged.length > 0) {
    console.log("=== FLAGGED CASES (read the transcripts — this is not a pass/fail certificate) ===\n");
    for (const r of flagged) {
      console.log(`[${r.id}] (${r.category}) "${r.question}"`);
      for (const f of r.failures) console.log(`  - ${f}`);
      if (r.answer) console.log(`  Answer: ${r.answer}\n`);
    }
  }

  // Write a full transcript for human review regardless of pass/fail —
  // reading every answer is the real evaluation, this file is what to read.
  const fs = await import("fs");
  const outPath = "tests/eval/last-run-transcript.json";
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Full transcript written to ${outPath} — read every answer before considering Phase 7 complete.`);
}

main().catch((err) => {
  console.error("Eval run failed:", err);
  process.exit(1);
});
