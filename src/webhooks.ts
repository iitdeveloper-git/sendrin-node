import { createHmac, timingSafeEqual } from "node:crypto";

export class WebhookVerificationError extends Error {}

export interface VerifyWebhookOptions {
  /** Raw request body bytes exactly as received — do NOT JSON.parse and
   * re-stringify before calling this. Sendrin signs the exact bytes it
   * transmits; re-serializing risks a whitespace/key-order mismatch that
   * would fail verification even for a genuine, untampered webhook. */
  body: Buffer;
  timestamp: string;
  signature: string;
  secret: string;
  toleranceSeconds?: number;
}

export function verifyWebhook(options: VerifyWebhookOptions): void {
  const { body, timestamp, signature, secret, toleranceSeconds = 300 } = options;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    throw new WebhookVerificationError(`Invalid timestamp: ${timestamp}`);
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > toleranceSeconds) {
    throw new WebhookVerificationError(
      `Timestamp ${timestamp} is outside the ${toleranceSeconds}s tolerance window (stale or replayed webhook)`
    );
  }

  if (!signature.startsWith("v1=")) {
    throw new WebhookVerificationError(`Unrecognized signature format: ${signature}`);
  }
  const providedSig = signature.slice("v1=".length);

  const expectedSig = createHmac("sha256", secret).update(`${timestamp}.`).update(body).digest("hex");

  const providedBuf = Buffer.from(providedSig, "hex");
  const expectedBuf = Buffer.from(expectedSig, "hex");
  if (
    providedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(providedBuf, expectedBuf)
  ) {
    throw new WebhookVerificationError("Signature mismatch");
  }
}
