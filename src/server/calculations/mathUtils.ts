/**
 * Small, pure math helpers shared by the calculation engines
 * (`greenScore.ts`, `solarScore.ts`). No I/O, no dependencies — extracted
 * here because both engines needed the same three functions verbatim, and
 * duplicating them risked the two engines' "High/Medium/Low" bucketing or
 * interpolation drifting apart silently. Nothing behavioural changed when
 * these were pulled out of `greenScore.ts` — see PROGRESS.md's Phase 5 entry
 * — its existing tests are the proof nothing broke.
 */

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Piecewise-linear interpolation between (x0,y0) and (x1,y1), clamped outside the range. */
export function lerpScore(x: number, x0: number, y0: number, x1: number, y1: number): number {
  if (x <= x0) return y0;
  if (x >= x1) return y1;
  return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
}

/** The project-wide convention: >=70 High, >=40 Medium, else Low. */
export function levelFor(score: number): "High" | "Medium" | "Low" {
  if (score >= 70) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}
