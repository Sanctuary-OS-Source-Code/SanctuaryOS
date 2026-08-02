**Date: August 1, 2026**
**Version: 0.4.90**

## **Time Capsule & Mod Dossier Polish**

### **Time Capsule Hub Overhaul**
- **Main Hub Rework**: Completely redesigned the primary Time Capsule landing page. The legacy layout has been replaced with a stunning new glassmorphic dashboard featuring fluid `animate-in` transitions and centralized statistics for total vault capacity and engine/world size allocations.
- **Glassmorphic Backup Cards**: Transformed the old blocky backup list items into premium, fully interactive cards. Each card now features absolute positioning with a smooth `group-hover:opacity-100` gradient overlay, bringing the interface to life when hovered.
- **3D Hover Actions**: Re-engineered the card action menus. Hovering over a Time Capsule now triggers a sleek CSS transform, smoothly translating the primary details upwards while sliding in high-contrast, fully integrated glass buttons for **Restore**, **Inspect**, and **Delete**.
- **Interactive Tab Navigation**: Upgraded the Hub's main navigation headers to utilize the new `HubTabButton` component suite, wrapping the landing, World State, and Engine Core filters in a gorgeous frosted glass pill container.
- **Interactive Stat Tiles**: The main dashboard stat tiles are now fully functional; clicking the World State or Engine Core capacity metrics will seamlessly slide you into their respective management tabs.

### **System Status Panel**
- **Detected Patch Tracking**: Added a brand new telemetry block to the `System Environment` section that displays the currently active game version / detected patch alongside the operating system information.
- **Aesthetic Unification**: Stripped out the glowing emerald accents from the Uplink Status and newly added Detected Patch boxes, pulling them into the standard neutral/glass aesthetic to keep the entire telemetry interface fully unified.

### **Time Capsule Operations Panel [New]**
- **Complete Architecture Replacement**: The legacy "Seal Panel" has been completely purged and replaced with a massive new unified **Operations Panel**. This new hub centralizes all advanced Time Capsule management tools (Inspector, Extract, Diff) into a single sleek interface accessible directly from individual backup cards.
- **Aesthetic Unification**: Built from the ground up utilizing the OS's heavy glass aesthetic. All headers, labels, and file listings across the new tabs strictly enforce the heavy `font-black uppercase tracking-widest` standard for a highly cohesive, brutalist feel.
- **Dynamic Context Tracking**: The operations panel intelligently tracks what kind of Capsule you have selected. All UI descriptions and button texts dynamically adapt depending on whether you are inspecting an Engine Core or a World State.
- **Diff Engine**: Introduced a unified, high-contrast directional flow header (`ACTIVE CAPSULE → SELECTED CAPSULE`) for the new Diff tool, allowing you to easily comprehend changes between your current state and historical snapshots.
- **Extraction Tool**: Built a brand new file extraction UI featuring chunky, native-feeling search bars (`py-3`, `rounded-xl`) to instantly drill down and pull specific assets out of massive snapshots.
- **Privacy Masking**: The Vault Coordinates output block actively intercepts the file path and masks your local OS username (`C:\USERS\***\...`), keeping your identity safe if you show the panel on stream.
- **Streamlined Workflow**: Removed the redundant `OPERATIONS` button from the top right of the main Time Capsule Hub. The workflow has been entirely streamlined into the specific backup cards themselves via hover actions.

### **Mod Dossier Polish**
- **Clean Forms**: Removed the inner box styling from the Artifact Category dropdown when in edit mode to better match the flat appearance of surrounding text inputs, utilizing a new `flat` property on the custom dropdown component.
- **URL & Download Fields**: Standardized the fonts for the external URL and cover image URL inputs, and relocated them below the main statistics grid for a cleaner layout. The primary action button (Download Artifact / Search Web) has been moved up to the HubTabs header pills alongside "Flag Artifact" and "Send to Lab" when the dossier is in read-only mode.
- **Toggle Switches**: Slimmed down the vertical footprint of the Paid Artifact and Early Access toggle switches, giving them a much sleeker profile that fits the glass aesthetic.
- **Scrollbar Overflow**: Fixed a clipping issue in the Game Version dropdown where the custom scrollbar would extend outside the rounded corner boundaries of the menu container.

### Vault Alerts & Diagnostics
- **Interactive Vault Alerts**: Overhauled the Vault Alert workflow. When encountering missing dependencies, version mismatches, or file conflicts, the generated alert cards now feature fully interactive dossiers. You can click directly into the artifact's details to view stats, edit metadata, or resolve issues without losing your place in the alert flow.