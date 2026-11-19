# Spoke Schema Migration Runbook & Fork / Trademark Policy

**Effective Date:** November 18, 2026 | **Document ID:** `SOP-GOV-04 (V1.0)`

---

## 1. Incremental Hub & Spoke SQL Migrations

Sanctuary OS tracks database schema compatibility automatically using `public.schema_migrations`, `public.get_spoke_schema_version()`, and incremental SQL scripts inside [`migrations/spoke/`](../migrations/spoke) and [`migrations/hub/`](../migrations/hub):

| Version | Migration Filename | Summary |
| --- | --- | --- |
| `1` | `0001_initial_baseline.sql` | Baseline 61-table Spoke (`schema.sql`) & 28-table Hub (`schema_os.sql`) tracking marker. |
| `2` | `0002_scale_and_migrations.sql` | Section 10 million-citizen scale primitives (`counter_shards`, statement-level `pwa-web-push` queue batching, advisory-locked staging GC, Spoke-owned wallpaper Storage buckets). |
| `3` | `0002_compliance_tiers_0_to_6_remapping.sql` / `0003_compliance_tiers_0_to_6_remapping` | Remaps canonical compliance tiers (`0` Clean, `1` Legal/DMCA Hold, `2` Explicit, `3` Illicit, `4` Extreme Violence, `5` Taboo, `6` Malware), updates `purge_flagged_hash_from_blueprints` & `NOT IN (1, 2, 3, 4, 5)` filters, and aligns `get_spoke_schema_version() = 3`. |

### Zero-Downtime Upgrade Checklist for Wayfinders & Standalone Forks
1. **Snapshot First:** Create a manual Supabase database backup / point-in-time checkpoint in your Supabase Dashboard before running migrations.
2. **Inspect Current Version:** Run `SELECT public.get_spoke_schema_version();` (or inspect `public.schema_migrations`) in your Supabase SQL Editor.
3. **Apply Pending Scripts in Order:** Execute each higher-numbered script in `migrations/spoke/` sequentially inside a transaction (every official migration script is written idempotently). Never skip numbered versions.
4. **Verify Edge / App Compatibility:** Deploy matching `game-gateway` updates (for Hub & Spoke forks) or build against your matching `main` release tag (for Standalone Forks), then run **Test Handshake & Verify Schema** inside Wayfinder / Keepers Hub.

### Master Schema (`sanctuary_schemas`) Compatibility Contract
- `sanctuary_schemas` JSON configurations resolve additively with safe null/empty fallbacks (`schema.rs`).
- Adding optional fields (e.g., `runtime_output_capture`, `ini_mutations`, `profile_isolated_dirs`, `post_deploy_hooks`) does not break older Spokes; removing or renaming active fields requires a coordinated release note and automatic fallback normalization in `getSafeSchema()`.

---

## 2. Open-Source License Freedom vs. Sanctuary OS Trademark Policy

**Sanctuary OS** source code is irrevocably free software under the **GNU General Public License v3.0 ([LICENSE](../LICENSE))**. You have complete legal freedom to clone, audit, modify, recompile, self-host, and redistribute derived software under GPLv3—using our zero-conflict [`sanctuary.fork.json`](../Sanctuary%20OS%20Forking%20&%20Architecture%20Guide.md) workflow.

However, **GNU GPLv3 grants rights to code, not trademarks, service marks, or official release identities**:

### Mandatory Rules for Third-Party & Community Forks
1. **Distinct Branding (`branding` & Icons):** Standalone or third-party Hub forks distributed to end users MUST configure their own distinct application title (`branding.appName`), support email, logo (`icon.png`), and WebAuthn Relying Party domain (`webauthnRpId`)—never using the **Sanctuary OS**, **Sanctuary Foundry**, or **Keepers Core** names/logos in a manner that suggests official Sanctuary Foundry endorsement or misleads Citizens about who operates the servers.
2. **Updater Endpoint Isolation (`updater`):** Forks MUST set `updater.releaseRepo` (`VITE_GITHUB_RELEASE_REPO`) and `updater.pubkey` (`TAURI_UPDATER_PUBKEY`) to their **own** release repository and signing key, OR leave updater endpoints unconfigured. Pointing a modified fork's silent updater at official `Sanctuary-OS-Source-Code` feeds—or spoofing official release metadata—is strictly prohibited.
3. **Permitted Attribution ("Powered by Sanctuary OS" / "Forked from Sanctuary OS"):** Truthful nominative attribution (e.g., *"Skyrim Mod Hub — Powered by Sanctuary OS (GPLv3)"*) with a link back to the upstream source repository is welcomed and encouraged!
4. **Source Availability Compliance:** Anyone distributing compiled installers (`.msi`, `.exe`, `.dmg`, `.AppImage`, `.deb`) of a modified fork MUST provide corresponding complete machine-readable source code under **GNU GPLv3 § 6**.
