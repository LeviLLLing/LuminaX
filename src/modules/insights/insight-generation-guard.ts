export interface InsightGenerationToken {
  userId: string;
  requestId: string;
  startedAt: number;
}

export class InsightGenerationGuard {
  private readonly latest = new Map<string, InsightGenerationToken>();

  claim(token: InsightGenerationToken): boolean {
    const current = this.latest.get(token.userId);
    if (current && compareTokens(token, current) < 0) return false;
    this.latest.set(token.userId, token);
    return true;
  }

  isCurrent(token: InsightGenerationToken): boolean {
    const current = this.latest.get(token.userId);
    return Boolean(
      current &&
        current.requestId === token.requestId &&
        current.startedAt === token.startedAt
    );
  }
}

function compareTokens(
  left: InsightGenerationToken,
  right: InsightGenerationToken
): number {
  return (
    left.startedAt - right.startedAt ||
    left.requestId.localeCompare(right.requestId)
  );
}
