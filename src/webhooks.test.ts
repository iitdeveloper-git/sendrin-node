import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhook, WebhookVerificationError } from "./webhooks.js";

function sign(secret: string, timestamp: string, body: Buffer): string {
  const sig = createHmac("sha256", secret).update(`${timestamp}.`).update(body).digest("hex");
  return `v1=${sig}`;
}

describe("verifyWebhook", () => {
  it("accepts a valid signature", () => {
    const secret = "whsec_test_12345";
    const body = Buffer.from('{"event":"notification.delivered","id":"ntf_abc"}');
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(secret, timestamp, body);

    expect(() => verifyWebhook({ body, timestamp, signature, secret })).not.toThrow();
  });

  it("rejects a tampered body", () => {
    const secret = "whsec_test_12345";
    const body = Buffer.from('{"event":"notification.delivered","id":"ntf_abc"}');
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(secret, timestamp, body);
    const tampered = Buffer.from('{"event":"notification.delivered","id":"ntf_XXX"}');

    expect(() => verifyWebhook({ body: tampered, timestamp, signature, secret })).toThrow(
      WebhookVerificationError
    );
  });

  it("rejects the wrong secret", () => {
    const body = Buffer.from('{"event":"notification.delivered","id":"ntf_abc"}');
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign("whsec_test_12345", timestamp, body);

    expect(() =>
      verifyWebhook({ body, timestamp, signature, secret: "whsec_wrong" })
    ).toThrow(WebhookVerificationError);
  });

  it("rejects a stale timestamp", () => {
    const secret = "whsec_test_12345";
    const body = Buffer.from('{"event":"notification.delivered","id":"ntf_abc"}');
    const oldTimestamp = String(Math.floor(Date.now() / 1000) - 3600);
    const signature = sign(secret, oldTimestamp, body);

    expect(() =>
      verifyWebhook({ body, timestamp: oldTimestamp, signature, secret })
    ).toThrow(WebhookVerificationError);
  });

  it("verifies raw bytes without re-serializing JSON", () => {
    const secret = "whsec_test_12345";
    const body = Buffer.from('{"id": "ntf_abc", "event": "notification.delivered"}');
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(secret, timestamp, body);

    expect(() => verifyWebhook({ body, timestamp, signature, secret })).not.toThrow();
  });
});
