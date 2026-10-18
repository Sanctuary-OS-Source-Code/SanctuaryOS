# Sanctuary OS — Version 0.5.8-1 Update
## *"The Proving Grounds, Phone-to-PC Mod Staging & True System Alerts"*

**Release Date:** October 17, 2026 | **Version:** 0.5.8-1 (Dev Channel)

Welcome to **Sanctuary OS 0.5.8-1**! This update transforms how you test unstable mods, browse and queue modpacks from your phone, receive real-time alerts on your desktop or mobile PWA, and support the communities and creators who keep your favorite games alive. Here is everything new in plain English.

---

## ⚡ TL;DR — The 60-Second Summary

* **Phone-to-PC Mod & Modpack Staging:** Browse the Nexus on your phone or tablet, build a Modpack (or queue individual Mods, Themes, and Translations), and send it to your PC with end-to-end encryption. When you sit down at your desk, click **Sign & Deploy** to install everything in one go.
* **The New Homestead Lab & Physical Save Shield:** Test risky mods with zero fear of corrupting your saves. Sanctuary physically moves your real saves into a locked vault, seeds a disposable sandbox with your latest save so you can click *"Resume Game"* immediately, and tracks your live in-game play session with an on-screen HUD overlay.
* **Plain-English Crash Diagnoses & Privacy Scrubbing:** Cryptic game crash logs (`lastException.txt`) now display plain-English *"What the Community Knows"* explanations right at the top, and Sanctuary automatically strips 100% of your personal PC file paths, usernames, and hardware IDs (`[REDACTED BY SANCTUARY]`) before any log is viewed, saved, or shared.
* **True System & PWA Notifications:** Get real Windows/macOS/Linux desktop notifications (fully branded as **Sanctuary OS** with the Sanctuary icon) and opt-in mobile PWA push alerts. Choose **System (OS)**, **In-App Only**, or **None (Muted)** for each alert category, with a strict single-send guarantee so you never get pinged twice.
* **0%-Fee Community Support & Daily Dev Builds:** Donate directly to any Partner Community (0% platform cut) to unlock **+30 Days of Global Daily Dev Builds per \$5** across the entire app, and verify creator Patreon/Ko-fi passes locally on your own PC for priority support routing.

---

## 🎮 For Players (Citizens)

### 1. Browse on Your Phone, Install on Your PC (Remote Queue & Modpack Builder)
Ever see a cool mod or modpack while scrolling on your phone away from your gaming PC? Now you can queue it up from anywhere:
* **End-to-End Encrypted Remote Queue:** Add mods, full modpacks, Chameleon themes, or Lexicon translation packs to your queue from the Sanctuary web app or mobile PWA. Your list is encrypted on your device using your account password before it ever touches the cloud—meaning nobody (not even server admins) can see what you're queuing.
* **1-Click Desktop Deployment:** When you open Sanctuary OS on your PC, a notification pill lets you review your incoming queue. Mods already in your Vault are linked immediately, and any missing mods open their official creator download pages in the Side Browser so you can grab them safely.
* **Streamlined 4-Tab Modpack Builder:** We reorganized the Modpack Builder into four clean tabs—**Included Mods**, **Modpack Settings**, **Saved Drafts**, and **Active PC Queue**—and unified the catalog with the main **Nexus** so you never have to bounce between two different search screens.
* **Smart Parent Dependency Detection:** Adding an add-on module like *MC Woohoo* now automatically detects and pulls in its required master mod (*MC Command Center* set to Core Priority) instead of cluttering your list with optional sub-modules. Twin `.package` + `.ts4script` files are also merged into a single clean card.

### 2. Homestead Lab: Physical Save Airgap & Live In-Game Proving
We completely rebuilt the **Homestead Lab** so testing new or updated mods is effortless and 100% safe for your saves:
* **Physical Save Airgap Shield:** Instead of just marking your saves read-only, Sanctuary now physically evacuates your live save folders into a protected backup vault and swaps in an isolated Sandbox folder whenever a Lab test starts. Even better, it automatically copies your most recent save into the sandbox so you can click **Resume Game** right away without creating a throwaway character!
* **4-Stage Live Simulation Watcher:** Sanctuary now knows the difference between sitting on the Main Menu and actually playing:
  1. **Booting:** Waits for the game process to stabilize.
  2. **Waiting for World:** Keeps the test timer paused until it detects your save world actually loading into memory.
  3. **Active Testing:** Only ticks the countdown while the game window is focused and actively unpaused—if you press `Esc` to open the pause menu, pause simulation speed (`0`, `P`, or `~`), or alt-tab away, the timer automatically pauses and waits for you.
  4. **Save Checkpoint:** Once the timer hits `0:00`, save your game once in the sandbox to confirm save stability and earn a verified certificate.
* **Single-Monitor Over-Game HUD & Audio Chimes:** Playing on a single monitor in fullscreen or borderless mode? Sanctuary now projects a sleek, click-through translucent HUD banner over the top of your game (with an audio chime and OS notification) when your test timer finishes!
* **External Tool Linker:** Link external modding utilities (like *Sims 4 Studio*, *Create-a-World*, or *xEdit*) right inside the Homestead Lab to launch them inside the save-protected sandbox environment.

### 3. Plain-English Crash Diagnoses & Automatic Privacy Scrubbing
Game exception logs shouldn't require a computer science degree to read—or leak your real name when you share them for help:
* **"What the Community Knows" Banners:** When a game error log is detected, Sanctuary cross-references it against community **Known Error Rules** and shows a plain-English diagnosis card explaining what broke, which mod likely caused it, and how to fix it.
* **Smart Normal-Bug Filtering:** Error logs are now classified into **Corrupted (Game Crash)**, **Unstable (UI / Random Bugs)**, and **Unrelated (Normal Game Bug)**. Harmless vanilla game bugs are automatically ignored during Lab runs so they never falsely fail your mod test.
* **Automatic `[REDACTED BY SANCTUARY]` Privacy Scrubber:** Before any crash log is displayed on screen, saved to disk, or attached to a support ticket, Sanctuary automatically scrubs your Windows/Mac username, file paths (`C:\Users\YourName\...`), OneDrive folders, machine IDs, and session GUIDs right on disk.
* **Dual Log Export (`Lab_Report_#.txt`):** Clicking **Download Report** now saves both the formatted Sanctuary Lab Report (complete with exact `[extension] (Version)` labels, loaded dependencies, and active conflicts) and the scrubbed raw game exception log right alongside it.

### 4. True System (OS) & Mobile PWA Notifications
* **Native Desktop & Phone Alerts:** Sanctuary OS now delivers real operating system notifications on Desktop (branded as **Sanctuary OS** with the official app icon—no more *"Windows PowerShell"* headers!) and supports opt-in push notifications on installed mobile PWAs.
* **Per-Category Delivery Controls:** Head to **System Preferences → Notifications** to choose **System (OS)**, **In-App Only**, or **None (Muted)** individually for:
  * **DEFCON Alerts** (Emergency patch/mod-breaking alerts)
  * **Urgent Global Alerts**
  * **System Dispatches**
  * **Comm-Link Posts** (including a compact new **Per-Creator Alert** manager with search and Verified filters)
  * **Comm-Link Replies**
  * **Support Ticket Replies**
* **Single-Send Guarantee:** Every notification is tracked locally so you will only ever be notified **once** per event—never spammed on startup or page refresh.

### 5. Instant Blueprint Matrix, Full Load Orders & Multi-Drive Backups
* **Instant Blueprint Matrix:** Opening the Blueprint Matrix on massive mod folders (1,000+ mods) used to freeze the screen for up to 10 seconds. We replaced the old search loop with an instant lookup index—it now opens in milliseconds, and scrolling through the **Load Order** screen is buttery smooth.
* **Blueprints Now Remember Your Load Order:** Exporting, importing, cloning, or cloud-syncing a **Blueprint** now packages your entire Load Order configuration—including your ordering strategy, Priority Tiers (`1_Core` through `4_Overrides`), and custom Load Rules. Even if a friend's local mod file has a slightly different filename, Sanctuary matches it by DNA hash and heals the load order automatically.
* **Multi-Drive Time Capsule Fix:** If you keep your Sanctuary Vault on a secondary drive (`D:\` or `E:\`) while your game saves live on `C:\Documents`, **Time Capsule** now stores World State snapshots on the same physical drive as your Documents folder so ultra-fast, zero-duplication hardlinks work every time.
* **Edge-to-Edge Mobile PWA:** Fixed the solid white bar beneath the bottom navigation dock on mobile phones so your theme background extends cleanly behind the phone's gesture bar.

---

## 💖 Supporting Communities & Creators (0% Platform Cut)

### 1. Support Any Partner Community → Unlock Daily Dev Builds Everywhere
Sanctuary OS takes **0% cut** on community and creator donations—payments go straight to the community's own Stripe or Ko-fi account.
* **Cumulative Global Daily Dev Builds (\$5 = +30 Days):** Whenever you donate to *any* Partner Game Community, your account is automatically credited with **+30 days per \$5** of access to the **Daily Dev Build** update channel across all of Sanctuary OS. Donating again simply stacks more days onto your existing timer—it never resets early.
* **Seamless Channel Switching:** Flip on the **Daily Dev Build** toggle in **Settings → Supporter** (or from the **Support & Perks** quick action on the Command Center) to get the latest nightly features as soon as they ship, and automatically return to the **Stable** channel whenever your timer expires.

### 2. Zero-Honeypot Creator Supporter Vault & Priority Support
* **100% Local Privacy:** Following creators and linking your Patreon or Ko-fi **Supporter Passes** happens strictly inside a private database on your own PC. Sanctuary never builds a central cloud list of who you follow or who you financially support.
* **Expedited Support Routing:** When you submit a support ticket for a mod whose creator you support, Sanctuary attaches a cryptographic proof that flags your ticket for the **Expedited Support Path** without exposing your financial details.

---

## 🛠️ For Mod Creators, Scouts & Community Leaders

* **Live Verification Gates for Publishing & Moderation:** Communities can now require a passing **Homestead Lab Verification Certificate** (matched by the file's exact SHA-256 `dna_hash`) before a mod can be published from the **Mason Workshop** or approved in the **Scout & Architect Queues**—complete with an inline test runner right inside the review panel.
* **Multi-Folder "Installer" File Routing:** Mods that need files placed outside the standard `Mods` folder (such as custom `.world` files that belong in the game's installation `Data/Shared/Worlds/Areas` directory) are now routed and linked automatically via the game schema, while safely backing up any vanilla game files they replace and restoring them when unequipped.
* **Zero-False-Positive Malware Heuristics:** We upgraded the security scanner from noisy single-word checks (which could flag legitimate mods like *MC Command Center* or *Better Exceptions*) to **Compound Behavioral Rules** (`subprocess + powershell`, `base64 + exec`, Discord webhook exfiltration, browser token stealers) and automatic whitelisting for verified Registry hashes.
* **Architect Known-Error Rule Extractor:** Community Architects can now paste any raw `lastException.txt` stack trace into the **Homestead Diagnostics** editor and click **Quick Extract** to automatically pull out the error signature, title, and file hint in one click—or click **Add Normal Game Bug** directly from a crash report banner.
* **In-Memory `override.json` Handling:** Dropping or exporting mods with decentralized `override.json` update manifests now processes and stores the update link directly in Sanctuary's local database without leaving stray `override.json` files cluttering your mod folders.
* **Lighter Custom Game Translations:** Game communities creating their own **Lexicon** flavor packs no longer need to translate all 2,000+ app strings—just override the 50–100 game-specific terms you want to theme, and Sanctuary automatically fills in the rest with clean Standard English.
* **Live Release Blog & GitHub Sync:** The **Web Landing Page** and **Keepers Core** now feature side-by-side **Public Release** and **Daily Dev Build** blog cards with a 2x2 Release Info Panel and live GitHub Release Notes / Full Changelog switching.
