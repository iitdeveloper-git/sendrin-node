import createClient from "openapi-fetch";
import type { paths } from "./generated/openapi-types.js";

/** Error shape Sendrin's API returns in the `detail` field of a non-2xx response body. */
interface ErrorDetail {
  detail?: {
    message?: string;
    code?: string;
  };
}

export class SendrinAPIError extends Error {
  readonly statusCode?: number;
  readonly errorCode?: string;

  constructor(message: string, statusCode?: number, errorCode?: string) {
    super(message);
    this.name = "SendrinAPIError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

/** 429 quota_exceeded — deliberately not auto-retried, see Sendrin's request loop. */
export class SendrinQuotaExceededError extends SendrinAPIError {
  constructor(message: string, statusCode?: number, errorCode?: string) {
    super(message, statusCode, errorCode);
    this.name = "SendrinQuotaExceededError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type SendOtpRequest = paths["/api/v1/otp/send"]["post"]["requestBody"]["content"]["application/json"];
type SendOtpResponse =
  paths["/api/v1/otp/send"]["post"]["responses"][200]["content"]["application/json"];
type VerifyOtpRequest =
  paths["/api/v1/otp/verify"]["post"]["requestBody"]["content"]["application/json"];
type VerifyOtpResponse =
  paths["/api/v1/otp/verify"]["post"]["responses"][200]["content"]["application/json"];

/** `SendOtpRequest` with the fields that carry server-side defaults made
 * optional on the SDK surface, so callers only need to specify what they
 * actually care about (mirrors the Python SDK's keyword-argument defaults). */
export type SendOtpInput = Omit<SendOtpRequest, "purpose" | "code_length" | "ttl_seconds"> &
  Partial<Pick<SendOtpRequest, "purpose" | "code_length" | "ttl_seconds">>;

/** `VerifyOtpRequest` with `purpose` (which defaults server-side) made optional. */
export type VerifyOtpInput = Omit<VerifyOtpRequest, "purpose"> &
  Partial<Pick<VerifyOtpRequest, "purpose">>;

export interface SendrinOptions {
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

type OpenApiResult<T> = { data?: T; error?: unknown; response: Response };

/**
 * Thin, typed wrapper around the generated Sendrin API client.
 *
 * ```ts
 * const client = new Sendrin("gns_live_sk_...");
 * await client.otp.send({ channel: "sms", recipient_phone: "+14155552671", purpose: "login" });
 * ```
 */
export class Sendrin {
  /** The raw generated openapi-fetch client. Used internally by the
   * namespace wrappers (e.g. `OtpNamespace`) to issue typed requests that
   * are then routed through `request()` for retry/quota/error handling. */
  private readonly http: ReturnType<typeof createClient<paths>>;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  readonly otp: OtpNamespace;

  constructor(apiKey: string, options: SendrinOptions = {}) {
    const { baseUrl = "https://api.sendrin.com", timeoutMs = 10_000, maxRetries = 2 } = options;
    this.maxRetries = maxRetries;
    this.timeoutMs = timeoutMs;
    this.http = createClient<paths>({
      baseUrl,
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    this.otp = new OtpNamespace(this);
  }

  /**
   * Executes a single openapi-fetch call with retry/backoff and error mapping.
   *
   * Retries 5xx responses and network errors with exponential backoff
   * (500ms, 1000ms, 2000ms, ...) up to `maxRetries` times. Never retries a
   * 429 — quota exhaustion doesn't self-resolve by retrying immediately, it
   * just burns another request against the same quota — so it's raised
   * immediately as a distinct `SendrinQuotaExceededError`.
   */
  async request<T>(fn: (http: ReturnType<typeof createClient<paths>>, signal: AbortSignal) => Promise<OpenApiResult<T>>): Promise<T> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let result: OpenApiResult<T>;
      try {
        result = await fn(this.http, controller.signal);
      } catch (err) {
        if (attempt < this.maxRetries) {
          await sleep(500 * 2 ** attempt);
          continue;
        }
        throw new SendrinAPIError(`Network error calling Sendrin API: ${String(err)}`);
      } finally {
        clearTimeout(timer);
      }

      const { data, error, response } = result;

      if (response.status === 429) {
        const detail = error as ErrorDetail | undefined;
        throw new SendrinQuotaExceededError(
          detail?.detail?.message ?? "Quota exceeded",
          429,
          detail?.detail?.code
        );
      }

      if (response.status >= 500 && attempt < this.maxRetries) {
        await sleep(500 * 2 ** attempt);
        continue;
      }

      if (response.status >= 400) {
        const detail = error as ErrorDetail | undefined;
        throw new SendrinAPIError(
          detail?.detail?.message ?? response.statusText,
          response.status,
          detail?.detail?.code
        );
      }

      return data as T;
    }
    // Unreachable: every loop iteration either returns above or throws once
    // `attempt === maxRetries`. This satisfies the compiler's control-flow
    // analysis without an unused variable.
    throw new SendrinAPIError(`Request failed after ${this.maxRetries} retries`);
  }
}

/**
 * Convenience wrapper around the generated OTP endpoints. Builds requests
 * using the generated request/response types, but sends them through the
 * parent `Sendrin` instance's `request()` so OTP calls get the same retry,
 * quota, and error-handling behavior as every other call made through this
 * SDK.
 */
class OtpNamespace {
  constructor(private readonly client: Sendrin) {}

  send(input: SendOtpInput): Promise<SendOtpResponse> {
    const body: SendOtpRequest = {
      purpose: "login",
      code_length: 6,
      ttl_seconds: 600,
      ...input,
    };
    return this.client.request<SendOtpResponse>((http, signal) =>
      http.POST("/api/v1/otp/send", { body, signal })
    );
  }

  verify(input: VerifyOtpInput): Promise<VerifyOtpResponse> {
    const body: VerifyOtpRequest = {
      purpose: "login",
      ...input,
    };
    return this.client.request<VerifyOtpResponse>((http, signal) =>
      http.POST("/api/v1/otp/verify", { body, signal })
    );
  }
}
