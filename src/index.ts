export { checkEmail } from "./check.js";
export { checkEmails } from "./bulk.js";
export { validateSyntax } from "./syntax.js";
export { isDisposable, DISPOSABLE_DOMAINS } from "./disposable.js";
export { clearMxCache, getPopularMxCacheSeed } from "./dns.js";
export {
  INVALID_REASON_AMOUNT_OF_AT,
  INVALID_REASON_USERNAME_GENERAL_RULES,
  INVALID_REASON_DOMAIN_GENERAL_RULES,
  INVALID_REASON_NO_DNS_MX_RECORDS,
  INVALID_REASON_DOMAIN_IN_BLOCKLIST,
  INVALID_REASON_USERNAME_VENDOR_RULES,
  INVALID_REASON_DOMAIN_POPULAR_TYPO,
  INVALID_REASON_DNS_TIMEOUT,
  INVALID_REASON_DNS_ERROR,
  INVALID_REASON_DOMAIN_NOT_FOUND,
} from "./type.js";

export type {
  CheckLevel,
  FailReason,
  EmailCheckResult,
  BulkCheckResult,
  MailProbeOptions,
} from "./type.js";
