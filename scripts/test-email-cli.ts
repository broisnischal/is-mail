#!/usr/bin/env bun
import { checkEmail } from "../src/check.js";

function printUsage(): void {
  console.log("Usage: bun run test:email -- <email> [--json] [--no-mx]");
  console.log("");
  console.log("Examples:");
  console.log("  bun run test:email -- someone@gmail.com");
  console.log("  bun run test:email -- someone@gmail.com --json");
  console.log("  bun run test:email -- someone@gmail.com --no-mx");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const email = args.find((arg) => !arg.startsWith("-"));
  const asJson = args.includes("--json");
  const noMx = args.includes("--no-mx");

  if (!email || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(email ? 0 : 1);
  }

  const result = await checkEmail(email, {
    checkMx: !noMx,
  });

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Email: ${result.email}`);
    console.log(`Valid: ${result.valid ? "YES" : "NO"}`);
    console.log(`Message: ${result.message}`);
    if (!result.valid && result.reasonId) {
      console.log(`Reason ID: ${result.reasonId}`);
    }
    if (result.mxRecords?.length) {
      console.log(`MX: ${result.mxRecords.join(", ")}`);
    }
    console.log(`Checks: ${JSON.stringify(result.checks)}`);
    console.log(`Duration: ${result.durationMs}ms`);
  }

  process.exit(result.valid ? 0 : 2);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`CLI error: ${message}`);
  process.exit(1);
});
