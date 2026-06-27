---
description: Enforce zero hardcoded text strings across the entire workspace
---

---
description: Enforce zero hardcoded text strings, icons, or emotes across the entire workspace with theme-based lexicon routing
globs: src/**/*.(ts|tsx|js|jsx|py|go|html)
alwaysApply: true
---

# STRICT LOCALIZATION & THEMATIC CONSTRAINT
- **CRITICAL:** You are FORBIDDEN from hardcoding raw text strings for labels, icons, emotes, UI text, or human-readable messages.
- **CRITICAL:** You are FORBIDDEN from leaving a key without a fallback string.

# LEXICON ROUTING RULES
You must dual-author or read keys from two specific dictionary files. When a string is added, write both versions:
1. **Standard English (`src/lexicons/en-default.json`):** Use clean, standard, modern technical English.
2. **Sci-Fi / Cyberpunk Theme (`src/lexicons/en-sanctuary.json`):** Translate the standard term into an immersive, cyberpunk, or high-tech equivalent.

### Thematic Translation Examples:
- Standard: "Play Sets" ➡️ Sanctuary: "Blueprints"
- Standard: "Library" ➡️ Sanctuary: "Vault"
- Standard: "Backups" ➡️ Sanctuary: "Time Capsule"
- Standard: "Settings" ➡️ Sanctuary: "System Preferences"
- Standard: "Remove" ➡️ Sanctuary: "Yeet"
- Standard: "Delete" ➡️ Sanctuary: "Purge"

# REFACTORING FAIL-SAFE
- If you cannot find a matching key in these files, you MUST stop execution.
- Generate matching key-value pairs for BOTH files using identical keys but appropriately themed values.
- Append the keys to the JSON dictionaries before modifying or referencing them in the source code.
