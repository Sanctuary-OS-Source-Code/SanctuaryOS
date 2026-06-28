## Table of Contents
- [Ticket Dossier](#️-ticket-dossier)
- [Layout Updates](#-layout-updates)

## Ticket Dossier
**Logs Tabs**
- The old classic minimalist tabs in the Ticket Dossier have been replaced with the same rounded, pill-shaped glass design seen in the IDE's Raw Editor, properly scaled down to fit cleanly inside the panel.
- Updated the display logic in the Ticket Dossier so that if a log section's internal title includes " (OS)" (like "Sanctuary OS Logs (OS)"), it is stripped out purely for the UI. The tab now cleanly displays "SANCTUARY OS LOGS".
- The unstyled, native Windows scrollbar under the log tabs (like "Attached Logs") was caused by a missing class (scrollbar-hide). 
- Replaced it with custom-scrollbar pb-2 so it now uses the sleek, stylized glass scrollbar that fits the rest of the application's aesthetic.

**Citizen Version (Support Desk Textareas)**
- The vertical scrollbars inside smaller inputs and textareas were looking a bit weird because they had a massive 30-pixel margin on the top and bottom, crushing them into the middle of the field. 
- Updated App.css to use a much smaller 4px margin and correctly separate vertical vs. horizontal padding (margin: 4px 0; vs margin: 0 4px;), so they now span properly across all container sizes.

**System Log History Icons**
- The Ticket Dossier now parses the log messages exactly like the rest of the application. 
- If the first word in a log message is a known material icon string (like check_circle, warning, info), it will render it as the actual icon next to the message rather than just printing the raw text.

**Edit Metadata Panel**
- Overhauled the Target Mod button in the dossier side panel. 
- It now shows an edit icon instead of open_in_new, and the handlers have been completely updated to open the proper Metadata Editor. 
- Now in all Elevated Hubs, it will open the Shared Metadata Side Panel.


## Layout Updates
**Quick Links [Command Screen]**
- Architect Console
    - Added Templates Section Quick Link
- Oversight
    - Added Malware Manifests Section Quick Link
- Wayfinder
    - Added Malware Manifests Section Quick Link

**Hub Metrics[Command Screen]**
- Oversight
    - Removed the Total Artifacts Tile
    - Added the Total Malware Manifests Tile
- Wayfinder
    - Removed the Total Blacklist Tile
    - Added the Total Malware Manifests Tile
