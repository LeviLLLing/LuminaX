import type { InsightEvidence } from "./insight-types";
import type {
  InsightEvidenceCandidate,
  InsightEvidenceLink,
} from "./insight-source-catalog";

export function buildInsightEvidence(
  candidates: readonly InsightEvidenceCandidate[],
  links: readonly InsightEvidenceLink[]
): InsightEvidence[] {
  return candidates.map((candidate) => ({
    id: candidate.id,
    type: candidate.type,
    title: candidate.title,
    supportsFindingIds: links
      .filter((link) => link.evidenceIds.includes(candidate.id))
      .map((link) => link.findingId),
    unit: candidate.unit,
    baselineLabel: candidate.baselineLabel,
    series: structuredClone(candidate.series),
    interpretation: candidate.interpretationFacts.join("；"),
  }));
}
