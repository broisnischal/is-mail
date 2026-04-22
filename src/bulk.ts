import { checkEmail } from "./check.js";
import type { BulkCheckResult, MailProbeOptions } from "./type.js";

export async function checkEmails(
  emails: string[],
  options: MailProbeOptions = {},
  concurrency = 10,
): Promise<BulkCheckResult> {
  const start = performance.now();
  const results = new Array(emails.length);
  let index = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, emails.length) },
    async () => {
      while (true) {
        const i = index++;
        if (i >= emails.length) break;
        results[i] = await checkEmail(emails[i]!, options);
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
