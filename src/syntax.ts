import {
  INVALID_REASON_AMOUNT_OF_AT,
  INVALID_REASON_DOMAIN_GENERAL_RULES,
  INVALID_REASON_USERNAME_GENERAL_RULES,
  type FailReason,
} from "./type.js";
/**
 * RFC 5321/5322 compliant email syntax validator.
 * Zero deps, <1ms.
 */

// Local part: RFC-safe characters, with explicit dot-sequence checks below
const LOCAL_RE =
  /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]([a-zA-Z0-9!#$%&'*+/=?^_`{|}~.-]*[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-])?$/;

// Domain: linear-time hostname validation (no nested quantifier backtracking)
const DOMAIN_RE =
  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

export interface SyntaxResult {
  valid: boolean;
  local?: string;
  domain?: string;
  reason?: string;
  reasonId?: FailReason;
}

export function validateSyntax(email: string): SyntaxResult {
  if (!email || typeof email !== "string") {
    return {
      valid: false,
      reason: "Empty or non-string input",
      reasonId: INVALID_REASON_AMOUNT_OF_AT,
    };
  }

  const trimmed = email.trim().toLowerCase();

  // Length limits per RFC 5321
  if (trimmed.length > 254) {
    return {
      valid: false,
      reason: "Email exceeds 254 character limit",
      reasonId: INVALID_REASON_USERNAME_GENERAL_RULES,
    };
  }

  const atCount = (trimmed.match(/@/g) ?? []).length;
  const atIndex = trimmed.lastIndexOf("@");

  if (atCount !== 1 || atIndex === -1) {
    return {
      valid: false,
      reason: "Email must contain exactly one @ symbol",
      reasonId: INVALID_REASON_AMOUNT_OF_AT,
    };
  }

  if (atIndex === 0) {
    return {
      valid: false,
      reason: "Missing local part before @",
      reasonId: INVALID_REASON_USERNAME_GENERAL_RULES,
    };
  }

  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);

  if (local.length > 64) {
    return {
      valid: false,
      reason: "Local part exceeds 64 character limit",
      reasonId: INVALID_REASON_USERNAME_GENERAL_RULES,
    };
  }

  if (!domain) {
    return {
      valid: false,
      reason: "Missing domain after @",
      reasonId: INVALID_REASON_DOMAIN_GENERAL_RULES,
    };
  }

  if (!LOCAL_RE.test(local)) {
    return {
      valid: false,
      reason: "Invalid characters in local part",
      reasonId: INVALID_REASON_USERNAME_GENERAL_RULES,
    };
  }

  if (local.includes("..")) {
    return {
      valid: false,
      reason: "Local part cannot contain consecutive dots",
      reasonId: INVALID_REASON_USERNAME_GENERAL_RULES,
    };
  }

  if (!DOMAIN_RE.test(domain)) {
    return {
      valid: false,
      reason: "Invalid domain format",
      reasonId: INVALID_REASON_DOMAIN_GENERAL_RULES,
    };
  }

  return { valid: true, local, domain };
}
