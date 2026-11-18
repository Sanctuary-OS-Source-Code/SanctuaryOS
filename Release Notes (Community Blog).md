# State of the Sanctuary — Version 0.6.0
### Liquid Glass Surface Unification, Multi-Game Support, Native Mac App & Deep Mod Protection
**Release Date:** October 28, 2026 | **Version:** 0.6.0 | **Platform:** Windows, macOS, Linux & SteamOS

## Welcome to Sanctuary OS 0.6.0!

This is our biggest update yet—touching almost every corner of the app on Desktop, Web, and Mobile. Whether you're a player organizing your mod folder, a creator sharing your next release, or a community leader running your own game hub, here is everything new in plain English.

### TL;DR — The 60-Second Summary

- **3D Liquid Glass & True Glass Mode:** We rebuilt the visual interface with real-time 3D glass refraction that bends light around every card and panel, plus a 1-click **True Glass** mode and **Auto-Tune** button in the Theme Editor.
- **Built for Any Moddable Game:** Sanctuary OS now supports any game out of the box—with built-in setups for *The Sims 4*, *GTA V*, *WWE 2K*, *Skyrim SE*, *Cyberpunk 2077*, *Baldur's Gate 3*, *Stardew Valley*, and custom games.
- **Cross-Platform Native Apps & 1-Click Updates:** Sanctuary OS runs natively on **Windows**, **macOS**, **Linux**, and **SteamOS / Steam Deck**, complete with a silent in-app updater that downloads and installs updates without opening your browser.
- **Smarter Mod Security Scanner:** Every downloaded archive, script, and package file is now scanned inside and out before it touches your mod folder—catching hidden threats while never falsely flagging popular script mods.
- **1-Click Creator Publishing:** Every registered user can now open the Creator Workshop to package mods, build settings templates, and publish static update manifests directly to GitHub, GitHub Gist, GitLab / Codeberg, Neocities, WebDAV / HTTP PUT endpoints, a Local Synced Folder, or a ready-to-share zip file.
- **Cleaner Cards & Floating Mobile Dock:** Mod titles now have the full width of every card without getting cut off, and phone users get a smooth floating glass bottom bar with swipeable top tabs.

### Visual Overhaul: 3D Liquid Glass & Easier-to-Read Cards

- **Real 3D Liquid Glass:** Cards, sidebars, and panels now behave like real optical glass—gently bending your background wallpaper around rounded corners with soft depth and zero harsh neon outlines.
- **True Glass & 1-Click Auto-Tune:** Flip on **True Glass** in the Theme Editor for a crystal-clear look, or click **Auto-Tune Glass** and **Auto-Harmonize** to automatically match your glass settings and colors to your wallpaper.
- **Full-Width Mod Titles on Every Card:** We moved action buttons (like *Update*, *Ignore*, *Delete*, and *Modules*) to the bottom-right corner of cards so long mod names have the entire top row to breathe without getting cut off.
- **Calm, Consistent Status Badges:** Status tags across the entire app now use a clean, neutral glass style where only the small icon is colored—making your mod library and alerts much easier on the eyes.
- **Live Card Previews & Bundled Theme Sharing:** Every mod, modpack, theme, and language pack card now displays a live mini-preview header. Exporting a theme automatically packs your custom wallpaper and preview image along with it.
- **Floating Mobile Dock & Fullscreen Web App:** On phones and tablets, the bottom navigation bar now floats like a rounded glass dock and matches your theme color all the way to the bottom edge of your screen.

### Multi-Game Support, Native Mac App & Faster Mod Management

- **Ready for Any Game Engine:** Switch between *The Sims 4*, *Grand Theft Auto V*, *WWE 2K Series*, *Skyrim Special Edition*, *Cyberpunk 2077*, *Baldur's Gate 3*, *Stardew Valley*, or any custom Universal schema from the top bar—each with its own folders, categories, and load rules.
- **Safe Vanilla Game Folders:** For games where mods go directly into the main game folder (like *Skyrim* or *GTA V*), Sanctuary OS tracks every file it places and backs up original files automatically—so disabling mods never breaks your clean game install.
- **Native Mac (.dmg), Linux & SteamOS Support + Silent Updates:** Mac players on Apple Silicon and Intel—plus Linux and Steam Deck players via `.AppImage` / `.deb`—can run Sanctuary OS natively. When a new version drops, clicking **Install & Restart** updates the app right inside the window.
- **Instant Library & Nexus Loading:** Opening huge mod libraries, switching between games, and browsing **The Nexus** or **Conflict Radar** is now dramatically faster thanks to background loading and smarter caching.
- **4-Tab Phone-to-PC Modpack Queue:** Browse mods on your phone or browser and send them straight to your home PC. Our updated 4-tab Modpack Builder automatically grabs required parent mods (like adding *MC Command Center* when you pick *MC Woohoo*).
- **No More Duplicate Settings Files:** Fixed an issue where live mod config files could create a duplicate copy in your main Mods folder when updated while the game was running.

### Deeper Mod Protection, Privacy & Safe Testing

- **Deep Archive & Package Scanning:** Before a downloaded mod ever enters your library, Sanctuary OS checks inside zip/rar/7z archives, script files, and compressed package files to block hidden malware, scripts, and credential stealers.
- **Clean Move-to-Quarantine Tracking:** If you use **Move** mode when importing mods and a dangerous file is caught, Sanctuary OS moves the original file straight into quarantine and clearly shows **Moved to Quarantine** so nothing is left behind in your Downloads folder.
- **Protected Save Games in Homestead Lab:** Starting a mod test run automatically moves your real save files to a safe backup vault and loads a dedicated test save—so testing new or broken mods can never corrupt your actual family or campaign saves.
- **Live In-Game Test Timer & Crash Plain-English Helper:** The Homestead Lab timer only counts down while you are actively playing in-game (pausing if you Alt-Tab out), and explains common game errors in plain English while scrubbing your computer username from crash logs.
- **Passkey & Biometric Security:** Protect your account with 2-Factor Authenticator codes, or use Windows Hello, Touch ID, or a hardware security key when opening creator and admin tools.
- **Focused Security & Backup Screens:** When a critical malware alert, game patch warning, or backup restore is running, Sanctuary OS locks the background screen so you never accidentally click away mid-operation.

### For Creators & Community Leaders: Open Workshop, Guides & Direct Support

- **Creator Workshop Open to Everyone:** Every registered player can now open the **Mason Workshop** to package mods, link add-ons and script files together, design custom themes, and build visual settings screens for their mods.
- **1-Click Cloud Publishing (Zero Lock-In):** Creators can push static `.sanctuary.manifest.json` or `catalog.json` updates directly to **GitHub Repo / Cloudflare Pages**, **GitHub Gist**, **GitLab / Codeberg**, **Neocities**, **Personal WebDAV / HTTP PUT**, or a **Local Synced Folder** with one click—or export a ready-to-share zip file for Patreon, itch.io, Nexus, or CurseForge.
- **Interactive Visual Settings & Diff Timeline:** Players and creators can tweak mod settings with simple sliders and toggles in the **Citizen's Workbench**, and compare current changes side-by-side against saved backups before applying them.
- **Built-In Schema & Language Guides + Icon Picker:** Customizing a game workspace or language pack now includes an interactive field-by-field guide explaining every setting in plain English, plus a visual searchable **Icon Picker** so you never have to guess icon names.
- **0%-Cut Community Donations & Daily Dev Builds:** Supporting Sanctuary OS or any Partner Community gives 100% of your donation directly to that community, and every **$5 adds +30 days** of early **Daily Dev Build** access across Desktop, Web, and Mobile.
- **Direct Human Support & Partner Community Applications:** Send platform feedback, report bugs (with automatic log attachment), reach a real human on the Sanctuary team (never an AI bot), or apply to launch a new Partner Game Community right from the home page.
