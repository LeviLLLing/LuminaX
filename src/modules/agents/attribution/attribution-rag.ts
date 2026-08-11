export interface AttributionRagQuery {
  question: string;
  analysisData: Record<string, unknown>;
}

export interface AttributionKnowledgeDocument {
  id: string;
  title: string;
  content: string;
  source?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface AttributionKnowledgeRetriever {
  retrieve(
    query: AttributionRagQuery
  ): Promise<AttributionKnowledgeDocument[]>;
}

export class NoopAttributionKnowledgeRetriever
  implements AttributionKnowledgeRetriever
{
  async retrieve(): Promise<AttributionKnowledgeDocument[]> {
    return [];
  }
}
