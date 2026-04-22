---
"mailcheckr": patch
---

Adjust SMTP probe behavior so unverifiable SMTP results no longer mark addresses as invalid when MX/domain checks pass.

Improve reliability by updating tests to use deterministic mocked SMTP outcomes and document the new behavior.
