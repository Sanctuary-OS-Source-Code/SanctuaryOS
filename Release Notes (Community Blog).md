# Sanctuary OS — Version 0.5.7 Update
## *"Sovereignty, Frosted Glass & The Open Workshop"*

**Release Date:** October 17, 2026 | **Version:** 0.5.7

Welcome to **Sanctuary OS 0.5.7**! This is one of our biggest updates yet—touching almost every corner of the app. Whether you’re a player organizing your mod folder, a creator packaging your next release, or a community leader running your own game hub, here is everything new in plain English.

---

## ⚡ TL;DR — The 60-Second Summary

* **True Frosted Glass UI:** We toned down the harsh neon outlines and rebuilt the interface with smooth, authentic frosted glass that lets your theme wallpaper shine through cleanly.
* **Casual vs. Advanced Load Order:** Keep the simple 1-click *"Pick a Winner"* button in **Casual Mode**, or flip to **Advanced Mode** to build custom *"Must Load After / Before"* rules and fix circular load-order loops with one click.
* **Open Creator Workshop & Direct Mod Updates:** Anyone can now use the local **Mason Workshop** to test mods, build themes, and export releases that update directly from a creator’s own website or GitHub—no central database required.
* **Interactive Polls & Scannable Alerts:** Official dispatches now have a built-in *"At a Glance"* summary box at the top and support live community polls right inside the feed.
* **Community Independence ("Cut the Cord"):** Game communities can now connect—or completely disconnect—their own database at any time with zero data loss, and forking Sanctuary OS into your own standalone app now requires editing **just one file**.

---

## 🎮 For Players (Citizens)

### 1. A Cleaner, True Frosted-Glass Look
We heard your feedback that some menus felt too dark, had harsh neon borders, or showed weird miniature copies of the background wallpaper inside dropdowns.
* **Authentic Frosted Glass:** Menus, cards, tooltips, the top title bar, and the bottom notification dock now use true translucent frosted glass that naturally blends with your active theme.
* **Top-Row Navigation Everywhere:** Instead of hiding tabs inside a collapsible side drawer, all major screens (including **System Preferences**) now use a clean, scrollable row of tab tiles across the top so you can jump between sections in one click.
* **Streamlined Side Panels:** We removed the cluttered *"Cancel / Abort"* button bars at the bottom of slide-out panels. Actions like *Save* and *Delete* now live cleanly in the top-right corner of the panel (and *Delete* still requires a double-click so you never delete anything by accident).

### 2. Conflict Radar: Casual Mode vs. Advanced Load Order
Different players want different levels of control when two mods edit the same game files:
* **Casual Mode (Default):** Keeps the effortless 1-click **"Pick a Winner"** workflow. Tell Sanctuary which mod should win, and it handles the folders and priority files behind the scenes.
* **Advanced Mode (New!):** Flip the toggle in the top bar to unlock the full **Load Order** tab. You can create custom directional rules (*"Mod A Must Load After Mod B"*), assign Priority Tiers, and even switch how the game orders mods. If you accidentally create an impossible loop (*A loads after B, B loads after A*), Sanctuary spots it automatically and gives you a **1-Click Break Loop** button.

### 3. Decentralized Mod Updates (Straight from Creators)
Not every mod creator uses a central mod site—many host their files on Patreon, itch.io, Cloudflare, or GitHub.
* Creators can now include a tiny `override.json` update link inside their mod’s `.zip` download.
* When you drag and drop that `.zip` into Sanctuary, you’ll be asked if you want to link the mod to the creator's update feed.
* Once linked, Sanctuary checks the creator's link directly during Radar Sweeps to notify you of new versions and automatically apply the creator's recommended conflict and DLC rules!

### 4. Interactive Polls & Built-In Dispatch Summaries
* **No More Wall-of-Text Alerts:** Official system announcements now feature a built-in 2x2 summary header at the top showing the **Alert Type**, **Who It Affects** (hover to see the full list of communities or roles), **Priority**, and **Action Required**.
* **Live Community Polls:** You can now vote in single-choice or multiple-choice polls directly inside system dispatches and watch the live results update in real time.

### 5. Smarter Security, Faster Scans & Better Privacy
* **Instant, Antivirus-Friendly Version Detection:** Sanctuary now reads your game version directly from the game `.exe` in memory instead of running background scripts—making scans faster and preventing false-positive Windows Defender alerts.
* **Universal Malware Protection:** Our built-in security scanner now inspects all mod file types (not just script files) using both global security rules and community-specific rules to catch hidden malicious code before it ever touches your game.
* **Privacy-First Hardware Protection:** Sanctuary **never** tracks or stores your PC's hardware ID on your profile. A hardware signature is only ever recorded in a separate ban list if someone actively tries to bypass malware quarantine.
* **Offline Blueprint Links Stay Intact:** If you add custom author names or download URLs to your local mods and export a **Blueprint** to share with a friend, those custom links now travel inside the Blueprint file automatically—even offline.

---

## 🛠️ For Mod Creators & Theme Makers (Masons)

### 1. The Mason Workshop is Now Open to Everyone
You no longer need special approval just to use Sanctuary's creation tools on your own PC!
* **Open Local Workshop:** Every user now has access to the **Mason Workshop** for local development—including the isolated **Dev Sandbox**, the built-in **Code Editor (IDE)**, the **Theme Builder**, and the **Creator Notepad**.
* **1-Click Release Exporter:** Package your mod into a clean `<mod>_v<version>.zip` bundle with one click. Sanctuary automatically calculates your file hashes and generates ready-to-upload `manifest.json` and `override.json` files so your players can get automatic update alerts from wherever you host your mods.
* **Verified Mason Fast-Lane:** Creators who are verified on the network get a dedicated priority approval queue (separate from community crowd-sourced submissions) and can publish directly to the public Nexus catalog.

### 2. Redesigned Creator Profiles & Blueprint Showcases
* **Glassmorphic Profile Banners:** Creator profiles have been completely restyled with frosted glass badges, follower counts, and social links.
* **Blueprints Showcase & 3-Tab Pinning:** You can now feature a **Blueprint** right below your featured Mods on your profile overview, and our new 3-tab Pin Selector lets you easily highlight your favorite **Mods**, **Blueprints**, and **Themes/Translations**.

### 3. Visual Theme Builder (No Coding Required)
* We replaced the old raw CSS code box in the **Chameleon Theme Forge** with an interactive **Background Builder**. Pick colors from visual swatches, drag angle sliders for linear or radial gradients, and preview your theme live in the **Holographic Sandbox** before applying it to your app.

---

## 🌐 For Community Managers & Server Owners (Wayfinders & Forkers)

### 1. 5-Minute Community Setup (`SANCTUARY-UPLINK://`)
Connecting a new game community database to Sanctuary OS used to take a lot of manual wiring. Now it’s copy-and-paste simple:
* **Copy & Paste SQL Setup:** Our updated `schema.sql` file sets up your entire community database in one paste inside the Supabase SQL Editor.
* **1-Paste Handshake & Auto-Founder Setup:** Paste your credentials (or a `SANCTUARY-UPLINK://` bundle) into the workspace setup panel, click **Test Handshake**, and Sanctuary automatically verifies every table and promotes your account to **Founding Wayfinder**.

### 2. "Cut the Cord" — True Community Sovereignty
We believe communities should always own their data—never be held hostage by a platform.
* **Self-Service Disconnect:** Previously, only core Sanctuary developers could disconnect a community database. Now, any community **Wayfinder** can open the **Server Health & Sovereignty** panel and click **Cut the Cord** at any time.
* **Clean Break, Zero Data Loss:** Cutting the cord immediately removes your database’s secret key from the Sanctuary Hub and deactivates the connection, while leaving **100% of your community's database, mods, and blueprints untouched** in your own Supabase account.

### 3. Forking Sanctuary OS Now Takes Editing Just One File
If your community wants to launch its own completely independent version of Sanctuary OS (or transition to your own app after cutting the cord):
* You no longer need to set up a second "Hub" database or deploy complex cloud functions.
* Simply open **`src/supabase.ts`**, paste your `SANCTUARY-UPLINK://` string (or set `mode: "standalone"` with your database URL and key), and launch the app.
* The very first person to sign up on a fresh standalone database is **automatically promoted to Founding Wayfinder** with full admin tools unlocked out of the box.

---

## 🧹 Bug Fixes & Quality-of-Life Polish

* **Fixed Draft Saving Errors:** Resolved a browser storage limit bug (`QuotaExceededError`) that could crash the Dispatch Editor when saving drafts with large translation packs installed.
* **Much Smoother Mobile Experience:**
  * Fixed the mobile bottom navigation bar getting pushed off-screen by browser address bars.
  * Collapsed crowded mobile filter buttons into a clean slide-up bottom sheet across 33+ screens.
  * Disabled sticky hover tooltips on touchscreens so popups don't get stuck on your screen after tapping.
  * Fixed mobile scrolling lag on glass panels.
* **Restored Quick Tools in Elevated Hubs:** Brought back the **Creator Notepad**, **Mason Settings**, **View Profile**, and **Check File Hash** buttons so they stay accessible in the top action bar across every tab in their hubs.
* **Cleaner Post Cards:** Removed redundant *View / Edit / Delete* hover buttons from Dispatch and News cards (clicking any card opens it directly, and *Delete* now lives safely in the panel header).
* **Smarter Popovers & Calendars:** Opening a dropdown or date picker now automatically closes any other open menu, and date pickers automatically flip upward if they are near the bottom of the screen.

