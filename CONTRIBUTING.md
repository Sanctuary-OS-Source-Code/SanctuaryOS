# Contributing to Sanctuary OS

Thank you for contributing to **Sanctuary OS**. This repository is an open-source, game-agnostic modding operating system licensed under the **GNU General Public License v3.0 (`GPL-3.0`)**.

---

## 1. Licensing & Contributor Terms (Inbound = Outbound)

- By submitting a Pull Request, patch, schema preset, or localization contribution, you represent that the work is your original creation (or properly licensed under GPLv3-compatible terms) and agree to license your contribution to the project under **GNU GPLv3** (`LICENSE`).
- All architectural source code remains free software under [LICENSE](./LICENSE). Community Spokes and Standalone Forks may not strip copyright notices, GPLv3 source availability obligations, or impersonate official Sanctuary OS channels ([Trademark & Forking Policy](./Docs/spoke_schema_migration_and_trademark_policy.md)).

---

## 2. Non-Negotiable Engineering Rules

All pull requests MUST pass automated checks and strictly adhere to the Sanctuary OS architecture invariants:

### A. 100% Game-Agnostic & Schema-Driven Kernel
- **Zero Hardcoded Game Identifiers:** You MUST NOT hardcode game-specific extensions (e.g., `.package`, `.ts4script`, `.esp`, `.pak`, `.archive`), publisher/game directories, launcher Steam/Xbox App IDs, manifest/log filenames (`plugins.txt`, `Resource.cfg`, etc.), or `game_id === "..."` branches inside `src-tauri/`, `src/`, `supabase/functions/`, or `*.sql`.
- **Master Schema Resolution:** Every path, extension, load-order template, binary header parser, cache cleanup target, exception matcher, and save airgap rule resolves dynamically from the active `GameSchema` (`sanctuary_schemas` / `schema.rs`). Explicit preset catalogs (`src/data/schemas/*.json` and `src/utils/gameArchitecturePresets.ts`) are the **only** permitted locations for per-game preset data.

### B. Lexicon Engine V2 & Zero Hardcoded UI Strings / Icons
- **Wrap Every Human-Readable String:** Use `t("canonical_key", "Clean Standard English with {Glossary} tokens")` everywhere in TypeScript/React. Never leave a `t("key")` call without a fallback string.
- **Wrap Every Material Icon:** Always write `t("icon_name", "name")`. Do NOT add `"icon_name": "name"` entries to JSON lexicon files (`LexiconContext.tsx` auto-resolves `icon_<glyph>` unless overridden by a theme).
- **Reuse Canonical Keys First:** Check `sanctuary-os/src/lexicons/en-default.json` for canonical keys (`save`, `cancel`, `delete`, `edit`, `overview`, `settings`, `search`, `filters`, etc.) before inventing new keys. Never duplicate identical Standard English strings into Sparse Delta files (`en-sanctuary.json`, `en-sims.json`, `Simlish.json`).
- **Auto-Sync Before Committing:** Run `node scripts/sync-lexicons.mjs` inside `sanctuary-os/` to synchronize `en-default.json` and prune unused keys cleanly.

### C. UI Primitives & Liquid Glass Consistency
- **Banned Components:** Do NOT use `<PillTabs>` or `<PillTabButton>`.
- Use `<StatTileCarousel>` + `<DashboardStatTile variant="tab">` for primary view navigation (one row per page), `<ActionPill>` (`primaryPopover`) for sub-filtering, and `<SidePanel>` for contextual drawers.

### D. Zero-Merge-Conflict Fork Development (`sanctuary.fork.json`)
- To test against your own Supabase project without dirtying tracked configuration files (`src/supabase.ts`, `src-tauri/tauri.conf.json`), copy `sanctuary-os/sanctuary.fork.example.json` to `sanctuary-os/sanctuary.fork.json` (git-ignored) and validate with:
  ```bash
  cd sanctuary-os
  npm run fork:configure -- --check
  ```

---

## 3. Local Development & Mandatory Pre-PR Verification Gates

1. **Install dependencies:**
   ```bash
   cd sanctuary-os
   npm install
   npm run tauri dev
   ```
2. **Run ALL 6 CI verification gates locally before opening a Pull Request:**
   ```bash
   cd sanctuary-os
   node scripts/sync-lexicons.mjs --check
   npx tsc --noEmit
   npx tsc -p tsconfig.node.json --noEmit
   npx tsc -p supabase/functions/tsconfig.json --noEmit
   npm test
   cd src-tauri && cargo test
   ```
3. **Pull Request Checklist:**
   - Clearly describe what changed, which module/schema fields are affected, and any database migrations (`migrations/hub/` or `migrations/spoke/`) required.
   - Confirm no `.env`, `sanctuary.fork.json`, or Supabase credentials are staged.
   - Update relevant user/developer documentation if public protocols, schema fields, or CLI commands changed.
