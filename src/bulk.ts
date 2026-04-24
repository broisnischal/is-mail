import { checkEmail } from "./check.js";
import type { BulkCheckResult, MailProbeOptions } from "./type.js";

const MAX_EMAILS_PER_BATCH = 1_000;
const MAX_CONCURRENCY = 25;
const MIN_CONCURRENCY = 1;
const MAX_PER_EMAIL_TIMEOUT_MS = 10_000;

export async function checkEmails(
  emails: string[],
  options: MailProbeOptions = {},
  concurrency = 10,
): Promise<BulkCheckResult> {
  if (emails.length > MAX_EMAILS_PER_BATCH) {
    throw new Error(`Too many emails: max ${MAX_EMAILS_PER_BATCH} per batch`);
  }

  const safeConcurrency = Math.min(
    MAX_CONCURRENCY,
    Math.max(MIN_CONCURRENCY, Math.floor(concurrency)),
  );
  const start = performance.now();
  const results = new Array(emails.length);
  let index = 0;
  const perEmailTimeoutMs = Math.min(
    MAX_PER_EMAIL_TIMEOUT_MS,
    Math.max(500, (options.timeout ?? 3_000) * 3),
  );

  const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> =>
    Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Email check timed out after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);

  const workers = Array.from(
    { length: Math.min(safeConcurrency, emails.length) },
    async () => {
      while (true) {
        const i = index++;
        if (i >= emails.length) break;
        results[i] = await withTimeout(checkEmail(emails[i]!, options), perEmailTimeoutMs);
      }
    },
  );
  await Promise.all(workers);
  const valid = results.filter((r) => r.valid).length;
  return {
    results,
    totalDurationMs: +(performance.now() - start).toFixed(2),
    summary: {
      total: results.length,
      valid,
      invalid: results.length - valid,
    },
  };
}
