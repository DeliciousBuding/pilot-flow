import { createHash, timingSafeEqual } from "node:crypto";

// Contract helpers only. The default product event path is lark-cli WebSocket NDJSON;
// this file intentionally does not start an HTTP server until public webhook fixtures
// and encrypted callback posture are verified.

const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

export interface VerifySignatureOptions {
  readonly timestamp: string;
  readonly nonce: string;
  readonly signature: string;
  readonly encryptKey: string;
  readonly body: string;
  readonly nowMs?: number;
  readonly seenNonces?: Map<string, number>;
}

export function verifyFeishuWebhookSignature(options: VerifySignatureOptions): boolean {
  if (!options.timestamp || !options.nonce || !options.signature || !options.encryptKey) return false;
  const nowMs = options.nowMs ?? Date.now();
  const timestampMs = Number.parseInt(options.timestamp, 10) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(nowMs - timestampMs) > SIGNATURE_MAX_AGE_MS) return false;

  const seenNonces = options.seenNonces;
  if (seenNonces) {
    const cutoff = nowMs - SIGNATURE_MAX_AGE_MS;
    for (const [nonce, timestamp] of seenNonces) {
      if (timestamp < cutoff) seenNonces.delete(nonce);
    }
    if (seenNonces.has(options.nonce)) return false;
  }

  const expected = createHash("sha256").update(`${options.timestamp}${options.nonce}${options.encryptKey}${options.body}`).digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(options.signature);
  const ok = expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
  if (ok && seenNonces) seenNonces.set(options.nonce, nowMs);
  return ok;
}

export function verifyFeishuVerificationToken(body: Record<string, unknown>, expected: string): boolean {
  if (!expected) return false;
  const token = typeof body.token === "string"
    ? body.token
    : body.header && typeof body.header === "object" && !Array.isArray(body.header) && typeof (body.header as Record<string, unknown>).token === "string"
      ? String((body.header as Record<string, unknown>).token)
      : "";
  return token === expected;
}

export interface WebhookVerifierOptions {
  readonly verificationToken: string;
  readonly encryptKey: string;
  readonly seenNonces: Map<string, number>;
  readonly nowMs?: () => number;
}

export function createWebhookVerifier(options: WebhookVerifierOptions): {
  verifySignature(input: Omit<VerifySignatureOptions, "encryptKey" | "seenNonces" | "nowMs">): boolean;
  verifyToken(body: Record<string, unknown>): boolean;
} {
  if (!options.verificationToken) throw new Error("PILOTFLOW_VERIFICATION_TOKEN is required for webhook mode");
  if (!options.encryptKey) throw new Error("PILOTFLOW_ENCRYPT_KEY is required for webhook mode");
  if (!options.seenNonces) throw new Error("A nonce store is required for webhook replay protection");
  return {
    verifySignature(input) {
      return verifyFeishuWebhookSignature({
        ...input,
        encryptKey: options.encryptKey,
        seenNonces: options.seenNonces,
        nowMs: options.nowMs?.(),
      });
    },
    verifyToken(body) {
      return verifyFeishuVerificationToken(body, options.verificationToken);
    },
  };
}
