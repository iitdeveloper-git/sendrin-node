import { afterEach, describe, expect, it, vi } from "vitest";
import { Sendrin, SendrinAPIError, SendrinQuotaExceededError } from "./client.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Sendrin client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reaches the right path with the right Authorization header on success", async () => {
    const calls: Request[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const request = input instanceof Request ? input : new Request(input);
      calls.push(request);
      return jsonResponse(200, {
        otp_id: "otp_123",
        status: "sent",
        channel: "sms",
        expires_at: "2026-09-19T12:00:00+00:00",
        ttl_seconds: 600,
        purpose: "login",
        remaining_credits: 42,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new Sendrin("gns_live_sk_test");
    const result = await client.otp.send({
      channel: "sms",
      recipient_phone: "+14155552671",
      purpose: "login",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = calls[0];
    expect(request.method).toBe("POST");
    expect(new URL(request.url).pathname).toBe("/api/v1/otp/send");
    expect(request.headers.get("Authorization")).toBe("Bearer gns_live_sk_test");
    expect(result.otp_id).toBe("otp_123");
    expect(result.remaining_credits).toBe(42);
  });

  it("raises SendrinQuotaExceededError without retry on 429", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(429, { detail: { message: "Quota exceeded", code: "quota_exceeded" } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new Sendrin("gns_live_sk_test", { maxRetries: 2 });

    const err = await client.otp
      .send({ channel: "sms", recipient_phone: "+14155552671" })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(SendrinQuotaExceededError);
    expect((err as SendrinQuotaExceededError).statusCode).toBe(429);
    // 429 must not be retried — a single attempt only.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries 500s up to maxRetries then raises SendrinAPIError", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(500, { detail: { message: "Internal error" } }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new Sendrin("gns_live_sk_test", { maxRetries: 2 });
    const start = Date.now();

    const err = await client.otp
      .send({ channel: "sms", recipient_phone: "+14155552671" })
      .catch((e: unknown) => e);
    const elapsedMs = Date.now() - start;

    expect(err).toBeInstanceOf(SendrinAPIError);
    expect(err).not.toBeInstanceOf(SendrinQuotaExceededError);
    expect((err as SendrinAPIError).statusCode).toBe(500);
    // Initial attempt + maxRetries retries.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // Backoff of 500ms then 1000ms between the 3 attempts.
    expect(elapsedMs).toBeGreaterThanOrEqual(1400);
  });

  it("retries network errors with backoff then raises SendrinAPIError", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new Sendrin("gns_live_sk_test", { maxRetries: 2 });
    const start = Date.now();

    const err = await client.otp
      .send({ channel: "sms", recipient_phone: "+14155552671" })
      .catch((e: unknown) => e);
    const elapsedMs = Date.now() - start;

    expect(err).toBeInstanceOf(SendrinAPIError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(elapsedMs).toBeGreaterThanOrEqual(1400);
  });
});
