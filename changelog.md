**Date: August 20, 2026**
**Version: 0.5.3**
## The Interface & Infrastructure Update

### Visual Overhauls
- **Conflict Radar (DbpfScout):** Relocated the blueprint selector dropdown, search bar, and severity filters to the `ViewHeader` for a cleaner, less cluttered interface, matching the layout structure of the Blueprints view. Applied to both the Conflicts and Overrides tabs.
- **Wayfinder Posts Editor:** Stripped the restrictive `glass-panel` class from the rich text toolbar and implemented a custom `color-mix` background style to create a heavily frosted, opaque background that perfectly matches the active theme without becoming pitch black.
- **Keepers Dispatch Audience Dropdown:** The target audience dropdown in the Keepers Dispatch now dynamically fetches and populates from the active games list, allowing the selection of different community Wayfinders (e.g., Sims 4 Wayfinders, Cyberpunk Wayfinders) instead of relying on hardcoded values!
- **Keepers Dispatch Editor Layout:** Moved the editor actions (Save, Discard, Cancel) out of the footer and into the panel's header as compact icon buttons with tooltips, aligning the layout with other side panels.
- **Glass Dropdown Enhancements:** Selected options inside dropdowns now feature a sleek, glass-like styling with accent borders and inset shadows. Additionally, multi-select dropdowns (like the Audience dropdown) now support search filtering alongside new "Select All" and "Clear" quick actions!
- **WYSIWYG Toolbar Aesthetics:** Increased the opacity and blur of the rich text editor's floating toolbar so it stands out better against the text while remaining translucent and adhering to the dynamic theme.
- **WYSIWYG Toolbar Tooltips:** Added descriptive, fully localized hover tooltips (in Standard, Sanctuary, and Simlish themes) for all formatting buttons in the rich text editor to improve usability.
- **Notification Indicators:** Implemented an ambient edge glow that dynamically pulses at the bottom of the screen when unread notifications are waiting and the dock is hidden. The System Status alert pill now automatically triggers with an incoming transmission alert when a new notification is detected, making them impossible to miss.
- **Mason Editor Alignment:** Rebuilt the Mason Posts Editor side panel to perfectly match the layout and design of the Keepers Core Dispatch. Migrated the primary actions (Submit, Cancel, Discard) from the footer into a unified header segment alongside the edit/preview tabs. Also fixed an issue where the WYSIWYG editor toolbar wasn't clickable and lacked proper hover effects.
- **Command Center Stats:** Repositioned the tooltips for the primary dashboard statistics tiles so they display cleanly below the tiles, preventing them from being cut off by the top of the viewport. Additionally, applied a `line-clamp-6` rule to the global tooltip component to prevent massive alerts (like full post text) from breaking the tooltip UI.

### Bug Fixes
- **WYSIWYG Toolbar Interactivity:** Restored pointer events on the rich text editor's toolbar, fixing an issue where the formatting buttons were completely unresponsive and lacked hover effects.
- **Global Search Standard:** Standardized the global SearchBar component across the entire app to guarantee uniform sizing and styling.
- **UI Alignment:** Migrated the filters and search bars to the ViewHeader for Homestead Lab, Citizens Workbench, and Time Capsule.
- **Time Capsule UI:** Compacted the massive row of search and filter dropdowns (Target Version, Start/End Dates) into a single sleek Filter popover button embedded in the ViewHeader.
- **Dispatch Notifications:** Corrected an issue where Keepers dispatch notifications were indiscriminately sent to all users; notifications are now properly routed exclusively to Wayfinders and correctly inserted into the central database.
- **Mason Post Deletions:** Fixed an issue preventing Masons from modifying or deleting their transmissions in the Masonhub by migrating direct database mutations to the secure Magic Proxy (`secure_upsert_cloud_file`, `secure_delete_cloud_file`), bypassing restrictive RLS policies and eliminating 401 Unauthorized errors.
- **Notification 404 Errors:** Eliminated continuous 404 Not Found and `GoTrueClient` console errors by removing legacy polling of the central OS database for notifications, restoring proper game client authentication stability.

### Architecture
- **Proxied Notifications:** Bypassed the recent Supabase ECC P-256 JWT validation enforcement by fully refactoring the Notifications system to route all reads/writes through the `game-gateway` Edge Function. This ensures global OS-level UI features can seamlessly interact with localized Game Databases without fighting cross-database RLS policies.
- **Dispatch Authorship:** Fixed an issue where system dispatches and notifications originating from Wayfinders or Oversight Hub falsely attributed authorship to the global Sanctuary OS Team. Posts and incoming transmission alerts are now accurately attributed to the respective Community Name Team (e.g., The Sims 4 Team) based on the active game environment.
- **Dispatch Notifications:** Revamped the automated notification messages for System Dispatches so that they now dynamically format based on the category and severity of the dispatch (e.g., 'The Sims 4 Team has posted an Urgent Alert: [Title]') instead of a static message. Additionally, clicking the System Status toast notification pill now directly opens the Notifications sidebar instead of the System Log History.
