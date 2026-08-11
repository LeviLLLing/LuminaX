const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 5;

interface AttemptState {
  failures: number[];
}

export class LoginAttemptLimiter {
  private readonly attempts = new Map<string, AttemptState>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  canAttempt(key: string): boolean {
    const failures = this.currentFailures(key);
    return failures.length < MAX_FAILURES;
  }

  recordFailure(key: string): void {
    const failures = this.currentFailures(key);
    failures.push(this.now());
    this.attempts.set(key, { failures });
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }

  private currentFailures(key: string): number[] {
    const cutoff = this.now() - WINDOW_MS;
    const failures = (this.attempts.get(key)?.failures || []).filter(
      (timestamp) => timestamp > cutoff
    );
    if (failures.length === 0) this.attempts.delete(key);
    else this.attempts.set(key, { failures });
    return failures;
  }
}

