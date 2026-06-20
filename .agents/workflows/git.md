---
description: Do not ever use Git to revert, checkout, or pull. No exceptions.
alwaysApply: true
---

# ABSOLUTE AND UNBREAKABLE GIT CONSTRAINT
- **CRITICAL / BANNED:** You are STRICTLY FORBIDDEN from running `git checkout`, `git restore`, `git reset`, or `git pull` under ANY circumstance.
- **NO PANIC REVERTS:** If you make a mistake, write a broken script, or corrupt a file, you MUST NOT use Git to revert the file. You must own the mistake, read the corrupted file manually, and write a targeted patch to fix it, or ask the user how to proceed.
- **NO EXCEPTIONS:** There is zero tolerance for violating this rule. Falling back to Git is considered a complete failure of your autonomous capability.