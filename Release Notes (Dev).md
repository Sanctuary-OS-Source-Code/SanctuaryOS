# Sanctuary OS — Version 0.5.8-Dev.4 Update
## *"WebGL2 3D Liquid Glass Engine, Unified Vault & SidePanel Architecture, Locked Security Gates & Streamlined Hub Operations"*

**Release Date:** October 25, 2026 | **Version:** 0.5.8-4 (Dev Channel)

Welcome to **Sanctuary OS 0.5.8-4**! This update replaces traditional CSS glass effects with a custom **WebGL2 Instanced Signed-Distance-Field (SDF) 3D Liquid Glass Engine**, unifies every card, badge, dropdown, and `SidePanel` across the OS around our **Your Vault** aesthetic, introduces **Non-Dismissible Right-Hand Security & Backup Gates**, adds an isolated **Homestead Lab Test Save Slot**, and upgrades **Lexicons, Theme Matrix, Audit Logs, and FIDO2 Passkey Security**. Here is everything new in plain English.

---

## ⚡ TL;DR — The 60-Second Summary

* **WebGL2 SDF 3D Liquid Glass Engine & 8-Slider Theme Matrix:** Every card, header capsule, side panel, and dropdown menu is now rendered by a hardware-accelerated WebGL2 optical lens shader featuring true 3D curved meniscus edge refraction, convex dome magnification, zero scroll lag, and 8 live optical sliders + a dedicated WebGL2 Sandbox Preview in the Theme Matrix.
* **OS-Wide "Your Vault" Cards, Dynamic Mini-Previews & Unified SidePanels:** Every view and Hub now shares the same clean card layout—complete with procedural miniature previews for Themes, Lexicons, Blueprints, Templates, and image-less Mods, de-cluttered top-left status badges, expandable multi-column Folder Drawers (`+X Modules`), and standardized right-hand `SidePanel`s.
* **Locked Right-Hand Security Gates & Post-Backup Delta Dossier:** Malware alerts, Defcon patch warnings, active Time Capsule backups, and workspace preparation now use a non-dismissible right-hand `SidePanel` gate that locks the background OS while keeping the wallpaper crystal clear—and Time Capsule backups now stay open when finished to show your exact **Written to Disk**, **Storage Saved**, and **File Diffs**.
* **Isolated Homestead Lab Test Save & Preloaded Conflict Radar:** Homestead Lab now uses a dedicated sandbox save slot (never touching or auto-cloning your live saves unless you choose to copy one), automatically links Dependencies & Conflicts in Lab Reports, and preloads Conflict Radar caches so conflict counts appear instantaneously.
* **21-Term Dynamic Lexicon Engine, Keepers Title Area & FIDO2 Passkeys:** Customize 21 core domain terms (`{Mod}`, `{Vault}`, `{Blueprint}`, `{Mason}`, etc.) that automatically adapt grammar and casing across the entire OS, while Elevated Hubs are protected by native Windows `webauthn.dll` & Web FIDO2 Passkey verification.

---

## 🎮 For Players (Citizens)

### 1. WebGL2 3D Liquid Glass Engine & Live Theme Matrix
We replaced browser CSS blur filters with a custom hardware-accelerated **WebGL2 Instanced SDF Optical Engine**:
* **True 3D Curved Meniscus Refraction:** Every `.glass-panel` and `.glass-surface` card, header capsule, `SidePanel`, and dropdown menu computes its exact rounded geometry on the GPU—bending background wallpaper details along a curved perimeter bevel while maintaining a smooth frosted smoked-crystal interior on both Dark and Light themes.
* **8 Live Optical Controls & WebGL2 Sandbox:** Open the **Theme Matrix** to tune **Glass Opacity**, **Refractive Blur**, **Refractive Saturation**, **Lens Refraction**, **Meniscus Bezel**, **Specular Glare**, **Elevation Depth**, and **Rim Outline** at 60 FPS inside a dedicated WebGL2 Sandbox Preview, or pick from **6 1-Click Liquid Glass Materials** and **8 Color Harmony Palettes**.
* **Sculpted Header Capsules, OS-Themed Dropdowns & Defcon-Aware Quick Launch:** Page headers (`ViewHeader`), `SidePanel` titles, and the Sidebar Brand Header now sit inside refracted Liquid Glass capsules. All dropdown menus now use the WebGL2 glass pipeline with 3D active selection pills, `<StatTileCarousel>` supports smooth mouse-wheel horizontal scrolling with centered scroll arrows, and the **Quick Launch** button shifts dynamically between **Operational Green** and **Defcon Red**.

### 2. Unified "Your Vault" Cards, Dynamic Previews & Multi-Column Folder Drawers
* **Dynamic Procedural Preview Banners:** Cards without custom cover art now generate live miniature previews right inside the top banner—including a mini Sanctuary OS window for **Chameleons**, a 2x2 terminology matrix for **Lexicons**, a `#01–#03` load-order stack for **Blueprints**, interactive control previews for **Workbench Templates**, and a 3-pill metadata HUD (`Suite` / `Script` / `Package`, target patch, and requirements) for **Mods**.
* **De-Cluttered Badge Zones:** To keep card banners clean and readable, the **Status** chip (`Stable`, `Verified`, `Update`, `Conflict`, `Synced`) sits in the top-left corner of the banner, **Category & Type** chips sit in the card body, and **`+X Modules`** sits in the card footer.
* **Full-Width Multi-Column Folder Drawers:** Clicking a multi-module mod folder in **Your Vault** or **The Nexus** expands a full-width multi-column drawer with an inline search bar so you can inspect or filter sub-packages effortlessly.
* **60+ FPS Vault Scrolling & Instant Startup:** Parent-culled GPU scanning, lazy folder unmounting, and `0ms` cached workspace hydration make launching Sanctuary OS and scrolling through thousands of mods faster than ever.

### 3. Locked Security Gates, Time Capsule Delta Dossier & Zero-Reload Sign-In
* **Full-OS Malware, Defcon & Backup Lockdown Gates:** When Malware is quarantined, a Defcon game patch alert triggers, or a Time Capsule backup runs, Sanctuary OS locks the background interface and opens a non-dismissible right-hand `SidePanel` with a live block cursor hovertip (`OS Locked`). Malware gates persist across app restarts until every quarantined threat is shredded via **Secure Shred**.
* **Post-Backup Completion Summary & `.delta_manifest.json` Explorer:** When a Time Capsule or Defcon backup finishes, the `SidePanel` unlocks and presents a complete **Snapshot Dossier** showing **Written to Disk**, **Storage Saved** (via hardlink deduplication), **Snapshot Size**, and **Indexed Files**, plus a 3-tab explorer (**Backed Up Delta**, **Live Folder Diff**, and **Extract**).
* **Right-Hand Login `SidePanel` & Reworked Workspaces Directory:** Signing in or registering now slides open a right-hand `SidePanel` directly over your current screen with zero page reload, and the **Workspaces** drawer features unified smoked-crystal game cards with 1-click **Enter Workspace** switching.

### 4. Homestead Lab Sandbox Save Slot & Preloaded Conflict Radar
* **Dedicated Lab Sandbox Save Slot:** Homestead Lab no longer automatically clones your latest live save. Instead, it maintains an isolated testing save inside `.sanctuary_lab_sandbox/saves` and includes a **Lab Test Save Configuration** panel where you can start with a clean empty sandbox or copy over any existing `.save` file whenever you choose.
* **Automatic Lab Report Loadouts & Preloaded Conflict Radar:** Lab Reports now automatically resolve and display tested **Dependencies**, **Conflicts**, and `.package`/`.ts4script` twins beneath a prominent **Tested Mod** banner. Meanwhile, Conflict Radar precomputes and caches conflict counts during every radar sweep and Blueprint swap so your conflict breakdown loads immediately.

### 5. Interactive Single-Column System Directives
* **Click-to-Expand Walkthroughs & Roadmaps:** All 5 System Directives on the Landing Page (**Citizen Guide**, **Phase 12 $\rightarrow$ 1 Chronology**, **Forking & Spoke Provisioning Guide**, **Master Architecture**, and **Master Protocols**) now use a 1x3 top filter bar above a single-column vertical card stack where inactive steps stay compact and dimmed (`50%` opacity) and the selected step expands in-place with **Previous / Next** navigation.

---

## 🛠️ For Mod Creators, Scouts, Wayfinders & Keepers

### 1. 21-Term Dynamic Lexicon Studio & Keepers `Title Area`
* **81% Leaner Lexicons & 21 Dynamic `{Glossary}` Tokens:** We streamlined Lexicon packs from `6,128` raw keys down to `1,168` curated core keys powered by **21 Dynamic Glossary Tokens** (`{Mod}`, `{Vault}`, `{Blueprint}`, `{Mason}`, `{Citizen}`, `{Backups}`, `{Lab}`, `{Settings}`, `{Nexus}`, `{Chameleon}`, `{Lexicon}`, `{Dispatch}`, `{Delete}`, `{Remove}`, and more). Changing a core term once automatically updates every matching string across the OS with smart Title/lower/UPPER casing and `a`/`an` grammar (`"a {mod}"` $\rightarrow$ `"an Artifact"`).
* **Keepers Core `Title Area` & Full Spoke/Mason Lexicon Freedom:** Only 3 core brand elements are locked to Keepers Core—the **Two-Tone OS Title**, **Rotating Subtitles**, and **OS Logo** (managed in `Keepers Core → Core Aesthetics → Title Area` via the `Title & Subtitles` IDE card and `Logo & Brand Header` `SidePanel`). Community Wayfinders and Masons have 100% freedom to customize all other keys—including **Core Terms**, **OS Modules**, **Sidebar & View Titles**, **Landing Strings**, and **Icon Overrides**—inside the 4-tab **Lexicon Visual Studio**.
* **`Closed = Closed` IDE with Automatic Draft Caching:** Closing the Lexicon or Schema IDE drawer now closes the file cleanly without leaving floating side tabs on screen, while any unsaved edits are automatically cached in `localStorage` (`Unsaved` badge on the card) with a 1-click **Revert Unsaved Changes** button in the IDE header.

### 2. 3-Mode Visual Post Builder & Consolidated Elevated Hubs
* **In-Place 3-Mode Post & Directive Editor (`Visual` / `Editor` / `Raw`):** All 6 Post, Dispatch, Release Notes, and Directive editors now share a unified 3-mode editor where **Visual Mode** lets you click any **Intro Box**, **Section Header**, or **2-Column Info Card** directly on the canvas to edit in-place, reorder (`↑`/`↓`), or add new cards without touching raw Markdown.
* **Streamlined Wayfinder Operations, Oversight & Keepers Core:**
  * **Keepers Core → Web Landing:** Consolidated `News`, `Directives` (with two-way `.md` file sync), and `Legal` into a single **Web Landing** hub.
  * **Identity & `{Masons}` Hub:** Combined Mason Linker and Identity Matrix into a unified 4-tab view (`Overview`, `{Citizens}`, `Verified {Masons}`, `Unlinked {Masons}`).
  * **Malware & Manifests Hub:** Combined Malware Triage, Heuristics (Spoke & Core), and Threat Manifests into a single 5-tab command view with 1-click Spoke Threat Manifest reporting.
  * **Wayfinder Spoke Control:** Unified Spoke Setup, Bilateral Severance (*Cut the Cord*), Interactive Forking Guide, 0%-Cut Donations, Audit Logs, and Keepers Support under **Spoke Control** with actionable **Recent & Anomalies** monitoring.

### 3. Dual-Write Audit Logs with Field-Level Diffs & Rolling Retention
* **Spoke $\rightarrow$ Core Dual-Write & Strict Isolation:** Spoke staff actions automatically dual-write to both the active Spoke database and the Core OS Hub (with game attribution), while Keepers Core actions remain strictly isolated to Core OS (`role = 'keeper'` RLS).
* **Field-Level Before/After Diffs & Cold Archive Export:** Audit Log entries now record exact field-level changes (`Previous Value → New Value`), resolve `@username` handles automatically, and support server-side pagination, `JSON`/`CSV` cold-storage exports, and 90-day retention pruning.

---

## 🛡️ Security & Authentication

* **FIDO2 / WebAuthn Passkeys (Web + Native Windows `webauthn.dll` Bridge):** Enroll and verify hardware security keys, Windows Hello, Touch ID, or passkeys via direct `/auth/v1/passkeys` transport and our native Windows `webauthn.dll` desktop bridge (plus full subdomain verification across `sanctuaryos.net` and `www.sanctuaryos.net`). General Citizen features support Password + 6-digit TOTP 2FA, while Elevated Hubs (`Workshop`, `Console`, `Command`, `Operations`, `Keepers Core`) enforce a phishing-resistant FIDO2 Passkey step-up once per session.
* **Email Privacy Masking:** Raw email addresses are automatically masked (`j***@outlook.com`) across all 2FA/Passkey factor lists, account security drawers, and native Windows Security prompts.
* **eMudhra / emSign CA Revocation & Node 24 LTS Build Hardening:** Upgraded Sanctuary OS's Rust TLS trust store (`rustls 0.23.46`, `rustls-webpki 0.103.16`, `aws-lc-rs 1.18.2`) to explicitly block compromised eMudhra / emSign certificates and upgraded all CI/CD release builders to **Node.js 24 LTS**.
