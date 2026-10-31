# Sanctuary OS — Daily Dev Build v0.6.0-Dev.1
### Conflict Radar 2.0, Live In-Game Config Diffs, Global Ctrl+K Search, Linux & Steam Deck Support & Instant Modpack Loading
**Release Date:** October 31, 2026 | **Version:** 0.6.0-Dev.1

Welcome to **Sanctuary OS v0.6.0-Dev.1**! This Daily Dev Build brings a complete redesign of **Conflict Radar & Load Order**, an automatic **In-Game Config Watcher & Diff Timeline** in the **Citizen's Workbench**, a fast **Ctrl+K Command Palette** to jump anywhere in the app, full **Linux & Steam Deck** support alongside **Windows** and **Mac**, and 100% matching mod counts across every screen. Here is everything new in plain English.

---

## ⚡ TL;DR — The 60-Second Summary

* **Conflict Radar 2.0 & Drag-and-Drop Load Order:** Redesigned Conflict, Override, and Priority Tier cards with a 4-box mini preview, a **Suggested** winner badge, a 3-line **Mod A vs. Mod B** layout, and real-time drag-and-drop reordering on both the main grid and a 2-column side panel.
* **Workbench Overhaul & Live In-Game Config Diffs:** When a mod changes its settings while you play in-game, Sanctuary OS now automatically captures a snapshot so you can compare, keep, or undo those changes in the redesigned **Citizen's Workbench & Version Timeline**.
* **Global `Ctrl+K` Search & Unified Top-Right Bar:** Press `Ctrl+K` (or `Cmd+K`) anywhere to jump straight to any screen, setting, Play Set, mod, theme, or language pack. We also combined Queues, Notifications, Search, and Settings into one sleek top-right glass capsule.
* **Instant 2,900+ Modpack Inspector & Exact Mod Counts:** Large Play Sets now open almost instantly without freezing, every alert card opens its **Mod Dossier** when clicked, and mod counts now match 1:1 across **Your Vault**, **Blueprints**, **Quick-Swap**, and **Command Center**.
* **Windows, Mac, Linux & Steam Deck Parity:** Added native **Linux (`.AppImage` / `.deb`)** and **SteamOS / Steam Deck** support (automatically finding Proton prefixes and SD card libraries) right alongside **Windows** and **Mac (`.dmg`)**.
* **Live Theme/Language Previews, Flag Dossiers & Visual Code IDE:** Preview any Nexus theme or language pack live before installing, keep your active theme untouched while editing in the Theme Studio, and inspect flagged reports using the full **Visual Studio & Raw JSON IDE**.

---

## 🎯 Conflict Radar 2.0 & Smarter Load Order

* **Clearer Head-to-Head Conflict Cards:** Every conflict card now shows the severity number on the left, the first and second mod stacked in the header preview, and a **Suggested** box in the top-right when a winner is recommended. Titles now use a bold 3-line **Mod A / VS / Mod B** layout with quick **A** and **B** buttons to open either mod's Dossier.
* **Load Order Rules on the Overrides Tab:** Explicit load rules (*Mod A must load after Mod B*) now live on the **Overrides** tab, led by an **Add Load Rule** card. Each card highlights the winning mod, shows the overridden file without cutting off its name, and lets you flip or remove the rule in one click.
* **3 Collapsible Priority Tier Rows:** The **Load Order** tab is now organized into 3 clean rows—**Late Load (Tier 1)**, **High Priority (Tier 2)**, and **Final Override (Always Wins)**—each starting with a **Select Mod to Configure** card and a **Reorder Load Order** button.
* **Smooth Drag-and-Drop + 2-Column Reorder Panel:** Dragging a mod card now shows a floating glass preview and slides neighboring cards out of the way in real time so you can see exactly where it will land. You can also click any `#01` badge to type a position number, or open the **Reorder Load Order** side panel to arrange compact 2-column cards.
* **Play Sets Save Your Full Load Order:** Exporting a Play Set to `.json` or uploading a Blueprint to the cloud now automatically packs your Priority Tiers, custom load sequence, Load Order Rules, and ignored conflicts so everything restores intact.

---

## 🔧 Citizen's Workbench, Time Capsule & Modpack Management

* **Automatic In-Game Config Watcher & Diff Timeline:** Whenever you tweak mod settings inside the game (across `.cfg`, `.ini`, `.json`, `.toml`, `.txt`, or `.xml` files), Sanctuary OS automatically records an **In-Game Edit** snapshot. Open the **Version Timeline** in the Workbench to browse a 2-column card grid of snapshots and compare **Changed Only** or **All Settings** side-by-side.
* **Cleaner Visual Workbench & Template Builder:** The **Citizen's Workbench** now scrolls smoothly with a clean multi-column category grid, uniform 2-column setting cards showing each setting's default value, and a symmetrical 2×4 button grid for adding controls in the **Template Builder**.
* **2-Column Time Capsule Backup Inspector:** Inspecting a backup in **Time Capsule** now uses a 2-column Sanctuary Card grid with a **Filters** menu (by Category, Status, Size, and `.ver` save revisions) instead of a cramped table.
* **100% Matching Mod Counts Everywhere:** Priority-tier mods (`Sanctuary2/`, `Sanctuary3/`) and `.package` + `.ts4script` twins are now recognized and counted identically across **Your Vault**, **Blueprints**, the **Quick-Swap Drawer**, **Blueprint Inspector**, and **Command Center**—eliminating false "missing mod" warnings and count mismatches.
* **Instant Loading for Huge Modpacks & Click-to-Dossier Alerts:** Opening the **Blueprint Inspector** or **Blueprint Sync** on 2,900+ mod loadouts is now near-instant, featuring a multi-filter menu (by Creator, Type, Access Tier, and Ownership), tile summaries for **Restricted Mods** and **Load Order Queue**, and 1-click **Mod Dossier** inspection from any alert card.

---

## 🖥️ Cross-Platform Support, `Ctrl+K` Search & Personalization

* **Jump Anywhere with `Ctrl+K` / `Cmd+K`:** Press `Ctrl+K` on Desktop, Web, or Mobile (or tap `>_` in the top bar) to search across every screen, hub sub-tab, Play Set, installed mod, theme, and language pack with full keyboard arrow navigation.
* **Unified Top-Right Capsule & Bottom-Right Toast:** Your active game workspace, **System Queues & Utilities**, **Notifications**, **Command Palette**, and **Settings** now live in one unified glass bar in the top-right corner (and centered at the top on phones), while background scan updates appear in a compact bottom-right toast pill.
* **Full Linux & Steam Deck Support:** Sanctuary OS now runs natively on Linux (`.AppImage` and `.deb`) and **SteamOS / Steam Deck**. It automatically detects Steam libraries across internal drives, SD cards, Flatpak, Heroic, Bottles, and Lutris, and maps Windows mod/save paths into the right Proton prefix automatically.
* **Seamless Mobile Web App & Gesture Bars:** On phones, the wallpaper now flows edge-to-edge behind the top status bar and bottom gesture bar with soft color blending, a floating rounded bottom dock, and an automatic `⋮` overflow menu on panels with lots of header buttons.
* **Live Theme & Language Previews + Isolated Theme Editor:** Click **Preview** on any theme or language pack in **The Nexus** to try it live across the entire app without saving, or click **Apply & Stage to PC** on Web/Mobile. Opening a theme in the **Chameleon Editor** no longer changes your active app theme until you toggle **OS Preview** or click **Apply Theme**.
* **Custom Date Formats, Image Toggles & Support Tickets Tab:** Visit **System Preferences → Preferences** to choose your preferred date format (`MM/DD/YYYY`, `DD/MM/YYYY`, or `YYYY-MM-DD`), toggle mod or Comm-Link images on and off, and track all your support tickets in the new **Support Tickets** tab.

---

## 🛠️ For Creators, Moderators & Partner Communities

* **What-You-See-Is-What-You-Get Post Builder:** Rebuilt the Visual Post Editor for Comm-Link posts, news, and directives so section headings, cards, and sub-blocks look identical while editing and after publishing—and deleting a section header no longer deletes the cards underneath it.
* **3-Part Flag & Resolution Dossiers:** When a mod, Blueprint, theme, or language pack is flagged, the inspector now clearly explains **(1) Why it was flagged**, **(2) What the specific issues are** (including any non-compliant or unverified mods in a Blueprint), and **(3) How to fix and resubmit it** in one click.
* **Upgraded Nexus Reports & Full Visual Code Inspector:** In Architect, Oversight, and Wayfinder Hubs, **Nexus Reports** now include automated Blueprint compliance reports, right-aligned quick-access buttons to inspect the reported asset, and a **View Code** button that opens the full **Lexicon / Schema Visual Studio & Raw JSON IDE** with side-by-side reference comparison.
* **Streamlined Scout Queue Review Panel:** Moderators reviewing community mod submissions in **Architect → Scout** now get a single unified form where competing community votes appear as clickable chips directly under each field, paired with a 1-click copyable `SHA-256` hash bar and Homestead Lab verification status.
* **Detailed Audit Logs & Staged Cloud Docs:** System Audit Logs now record exact *Before → After* field changes for every mod edit, version update, and moderation action. Plus, edits to the **Phase Roadmap** (now featuring *In Progress*, *In Testing [In Dev Build]*, and *Complete (In Stable Build)* badges) and official guides can be synced between `.md` files and the cloud before publishing live to players.
* **8-Section Landing Hub & Apply to Sanctuary Foundry:** Reorganized the web home page into an 8-tab Command Hub with pinnable game workspaces, an interactive **About Partner Spokes** timeline guide, and a 3-step application drawer to apply for open engineering, security, schema, and support roles at **Sanctuary Foundry**.
