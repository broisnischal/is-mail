import { validateSyntax } from "./syntax.js";
import { isDisposable } from "./disposable.js";
import { lookupMx } from "./dns.js";
import { probeSmtpMailbox } from "./smtp.js";
import {
  INVALID_REASON_DOMAIN_DISPOSABLE,
  INVALID_REASON_USERNAME_GENERAL_RULES,
  INVALID_REASON_SMTP_MAILBOX_NOT_FOUND,
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
} as const;

const SMTP_DEFAULT_OPTIONS = {
  timeoutMs: 2500,
  heloDomain: "localhost",
  mailFrom: "probe@localhost",
  maxMxHosts: 1,
  catchAllCheck: true,
} as const;

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
  const opts = {
    ...DEFAULT_OPTIONS,
    ...options,
    checkMx: options.smtpProbe ? true : (options.checkMx ?? DEFAULT_OPTIONS.checkMx),
  };
  const start = performance.now();

  const checksRan = { syntax: false, disposable: false, dns: false, smtp: false };

  checksRan.syntax = true;
  const syntax = validateSyntax(email);

  if (!syntax.valid) {
    const reasonId = syntax.reasonId ?? INVALID_REASON_USERNAME_GENERAL_RULES;
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
    const blocklistDomains = options.blocklistDomains ?? [];
    if (
      blocklistDomains.length > 0 &&
      blocklistDomains.map((d) => d.toLowerCase()).includes(domain)
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
        reasonId: INVALID_REASON_DOMAIN_DISPOSABLE,
        reason: INVALID_REASON_DOMAIN_DISPOSABLE,
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

    if (opts.smtpProbe) {
      checksRan.smtp = true;
      const smtpClient = opts.smtpProbeClient ?? probeSmtpMailbox;
      const smtpResult = await smtpClient({
        email,
        mxRecords: mxResult.mxRecords ?? [],
        timeoutMs: options.smtpProbeTimeoutMs ?? SMTP_DEFAULT_OPTIONS.timeoutMs,
        // Security: these values are intentionally not user-configurable.
        heloDomain: SMTP_DEFAULT_OPTIONS.heloDomain,
        mailFrom: SMTP_DEFAULT_OPTIONS.mailFrom,
        maxMxHosts: options.smtpProbeMaxMxHosts ?? SMTP_DEFAULT_OPTIONS.maxMxHosts,
        catchAllCheck:
          options.smtpProbeCatchAllCheck ?? SMTP_DEFAULT_OPTIONS.catchAllCheck,
      });

      const smtpDurationMs = +(performance.now() - start).toFixed(2);

      if (smtpResult.status === "not_exists") {
        return {
          email,
          valid: false,
          reasonId: INVALID_REASON_SMTP_MAILBOX_NOT_FOUND,
          reason: INVALID_REASON_SMTP_MAILBOX_NOT_FOUND,
          message: "Mailbox rejected by SMTP RCPT probe",
          checks: checksRan,
          mxRecords: mxResult.mxRecords,
          durationMs: smtpDurationMs,
          smtp: {
            attempted: true,
            status: smtpResult.status,
            host: smtpResult.host,
            code: smtpResult.code,
            response: smtpResult.response,
          },
        };
      }

      if (smtpResult.status === "unverifiable") {
        return {
          email,
          valid: true,
          message: "SMTP probe could not verify mailbox existence; treating as domain-valid",
          checks: checksRan,
          mxRecords: mxResult.mxRecords,
          durationMs: smtpDurationMs,
          smtp: {
            attempted: true,
            status: smtpResult.status,
            host: smtpResult.host,
            code: smtpResult.code,
            response: smtpResult.response,
          },
        };
      }

      return {
        email,
        valid: true,
        message:
          smtpResult.status === "catch_all"
            ? "Mailbox accepted, but domain appears catch-all"
            : "Mailbox accepted by SMTP RCPT probe",
        checks: checksRan,
        mxRecords: mxResult.mxRecords,
        durationMs: smtpDurationMs,
        smtp: {
          attempted: true,
          status: smtpResult.status,
          host: smtpResult.host,
          code: smtpResult.code,
          response: smtpResult.response,
        },
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
