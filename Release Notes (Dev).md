# Sanctuary OS — Version 0.5.8-Dev.3 Update
## *"Liquid Glass Optics, Reimagined Citizen's Workbench, Unified Artifact Studio & Silent In-App Updates"*

**Release Date:** October 22, 2026 | **Version:** 0.5.8-3 (Dev Channel)

Welcome to **Sanctuary OS 0.5.8-3**! This update brings a top-to-bottom visual and performance overhaul with our new **Zero-Tearing Liquid Glass Optics Engine**, a completely redesigned **Citizen's Workbench** (with a 2-column Visual Config Editor, Visual Template Builder, and interactive Timeline Diff Panel), a unified **3-Tile Artifact Studio** across both the Creator Hub and Architect Console, **1-Click Silent In-App Updates**, and a comprehensive full-stack security hardening sweep. Here is everything new in plain English.

---

## 🛡️ Security Hotfix Patch (v0.5.8-Dev.3)

Following this week's global internet security advisories surrounding the compromised **eMudhra / emSign** Certificate Authority keys and the **October 2026 Node.js Security Release**, we pushed an immediate preventive security patch across Sanctuary OS and our build pipeline:
* **Trusted Certificate Store Hardening:** Updated Sanctuary OS's internal HTTPS networking and auto-updater security libraries (`rustls` & `webpki`) to explicitly block the compromised eMudhra / emSign certificates, ensuring all background downloads and update checks remain protected against spoofing or interception.
* **Build Pipeline Security Update:** Upgraded our automated GitHub release builders to the newly patched **Node.js 24 LTS** security release (which fixes recent compression, DNS, and TLS verification vulnerabilities and removes the affected certificate authorities during builds).

---

## ⚡ TL;DR — The 60-Second Summary

* **Zero-Tearing Liquid Glass & Theme Forge Optics:** Every card, side panel, and floating menu now refracts your background wallpaper smoothly with zero scroll seams on both Dark and Light themes—plus 6 new **Liquid Glass Optics** sliders in Theme Forge so you can tune glass opacity, blur, saturation, rim lighting, glare, and depth in real time.
* **Reimagined Citizen's Workbench & Visual Timeline Diff:** Edit massive mod config files (like `mc_settings.cfg` with 430+ settings) with zero lag using a compact 2-column Visual Editor, 1-click Category Pill Bar, dual `Min` / `Max` range steppers, per-setting **Undo to Saved** and **Reset to Default**, and a full **2-Column Interactive Timeline & Diff Workspace** comparing your live unsaved edits or historical snapshots in either **Visual Diff** or **Raw Code Diff**.
* **No-Code Visual Template Builder:** Create and edit `.json` config templates visually without touching raw JSON—auto-map keys directly from any `.cfg` or `.ini` file in one click, pick category icons visually with the built-in **Icon Picker**, and add Booleans, Numbers, Ranges, Text, Dropdowns, Keybinds, and Groups from a single row.
* **Unified 3-Tile Artifact Studio & Mod Family Grouping:** We consolidated the fragmented `Protocols`, `Folder Structure`, and `Conflicts` screens in both the **Creator Hub** and **Architect Console** into a unified **3-Tile Artifact Studio** (`Details & Versions`, `Files & Folders`, and `Rules & Upload`), and grouped multi-part mod suites (like *MC Command Center* and its 13 modules) into a single clean Parent Card.
* **1-Click Silent In-App Updater & Single Morphing Dock:** Clicking **Install & Restart** now downloads and installs updates right inside Sanctuary OS with a live progress bar and automatic relaunch—no browser redirects or Windows installer popups—while the bottom status bars have been merged into a single sleek, auto-tucking **Morphing Status Pill**.

---

## 🎮 For Players (Citizens)

### 1. Reimagined Citizen's Workbench & Visual Config Editor
Tweaking complex mod settings files shouldn't mean hunting through hundreds of lines of raw text or losing track of what you changed:
* **Compact 2-Column Visual Editor:** Settings are now organized into a responsive 2-column grid of Liquid Glass cards with automatic readable label formatting (`AgeSpanCatLong` automatically becomes `Age Span Cat Long`) and collapsible multi-column Group cards.
* **1-Click Category Pill Bar:** Switch between setting categories (`General`, `Gameplay`, `CAS`, `Occult`, etc.) directly from the interactive Category Pill Bar right below the search bar—complete with icons, live setting counts, and an expand/compact row toggle.
* **Dual `Min` / `Max` Range Steppers:** Comma-separated slider bounds (like MCCC's `-100,100` CAS sliders) are automatically detected and rendered as side-by-side **Min** and **Max** numeric steppers.
* **Unsaved vs. Modified Tracking & 1-Click Undo:** Every setting now tracks both **Unsaved** changes (edits since your last save, highlighted with an amber outline pill and **Undo to Saved** button) and **Modified** changes (values that differ from the mod's default, with a **Reset to Default** button). Filter by **Unsaved** or **Modified**—or revert all unsaved edits—directly from the filter toolbar.
* **Instant Performance on 430+ Setting Files:** Progressive windowed rendering keeps massive configuration files like `mc_settings.cfg` scrolling and editing at a locked 60+ FPS.

### 2. Interactive 2-Column Timeline & Diff Workspace
We replaced the tiny 500-character timeline preview box with a full **2-Column Timeline & Diff Workspace**:
* **Compare Unsaved Edits or Historical Snapshots:** The left timeline column features a live **"Current Edits vs. Saved"** card at the top right above your saved historical snapshots, with a high-contrast accent border so you always know which version you're inspecting.
* **Visual Diff & Raw Code Diff Modes:** Switch between **Visual Diff** (which shows human-readable `Saved/Snapshot → Current` setting cards with individual 1-click **Undo** / **Restore** buttons and wraps long values cleanly across two rows) and **Raw Code Diff** (a side-by-side Monaco code diff with **Previous / Next Change** jump buttons).
* **Filter & Search Changes:** Toggle between **Changed Only** and **All Settings**, search for specific keys, or restore an entire snapshot in one click.

### 3. True Liquid Glass Optics, Single Morphing Dock & Clean Alert Cards
* **Zero-Tearing Liquid Glass Engine:** We re-engineered how Sanctuary renders frosted glass across scrolling pages (`Nexus`, `Vault`, `Command Center`, `Workbench`). Cards now refract your theme wallpaper as a single continuous sheet of 3D glass without tile seams, double borders, or dark slate rings—automatically adapting to both Dark and Light themes.
* **Theme Forge Optical Sliders:** Open **Theme Forge** to customize 6 live optical controls—**Glass Opacity**, **Refractive Blur**, **Refractive Saturation**, **Rim Light Intensity**, **Specular Glare**, and **Elevation Depth**—with a 1-click **Reset Optics** button.
* **Single Morphing Dock Pill:** We merged the separate Status Bar, Notification Dock, and Main Dock into a single centered **Morphing Status Pill** that displays inline save/scan status updates and flat alert counters, and automatically tucks out of the way when a SidePanel opens or when you scroll to the bottom of a page.
* **Clean 2-Column Alert & Update Cards with Expandable Modules:** Incompatible Mod and Available Update panels now use a spacious 2-column card layout where mod suites (like *MC Command Center* or `.package` + `.ts4script` twins) coalesce into a single parent card with an interactive **`{N} Linked Modules ▾`** drawer.
* **Centered Beacon Alert Modals:** Confirmation dialogs, DEFCON alerts, Quarantine prompts, and Time Capsule restore modals have been redesigned into sleek, centered Beacon Glass cards.

### 4. 1-Click Silent In-App Updates & Account Security
* **Silent In-App Auto-Installer:** Updating Sanctuary OS no longer opens your web browser or pops up Windows setup wizards. Clicking **Install & Restart** inside the **Update Panel** streams the update in the background with a live progress bar (`Downloading Update...` → `Installing Update...` → `Restarting Sanctuary OS...`) and relaunches the app automatically.
* **2-Column Bento Release Notes:** Both the in-app **Update Panel** and **Release Notes Showcase** now display updates in a clean 2-column Bento grid with a 4-box telemetry header.
* **Password Recovery & Account Re-Authentication:** Added a complete in-app **Set New Password** recovery flow and required current-password verification before changing your account email, changing your password, or disabling Two-Factor Authentication (2FA) in **System Preferences**.

---

## 💖 Supporting Communities & Creators (0% Platform Cut)

* **Instant In-App Browser Auto-Stacking & Celebration Panel:** When you support a Partner Community through the in-app **Side Panel Browser** (including 100% Promo Code redemptions), Sanctuary automatically detects checkout completion, closes the checkout drawer, and slides open the **Supporter Celebration Panel** showing your **Time Added**, **Active Timer**, and **New Expiration Date** (supporting 3- and 4-digit day balances without text cutoff).
* **Instant Dev / Stable Channel Switching:** Flipping the **Daily Dev Build Channel** toggle in **System Preferences → Support & Perks** now immediately offers the latest Dev Build (when switching to Dev) or the latest Public Stable release (when switching back to Stable) right in your status dock and Update Panel.

---

## 🛠️ For Mod Creators, Scouts & Community Leaders

### 1. Unified 3-Tile Artifact Studio (Creator Hub & Architect Console)
We simplified mod management for both Creators and Community Architects by removing the separate `Protocols`, `Folder Structure`, and `Conflicts` navigation screens and bringing everything into a single unified **3-Tile Artifact Studio** (`Details & Versions`, `Files & Folders`, and `Rules & Upload`):
* **Single-Card Mod Family Grouping:** Multi-hop mod suites (such as a Core `.package` $\rightarrow$ Script Twin `.ts4script` $\rightarrow$ 12 Add-on modules) now collapse into a single **Core Mod** card (`+13 Modules`) across the Creator Workshop, Architect Registry, and Search results.
* **Smart Sandbox Entry Choice & Auto-Pull:** Clicking an unlinked file in your local Sandbox lets you choose **Make a New Mod** or **Link to Existing Mod**. Choosing **New Version / Update** automatically pulls over your previous version's Title, Category, Description, Cover Art, URL, Paid/Early Access flags, Required DLC, Dependencies, Conflicts, Collections, Folder Structure, and Family Modules while archiving the old SHA-256 hash into version history!
* **Always-Visible Mod Family Card & Family-Aware Folder Tree:** Tile 2 (`Files & Folders`) now features a dedicated **Mod Family Modules** card at the top (resolving real mod titles and `.package`/`.ts4script` badges for every linked Twin, Add-on, Flavor, and Beta) right above a family-aware `Mods/` folder tree where you can assign install subfolders for every file in the suite.
* **Symmetrical 2x2 Rules Grid & Single-View Patch Range Picker:** Tile 3 (`Rules & Upload`) organizes **Required EA Packs (DLC)**, **Required Mods (Dependencies)**, **Incompatible Mods (Conflicts)**, and **Collections** into a clean 2x2 grid with compact 2-column scroll wells, while the **Game Version Picker** now includes an inline `From Patch → To Patch` range selector right above the version checklist.
* **Expanded Local `manifest.json` & `override.json` Exports for All Citizens:** All registered users can now author and export complete local `manifest.json` and `override.json` packages in the Sandbox—including Protocol Flavors, Local Collections, Virtual Folder Structures, DLC requirements, Dependencies, and Conflicts—while cloud publishing and public Creator Profiles remain gated to **Verified Creators**.

### 2. Visual Template Builder for Config Authors
* **Author Templates Visually:** Switching a `.json` template to **Author Mode** in the Citizen's Workbench opens the new **Visual Template Builder** side-by-side with a live **Visual Preview**.
* **1-Click Auto-Map & Visual Icon Picker:** Select a target config file and click **Auto-Map Target Keys** to automatically generate categorized controls from the file's keys and values, use the portaled **Icon Picker** to choose Material Symbol icons for your categories, and add `Boolean`, `Number`, `Range`, `Text`, `Dropdown`, `Keybind`, or `Group` fields from a single compact row.

### 3. Full-Stack Security Hardening
* **Database, Gateway & Desktop Hardening:** Locked down column-level security and Row-Level Security (RLS) across Hub and Spoke databases, enforced fail-closed HMAC-SHA256 webhook verification and role/ownership checks in Edge Functions, scoped Tauri v2 IPC capabilities strictly to the main OS windows, added Zip-Slip path traversal protection across all archive extractors, and secured the Side Panel Browser bridge with per-session cryptographic tokens.
