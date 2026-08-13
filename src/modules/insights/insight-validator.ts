import { createHash, randomUUID as createRandomUUID } from "node:crypto";
import type { DataAccessRequirement } from "@/modules/admin/permissions/permission-types";
import type { AnalysisIntent } from "@/modules/domain/analysis-types";
import { buildInsightEvidence } from "./evidence-builder";
import type { InsightSourceCatalog } from "./insight-source-catalog";
import type { InsightDraft, InsightScope, InsightSnapshot } from "./insight-types";

export class InsightValidationError extends Error {
  constructor(readonly code: string, message = code) {
    super(message);
    this.name = "InsightValidationError";
  }
}

export interface MaterializeInsightSnapshotInput {
  userId: string;
  question: string;
  intent: AnalysisIntent;
  scope: InsightScope;
  catalog: InsightSourceCatalog;
  draft: InsightDraft;
  accessRequirements: DataAccessRequirement[];
  now?: () => Date;
  randomUUID?: () => string;
}

export function containsNumericClaim(value: string): boolean {
  return /[0-9０-９%％¥￥]/.test(value) ||
    /第[零〇一二两三四五六七八九十百千万亿]+/.test(value) ||
    /(?:零|〇|一|二|两|三|四|五|六|七|八|九|十|百|千|万|亿|点)+(?:元|单|笔|家|店|天|日|周|月|年|成|倍|个)/.test(value);
}

export function materializeInsightSnapshot(input: MaterializeInsightSnapshotInput): InsightSnapshot {
  const { draft, catalog } = input;
  validateDraftProse(draft);
  if (draft.findings.length < 3 || draft.findings.length > 5 || draft.actions.length < 2 || draft.actions.length > 5 || draft.verificationItems.length > 3) {
    throw new InsightValidationError("INVALID_CARDINALITY");
  }
  const sourceIds = draft.findings.map((finding) => finding.sourceId);
  if (new Set(sourceIds).size !== sourceIds.length) throw new InsightValidationError("DUPLICATE_FINDING_SOURCE");
  assertUniqueCatalogIds(catalog.findingSources.map((source) => source.id), "DUPLICATE_SOURCE_ID");
  assertUniqueCatalogIds(catalog.evidenceCandidates.map((candidate) => candidate.id), "DUPLICATE_EVIDENCE_ID");

  const uuid = input.randomUUID || createRandomUUID;
  const now = (input.now || (() => new Date()))().toISOString();
  const sources = new Map(catalog.findingSources.map((source) => [source.id, source]));
  const candidates = new Map(catalog.evidenceCandidates.map((candidate) => [candidate.id, candidate]));
  const evidenceReferences = new Set<string>();
  const links: Array<{ findingId: string; evidenceIds: string[] }> = [];

  const findings = draft.findings.map((finding) => {
    const source = sources.get(finding.sourceId);
    if (!source) throw new InsightValidationError("UNKNOWN_SOURCE_ID");
    if (!Number.isFinite(source.value)) throw new InsightValidationError("NON_FINITE_SOURCE_VALUE");
    if (finding.evidenceIds.length === 0 || new Set(finding.evidenceIds).size !== finding.evidenceIds.length) throw new InsightValidationError("INVALID_EVIDENCE_REFERENCE");
    for (const evidenceId of finding.evidenceIds) {
      const candidate = candidates.get(evidenceId);
      if (!candidate) throw new InsightValidationError("UNKNOWN_EVIDENCE_ID");
      if (candidate.series.length === 0) throw new InsightValidationError("EMPTY_EVIDENCE");
      if (candidate.series.some((item) => !Number.isFinite(item.value) || (item.baseline !== undefined && !Number.isFinite(item.baseline)))) {
        throw new InsightValidationError("NON_FINITE_EVIDENCE_VALUE");
      }
      if (!source.evidenceCandidateIds.includes(evidenceId)) throw new InsightValidationError("UNSUPPORTED_EVIDENCE_REFERENCE");
      if (
        candidate.unit !== source.unit ||
        !candidate.series.some(
          (item) => item.value === source.value || item.baseline === source.value
        )
      ) {
        throw new InsightValidationError("UNSUPPORTED_EVIDENCE_FACT");
      }
      evidenceReferences.add(evidenceId);
    }
    const id = uuid();
    links.push({ findingId: id, evidenceIds: finding.evidenceIds });
    return {
      id,
      title: finding.title,
      summary: finding.summary,
      severity: finding.severity,
      confidence: finding.confidence,
      subjectIds: [...source.subjectIds],
      metricCode: source.metricCode,
      value: source.value,
      unit: source.unit,
      displayValue: source.displayValue,
      evidenceIds: [...finding.evidenceIds],
    };
  });

  const referencedCandidates = [...evidenceReferences].map((id) => candidates.get(id)!);
  const builtEvidence = buildInsightEvidence(referencedCandidates, links);
  const evidenceIdMap = new Map<string, string>();
  const evidence = builtEvidence.map((item) => {
    const id = uuid();
    evidenceIdMap.set(item.id, id);
    return { ...item, id };
  });
  for (const finding of findings) finding.evidenceIds = finding.evidenceIds.map((id) => evidenceIdMap.get(id)!);

  const verificationItems = draft.verificationItems.map((item) => ({ id: uuid(), ...item }));
  const actions = draft.actions.map((action) => {
    const verificationMetricLabel = catalog.verificationMetricLabels[action.verificationMetricCode];
    if (!verificationMetricLabel) throw new InsightValidationError("UNKNOWN_VERIFICATION_METRIC");
    return { id: uuid(), ...action, verificationMetricLabel, completed: false, completedAt: null };
  });

  return {
    id: uuid(),
    userId: input.userId,
    sourceQuestion: input.question,
    sourceIntent: input.intent,
    scope: structuredClone(input.scope),
    headline: draft.headline,
    findings,
    evidence,
    verificationItems,
    actions,
    accessRequirements: structuredClone(input.accessRequirements),
    sourceFingerprint: fingerprint(input),
    createdAt: now,
    updatedAt: now,
  };
}

function assertUniqueCatalogIds(ids: string[], code: string): void {
  if (new Set(ids).size !== ids.length) {
    throw new InsightValidationError(code);
  }
}

function validateDraftProse(draft: InsightDraft): void {
  const prose = [
    draft.headline,
    ...draft.findings.flatMap((finding) => [finding.title, finding.summary]),
    ...draft.verificationItems.flatMap((item) => [item.observedFact, item.hypothesis, item.requiredCheck]),
    ...draft.actions.map((action) => action.title),
  ];
  if (prose.some((value) => typeof value !== "string" || value.trim().length === 0 || containsNumericClaim(value))) {
    throw new InsightValidationError("UNSUPPORTED_NUMERIC_PROSE");
  }
}

function fingerprint(input: MaterializeInsightSnapshotInput): string {
  const payload = {
    userId: input.userId,
    intent: input.intent,
    storeIds: [...input.scope.storeIds].sort(),
    startDate: input.scope.startDate,
    endDate: input.scope.endDate,
    catalog: input.catalog,
  };
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
