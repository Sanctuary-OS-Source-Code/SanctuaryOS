import type { DirectiveBuilderSchema, DirectiveBuilderCard } from "../types";
import { CURRENT_DIRECTIVE_SCHEMA_VERSION } from "../types";

export function buildForkingGuideSchema(
  t: (key: string, fallback?: string) => string,
  g: (txt: string) => string,
  elevatedRolesCards: DirectiveBuilderCard[]
): DirectiveBuilderSchema {
    return {
      slug: "forking_guide",
      _schemaVersion: CURRENT_DIRECTIVE_SCHEMA_VERSION,
      title: g("Forking & Spoke Provisioning Matrix"),
      summary: g(
        "Interactive schematic for deploying a Sovereign Community Spoke (SANCTUARY-UPLINK://), reviewing Partner Covenants, launching a 1-file Standalone Codebase Fork (src/supabase.ts), or building cross-platform Master Schemas."
      ),
      tabs: [
        {
          id: "spoke",
          icon: t("icon_hub", "hub"),
          label: g("STEP 1"),
          value: g("Spoke Setup"),
          cards: [
            {
              id: "fork_spoke_setup",
              icon: t("icon_hub", "hub"),
              overline: g("OFFICIAL PARTNER NETWORK • ZERO CODE EDITS"),
              badge: t("active", "Active"),
              title: g("Connect a Sovereign Community Spoke in 3 Steps"),
              footerMeta: "SANCTUARY-UPLINK:// • schema.sql",
              desc: g(
                "Join the official Sanctuary OS multi-game network while retaining 100% ownership of your community's Supabase PostgreSQL database. No client forking or code edits required."
              ),
              subCards: [
                {
                  id: "fork_spoke_s1",
                  icon: t("icon_database", "database"),
                  title: g("Step 1: Initialize Your Supabase Spoke (schema.sql) & Mint Token"),
                  desc: g(
                    "Create a free Supabase project, open the SQL Editor, run schema.sql (52 tables, RLS, and gateway auth), then run SELECT public.mint_spoke_gateway_token(); to mint your one-time spk_gw_... token."
                  ),
                },
                {
                  id: "fork_spoke_s2",
                  icon: t("icon_key", "key"),
                  title: g("Step 2: Configure Uplink Bundle & Scoped Gateway Token"),
                  desc: g(
                    "In Keepers Core -> Partner Spokes (or Wayfinder Operations -> Spoke Control), paste your secret-free SANCTUARY-UPLINK:// bundle (Supabase URL + Anon Key) and your spk_gw_... token to seal it inside the Split-Custody Hub Vault. Rotate anytime later in 1 click."
                  ),
                },
                {
                  id: "fork_spoke_s3",
                  icon: t("icon_rocket_launch", "rocket_launch"),
                  title: g("Step 3: Verify Handshake & Provision Founding Wayfinder"),
                  desc: g(
                    "Click 'Test Handshake & Verify Schema'. The game-gateway Edge Function verifies table readiness, seeds global_network_status, and automatically promotes your founder account to Wayfinder."
                  ),
                },
              ],
            },
            {
              id: "fork_spoke_covenants",
              icon: t("icon_gavel", "gavel"),
              overline: g("PARTNER APPLICATION • SOVEREIGN COVENANTS"),
              badge: t("verified", "Verified"),
              title: g("Readiness-Gated Partner Application & Sovereign Covenants"),
              footerMeta: "Partners Agreement • Compliance Protocol",
              desc: g(
                "Prospective community leaders can apply directly from the Landing Page after inspecting and accepting the Sanctuary Partners Agreement and Compliance Protocol."
              ),
              subCards: [
                {
                  id: "fork_cov_s1",
                  icon: t("icon_handshake", "handshake"),
                  title: g("Mandatory Partners Agreement & Compliance Review"),
                  desc: g(
                    "Both covenants open in an interactive overlay drawer during Step 1 of the Partner Application and remain permanently accessible inside Wayfinder Hub -> Spoke Maintenance."
                  ),
                },
                {
                  id: "fork_cov_s2",
                  icon: t("icon_link_off", "link_off"),
                  title: g("Community-Initiated Severance ('Cut the Cord')"),
                  desc: g(
                    "A Wayfinder can execute the phrase-locked 'Cut the Cord' safeguard in Wayfinder Operations at any time—writing an immutable audit log, setting is_active = false, revoking all Spoke Gateway Tokens, and purging the Spoke's sealed Vault credential from the Hub."
                  ),
                },
                {
                  id: "fork_cov_s3",
                  icon: t("icon_volunteer_activism", "volunteer_activism"),
                  title: g("0% Platform Tax & Non-Custodial Community Donations"),
                  desc: g(
                    "Sanctuary OS takes 0% of {mason} Patreon/Ko-fi revenue and 0% of Partner community donations. Export your SANCTUARY-UPLINK:// bundle at any time."
                  ),
                },
              ],
            },
          ],
        },
        {
          id: "standalone",
          icon: t("icon_call_split", "call_split"),
          label: g("FORK MODES"),
          value: g("Standalone & Hub"),
          cards: [
            {
              id: "fork_mode_standalone",
              icon: t("icon_call_split", "call_split"),
              overline: g("MODE 1 • 1-DATABASE STANDALONE"),
              badge: g("1-File Fork"),
              title: g("1-File Standalone Fork (Single Database)"),
              footerMeta: "schema.sql • src/supabase.ts",
              desc: g(
                "Run your own independent Sanctuary OS build backed by a single Supabase project (schema.sql) and a 1-file edit in src/supabase.ts with zero Edge Functions."
              ),
              subCards: [
                {
                  id: "fork_m1_s1",
                  icon: t("icon_bolt", "bolt"),
                  title: g("1. Unified Auth & Direct RPC Engine"),
                  desc: g(
                    "When mode is set to 'standalone', Sanctuary OS automatically routes all 15 secure_* RPCs directly against your single Supabase database with zero Edge Function dependency."
                  ),
                },
                {
                  id: "fork_m1_s2",
                  icon: t("icon_verified", "verified"),
                  title: g("2. Founding Wayfinder & Cryptographic Spoke Profile Relinking"),
                  desc: g(
                    "In federated mode, auth.users lives on the Hub while Spokes store public.profiles and zero-PII SHA-256 relink commitments. When transitioning a severed Spoke to a Standalone Fork, on_auth_user_created_spoke promotes the first local auth.users signup to Wayfinder, and {Citizens} or {Masons} verify their Spoke Relink Token (SRK1.<uuid>.<secret>) at sign-up or in {Settings} -> System ID to cryptographically reclaim their legacy Spoke profile, {Mason} studio, and {Blueprints} without username hijacking."
                  ),
                },
                {
                  id: "fork_m1_s3",
                  icon: t("icon_storage", "storage"),
                  title: g("3. Transparent OS-to-Spoke Table Mapping"),
                  desc: g(
                    "All internal queries to global broadcasts, polls, and support categories automatically map to your single database's system_broadcasts, dispatch_poll_votes, and support_tickets tables."
                  ),
                },
              ],
            },
            {
              id: "fork_mode_hub",
              icon: t("icon_hub", "hub"),
              overline: g("MODE 2 • FULL HUB & SPOKE FEDERATION"),
              badge: g("Hub & Spokes"),
              title: g("Full Hub & Spoke Multi-Game Fork (Hub + Child Spokes)"),
              footerMeta: "schema_os.sql + schema.sql • game-gateway",
              desc: g(
                "Self-host your own central Sanctuary OS Hub (schema_os.sql + game-gateway Edge Function) that authenticates users once and routes across multiple independent community Spoke databases (schema.sql)."
              ),
              subCards: [
                {
                  id: "fork_m2_s1",
                  icon: t("icon_memory", "memory"),
                  title: g("1. Provision Core Hub Database (schema_os.sql)"),
                  desc: g(
                    "Create your central Hub Supabase project and run schema_os.sql in the SQL Editor. This provisions global SSO profiles, auth.webauthn_credentials FIDO2 passkeys, sanctuary_games, sanctuary_schemas, system_directives, and keeper_heuristic_signatures."
                  ),
                },
                {
                  id: "fork_m2_s2",
                  icon: t("icon_cloud_done", "cloud_done"),
                  title: g("2. Set SPOKE_VAULT_MASTER_KEY & Deploy game-gateway"),
                  desc: g(
                    "Generate a 256-bit Split-Custody key (supabase secrets set SPOKE_VAULT_MASTER_KEY=<64-hex-chars>) and deploy supabase/functions/game-gateway to your Hub project to proxy verified cross-database Spoke RPCs."
                  ),
                },
                {
                  id: "fork_m2_s3",
                  icon: t("icon_code", "code"),
                  title: g("3. Point src/supabase.ts at Your Core Hub"),
                  desc: g(
                    "Keep mode set to 'hub_and_spoke' in src/supabase.ts (or set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env) pointing to your central Hub project's URL and Anon Key."
                  ),
                },
                {
                  id: "fork_m2_s4",
                  icon: t("icon_storage", "storage"),
                  title: g("4. Provision & Link Child Spoke Databases (schema.sql)"),
                  desc: g(
                    "For each game community, create a separate Supabase project, run schema.sql, execute SELECT public.mint_spoke_gateway_token(); in the SQL Editor, and register its URL, Anon Key, and spk_gw_... token in Keepers Core -> Partner Spokes."
                  ),
                },
              ],
            },
            {
              id: "fork_mode_schema",
              icon: t("icon_schema", "schema"),
              overline: g("MODE 3 • MASTER GAME SCHEMAS & CROSS-PLATFORM"),
              badge: g("7 Engine Presets"),
              title: g("Master Schema Studio & Windows/macOS/Linux Build Pipeline"),
              footerMeta: "schema.json • Windows .msi, Darwin .dmg & Linux / SteamOS .AppImage/.deb",
              desc: g(
                "Adapt Sanctuary OS to any game engine without touching Rust or React code by configuring a declarative Master Schema JSON in Wayfinder or Keepers IDE."
              ),
              subCards: [
                {
                  id: "fork_m3_s1",
                  icon: t("icon_schema", "schema"),
                  title: g("7 Built-In Engine Architecture Presets"),
                  desc: g(
                    "1-click templates for Binary Chunk + Script, Multi-Folder Asset Tree, Ordered Load List, Virtual Archive Container, XML Load Manifest, JSON Mod Loader, and Universal engines."
                  ),
                },
                {
                  id: "fork_m3_s2",
                  icon: t("icon_laptop_mac", "laptop_mac"),
                  title: g("Windows (.exe), macOS (.app) & Linux / SteamOS Parity"),
                  desc: g(
                    "Supports Windows %USERPROFILE%, macOS ~/Documents & /Applications/*.app bundles, and Linux / SteamOS Proton compatdata prefixes, plus Windows .msi, universal-apple-darwin .dmg, and Linux .AppImage/.deb builds."
                  ),
                },
              ],
            },
          ],
        },
        {
          id: "deploy",
          icon: t("icon_language", "language"),
          label: g("STEP 3"),
          value: g("Deploy & Domains"),
          cards: [
            {
              id: "fork_deploy_branding",
              icon: t("icon_palette", "palette"),
              overline: g("WHITE-LABEL BRANDING • ZERO SCATTERED EDITS"),
              badge: g("Title Area Studio"),
              title: g("Centralized Brand Identity (SANCTUARY_CONFIG.branding & Database Title Area)"),
              footerMeta: "src/supabase.ts • VITE_APP_TITLE • sanctuary_themes",
              desc: g(
                "Customize every app title, organization name, logo, support email, WebAuthn Relying Party ID, and rotating subtitle from SANCTUARY_CONFIG.branding / VITE_* env vars—or edit them live from the database in Wayfinder / Keepers -> Chameleons -> Title Area Studio."
              ),
              subCards: [
                {
                  id: "fork_deploy_b1",
                  icon: t("icon_tune", "tune"),
                  title: g("Compile-Time Env Vars & Uplink Bundles"),
                  desc: g(
                    "Set VITE_APP_TITLE, VITE_ORG_NAME, VITE_LOGO_URL, VITE_SUPPORT_EMAIL, and VITE_WEBAUTHN_RP_ID in .env (or embed branding in SANCTUARY-UPLINK://), and LexiconContext automatically updates copy and document.title."
                  ),
                },
                {
                  id: "fork_deploy_b2",
                  icon: t("icon_auto_awesome", "auto_awesome"),
                  title: g("Database-Driven Title Area Studio"),
                  desc: g(
                    "Both Core Hubs and Standalone Forks unlock Title Area Studio inside Chameleons to push live logos, app names, and subtitles via sanctuary_themes without rebuilding binaries."
                  ),
                },
              ],
            },
            {
              id: "fork_deploy_targets",
              icon: t("icon_devices", "devices"),
              overline: g("SHARED CODEBASE • DESKTOP, PWA & WEB"),
              badge: g("Single Repo"),
              title: g("Build Desktop App, Installable PWA & Web Portal From One Codebase"),
              footerMeta: "package.json • dist/ • src-tauri/target/",
              desc: g(
                "One React + Vite + Tauri codebase deploys everywhere: static web portal, offline-capable PWA, and native desktop builds sharing identical SANCTUARY_CONFIG and environment variables."
              ),
              subCards: [
                {
                  id: "fork_deploy_t1",
                  icon: t("icon_public", "public"),
                  title: g("Web Portal & PWA (npm run build:web:public)"),
                  desc: g(
                    "Run npm run build:web:public (or build:web:beta) inside sanctuary-os/ to output dist/ with public/sw.js and public/manifest.webmanifest ready for Cloudflare Pages, Vercel, or Netlify."
                  ),
                },
                {
                  id: "fork_deploy_t2",
                  icon: t("icon_desktop_windows", "desktop_windows"),
                  title: g("Native Desktop Binaries & Brand Icons"),
                  desc: g(
                    "Replace public/icon.png, run npx tauri icon path/to/icon.png to regenerate Windows/macOS/Linux assets, and compile installers with npm run tauri build."
                  ),
                },
              ],
            },
            {
              id: "fork_deploy_domains",
              icon: t("icon_dns", "dns"),
              overline: g("CUSTOM DOMAINS • AUTH & PASSKEYS"),
              badge: g("HTTPS + WebAuthn"),
              title: g("Domain DNS, Supabase Auth Redirects & Cross-Platform Passkeys"),
              footerMeta: "CNAME / ALIAS • Auth Redirects • rp_id",
              desc: g(
                "Link your custom domain cleanly across web, mobile PWA, and native desktop deep links without breaking OAuth callbacks or FIDO2 passkeys."
              ),
              subCards: [
                {
                  id: "fork_deploy_d1",
                  icon: t("icon_link", "link"),
                  title: g("DNS Records & Supabase Redirect Allowlist"),
                  desc: g(
                    "Point CNAME/ALIAS records to your static host with SPA fallback to /index.html, then set Site URL and add https://your-domain.com/**, http://localhost:1420/**, and sanctuary://** in Supabase Auth URL Configuration."
                  ),
                },
                {
                  id: "fork_deploy_d2",
                  icon: t("icon_fingerprint", "fingerprint"),
                  title: g("Matching WebAuthn rp_id Across Web & Desktop"),
                  desc: g(
                    "Set VITE_WEBAUTHN_RP_ID to your apex/host domain (such as example-mods.org) so passkeys enrolled in the browser validate inside desktop builds too."
                  ),
                },
              ],
            },
          ],
        },
        {
          id: "sql",
          icon: t("icon_database", "database"),
          label: g("STEP 4"),
          value: g("SQL Schemas"),
          cards: [
            {
              id: "fork_sql_spoke",
              icon: t("icon_storage", "storage"),
              overline: g("Spoke & Standalone DB • 52 Tables"),
              badge: "schema.sql",
              title: g("schema.sql (52 Tables)"),
              footerMeta: "Community Spoke & Standalone Fork SQL",
              desc: g(
                "Idempotent copy-paste community registry schema (mods, blueprints, citizen_staging_queue, masons, conflicts, tickets, heuristics, pending-flag triggers, RLS policies, and Founding Wayfinder trigger)."
              ),
              subCards: [],
            },
            {
              id: "fork_sql_hub",
              icon: t("icon_dns", "dns"),
              overline: g("Core Hub Federation DB • 22 Tables"),
              badge: "schema_os.sql",
              title: g("schema_os.sql (Core Hub DB)"),
              footerMeta: "Central Multi-Game Federation SQL",
              desc: g(
                "Central multi-game federation schema (global SSO profiles, FIDO2 passkeys, sanctuary_games directory, master schemas, global lexicons/themes, and core heuristics)."
              ),
              subCards: [],
            },
          ],
        },
      ],
    };
}
