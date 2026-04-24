export type CheckLevel = "syntax" | "dns" | "deep";

export const INVALID_REASON_AMOUNT_OF_AT = "amount_of_at";
export const INVALID_REASON_USERNAME_GENERAL_RULES = "username_general_rules";
export const INVALID_REASON_DOMAIN_GENERAL_RULES = "domain_general_rules";
export const INVALID_REASON_NO_DNS_MX_RECORDS = "no_dns_mx_records";
export const INVALID_REASON_DOMAIN_IN_BLOCKLIST = "domain_in_blocklist";
export const INVALID_REASON_USERNAME_VENDOR_RULES = "username_vendor_rules";
export const INVALID_REASON_DOMAIN_POPULAR_TYPO = "domain_popular_typo";
export const INVALID_REASON_DNS_TIMEOUT = "dns_timeout";
export const INVALID_REASON_DNS_ERROR = "dns_error";
export const INVALID_REASON_DOMAIN_NOT_FOUND = "domain_not_found";
export const INVALID_REASON_SMTP_MAILBOX_NOT_FOUND = "smtp_mailbox_not_found";
export const INVALID_REASON_SMTP_UNVERIFIABLE = "smtp_unverifiable";
export const INVALID_REASON_DOMAIN_DISPOSABLE = "domain_disposable";
// Backward compatible alias
export const INVALID_REASON_DISPOSABLE_DOMAIN = INVALID_REASON_DOMAIN_DISPOSABLE;

export type SmtpProbeStatus =
  | "exists"
  | "not_exists"
  | "catch_all"
  | "unverifiable";

export type FailReason =
  | typeof INVALID_REASON_AMOUNT_OF_AT
  | typeof INVALID_REASON_USERNAME_GENERAL_RULES
  | typeof INVALID_REASON_DOMAIN_GENERAL_RULES
  | typeof INVALID_REASON_NO_DNS_MX_RECORDS
  | typeof INVALID_REASON_DOMAIN_IN_BLOCKLIST
  | typeof INVALID_REASON_USERNAME_VENDOR_RULES
  | typeof INVALID_REASON_DOMAIN_POPULAR_TYPO
  | typeof INVALID_REASON_DNS_TIMEOUT
  | typeof INVALID_REASON_DNS_ERROR
  | typeof INVALID_REASON_DOMAIN_NOT_FOUND
  | typeof INVALID_REASON_SMTP_MAILBOX_NOT_FOUND
  | typeof INVALID_REASON_SMTP_UNVERIFIABLE
  | typeof INVALID_REASON_DOMAIN_DISPOSABLE;

export interface EmailCheckResult {
  /** The original email passed in */
  email: string;
  /** Whether the email is considered valid at the requested level */
  valid: boolean;
  /** Reason ID for failure — undefined if valid */
  reasonId?: FailReason;
  /** Backward-compatible alias */
  reason?: FailReason;
  /** Human-readable message */
  message: string;
  /** Which checks were actually run */
  checks: {
    syntax: boolean;
    disposable: boolean;
    dns: boolean;
    smtp: boolean;
  };
  /** MX records found (populated when dns check runs) */
  mxRecords?: string[];
  /** Time taken in milliseconds */
  durationMs: number;
  /** Optional SMTP mailbox probe metadata */
  smtp?: {
    attempted: boolean;
    status: SmtpProbeStatus;
    host?: string;
    code?: number;
    response?: string;
  };
}

export interface BulkCheckResult {
  results: EmailCheckResult[];
  /** Total time for the entire batch */
  totalDurationMs: number;
  summary: {
    total: number;
    valid: number;
    invalid: number;
  };
}

type SmtpProbeClient = (args: {
  email: string;
  mxRecords: string[];
  timeoutMs: number;
  heloDomain: string;
  mailFrom: string;
  maxMxHosts: number;
  catchAllCheck: boolean;
}) => Promise<{
  status: SmtpProbeStatus;
  host?: string;
  code?: number;
  response?: string;
}>;

interface MailProbeCoreOptions {
  /**
   * Validation level:
   * - "syntax"  → regex only, <1ms
   * - "dns"     → syntax + MX lookup, ~20–150ms  (default)
   * - "deep"    → dns + disposable domain check
   */
  level?: CheckLevel;

  /** DNS lookup timeout in ms. Default: 3000 */
  timeout?: number;

  /** Custom DNS server to query. Default: system resolver */
  dnsServer?: string;

  /** Additional disposable domains to block */
  extraDisposableDomains?: string[];

  /** Enable/disable disposable domain check. Default: true */
  checkDisposable?: boolean;

  /** Enable/disable popular typo check. Default: true */
  checkTypo?: boolean;

  /** Enable/disable vendor-specific username rules. Default: true */
  checkVendorRules?: boolean;

  /** Enable/disable MX DNS check. Default: true except in syntax mode */
  checkMx?: boolean;

  /** Cache MX results in-memory for repeated lookups. Default: true */
  cache?: boolean;

  /** TTL for MX cache entries in ms. Default: 300_000 (5 min) */
  cacheTtl?: number;

  /** Custom DNS-over-HTTPS provider URL */
  dohProviderUrl?: string;

  /** Number of retries for DNS queries */
  dohRetryAmount?: number;

  /** Skip the internal MX domain cache */
  skipCache?: boolean;

  /** Use built-in popular-domain MX cache seeds. Default: true */
  usePopularMxCache?: boolean;

  /** Override or extend popular-domain MX cache seeds */
  popularMxCache?: Record<string, string[]>;

  /** Custom MX resolver override */
  mxResolver?: (domain: string) => Promise<string[] | false>;

}

type BlocklistEnabledOptions = {
  /** Enable/disable domain blocklist check. Default: true */
  checkBlocklist?: true;
  /** Domains to block */
  blocklistDomains?: string[];
};

type BlocklistDisabledOptions = {
  checkBlocklist: false;
  blocklistDomains?: never;
};

type SmtpProbeEnabledOptions = {
  /** Enable SMTP RCPT probe without sending email body */
  smtpProbe: true;
  /** SMTP probing requires MX checking to be enabled */
  checkMx?: true;
  /** SMTP probe timeout in ms. Default: 2500 */
  smtpProbeTimeoutMs?: number;
  /** Maximum MX hosts to probe. Default: 1 */
  smtpProbeMaxMxHosts?: number;
  /** Probe random address to detect catch-all domains. Default: true */
  smtpProbeCatchAllCheck?: boolean;
  /** Custom SMTP probe client override (useful for testing) */
  smtpProbeClient?: SmtpProbeClient;
};

type SmtpProbeDisabledOptions = {
  smtpProbe?: false;
  smtpProbeTimeoutMs?: never;
  smtpProbeMaxMxHosts?: never;
  smtpProbeCatchAllCheck?: never;
  smtpProbeClient?: never;
};

export type MailProbeOptions = MailProbeCoreOptions &
  (BlocklistEnabledOptions | BlocklistDisabledOptions) &
  (SmtpProbeEnabledOptions | SmtpProbeDisabledOptions);
