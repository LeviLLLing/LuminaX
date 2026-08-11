import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AuthSessionPayload } from "./auth-types";

export const AUTH_COOKIE_NAME = "luminax_session";
export const AUTH_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export class SessionManager {
  private secretPromise: Promise<Buffer> | null = null;

  constructor(
    private readonly secretPath =
      process.env.LUMINAX_SESSION_SECRET_PATH ||
      join(process.cwd(), ".luminax", "session-secret.key"),
    private readonly now: () => Date = () => new Date()
  ) {}

  async issue(
    userId: string,
    credentialVersion: string
  ): Promise<{ token: string; expiresAt: Date }> {
    const issuedAt = this.now().getTime();
    const expiresAt = new Date(
      issuedAt + AUTH_SESSION_MAX_AGE_SECONDS * 1000
    );
    const payload: AuthSessionPayload = {
      userId,
      credentialVersion,
      issuedAt,
      expiresAt: expiresAt.getTime(),
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      "base64url"
    );
    const signature = await this.sign(encodedPayload);
    return { token: `${encodedPayload}.${signature}`, expiresAt };
  }

  async verify(token: string): Promise<AuthSessionPayload | null> {
    const [encodedPayload, suppliedSignature, extra] = token.split(".");
    if (!encodedPayload || !suppliedSignature || extra) return null;
    const expectedSignature = await this.sign(encodedPayload);
    const supplied = Buffer.from(suppliedSignature, "base64url");
    const expected = Buffer.from(expectedSignature, "base64url");
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      return null;
    }

    try {
      const payload = JSON.parse(
        Buffer.from(encodedPayload, "base64url").toString("utf8")
      ) as Partial<AuthSessionPayload>;
      if (
        typeof payload.userId !== "string" ||
        typeof payload.credentialVersion !== "string" ||
        typeof payload.issuedAt !== "number" ||
        typeof payload.expiresAt !== "number" ||
        payload.expiresAt <= this.now().getTime()
      ) {
        return null;
      }
      return payload as AuthSessionPayload;
    } catch {
      return null;
    }
  }

  private async sign(payload: string): Promise<string> {
    const secret = await this.getSecret();
    return createHmac("sha256", secret).update(payload).digest("base64url");
  }

  private getSecret(): Promise<Buffer> {
    if (!this.secretPromise) this.secretPromise = this.loadOrCreateSecret();
    return this.secretPromise;
  }

  private async loadOrCreateSecret(): Promise<Buffer> {
    const configuredSecret = process.env.LUMINAX_SESSION_SECRET?.trim();
    if (configuredSecret) return Buffer.from(configuredSecret, "utf8");

    try {
      const secret = (await readFile(this.secretPath, "utf8")).trim();
      if (secret) return Buffer.from(secret, "base64url");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    await mkdir(dirname(this.secretPath), { recursive: true });
    const generated = randomBytes(32).toString("base64url");
    try {
      await writeFile(this.secretPath, `${generated}\n`, {
        encoding: "utf8",
        flag: "wx",
      });
      return Buffer.from(generated, "base64url");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = (await readFile(this.secretPath, "utf8")).trim();
      return Buffer.from(existing, "base64url");
    }
  }
}

