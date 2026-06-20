---
description: Enforce zero hardcoded text strings across the entire workspace
---

---
description: Enforce zero hardcoded text strings across the entire workspace
globs: src/**/*.(ts|tsx|js|jsx|py|go|html)
alwaysApply: true
---

# STRICT LOCALIZATION CONSTRAINT
- **CRITICAL:** You are FORBIDDEN from hardcoding raw text strings for labels, Icons, Emotes, UI text, or human-readable messages.
- **CRITICAL:** You are FORBIDDEN from leving a key without a Fall Back String.
- **MANDATORY SOURCE OF TRUTH:** You must read existing keys or append new keys explicitly to:
  - `\sanctuary-os\src\lexicons\en-default.json`
  - `\sanctuary-os\src\lexicons\en-sanctuary.json`
- **FAIL-SAFE:** If you cannot find a matching key in these files, you MUST stop execution, create a key-value pair, and update the JSON dictionaries before changing the source code. 