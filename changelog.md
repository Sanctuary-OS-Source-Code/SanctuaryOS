**Date: August 28, 2026**
**Version: 0.5.5**
## Sanctuary OS: The Web Expansion Update

### Web Landing Page & Routing Architecture
- **Web Multi-Domain Architecture:** Overhauled routing to use clean URL paths (`/thesims4`) rather than wild-card subdomains, natively bypassing strict DNS constraints. Selecting a workspace now dynamically routes to its respective Command Center, seamlessly bridging the desktop and web experiences.
- **Web Environment Gateway:** Implemented a global environment detection utility to safely decouple the frontend. Heavy desktop-exclusive features (Vault, Radar, Workbench, OS APIs) are gracefully hidden when running as a web app.
- **Bento-Box Feature Grid:** Completely reimagined the Web Landing Page layout structure. Discarded rigid dashboard models in favor of a sleek, asymmetrical "Bento-Box" grid integrating Workspaces, News, and Download sections.
- **Pure HUD Aesthetic:** Stripped out generic `glass-panel` wrappers and `backdrop-blur` from the Landing Page in favor of transparent, edge-to-edge panes with sharp neon borders, allowing the complex geometric `SystemBackground` to bleed through beautifully.
- **Web Compatibility Enhancements:** Bypassed native offline cache handlers to resolve infinite loaders during web boot sequence. Restored dynamic sidebar routing and ensured Game Spoke schemas initialize properly on web.
- **CI/CD Automation:** Updated the GitHub Actions release workflow to automatically synchronize the current release commit to the `main` branch, ensuring Vercel automatically deploys the latest version.

### Performance & Infrastructure
- **Global State Caching:** Implemented a Stale-While-Revalidate caching pattern using a global `window.__sanctuaryCache` for elevated hubs (The Nexus, Comm-Link Feed, Sanctuary Support). Views now render instantly with cached data while silently fetching fresh updates in the background, entirely eliminating the 5+ second 'Loading' screen flash between tab switches.
- **Boot Pre-fetching:** Added silent background pre-fetching for elevated hubs during OS boot, ensuring data is fully hydrated and ready for 0ms loading times before the user even clicks.

### Visual & UI Overhauls
- **Mason Profile Redesign:** Implemented a dynamically collapsing `MasonProfileHeader`. The massive hero section gracefully shrinks into a compact top-bar when navigating away from the 'Overview' tab, vastly increasing screen space for content.
- **Showcase Feature Grid:** Upgraded the Mason Profile 'Showcase' to a 2-column layout. Pinned items are now prominent vertical cards on the left, while secondary items are clean horizontal stacks on the right, eliminating awkward image scaling gaps.
- **Chameleon Editor Overhaul:** Completely reimagined the `ChameleonControlDashboard` UI, grouping the previously massive scrolling list into four sleek sub-navigation tabs. Upgraded generic color swatches into premium pill-shaped hex code displays.
- **Card & Folder Enhancements:** Pinned Install/Update buttons and dates to the right side of asset card footers. Realigned Artifact folder behavior so clicking a folder card expands the inner contents drawer rather than opening a dossier.
- **Legal Documents Viewer:** Transitioned the Legal Documents viewer (`WebLegalViewer.tsx`) from a centered modal to the standard global `SidePanel` component for a seamless UI experience.
- **Sidebar Typography:** Replaced rigid truncation with a clean multi-line wrapping rule for long sidebar items (e.g., "End User License Agreement").
- **Unified Scrollbars:** Eliminated intrusive default Windows scrollbars across Asset Preview Sidebars in favor of a custom-styled sleek accent scrollbar.

### Keepers Core & Legal CMS
- **Legal Documents Editor Rewrite:** Scrapped the bloated UI for Legal Documents in the Keepers Hub. Redesigned it with a clean grid of Universal Cards for EULA, Privacy, and Terms, which launch a dedicated Markdown editor SidePanel.
- **Dedicated Web News CMS:** Replaced the repurposed In-App Alerts UI with a brand new, isolated "Website News" tab for Keepers. This powers the Web Landing Page news feed independently from in-game Wayfinder Alerts.
- **Keepers Comms Expansion:** Added 'Announcement', 'Blog', 'Press', and 'Legal / Terms' categories to the Keepers Core dispatch system. Empowered Keepers to target global system broadcasts for the entire platform.

### System Dock & Notifications
- **Micro-Dock Notifications:** Upgraded floating alerts into a unified, premium 'Micro-Dock' glass pill featuring precise alert counts, inner glass shadows, and a gentle zero-gravity pulse animation.
- **Interactive Updates Panel:** Upgraded the floating Micro-Dock into an interactive quick-launch pad. Added a dedicated, glassmorphism 'Nexus Updates Panel' allowing you to preview and install asset updates directly from any screen.
- **Desktop Notifications (Opt-in):** Integrated native OS notifications for Urgent System Broadcasts, Comm-Link alerts, and Malware Detections. Guarded by a strict client toggle to ensure zero desktop spam.
- **Quarantine Micro-Dock Integration:** Added a dedicated glowing red warning button to the micro-dock that dynamically appears when malware is quarantined, ensuring immediate visibility of active threats.

### Security, Privacy & Quarantine
- **Two-Factor Authentication (2FA):** Integrated a comprehensive TOTP Multi-Factor Authentication system within the settings panel. Implemented dual fallback protections and UI mechanisms to securely copy TOTP setup keys.
- **Hardware ID Privacy Masking:** Refactored the telemetry system to cryptographically hash your device's Hardware ID before it is sent to Supabase. This creates a one-way fingerprint for ban detection while guaranteeing zero-knowledge privacy.
- **Malware Quarantine Backend Fix:** The system now correctly indexes the actual quarantined files instead of their JSON manifests, allows restoring the correct package file, and completely purges both the file and manifest when deleted.
- **Persistent Lockdown Mode:** If Sanctuary OS crashes before a quarantined file can be shredded, the system will now trigger the full-screen Secure Shred Modal immediately upon the next startup.
- **Cloud Telemetry (Wayfinder Hubs):** Persistent malware signatures found during the startup sweep are now properly transmitted to the Supabase hubs for community threat analysis, provided telemetry sharing is enabled.
- **Guest Permissions Enforced (Web Expansion):** Properly secured Guest Mode interactions across Comm-Link and The Nexus. Guests can browse freely but are strictly blocked from commenting, uploading, or submitting bug reports.

### General Bug Fixes
- **Firefox Web Compatibility:** Resolved a severe rendering glitch on Windows Firefox where repainting children inside a backdrop-filter caused massive shadow artifacts. Deployed a `-moz-document` fallback to gracefully degrade the glass material.
- **Login Page Theme Fix:** Resolved a bug where the default "transparent" background gradient bypassed fallback logic, rendering the login screen with a blank white background.
- **Title Bar Fixes:** Resolved an issue where the Maximize window button icon was missing due to an unmapped lexicon key. Corrected the Close window button's hover state by repointing its CSS variable to `--danger`.
- **Chameleon Editor Fixes:** Resolved a crash caused by the color selector rendering logic.
- **Nexus Bug Fixes:** Resolved a TypeScript error in the Asset Upload component caused by a missing `releaseNotes` property, and fixed a bug where the "What's New" section appeared empty when uploading a Chameleon or Lexicon.
- **Command Center Alerts Fix:** Fixed a disconnected state issue where clicking the "Sanctuary Alerts" Quick Link failed to open the global Alerts panel.
- **Code Snippet Panel Search:** Added 'Enter to find next' functionality in the Code Snippet panel, tracking the current match index and auto-scrolling to active matches.
- **Time Capsule Enhancements:** Upgraded the "Seal World State" and "Seal Engine Core" buttons to use custom component variants, perfectly syncing their styling with Indigo and Rose themes.
