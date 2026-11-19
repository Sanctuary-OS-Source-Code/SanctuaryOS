# Sanctuary OS Security Policy

## 1. Supported Versions

Security fixes, cryptographic updates, and **Bytecode Hound** engine hardening are shipped exclusively for active release lines:

| Version / Branch | Support Status | Notes |
| --- | --- | --- |
| `0.6.0-Dev.15+` (`main`) | Active Security Support | Receives immediate patches across Tauri/Rust, React, SQL schemas, and `game-gateway`. |
| `0.7.0` Beta (Planned) | Upcoming Security Support | Will inherit full security telemetry controls and signed multi-OS builds. |
| `1.0.0` GA (Planned) | Long-Term Security Support | Full reproducible Authenticode, notarized macOS, and GPG-signed Linux releases. |
| `< 0.6.0` Legacy Builds | End of Life (Unsupported) | Upgrade to `0.6.0-Dev.15+` immediately. |

## 2. Reporting a Vulnerability Privately

**Do NOT open public GitHub issues, Discord threads, or Comm-Link posts for undisclosed security vulnerabilities.**

Please report suspected vulnerabilities privately through:
- **GitHub Private Vulnerability Reporting** on the repository (`Security -> Advisories -> Report a vulnerability`), or
- **Direct Security Contact:** `security@sanctuaryos.net` (include `[SECURITY]` in the subject line and encrypt sensitive payloads with PGP when available).

Include in your report:
1. Affected surface (`src-tauri` Rust backend, `game-gateway` Edge Function, `schema.sql` / `schema_os.sql` RLS/RPCs, or frontend Web/Desktop shell).
2. Clear reproduction steps, minimal proof-of-concept input, and expected vs. observed impact.
3. Version / commit hash and operating system (`Windows`, `macOS`, `Linux / SteamOS`, or `Web/PWA`).

### Response & Disclosure SLAs
- **Initial Acknowledgment:** Within **48 hours**.
- **Triage & Severity Assessment:** Within **7 calendar days**.
- **Coordinated Remediation Window:** Targeted **14–45 days** (up to **90 days** for complex architectural changes) before public advisory disclosure, unless active exploitation requires expedited release.

## 3. Security Scope & Architecture Model

Primary in-scope security boundaries include:
- **Zero-Knowledge Auth & Passkeys:** `600,000`-iteration client `PBKDF2-HMAC-SHA256` email/password blinding, WebAuthn FIDO2 passkey assertion/registration verification (`webauthnCbor.ts`), and JWT verification in `game-gateway`.
- **Split-Custody Spoke Credentials:** `HKDF-SHA256` + `AES-256-GCM` bound-AAD encryption guarding `spk_gw_*` Spoke Gateway Tokens inside `sanctuary_internal.spoke_credentials`.
- **Rust Filesystem & Intake Sandboxing:** Path traversal guards (`is_safe_user_file_path`), bounded streaming decompression caps (`32 GiB` single entry / `64 GiB` total / `250,000` entries), SSRF URL filtering on direct downloads and schema pulls, and native BSDiff/xdelta binary patch bounds.
- **Bytecode Hound (`Tier 6 Malware`):** Heuristic stream/bytecode inspection, anti-masquerade terminal extension normalization, **Zero-Choice Lockdown** isolation, and Citizen-signed zero-fill **Secure Shred**.
- **Database Row-Level Security (RLS) & Gateway Authorization:** Non-permissive Postgres RLS across `schema.sql` (`61` tables) and `schema_os.sql` (`28` tables), privilege escalation blocks, and rate limiting.

### Out of Scope
- Moderation disputes or **Tier `1–5`** content classifications within independent Partner Spokes (handled by the Spoke's Architect/Oversight/Wayfinder team; see [Moderation Appeals SOP](./Docs/moderation_appeals_and_remediation_sop.md)).
- Deliberate local self-bypass via the offline 5-click **Nuclear Override** toggle.
- Automated volumetric DDoS testing against live Supabase, Vercel, or third-party static mod CDNs.
- Bugs inside third-party game executables or third-party external mods themselves.

## 4. Safe Harbor for Good-Faith Researchers

Sanctuary Foundry authorizes good-faith security research strictly against your own self-hosted Supabase instances or local test workspaces without accessing, modifying, or exfiltrating another Citizen's or Partner Spoke's private data. We will not initiate legal action or pursue **Nuclear Override** sanctions against researchers who follow coordinated private disclosure in good faith under this policy.
