import { validateSyntax } from "./syntax.js";
import { isDisposable } from "./disposable.js";
import { lookupMx } from "./dns.js";
import {
  INVALID_REASON_DOMAIN_IN_BLOCKLIST,
  INVALID_REASON_DOMAIN_POPULAR_TYPO,
  INVALID_REASON_USERNAME_VENDOR_RULES,
  type EmailCheckResult,
  type MailProbeOptions,
} from "./type.js";

const DEFAULT_OPTIONS = {
  level: "dns",
  timeout: 3000,
  dnsServer: "",
  extraDisposableDomains: [],
  blocklistDomains: [],
  checkBlocklist: true,
  checkDisposable: true,
  checkTypo: true,
  checkVendorRules: true,
  checkMx: true,
  cache: true,
  cacheTtl: 300_000,
  dohProviderUrl: "",
  dohRetryAmount: 1,
  skipCache: false,
  usePopularMxCache: true,
  popularMxCache: {},
} satisfies Omit<MailProbeOptions, "mxResolver">;

const POPULAR_DOMAIN_TYPOS: Record<string, string> = {
  "gmal.com": "gmail.com",
  "gnail.com": "gmail.com",
  "hotnail.com": "hotmail.com",
  "yaho.com": "yahoo.com",
  "outlok.com": "outlook.com",
};

function validateVendorRules(local: string, domain: string): string | null {
  if (domain === "gmail.com") {
    if (local.length < 6)
      return "Gmail usernames must be at least 6 characters";
    if (!/^[a-z0-9.]+$/.test(local)) {
      return "Gmail usernames can only contain lowercase letters, numbers, and dots";
    }
  }
  return null;
}

export async function checkEmail(
  email: string,
  options: MailProbeOptions = {},
): Promise<EmailCheckResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const start = performance.now();

  const checksRan = { syntax: false, disposable: false, dns: false };

  checksRan.syntax = true;
  const syntax = validateSyntax(email);

  if (!syntax.valid) {
    const reasonId = syntax.reasonId ?? INVALID_REASON_USERNAME_VENDOR_RULES;
    return {
      email,
      valid: false,
      reasonId,
      reason: reasonId,
      message: syntax.reason ?? "Invalid email syntax",
      checks: checksRan,
      durationMs: +(performance.now() - start).toFixed(2),
    };
  }

  const domain = syntax.domain!;
  const local = syntax.local!;

  if (opts.level === "syntax") {
    return {
      email,
      valid: true,
      message: "Email syntax is valid",
      checks: checksRan,
      durationMs: +(performance.now() - start).toFixed(2),
    };
  }

  if (opts.checkTypo) {
    const typoTarget = POPULAR_DOMAIN_TYPOS[domain];
    if (typoTarget) {
      return {
        email,
        valid: false,
        reasonId: INVALID_REASON_DOMAIN_POPULAR_TYPO,
        reason: INVALID_REASON_DOMAIN_POPULAR_TYPO,
        message: `Domain appears to be a typo (did you mean ${typoTarget}?)`,
        checks: checksRan,
        durationMs: +(performance.now() - start).toFixed(2),
      };
    }
  }

  if (opts.checkBlocklist) {
    if (
      opts.blocklistDomains.length > 0 &&
      opts.blocklistDomains.map((d) => d.toLowerCase()).includes(domain)
    ) {
      return {
        email,
        valid: false,
        reasonId: INVALID_REASON_DOMAIN_IN_BLOCKLIST,
        reason: INVALID_REASON_DOMAIN_IN_BLOCKLIST,
        message: `This email domain is blocked: ${domain}`,
        checks: checksRan,
        durationMs: +(performance.now() - start).toFixed(2),
      };
    }
  }

  if (opts.checkVendorRules) {
    const vendorError = validateVendorRules(local, domain);
    if (vendorError) {
      return {
        email,
        valid: false,
        reasonId: INVALID_REASON_USERNAME_VENDOR_RULES,
        reason: INVALID_REASON_USERNAME_VENDOR_RULES,
        message: vendorError,
        checks: checksRan,
        durationMs: +(performance.now() - start).toFixed(2),
      };
    }
  }

  if (opts.checkDisposable) {
    checksRan.disposable = true;
    if (isDisposable(domain, opts.extraDisposableDomains)) {
      return {
        email,
        valid: false,
        reasonId: INVALID_REASON_DOMAIN_IN_BLOCKLIST,
        reason: INVALID_REASON_DOMAIN_IN_BLOCKLIST,
        message: `Disposable/temporary email domain: ${domain}`,
        checks: checksRan,
        durationMs: +(performance.now() - start).toFixed(2),
      };
    }
  }

  if (opts.checkMx) {
    checksRan.dns = true;
    const mxResult = await lookupMx(domain, {
      timeout: opts.timeout,
      cacheTtl: opts.cacheTtl,
      useCache: opts.cache && !opts.skipCache,
      dnsServer: opts.dnsServer || undefined,
      dohProviderUrl: opts.dohProviderUrl || undefined,
      dohRetryAmount: opts.dohRetryAmount,
      usePopularMxCache: opts.usePopularMxCache,
      popularMxCache: opts.popularMxCache,
      mxResolver: opts.mxResolver,
    });

    const durationMs = +(performance.now() - start).toFixed(2);

    if (!mxResult.valid) {
      return {
        email,
        valid: false,
        reasonId: mxResult.reason,
        reason: mxResult.reason,
        message: mxResult.message,
        checks: checksRan,
        durationMs,
      };
    }

    return {
      email,
      valid: true,
      message: mxResult.message,
      checks: checksRan,
      mxRecords: mxResult.mxRecords,
      durationMs,
    };
  }

  return {
    email,
    valid: true,
    message: "Email passed enabled checks",
    checks: checksRan,
    durationMs: +(performance.now() - start).toFixed(2),
  };
}
