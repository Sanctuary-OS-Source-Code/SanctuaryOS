# Pulse of the Foundry Version 0.6.0-Dev.2
### WebGL2 Optical Glass, OS-Wide Context Menus, Multi-Rig Blueprint Queueing, Mod Version History & Zero-PII Security Overhaul
**Release Date:** 11/04/2026 | **Version:** 0.6.0-Dev.2 | **Platform:** Windows, MacOS, Linux & SteamOS

Welcome to **Sanctuary OS v0.6.0-Dev.2**! This Dev Build upgrades our visual engine to **1:1 Physical-Pixel WebGL2 Optical Glass** with **8 lossless 2K wallpapers**, brings **OS-wide right-click context menus** to every card and hub, introduces zero-extra-byte **Mod Version History & Whole-Family Rollbacks**, adds **Multi-Rig Blueprint Queueing** with a **Zero-PII Mobile Companion Radar** and **Guided Batch Updater (`1 of N`)**, and hardens cross-platform privacy and **SteamOS / macOS / Windows** performance. Here is everything new in plain English.

---

## ⚡ TL;DR — The 60-Second Summary

* **WebGL2 Optical Glass & 8 Lossless 2K Wallpapers:** Upgraded the 3D Liquid Glass engine to 1:1 physical-pixel clarity with real Snell's Law edge bevels—now extending to floating dropdowns and hovertips—paired with 8 rebuilt `2560×1440` lossless PNG theme wallpapers and clean, grid-free section headers.
* **OS-Wide Right-Click Context Menus & Chameleon Text Highlight:** Right-click any mod, Play Set, Nexus item, theme, Comm-Link post, Workbench file, backup, conflict, or admin record for instant quick actions without opening a side panel, plus a soft Chameleon-tinted text highlight.
* **Zero-Byte Mod Version History & Family Rollbacks:** Every mod is now archived into `Backups/Mods/` from Version #1 using zero-extra-byte hardlinks. Roll back an entire multi-file mod suite together, toggle **Keep Multiple** vs. **Keep One**, or let Sanctuary **Auto-Swap Versions** when your game updates or rolls back.
* **Multi-Rig Play Set Queue, Mobile Companion Radar & Guided Updater (`1 of N`):** Edit Play Sets in-place from your phone or browser, deploy queued loadouts across multiple PCs and Steam Decks (**Leave in Cloud** vs. **Shred After Deploy**), check your encrypted Desktop Vault health on Mobile, and step through updates with the **Guided Batch Updater (`1 of N`)**.
* **Custom Hotkeys, Steam Deck Controller Mapping & Workbench v2.0:** Record custom keyboard shortcuts or map **Steam Deck / Gamepad buttons** (`L1 + R1`, `A`, `B`, `X`, `D-Pad`) in the `Ctrl+K` Command Matrix, and edit `Min / Max` array settings in the upgraded **Citizen's Workbench**.
* **Zero-PII Privacy Scrubber, 12-Hour Passkey Seal & SteamOS/macOS Fixes:** Expanded crash-log scrubbing across Windows, Mac, Linux, and Proton paths (plus IPs, MACs, SIDs, and HWIDs), added a **12-hour Device-Bound Passkey Seal**, enforced strict **Tier 0 Isolation** in the Architect Console, and fixed SteamOS `.AppImage` launch and `1280×800` handheld scaling.

---

## 💎 WebGL2 Optical Glass, 8 Lossless 2K Wallpapers & Zero-Grid Headers

* **Crystal-Clear 1:1 WebGL2 Optical Glass:** Card and panel interiors now map your background wallpaper at exact 1:1 physical-pixel resolution with soft `4px–6px` optical diffusion so background details stay crisp and readable, framed by `8px–13px` 3D refractive bevels and subtle prism catchlights across Dark and Light themes.
* **3D Liquid Glass Dropdowns & Hovertips:** Floating dropdown menus and hover tooltips now render through a dedicated second WebGL2 glass layer—bending light around curved corners while cleanly shielding the text and buttons underneath.
* **8 Rebuilt `2560×1440` Lossless Wallpapers:** Re-rendered all 8 built-in Chameleon theme wallpapers (**Architect**, **Bunker**, **Plumbob Nocturne**, **Plumbob Crystal**, **Radiant**, **Aurora**, **Miami Vice**, and **Dracula**) as true 2K QHD lossless PNGs using 5K supersampling and sharp crystal masks with zero blur or pixel stair-stepping.
* **Clean Floating Section Headers & Divided Action Boxes:** Removed the horizontal and vertical grid lines running beside section headers across Command Center, Overview screens, Homestead Lab, and Elevated Hubs. Header action buttons, panel toolbar buttons, and filter buttons now sit in clean full-height divided compartments with edge-straddling hover paddles on stat carousels.
* **Concentric Rounded-Square Icons & Sculpted Toggle Keycaps:** Tuned corner radii across the sidebar brand emblem, view headers, card icon boxes, and `.sa-glass-toggle` switches so every icon box and toggle keycap forms a balanced rounded square, paired with the new **Sovereign Co-Pilot Crest** app icon across Desktop, Mobile, and installers.
* **Live Theme Studio Editing & Instant Card Actions:** Fixed an issue where top-right banner buttons on Theme and Language cards could be blocked from clicking, enabled inline renaming on built-in themes (automatically saving a custom copy), and made **Theme Forge** preview your edits live without losing changes when closed.

---

## 🖱️ OS-Wide Right-Click Context Menus, Command Matrix & Steam Deck Controls

* **Right-Click Anything for Instant Actions:** Right-clicking any card across **Your Vault**, **Blueprints**, **The Nexus**, **Chameleon Themes**, **Comm-Link**, **Citizen's Workbench**, **Time Capsule**, **Conflict Radar**, **Homestead Lab**, or any **Elevated Hub** now opens a Liquid Glass context menu with a mini header card and flyout submenus (like adding a mod suite straight to a Play Set or local folder, equipping a Play Set, or previewing a theme).
* **Translucent Chameleon Text Selection:** Highlighting text anywhere in Sanctuary OS now uses a soft, glowing translucent highlight matched to your active Chameleon theme's accent color instead of harsh browser blue, paired with a restyled right-click copy/paste menu.
* **Custom Keyboard Hotkeys & Steam Deck Controller Mapping:** Open the `Ctrl+K` **Command Matrix** (or **System Preferences → Vault & Workflow**) to record custom keyboard shortcuts and bind **Steam Deck / Gamepad controller buttons** or 2-button chords (like `L1 + R1`) to any OS action.
* **Deeper `Ctrl+K` Search for Creators, Configs & Panels:** The Command Matrix now searches verified and local **Masons** (with 1-click profile jump), opens `.cfg`/`.ini`/`.json`/`.xml` files straight into the **Citizen's Workbench**, triggers **Lockdown Vault**, and jumps directly to all 13 Command Center and OS side panels.
* **Chronological Comm-Link Feeds & Non-Destructive Creator Profiles:** Pinned posts now stay at the top of a creator's own **Mason Profile** while keeping the **Command Center** and **Global Comm-Link** feeds strictly chronological or top-rated. Plus, opening a **Mason Profile** from a Mod Dossier or post drawer now stacks cleanly on top without closing your previous panel.
* **Sharper Command Center Tiles & Consolidated `Yeet All` Button:** **Your Vault** and **Blueprints** stat tiles now use crisp white icons, **Updates Available** (`accent`) and **System Alerts** (`warning`) color both their icon and number with matching tooltip icons, and the Alerts drawers combine duplicate remove buttons into one **Remove All (`Yeet All`)** button with a detailed breakdown tooltip.

---

## 📦 Mod Version History, Multi-Rig Blueprint Queue & Mobile Companion Radar

* **Zero-Byte Mod Version History (`Backups/Mods/`):** Every `.package` and `.ts4script` file is now archived into `<Vault>/Backups/Mods/` from Version #1 using OS hardlinks—taking **zero extra disk space** while active and keeping a clean backup copy whenever you update a mod. Sanctuary also consolidates duplicate binaries across subfolders so only one active copy ever runs.
* **Whole-Family Suite Rollbacks & Auto-Swap Versions:** Open the new **Version History** drawer in **Your Vault** (or click **Versions** inside any **Mod Dossier**) to browse every saved revision, roll back an entire multi-file mod suite together via the **Suite Revision Matrix**, toggle **Keep Multiple** vs. **Keep One**, or turn on **Auto-Swap Versions** so Sanctuary automatically swaps in compatible mod versions when your game updates or rolls back.
* **Multi-Rig Blueprint Queue (`Leave in Cloud` vs. `Shred After Deploy`):** The top-bar queue badge now counts **`+1` per queued Play Set** with a **Queued Play Sets Selector** and **Changes & Alerts | Missing | All** tabs. Edit any Desktop Play Set in-place from your phone (`+Added` / `-Removing`), and choose **Leave in Cloud** (marking each rig **Complete on This Rig** as you deploy across your Desktop PC and Steam Deck) or **Shred After Deploy**.
* **Zero-PII Mobile Companion Radar & Static Edge Polling:** Open **My Vault Patch Radar** on Mobile or Web to see your exact Desktop counts (`Your Vault`, `Critical Failures`, `System Alerts`, `Updates Available`, and `Blueprints`) encrypted end-to-end with AES-256-GCM—including decentralized `manifest.json` update checks for Tier 1–4 and unverified mods.
* **Side Browser Guided Batch Updater (`1 of N`):** Need to download 8 mod updates? Click **Guided Batch Update** to open a `1 of N` stepper bar at the top of the **Side Browser** that loads each creator's download page in order and automatically advances to `2 of N` the second your download finishes.

---

## 🛡️ Zero-PII Privacy Overhaul, 12-Hour Passkey Seal & Tri-Platform Polish

* **Expanded Zero-PII Crash Log & Path Scrubber:** Upgraded the Rust and TypeScript log scrubbers to automatically redact usernames and file paths across **Windows** (`C:\Users\...`), **Mac** (`/Users/...`), **Linux & SD Cards** (`/home/...`, `/run/media/...`), and **SteamOS Proton prefixes** (`drive_c/users/...`), alongside IPv4/IPv6 addresses, MAC addresses, Windows SIDs, emails, and hardware headers before any log is viewed or attached to a support ticket.
* **12-Hour Device-Bound Passkey Seal & 2-Column Security Vault:** Replaced plain local flags with a cryptographic **12-hour Device-Bound Passkey Seal** (`sanctuary_passkey_seal_v2`) so trusted devices stay unlocked for 12 hours while still requiring a Passkey step-up for sensitive account changes. Enrolled Passkeys and Authenticator Apps now display in a clean 2-column card grid, and Dev Web builds feature a locked **Dev Build Clearance** side panel.
* **Domain-Salted One-Way Hardware Hash & Command Armor:** Hardware ban checks now use a domain-salted one-way SHA-256 digest computed inside Rust (never exposing raw serials or matching fallback placeholders), and all file/backup commands enforce strict path-traversal armor protecting system and user root folders.
* **Strict Tier 0 Isolation in the Architect Console:** The Tier 3 **Architect Console** is now strictly isolated to public **Compliance Tier 0** mods, collections, and tickets—automatically transferring any record escalated to Compliance Tiers 1–4 over to **Oversight Command → Compliance**.
* **Upgraded Citizen's Workbench v2.0 & 820px System Log Drawer:** Added JSON array support (`[-100, 100]`) to `Min / Max` tuple controls, chronological life-stage ordering, and transparent outline badges in the **Citizen's Workbench** (plus a v2.0 `mc_settings.cfg` template). Rebuilt the **System Log Viewer** into a wide 2-column telemetry drawer with 1-click **Stop Preview** and clickable **Radar Sweep** cards.
* **Seamless SteamOS `.AppImage`, Proton Auto-Detection & macOS Builds:** Fixed `EGL_BAD_PARAMETER` startup crashes on **SteamOS / Linux `.AppImage`** builds, added automatic **Steam & Non-Steam Proton prefix** path detection (`compatdata`) and responsive `1280×800` **Steam Deck** scaling, and enabled native `macos-private-api` transparent window builds on **Apple Silicon & Intel Macs**.
