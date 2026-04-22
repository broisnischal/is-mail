# is-mail

Fast email validation with configurable checks: syntax, typo detection, domain blocklists, disposable-domain filtering, and MX DNS validation.

- Built with [`obuild`](https://github.com/unjs/obuild)
- Works in Bun and Node.js runtimes
- Designed to reduce network bottlenecks with cache, retries, and custom resolvers

## What problem this solves

Most apps need more than regex. `is-mail` helps you:

- reject malformed addresses early
- prevent typo domains (`hotnail.com` -> `hotmail.com`)
- block disposable/temporary providers
- enforce your own blocked domains
- validate that a domain can actually receive mail (MX records)

## Install

```bash
bun add is-mail
```

For local development in this repo:

```bash
bun install
```

## Basic usage

```ts
import { checkEmail } from "is-mail";

const result = await checkEmail("someone@gmail.com");

if (result.valid) {
  console.log("valid");
} else {
  console.log(result.reasonId, result.message);
}
```

## Disable specific checks

Turn off disposable-domain check (your request):

```ts
const result = await checkEmail("user@mailinator.com", {
  checkDisposable: false,
});
```

Other toggles:

```ts
await checkEmail("someone@hotnail.com", {
  checkTypo: false,
  checkBlocklist: false,
  checkVendorRules: false,
  checkMx: true, // keep DNS MX verification
});
```

## All options

```ts
await checkEmail("user@company.com", {
  level: "dns", // "syntax" | "dns" | "deep"
  timeout: 3000,
  dnsServer: "",
  extraDisposableDomains: [],
  blocklistDomains: ["disposable-email.com"],
  checkBlocklist: true,
  checkDisposable: true,
  checkTypo: true,
  checkVendorRules: true,
  checkMx: true,
  cache: true,
  cacheTtl: 300_000,
  skipCache: false,
  usePopularMxCache: true,
  popularMxCache: {
    "company.com": ["mx.company.com"],
  },
  dohProviderUrl: "https://cloudflare-dns.com/dns-query",
  dohRetryAmount: 2,
  mxResolver: async (domain) => {
    return domain === "example.com" ? ["mail.example.com"] : [];
  },
});
```

`usePopularMxCache` helps reduce cold DNS latency for common providers by seeding known MX entries.

## Custom error messages

```ts
import {
  checkEmail,
  INVALID_REASON_AMOUNT_OF_AT,
  INVALID_REASON_USERNAME_GENERAL_RULES,
  INVALID_REASON_DOMAIN_GENERAL_RULES,
  INVALID_REASON_NO_DNS_MX_RECORDS,
  INVALID_REASON_DOMAIN_IN_BLOCKLIST,
  INVALID_REASON_USERNAME_VENDOR_RULES,
  INVALID_REASON_DOMAIN_POPULAR_TYPO,
} from "is-mail";

const customReasons = {
  [INVALID_REASON_AMOUNT_OF_AT]: "Email must contain exactly one @ symbol",
  [INVALID_REASON_USERNAME_GENERAL_RULES]: "Username contains invalid characters",
  [INVALID_REASON_DOMAIN_GENERAL_RULES]: "Domain name is invalid",
  [INVALID_REASON_NO_DNS_MX_RECORDS]: "Domain does not have mail server records",
  [INVALID_REASON_DOMAIN_IN_BLOCKLIST]: "This email domain is not allowed",
  [INVALID_REASON_USERNAME_VENDOR_RULES]: "Username does not meet provider requirements",
  [INVALID_REASON_DOMAIN_POPULAR_TYPO]:
    "Domain appears to be a typo (did you mean gmail.com?)",
};

const result = await checkEmail("someone@gmail.com");
if (!result.valid) {
  console.log(customReasons[result.reasonId!]);
}
```

## Node.js custom MX resolver

```ts
import { resolveMx } from "dns/promises";
import { checkEmail } from "is-mail";

async function nodeResolver(emailDomain: string): Promise<string[] | false> {
  try {
    const records = await resolveMx(emailDomain);
    return records.map((rec) => rec.exchange);
  } catch (error) {
    const err = error as Error;
    if (err.message.includes("ENOTFOUND")) return [];
    return false;
  }
}

const result = await checkEmail("someone@gmail.com", {
  mxResolver: nodeResolver,
});
```

## Build and test

```bash
bun run build
bun test
```
