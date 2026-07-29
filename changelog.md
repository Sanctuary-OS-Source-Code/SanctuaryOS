**Date: July 29, 2026**
**Version: 0.4.87**

## **Blueprint Infrastructure & UI Harmonization**

### Ecosystem Syncing
- **Cloud Blueprint Ingestion**: Fixed a critical path in the Nexus Blueprint downloader where the `syncBlueprintByCode` handler wasn't being correctly passed to the core component. The "Install" action on the Nexus now accurately fetches and unpacks cloud blueprints directly into the local workspace.
- **Blueprint Premium Status Pipeline**: Engineered a new premium data fetching pipeline for Nexus blueprints. Premium and Early Access flags for artifacts inside a blueprint are now accurately computed across chunked arrays to bypass URL-length limitations when querying massive load orders.

### Core Systems & Monetization
- **Paid Artifacts Infrastructure**: Engineered a comprehensive Paid Mods system, introducing full database-level tracking for `is_paid` and `is_early_access` flags. Developed robust pipeline logic to verify premium status across the ecosystem. **Architects can now toggle Premium and Early Access status for their artifacts directly within the Metadata Editor.**
- **Local Scanner Deprecation**: Removed the redundant Local Scanner logic.

### Component Architecture
- **Mason Profile Overhaul**: Fully refactored and revamped the massive `MasonProfile.tsx` by breaking it down into distinct, modular components (`MasonProfileHeader`, `MasonProfileOverview`, `MasonProfileArtifacts`, `MasonProfileBlueprints`, `MasonProfileCommLink`). Alongside the backend refactor, the entire front-end user interface was completely reimagined. It now features a hyper-immersive layout with dynamic glassmorphism, vastly improved data visualizations, seamless tab transitions, and an architectural overhaul that fundamentally elevates the entire Mason Profile.
- **Dispatch Feed & Post Editor Revamp**: Reworked the Comm-Link and Dispatch Feeds across the Command Center and Elevated Hubs to use a more fluid, compact layout instead of pinning a single post at the top. Additionally, overhauled the backend logic to clean up the Alert and Dispatch flows alongside revamping the associated Post Editor components.

### UX / Polish
- **Centralized Action Buttons**: Revamped action buttons across the entire application to use a sleek, standardized pill-shaped glass design with dynamic hover heuristics.
- **Loading Screen Revamp**: Implemented stunning new global loading screens that utilize smooth CSS micro-animations, glassmorphism, and branded accents to keep users engaged during heavy data fetches.
- **Status Bar Blueprints**: Re-architected the System Status Bar to deeply integrate Blueprint management, establishing a seamless new button flow for tracking active deployments and background syncs.
- **Blueprint Sanitization UI**: Repaired and fully integrated the Blueprint Sanitize action. Missing artifacts ("ghosts") in a blueprint can now be cleaned up effortlessly via a dedicated, polished SidePanel.
- **Missing Imports Alert Overhaul**: Refined the UX for resolving missing dependencies during Blueprint ingestion.
  - Added a "Skip Premium" batch action for quickly bypassing paid or early access requirements.
  - Skipped Premium artifacts now render underneath the banner for transparency instead of being completely hidden.
- **Premium Blueprint Badges**: Implemented a new absolute top-left layout for premium/early access badges on Nexus blueprint cards, preventing overlap with critical asset counts and improving visual hierarchy.
- **Scout Queue Updates**: Hashes now require a minimum number of uploads before hitting the Scout Queue for Architect review.
- **...and countless micro-interactions, layout fixes, and aesthetic polishes.**

---

**Date: July 24, 2026**
 **Version: 0.4.86**

## **Core Architecture & UI Refinements**

### Security & Data Integrity
- **Immutable Audit Logs**: Implemented strict append-only security triggers at the database level (`schema.sql`). Audit records can no longer be modified or deleted once written, completely locking down history tracking even from database owners.
- **Audit Log Redundancy**: Audit logs now synchronously write to both the localized workspace database and the overarching Core OS database, acting as an un-tamperable failsafe.
- **Keeper Core Log Filtering**: Added workspace-specific filtering to the Audit Log Viewer, cleanly separating global OS operations from individual game-specific activity.

### Component Architecture
- **Keeper Hub Buildout**: Completed a major expansion of the Keeper Hub environment, providing OS-level administrators with a comprehensive dashboard to monitor global metrics, manage cross-workspace broadcasts, and oversee the entire Sanctuary OS ecosystem.
- **Keeper Support System**: Built out a dedicated support ticketing pipeline for direct communication between workspace operators (Wayfinders) and Core OS developers (Keepers).
- **Command Screens Modularization**: Completely refactored the massive 1,100+ line `CommandScreens.tsx` file. All role-specific dashboards (Mason, Architect, Oversight, Wayfinder, Keeper) have been extracted into their own individual, lightweight components to drastically improve code maintainability.
- **Chameleon UI Rework**: Reimagined the Chameleon customizer tab into a paginated wizard flow, significantly improving the aesthetic customization experience and making theme creation much more intuitive.

### Performance & Engine Optimizations
- **Blueprint Deploy Times**: Optimized the underlying engine for parsing and deploying Blueprints, drastically reducing the time it takes to apply complex workspace configurations.

### UI Polish & Consistency
- **Workspace Landing Aesthetics**: Overhauled the Workspace Landing page UI to be lighter and more closely integrated with the active theme, shedding the heavy dark backdrop.
- **Workspace Loading Flow**: Updated the global 'Syncing Workspace' loading screen to utilize the new `theme-glass-panel` aesthetics, lightening the overall visual feel to better match active themes.
- **Dispatch Layouts**: Normalized the header styling across all Dispatch and Post Editor screens (Keeper, Mason, Wayfinder), removing inconsistent background tints and standardizing padding for a cleaner, unified look.
- **Search Dropdown Aesthetics**: Refined the global search pill, flattening the bottom radius when the dropdown is active for a seamless visual connection to the results list.
- **Status Bar Integration**: Relocated the Unidentified (DNA) panel trigger and the Conflict Radar to the global status bar, preventing intrusive screen takeovers while ensuring both tools remain accessible from anywhere. The radar icon now dynamically ties to the active environment's status colors.

### Bug Fixes & Internal Routing
- **System Actor Formatting**: Hardened the Audit Log Viewer to properly render "SYSTEM" for backend actions lacking a direct user identity, and fixed `game_name` syncing for cross-database logs.
- **Keeper Broadcast Action Logging**: Fixed the system broadcast saving logic within the Keeper Dispatch to correctly log actions under "Keeper Hub" instead of "Wayfinder Operations".
- **Ticket Hashes**: Implemented logic in the Support Queue to properly resolve unverified mod `dna_hash` targets back to their original mod records and authors.

---

 **Date: July 23, 2026**
 **Version: 0.4.84**

## **Workspace Architecture & UX Overhaul**

### Workspace Flow & Sidebar
- **Workspace Flow Rework**: Overhauled the workspace loading flow. The transition between your active game environments is now significantly smoother, eliminating the clunky intermediate steps when swapping workspaces.
- **Workspace Sidebar Redesign**: Updated the sidebar layout when inside a workspace. The new design reorganizes game-specific tools and navigation, clearing up clutter and making better use of vertical space compared to the old layout.
- **Workspace Side Panel Enhancements**: Improved the slide-out Workspace Panel. It now serves as a more effective centralized hub for your active game, bringing workspace-specific settings, themes, and diagnostics closer to the surface instead of burying them in the main settings menus.
- **Collapsed Sidebar Tooltips**: Fixed the hover tooltips in the collapsed sidebar state. Tooltips now correctly anchor to the viewport edge instead of negatively shifting off-screen, ensuring full labels (like "Notifications") are always readable.

### Personalization & Control
- **Chameleon & Lexicon Engine Rework**: Refactored the core Chameleon (Theme) and Lexicon systems. The underlying engine has been tightened up to properly enforce user-defined overrides over the default OS lexicons, ensuring custom UI strings and themes apply consistently across all workspace components.
- **Global vs. Workspace Toggle**: Added a clear distinction between Global and Workspace-specific options. You can now explicitly toggle whether your current setting adjustments should apply universally across Sanctuary OS or be scoped strictly to your active game environment.

### Workbench, Polish & Fixes
- **Template Keybinding Updates**: Expanded keybinding support within the template system, adding new shortcuts and refining existing ones to speed up the visual mapping workflow in the Workbench.
- **QOL & Random Fixes**: Squashed several UI bugs, corrected dropdown placeholder strings across the Mason and Scout Queues (swapping generic 'architect' labels for context-accurate ones), and stripped out redundant headers in the Compliance Oversight panels to give your data more room to breathe.

---

 **Date: July 22, 2026**
 **Version: 0.4.81**

## **Citizens Workbench & System Preferences Polish**

### Citizens Workbench: Split Vision Enhancements
- **Bi-Directional Scroll Synchronization**: Engineered true two-way scroll-sync between the visual block editor and the raw text editor in the Citizen's Workbench Split Vision mode. Scrolling one panel perfectly maps and scrolls the other, keeping you perfectly oriented.
- **Targeted Edit Highlighting**: Integrated a smart highlighting engine. Hovering or editing any layout block in the visual interface now actively pulses and highlights its exact corresponding JSON/code block in the raw editor panel.
- **Auto-Locking & Snap-to-Edit**: Built auto-scroll locking into the visual editor. Clicking any element in the visual block instantly snaps the raw text editor's viewport directly to that exact line of code, eliminating the need to manually hunt for your changes.
- **Auto-Map from Target File (Magic Wand)**: Introduced a powerful new "Auto Map" feature into the Workbench Editor toolbar. Clicking the magic wand icon instantly parses the raw JSON template, automatically detecting template keys and dynamically generating a fully functional visual form interface on the fly without any manual mapping.

### System Preferences: Lexicon Library
- **Dual-Database Lexicon Architecture**: Re-architected the Lexicon Hub's data flow to securely support the new Hub-and-Spoke database model. Core OS Lexicons (`en-sanctuary`, `en-default`) now safely fetch and write strictly to the global OS Database, while community/game lexicons (like `simlish`) dynamically route directly to your active Game Database.
- **Dynamic Community Badges**: Fixed an issue where community lexicons were incorrectly badged with "Sanctuary". Community lexicons now intelligently ping the active global game schema to dynamically display the correct active workspace name (e.g., "The Sims 4") on their library cards.
- **Inline Custom Dropdowns**: Upgraded the Lexicon Library search filters. Stripped out the legacy horizontal-scrolling pill buttons and replaced them with sleek, custom dropdown components (`CustomDropdown`) beautifully aligned directly beside the search bar.
- **Lexicon Cache Purge**: Resolved a stubborn localStorage caching bug where deleting or replacing a lexicon would fail to properly wipe the orphaned data from local memory, causing stale or ghost lexicons to persist in the UI.

---

 **Date: July 22, 2026**
 **Version: 0.4.80**

## **Multi-Workspace & Database Architecture Overhaul**

### Hub and Spoke Database Routing [New Architecture]
- **Multi-Database Support**: Completely restructured the backend architecture to support multiple independent databases. The application now uses a Hub-and-Spoke model where a single Main OS Database acts as the central Source of Truth, connecting dynamically to various Game Databases based on your active workspace.
- **Dynamic Client Proxy**: Engineered a custom Supabase `Proxy` client (`supabase.ts`) that intelligently intercepts database calls. Global OS tables (`profiles`, `sanctuary_themes`, `sanctuary_games`, `audit_logs`) are automatically routed to the Main OS Database, while game-specific queries seamlessly route to the active Game Database.
- **Legacy Fallback**: Implemented a secure fallback mechanism to route calls to a legacy environment if no active workspace is selected, ensuring backwards compatibility for older flows.

### Authentication & Security Polish
- **Dual Session Persistence**: Resolved critical `Permission Denied` errors on Game Database interactions. The dynamic database client now properly respects and loads cached game-specific tokens (`sb-<project-ref>-auth-token`) from local storage instead of forcing anonymous sessions, ensuring Row Level Security (RLS) is strictly enforced and automatically validated against your active Game Profile.
- **Cross-Database Identity Fixes**: Dropped restrictive Postgres Foreign Key constraints (`masons_profile_id_fkey`) on Game Databases. Profile IDs stored in Game Databases now act as loose, decentralized UUID references to the OS Database, preventing 409 Conflict errors when linking identities across databases.

### Localization & Lexicon Enforcement
- **Zero-Hardcoded Strings**: Conducted a massive sweep across the UI to enforce the `useLexicon` translation engine. 
- **Thematic Lexicon Routing**: Created strict keys across `en-default.json`, `en-sanctuary.json`, and `en-sims.json` dictionaries. Standard text is now dynamically translated into immersive, cyberpunk, or casual English depending on the active theme and workspace context.
- **Mason Linker UI Polish**: Refined the identity linking UI to accurately fetch and display cross-database usernames. Fixed a confusing UI glitch where your OS username was surfacing instead of your Game Database username when interacting with Game tables.

### Wayfinder & Identity Evolution
- **Wayfinder Role Migration**: Reworked the "Wayfinder" concept from being a hardcoded core OS application feature to a dynamic, game-specific role. This allows for distributed, game-specific moderation and oversight without granting global OS-level admin rights.

### Core Systems & Workflows
- **Keepers Core & Schema Evolution**: Introduced a brand new `Keepers Core` flow to centralize and streamline schema management. 
- **Advanced Lexicon Process**: Built a robust new Lexicon editing process for mapping translation dictionaries dynamically across the OS.
- **Theme Process Overhaul**: Refined the theme generation and management process, allowing for tighter aesthetic synchronization across workspaces.

### Workspace & Navigation
- **Workspace Selector Screen**: Built a brand new Workspace Selector launch screen, providing a visual, game-oriented entry point to seamlessly swap between active environments on boot.
- **Revamped Login & Cartographer**: Overhauled the authentication and onboarding experience, implementing the "Cartographer" flow for smoother user identity and database mapping during login.

### Vault Organization
- **Master OS Vault Enforcement**: Promoted the Vault Path architecture from a per-game setting to a global Master OS Vault. Game-specific vaults are now dynamically routed into subfolders (e.g., `Sanctuary OS Vault/sims4`). If the Master Vault is moved, all active workspaces automatically and safely reconnect to their respective subfolders without breaking.
- **Vault Folders Rework**: Major overhaul to the Vault storage system, introducing true Folder support. Assets can now be organized, grouped, and managed within nested folder structures instead of a flat list.

---

 **Date: July 18, 2026**
 **Version: 0.4.72**

## **QOL & Optimizations**

### QOL Updates
- **Custom Context Menu Spellchecker [New]**: Built a completely offline, native-feeling JavaScript spellchecker (`nspell`) directly into the custom dark-mode context menu. It geometrically detects misspelled words on right-click using `document.caretRangeFromPoint`, queries local dictionaries, and allows 1-click text replacements without breaking TipTap's selection history.
- **Comm-Link Drafts**: Added local state preservation for unsaved replies in the Comm-Link, ensuring drafted text isn't lost if you accidentally close the panel or navigate away.

### Bug Fixes & Optimizations
- **Rich Text Performance Optimization**: Eliminated severe typing lag inside the Comm-Link reply editor. Increased the state-sync debounce timeout on the `RichReplyEditor` component from 50ms to 500ms to prevent the massive parent component (`MasonPostViewer`) from thrashing the DOM with re-renders on every single keystroke.
- **Side Panel Header Aesthetics**: Adjusted the master `SidePanel` component to slightly raise the titles and close buttons, and swapped hard truncation for `line-clamp-2`, allowing long subtitles to naturally wrap onto a second line instead of aggressively cutting off.
- **Browser Panel Depth Sort**: Resolved a UI clipping glitch where the floating `SidePanelBrowser` was getting eclipsed by the main top-left Sanctuary logo by explicitly elevating its `z-index` over the TitleBar layer.
- **Status Bar Toggle Polish**: Fixed broken state toggles on the System Status Bar buttons, ensuring the Browser and Settings panels open/close reliably, and updated their active states to have consistent, distinct visual feedback.
- **Vault Sandbox Integration**: Sandbox Mods now correctly populate and display within the Vault.
- **Comm-Link Reply Icons**: Fixed rendering of inline icons (`[ICON:...]`) within Comm-Link replies.
- **Nexus Template Updates**: Resolved a bug in the Nexus where Template updates would get stuck or fail to process correctly.
- **Hidden Asset Updates**: Hidden assets (e.g., hidden by their creator) no longer falsely trigger global update alerts for users.
- **Template Alert Clearing**: Fixed an issue where Template update alerts wouldn't correctly clear from the UI after successfully installing the update.


---

 **Date: July 18, 2026**
 **Version: 0.4.7**

## **UI/UX & Platform Architecture**

### Cloud Synchronization & State Management
- **Master Lexicon Cloud Flow [New]**: Built a brand new cloud-synchronized flow for Master Lexicons. Wayfinder Oversight can now fetch, edit, and push global translation dictionaries directly to the cloud backend, ensuring immediate deployment of new keys without client updates.
- **Master Schema Integration**: Upgraded the existing Master Schema flow to utilize the same new robust architecture as the Lexicons, providing a unified editing experience across both datasets.
- **Dynamic Themes**: Hooked default Chameleons into the cloud backend (`sanctuary_themes`), enabling live platform-wide aesthetic updates without needing a local patch.
- **Toolbar & Error States**: Implemented comprehensive error handling and visually distinct toolbar states across the new Master Schema and Lexicon flows to provide robust feedback during cloud save/sync operations.

### Component Refactors
- **Chameleon & IDE Breakdown**: Executed a major structural refactor of the Wayfinder Hub's file editing capabilities. Exploded monolithic components by separating logic into dedicated `WayfinderChameleons.tsx`, `MasonIDE.tsx`, `MasonEditorPanel.tsx`, `MasonFileBrowser.tsx`, `MasonHeader.tsx`, and a centralized `useMasonFiles.ts` hook, drastically improving maintainability and performance.
- **Lexicon Simplification**: Performed deep cleanup and standardization of Lexicon files across the ecosystem, streamlining translation keys and removing redundant logic.

### Wayfinder Hub Upgrades
- **Centralized Control**: General polish and upgrades to the Wayfinder Hub interface to integrate the new Lexicon, Schema, and Chameleon flows into a unified developer dashboard.

---

 **Date: July 17, 2026**
 **Version: 0.4.67**

## **UI/UX & Platform Polish**

### Lexicon IDE Buildout [New Feature]
- **Dedicated Language Editor**: Built a new IDE environment specifically for viewing, editing, and managing localization files (Lexicon Packs).
- **Live Translation Stats**: Added a floating action bar that tracks translation progress and surfaces missing or completely absent strings in real-time.
- **Quick Actions**: Introduced `Next Empty` and `Add Missing Keys` functionality to rapidly tab through and complete partial translations.

### Chameleon Theme Forge (Mason Version) [New]
- **Theme Creator Tools**: Implemented the "Chameleon Forge" for creators to build, edit, and publish platform-wide themes.
- **Holographic Sandbox**: Integrated a live preview component that instantly updates typography, glass effects, and semantic colors as you drag sliders.
- **Live Theme Synchronization**: Changing values in the Forge automatically previews them across the entire OS interface in real-time.

### Component Polish & Consistency
- **Workbench Visual Block**: Rethemed the Workbench layout to closely match the new glassmorphic OS design patterns.
- **Mason IDE Enhancements**: Unified card styles and headers across `MasonIDE` and `MasonChameleons` for a cohesive layout.
- **Theme Cards Update**: Restyled custom theme cards with vertical layouts and subtle hover gradients to match IDE file cards.
- **Sandbox Cards**: Stripped legacy color-bars from Sandbox artifact cards to align with modern glass UI.

### The Nexus & Upload Polish
- **Nexus Upload Flow Rework**: Completely refactored the artifact upload flow in the Nexus to provide a smoother, more guided experience for all asset types (Mods, Lexicons, Themes, Templates).
- **Nexus Visibility Toggles**: Added the ability to hide assets from public view (making them active but unlisted).

---

 **Date: July 15, 2026**
 **Version: 0.4.66**

## **UI/UX & Platform Polish**

### Citizens Workbench Overhaul
- **Modular Refactoring**: Exploded the massive, monolithic `CitizensWorkbench.tsx` file into smaller, highly focused components (`WorkbenchVisualEditor`, `WorkbenchFileGrid`, `WorkbenchTemplateGuide`), dramatically improving codebase maintainability.
- **Tabbed Navigation**: Implemented a sleek 3-tab navigation system inside the Workbench (Visual Interface, Raw Editor, Template Guide) using fully localized strings, providing dedicated screen space for configurations versus documentation.
- **Template Menu Groups**: Introduced a brand new menu grouping system for template categorization, keeping custom and default templates cleanly separated and easily accessible.
- **Insert Buttons**: Added localized insert buttons to streamline adding blocks directly into raw and visual configuration editors.
- **Visual Interface Lockout**: Integrated a real-time syntax parser. If syntax errors (like missing commas or brackets) are detected in the raw editor, the visual interface is instantly locked behind a warning overlay, preventing destructive slider/toggle inputs from corrupting the raw layout until the typo is resolved.
- **Save Diagnostics**: The primary save button now actively monitors for active syntax errors. If an error is detected, the button turns a stark danger-red and forces you into a double-inline confirmation (`SAVE WITH ERRORS` -> `FORCE OVERRIDE`) before letting you overwrite the file with broken code.
- **Resize Glitching**: Resolved a jittery resizing glitch when dragging the preview panel edge, ensuring smooth fluid resizing constraints.

### The Nexus & Upload Polish
- **Nexus Updates Fixed**: Repaired a broken update flow in the Nexus, ensuring that downloading updates correctly tracks versioning and registers locally without falling out of sync.
- **Upload Process Polish**: Smoothed out the mod and blueprint upload flows, refining error handling and standardizing the UI state transitions for a much cleaner publishing experience.

### Version Timeline Refactor
- **True Time Travel**: Completely overhauled the "Restore" logic. Previously, restoring an old version instantly created a brand-new duplicate snapshot at the top of the timeline. Now, restoring an old version silently rewrites the active file and *properly applies* the "Active Version" badge directly to that specific historical snapshot. A new snapshot is only created when you physically make new edits and save them.
- **Backend File History Management**: Engineered new Rust-powered backend commands (`delete_version`, `toggle_pin_version`, `rename_version`) allowing deep manipulation of `.json` file history backups.
- **Double-Inline Confirm Deletions**: Built a sleek, glassmorphic double-inline confirm delete button into the Version Timeline, allowing users to safely purge unwanted backups without leaving the panel.
- **Badge Sorting Fixes**: Fixed a persistent glitch where the "Active Version" badge was stubbornly hardcoded to the top of the list (`idx === 0`). The Timeline now accurately reads the precise timestamp of your active state and sorts pinned items correctly above unpinned history.

### Component Polish
- **HubTabs**: Workbench interior navigation tabs now dynamically stretch the full width of the interface.
- **Navbar Dropdowns**: Addressed various layout and clipping bugs in the global Navbar dropdowns, ensuring content fits perfectly without spilling over.
- **Card Grids**: App-wide resize to remove hard-coded 4-column locks, allowing grids to naturally scale and respond dynamically to all screen widths without artificial overflow constraints.

---

 **Date: July 11, 2026**
 **Version: 0.4.64**

## **UI/UX & Platform Polish**

### Dispatch & Comm-Link Enhancements
- **Transmission Descriptions**: Introduced a dedicated Description field for Comm-Link, Dispatch, and Global Alert transmissions. Added corresponding backend database columns (`mason_posts`, `system_broadcasts`) to support this enhancement.
- **Wayfinder Post Editor UI**: Re-organized the Wayfinder Posts Editor to move the new Description field onto its own row, giving the target audience and category dropdowns more room to breathe.
- **Card Expansion Polish**: The featured Dispatch Cards and Mason Post Cards will now display this description (falling back to stripping the main message if left empty). Furthermore, the featured Dispatch Cards were stripped of their artificial minimum height constraint, allowing them to perfectly hug short descriptions without leaving dead empty space. 
- **Title Wrapping Fix**: Fixed a bug on the Hub Command Screen Dispatch feed and the Alerts Side Panels where long titles would aggressively cut off. Titles can now wrap up to 4 lines naturally.
- **Image Container Aspect Ratios**: Addressed an issue in the Hub Dispatch layout where the image container would forcibly stretch the card's height on mobile layouts. Images are now correctly positioned to scale responsively.
- **Alert Theming**: Applied a custom muted red aesthetic to the banner images of Global Alerts within the main Viewer modal and the Sanctuary Alerts side panel. These images now utilize a subtle `mix-blend-luminosity` layered over a deep red background with a matching soft gradient to achieve a highly stylized DEFCON look.
- **Sanctuary Alerts Polish**: Upgraded the "Active" filter dropdown within the Sanctuary Alerts side panel to a sleeker 3-button "tab pill" design (All Statuses, Active, Inactive), bringing the layout in line with the Sandbox component.
- **Status Bar & Banner Polish**: Refined the visual aesthetics and hover interactions for the Status Bar buttons and the Radar Sweep banner alerts.
- **Permissions & Violations**: Upgraded the Permissions Alert, Blueprint Violation panel, and Swap Panel layouts to properly integrate with the OS's core themed glass design system.

### Architect Hub Diagnostics
- **Homestead Diagnostics Refinement**: Upgraded the Homestead Diagnostics section within the Architect Hub. Adjusted the data fetching logic to guarantee that artifacts populate the feed *only* after a failed Homestead Lab test or a manual user upload, explicitly excluding arbitrary manual flags.
- **Artifact Hash Grouping**: Implemented intelligent grouping logic to cluster diagnostic artifacts by their unique hash, drastically decluttering the Architect Hub diagnostic feed.

---

 **Date: July 10, 2026**
 **Version: 0.4.59**

## **UI/UX & Platform Polish**

### Universal UI Components
- **Tooltip Modernization**: Upgraded all legacy tooltips across the platform (IDE, Workbench, Comm-Link, Dispatch) to use the new `HoverTooltip` component.
- **Dropdown Refinements**: Fixed sizing constraints on dropdown menus across the app to ensure that text content fully fits and no longer clips or overflows.
- **Hub Tabs & Pill Tabs**: Re-aligned the "Pill Tabs" to inherit the `Mason Hub` layout specifications. Addressed clipping issues within `HubTabs` so the active tab seamlessly expands to fill its designated area in the Tab Bar.
- **Themed Glass Aesthetics**: Updated the table headers in `SAMassUpdateOversight.tsx` to utilize the platform's standardized themed glass styling instead of harsh solid colors.
- **Empty State Standardization**: Integrated the shared `EmptyState` component into the **Vault** and **Comm-Link** feeds, preventing harsh blank screens when no mods or transmissions match active filters/searches.
- **Card Hover Glitch Fix**: Resolved a visual jittering and glitching issue related to hover states on interactive cards.
- **Malware Alert Modal Polish**: Refined the aesthetics of the Malware Alert Modal by removing harsh scanlines, restoring rounded glass corners, lowering glow intensities, and adopting a translucent dark background to match the OS's cohesive glassy feel.
- **Banned Screen Glassification**: Redesigned the "Network Severed" (Banned) screen to use the standard glassy `backdrop-blur-3xl` aesthetic instead of a pitch-black void, and explicitly blocked the native right-click Context Menu to prevent quarantine bypass via the web inspector.
- **Status Bar Layering**: Lowered the `SystemStatusBar` z-index so that it correctly sits *behind* global system modals (such as Malware and Defcon alerts) while remaining securely above standard side panels.
- **Preferences Migration**: Migrated the "Preferences" (Settings) navigation button out of the main Sidebar and integrated it into the bottom System Status Bar. Replaced the text-heavy "Notifications" button with a sleek, icon-only split layout utilizing localized hover tooltips.

### DEFCON & Alert Systems
- **Modal Color Synchronization**: Unified the Backup & Restore modal color palettes with their respective hubs. The World State (Time Capsule) modal now uses a deep Indigo Purple (`#6366f1`), and the Engine Core modal uses a vibrant Rose Red (`#f43f5e`), replacing generic CSS variables to match the hubs 1:1.
- **Launch Intercept Anti-Spam**: Refined the Quick Launch DEFCON 1 logic to prevent alert fatigue. The system now silently verifies if a backup has already been performed or if the intercept warning has already been acknowledged during the current alert. If either is true, the game launches instantly without redundant pop-ups. The intercept tracker resets automatically when the network returns to DEFCON 5.
- **Wayfinder Stat Tile Real-Time Sync**: Fixed a bug where the Wayfinder Hub's "Global Defcon" statistic tile was freezing on an outdated local state. The tile's one-off independent fetch has been removed and it is now permanently wired to the global `useStore()` state, ensuring it updates in real-time alongside the rest of the operating system.

### Context Menu & Icon Picker
- **Focus Preservation System**: Fixed a critical text-insertion bug for rich-text editors. The Context Menu now snapshots the exact DOM selection range at the moment of opening. This ensures that when the Icon Picker's search bar steals focus, icons can still be reliably injected into the exact cursor location in the text field.
- **Context Menu Positioning**: Improved smart positioning logic so the Icon Picker reliably appears beside the cursor instead of overlaying it.

### Architect Cartographer
- **Cartographer Workspace Polish**: Upgraded the Cartographer component suite with refined layouts, updated styling variables, and an overall more cohesive integration into the Sanctuary OS ecosystem, improving the developer experience.

## **Database & Backend Integrations**

### Supabase Architecture Fixes
- **Game Versions RLS**: Resolved a `403 Forbidden` error restricting Oversight additions by properly defining `INSERT`, `UPDATE`, and `DELETE` Row Level Security policies on the `game_versions` table.
- **Schema Auto-Defaults**: Patched a `400 Bad Request` API error by altering the `game_versions` schema, establishing `CURRENT_DATE` as the automatic default for the `release_date` column.

### Homestead Diagnostics & Lab Sandbox
- **Saves Folder Airgap Engine**: Engineered a protective "airgap" mechanism to shield player progression during aggressive mod testing.
- Built a new Rust-powered backend command (`airgap_saves`) that recursively applies strict Windows `Read-Only` attributes across the `saves` directory.
- Integrated the airgap toggle within `ArchitectHomesteadDiagnostics.tsx` and `App.tsx` to automatically lock the folder prior to launching a test run. The game can read existing saves, but the OS physically blocks any modifications or corruptions. Normal read/write access is automatically restored when the test concludes or aborts.

### Engine & Asset Updates
- **Async Scanner Performance Fix**: Resolved a catastrophic UI freezing bug that occurred when performing rapid back-to-back "Secure Shreds". By converting `scan_bunker` and `scan_sandbox` into true `async` functions within the Rust backend, intensive disk-scanning (`runRadarSweep`) is now properly offloaded to the background thread pool, keeping the application instantly responsive.
- **Asset Updates Engine**: Implemented a new engine for updating game assets seamlessly.
- **Download Watcher Fix**: Resolved bugs in the Download Watcher system, ensuring accurate tracking and synchronization of active downloads.
- **Game Version Rip Update**: Updated the game version ripping logic to accurately detect and capture the latest patches.
- **Dev Folder Sync Fix**: Fixed a bug causing the Dev Folder synchronization to fail or lag, ensuring rapid hot-reloads and accurate state matching.

## **Account & Access Management**

### Authentication & Login Suite
- **Login Suite Refresh**: Completely overhauled the authentication flow (`AuthWrapper`) to provide a premium first impression. Introduced glassy translucent panels, modernized login/registration forms, smoothed out state transitions, and integrated robust fallback logic for offline or severed states.

### Guest & First-Time Experience
- **Guest Mode Overhaul**: Completely revamped Guest Mode permissions. Guests now have a cleanly restricted experience tailored to prevent unauthorized edits while still allowing basic navigation and viewing.
  - **What Guests CAN Do**: Browse the Vault, explore the Nexus, view the Comm-Link feed, access the local Workbench/IDE, and read public Mod Dossiers.
  - **Unlocked Sync Access**: Guests now have read-only sync access to the global network, unlocking live data feeds including **Artifact Updates**, **System Status**, **Global Alerts**, and **DEFCON Alerts** without requiring an account.
  - **What Guests CANNOT Do**: Upload Blueprints, publish mods to the Nexus, submit Support Tickets, file Mod Reports/Scout requests, or interact socially (liking, following, commenting, and flagging).
- **First-Time Setup**: Introduced a smoother, streamlined first-time setup process to properly onboard new users. The onboarding flow now actively prompts users to configure their core paths, select their preferred language (**Lexicon**), and choose their starting aesthetic theme (**Chameleon**).

## **Localization Enforcement**

### Lexicon & Translation Overhaul
- **Zero Hardcoded Strings Constraint**: Executed a comprehensive sweep to eliminate raw text strings from the user interface. 
- **Automated Missing String Interception**: Refactored `LexiconContext.tsx` and introduced a `MissingStringLogger`. This dynamically catches unregistered translation keys during development, stores them in `.solder/missing_strings.json`, and bridges the gap to ensure 100% localization coverage.
- **Lexicon Standardization**: Programmatically sorted and synchronized translation dictionaries (`en-default.json`, `en-sanctuary.json`), adding all the necessary mapping keys discovered during the cleanup process.
- **Sims-Friendly Lexicon (`en-sims.json`)**: Expanded the Sims-specific localization strings to cover all newly introduced features and ensure a highly contextualized experience for players.

---
 **Date: July 9, 2026**
 **Version: 0.4.53**

## **UI/UX & Theming Polish**

### Nav Bars & Menus
- **New Dropdowns**: Introduced improved, polished dropdown functionality in the navigation bars.
- **Branding Refresh**: Updated the Logo, Title, and Subtitle across the platform for a fresher look.

### Theming System
- **Theme Forge Expansion**: Expanded the Theme Forge capabilities.
- **Default Theme Refreshes**: Refreshed the default themes with updated color palettes and aesthetics.

### Notifications & Lexicon
- **Status Bar Notifications**: Moved notifications out of the main view and integrated them cleanly into the Status Bar.
- **Lexicon Simplification**: Performed the first pass of simplifying and cleaning up localization dictionary files.

### Bug Fixes
- **Markdown Hydration Errors**: Fixed React hydration and DOM nesting errors in `MarkdownRenderer.tsx` by replacing `<div>` elements inside `<p>` tags with valid HTML elements like `<span>` to eliminate warning logs.

---

 **Date: July 6, 2026**
 **Version: 0.4.52**

## **Sanctuary OS Terminology Overhaul**

### Massive Terminology Refactor (Codebase & UI)
A codebase-wide search and replace was executed alongside meticulous lexicon dictionary updates to shift the platform's core terminology:
	- **Senior Architect** ➔ **Oversight**
	- **Collection** ➔ **Vault**
	- **Marketplace** ➔ **The Nexus**
	- **Solder Lab** ➔ **Homestead Lab**
	- **Proving Grounds** ➔ **Homestead Diagnostics**
	- **CC Sets** ➔ **Collections**
_Dozens of files were successfully renamed (e.g., `Marketplace.tsx` -> `Nexus.tsx`) and all localized translation keys in `en-default.json`, `en-sanctuary.json`, and `de-default.json` were rewritten to strictly enforce the new terminology._

---
### Database Schema (`schema.sql`)
The PostgreSQL schema definition file was restructured to match the new taxonomy:
	- **[NEW] Added Next-Gen Tables**:  `nexus_assets`, `nexus_reports`, `collections`, `collection_members`, `homestead_lab_logs`, `homestead_workbench_templates`.
	- **[DELETE] Purged Legacy Tables**:  `marketplace_assets`, `marketplace_reports`, `solder_lab_logs`, `solder_workbench_templates`, `cc_sets`, `cc_set_members`.
	- **Documentation**: Updated the _Sanctuary OS Forking & Architecture Guide_ to correctly reference Homestead Lab and Nexus logic within the conceptual schema overview.

---
### Sidebar Access & Role Hierarchy Fix
**Bug:** Users assigned the `architect` role could not see the Mason Workshop hub in the sidebar. 
**Fix:** Updated `Sidebar.tsx` routing and visibility logic so that elevated tiers automatically inherit lower-tier tools:
		- `architect` and `oversight` roles can now natively view the Mason Hub.
		- `oversight` roles can now natively view the Architect Console.

---
### UI Rendering & Lexicon Hotfixes
During the automated rename pass, a few unintended side-effects were squashed:
	- **Broken Vault Icon Text Fix**: Fixed the bug where the Collections Hub tab displayed overlapping text (`VAULTS_BOOKMARK`). The automated script replaced `collection` with `vault`, accidentally breaking the `collections_bookmark` Material Symbol identifier. This was surgically reverted so the folder icon renders cleanly.
	- **Mason Stats Card Fix**: Fixed the Mason Workshop's second stat card displaying "Vaults" instead of "Collections". The legacy "CC Sets" translation key was originally translated as "Collections", causing the first script pass to inadvertently rename it to "Vaults".

---
### Dynamic Master Schema Synchronization
A critical architectural upgrade was implemented to move the core game schema definitions (e.g., `sims4.json`) out of hardcoded frontend files and into a fully dynamic, cloud-synced database structure:
	- **Cloud Database Integration**: Created the `sanctuary_schemas` table in Supabase to host all active game schemas via JSONB fields.
	- **Hub Architecture Updates**: Integrated seamless fetching logic into the OS initialization (`loadActiveGameSchema`), allowing the frontend to pull the latest schema version from the cloud and cache it in local storage.
	- **Live Upgrades**: The operating system can now instantly receive structural updates for new game patches, dynamic parser rules, and new category mappings without requiring a complete desktop app re-compilation or software update.
