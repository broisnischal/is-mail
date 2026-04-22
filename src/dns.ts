import { promises as dnsPromises } from "node:dns";
import {
  INVALID_REASON_DNS_ERROR,
  INVALID_REASON_DNS_TIMEOUT,
  INVALID_REASON_DOMAIN_NOT_FOUND,
  INVALID_REASON_NO_DNS_MX_RECORDS,
  type FailReason,
} from "./type.js";

interface CacheEntry {
  mxRecords: string[];
  expiresAt: number;
}

interface MxResult {
  valid: boolean;
  mxRecords?: string[];
  reason?: FailReason;
  message: string;
}

const mxCache = new Map<string, CacheEntry>();
const POPULAR_MX_CACHE_SEED: Record<string, string[]> = {
  "gmail.com": ["gmail-smtp-in.l.google.com"],
  "googlemail.com": ["gmail-smtp-in.l.google.com"],
  "outlook.com": ["outlook-com.olc.protection.outlook.com"],
  "hotmail.com": ["hotmail-com.olc.protection.outlook.com"],
  "yahoo.com": ["mta5.am0.yahoodns.net"],
  "icloud.com": ["mx01.mail.icloud.com"],
  "proton.me": ["mail.protonmail.ch"],
};

export function getPopularMxCacheSeed(): Record<string, string[]> {
  return { ...POPULAR_MX_CACHE_SEED };
}

export function clearMxCache(): void {
  mxCache.clear();
}

function getCached(domain: string): string[] | null {
  const entry = mxCache.get(domain);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    mxCache.delete(domain);
    return null;
  }
  return entry.mxRecords;
}

function setCached(domain: string, mxRecords: string[], ttl: number): void {
  // Evict oldest if cache grows too large (simple LRU cap at 1000)
  if (mxCache.size >= 1000) {
    const firstKey = mxCache.keys().next().value;
    if (firstKey) mxCache.delete(firstKey);
  }
  mxCache.set(domain, { mxRecords, expiresAt: Date.now() + ttl });
}

export async function lookupMx(
  domain: string,
  options: {
    timeout: number;
    cacheTtl: number;
    useCache: boolean;
    dnsServer?: string;
    dohProviderUrl?: string;
    dohRetryAmount: number;
    usePopularMxCache?: boolean;
    popularMxCache?: Record<string, string[]>;
    mxResolver?: (domain: string) => Promise<string[] | false>;
  },
): Promise<MxResult> {
  const {
    timeout,
    cacheTtl,
    useCache,
    dnsServer,
    dohProviderUrl,
    dohRetryAmount,
    usePopularMxCache = true,
    popularMxCache = {},
    mxResolver,
  } = options;

  // Cache hit
  if (useCache) {
    const cached = getCached(domain);
    if (cached !== null) {
      return cached.length > 0
        ? {
            valid: true,
            mxRecords: cached,
            message: "MX records found (cached)",
          }
        : {
            valid: false,
            reason: INVALID_REASON_NO_DNS_MX_RECORDS,
            message: "No MX records found (cached)",
          };
    }
  }

  if (useCache && usePopularMxCache) {
    const mergedPopularCache = { ...POPULAR_MX_CACHE_SEED, ...popularMxCache };
    const seeded = mergedPopularCache[domain];
    if (seeded && seeded.length > 0) {
      const seededRecords = [...seeded].sort();
      setCached(domain, seededRecords, cacheTtl);
      return {
        valid: true,
        mxRecords: seededRecords,
        message: "MX records found (popular cache seed)",
      };
    }
  }

  const runLocalResolver = async (): Promise<string[]> => {
    const resolver = new dnsPromises.Resolver({ timeout, tries: 1 });
    if (dnsServer) resolver.setServers([dnsServer]);
    const records = await resolver.resolveMx(domain);
    return records
      .sort((a, b) => a.priority - b.priority)
      .map((r) => r.exchange);
  };

  const runDohResolver = async (): Promise<string[]> => {
    if (!dohProviderUrl) return runLocalResolver();
    const response = await fetch(
      `${dohProviderUrl}?name=${encodeURIComponent(domain)}&type=MX`,
      {
        headers: { accept: "application/dns-json" },
      },
    );
    if (!response.ok) {
      throw new Error(`DOH_HTTP_${response.status}`);
    }
    const payload = (await response.json()) as {
      Answer?: Array<{ data?: string }>;
      Status?: number;
    };
    if (payload.Status === 3) {
      const error = new Error("DOMAIN_NOT_FOUND") as Error & { code?: string };
      error.code = "ENOTFOUND";
      throw error;
    }
    const answers = payload.Answer ?? [];
    return answers
      .map((answer) => answer.data?.replace(/\.$/, ""))
      .filter((record): record is string => Boolean(record))
      .map((record) => {
        const parts = record.split(/\s+/);
        return parts.length > 1 ? parts[1]! : record;
      });
  };

  const runCustomResolver = async (): Promise<string[]> => {
    if (!mxResolver) return runDohResolver();
    const records = await mxResolver(domain);
    if (records === false) {
      const error = new Error("CUSTOM_RESOLVER_FAILED");
      (error as Error & { code?: string }).code = "ECUSTOM";
      throw error;
    }
    return records;
  };

  try {
    let records: string[] = [];
    let attempt = 0;
    const maxAttempts = Math.max(1, dohRetryAmount + 1);

    while (attempt < maxAttempts) {
      try {
        records = await Promise.race([
          runCustomResolver(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("DNS_TIMEOUT")), timeout),
          ),
        ]);
        break;
      } catch (error) {
        attempt++;
        if (attempt >= maxAttempts) throw error;
      }
    }

    const sorted = records.sort();

    if (useCache) setCached(domain, sorted, cacheTtl);

    if (sorted.length === 0) {
      return {
        valid: false,
        reason: INVALID_REASON_NO_DNS_MX_RECORDS,
        message: "Domain has no MX records",
      };
    }

    return {
      valid: true,
      mxRecords: sorted,
      message: `${sorted.length} MX record(s) found`,
    };
  } catch (err: unknown) {
    const error = err as Error & { code?: string };

    if (error.message === "DNS_TIMEOUT") {
      if (useCache) setCached(domain, [], cacheTtl / 10); // short-cache timeouts
      return {
        valid: false,
        reason: INVALID_REASON_DNS_TIMEOUT,
        message: `DNS lookup timed out after ${timeout}ms`,
      };
    }

    // ENOTFOUND = domain doesn't exist at all
    if (error.code === "ENOTFOUND" || error.code === "ENODATA") {
      if (useCache) setCached(domain, [], cacheTtl);
      return {
        valid: false,
        reason: INVALID_REASON_DOMAIN_NOT_FOUND,
        message: "Domain does not exist",
      };
    }

    // ENODATA / ESERVFAIL etc — no MX records
    if (error.code === "ESERVFAIL" || error.code === "ECANCELLED") {
      if (useCache) setCached(domain, [], cacheTtl / 5);
      return {
        valid: false,
        reason: INVALID_REASON_DNS_ERROR,
        message: `DNS server error: ${error.code}`,
      };
    }

    if (error.code === "ECUSTOM") {
      return {
        valid: false,
        reason: INVALID_REASON_DNS_ERROR,
        message: "Custom MX resolver could not determine DNS result",
      };
    }

    if (useCache) setCached(domain, [], cacheTtl);
    return {
      valid: false,
      reason: INVALID_REASON_NO_DNS_MX_RECORDS,
      message: "No MX records found",
    };
  }
}
