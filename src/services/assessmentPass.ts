/** Hydrafacial / Women Straight Finish assessment pass mark (inclusive). */
export const ASSESSMENT_PASS_PERCENT = 60;

export function didPassAssessment(scorePercent: number): boolean {
  return Number.isFinite(scorePercent) && scorePercent >= ASSESSMENT_PASS_PERCENT;
}
