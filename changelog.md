# **Sanctuary OS**
## **June 28, 2026**
## **Version 0.4.36**

## **System Status Telemetry & Smart Update Architecture**
---
### **Today's update covers:**
- A Comm-Link Update
- New System Status & Telemetry System
- New Smart Update Architecture
- Heuristic Caching
- Zero-Latency Cloud Sync
- Some Bug Fixes  
  
---
### **Comm-Link Update**
- **Comm-Link Cards**
	 - Fixed an “odd border” around the Comm-Link Cards by applying a standard CSS trick for scroll containers with shadows: adding p-6 and a compensating -m-6 to the grid container. 
	- This pushes the scroll clipping boundary out by 24px in all directions, giving the glassmorphic shadows enough room to fade out naturally without affecting the layout alignment.
- **Icons**
	- Added a custom Material Icon Picker to the editor
	- Built a custom ProseMirror Plugin for WYSIWYG Integration
	- Added a user-select: none string
	- This ensures when deleting an icon using the backspace, the icon is deleted instead of deleting the last character in the string leaving you with [ICON:chat_bubble

---
### **Heuristic Caching**
- **Cache Extension**
	- Expanded the internal .bunker_cache.json system to store a heuristic_malware_sig result. 
	- This utilizes #[serde(default)] under the hood to ensure users migrating to this new version won't experience crashing caches.
- **Signature Tracking**
	- Before scanning, the backend checks the modification time (mtime) of Data/.malware_signatures.json. 
	- This gives us a lightweight version stamp for the malware definitions.
- **Smart Skip**
	- Visually tracks your primary drive's used vs. total capacity with a stylized, pulsing progress bar.
- **Retroactive Scanning**
	- If we push a new malware signature post-install, the backend will automatically re-run the heuristic checks on all scripts on the next boot.

  ---
### **Zero-Latency Cloud Sync**
- **Parallel Network Requests**
	- The App.tsx logic previously forced the UI to await over 300 network requests sequentially when syncing a library of 3,000 files. 
	- We've rewritten all four major syncing loops (mod_versions, flavor_group_members, mod_relationships, and mods) to use Promise.all(), allowing the browser to fetch data concurrently.
- **Larger Chunk Sizes**
	- We increased the batching chunk size from 20 to 200.
	- Supabase is highly optimized for large IN (...) queries, meaning the UI now only makes ~15 requests total instead of ~150 requests per table.
- **The Result**
	- Since the Rust backend completes its local scan in < 1 second, and the frontend now fetches cloud data in parallel in < 1 second, the Radar Sweep should finish almost instantly.

 ---
### **System Status & Telemetry (New Feature)**
- **App Telemetry**
	- Instantly verify your current OS version, live online status, and active backend database connections.
- **Environment Diagnostics**
	- Auto-detects and displays your host Operating System, Logical Cores, and total system RAM.
- **Local Storage Tracking**
	- Visually tracks your primary drive's used vs. total capacity with a stylized, pulsing progress bar.
- **Sanctuary Storage Breakdown**
	- Deep-scans your mapped Vault directory and breaks down its exact data footprint in real-time, categorizing the weight of your overall Vault, Artifacts, Data Matrix, Sandbox, and Time Capsule.

---
### **Smart Update Architecture (New Feature)**
- **Global Alerts**
	- When a new update drops, the SYSTEM STATUS button on your global bar will morph into UPDATE AVAILABLE, switch to a pulsing download icon, and glow in your chosen accent color so you never miss a critical patch.
- **Prominent Update Banners**
	- Opening the System Status panel reveals a massive, glowing update banner at the very top, letting you instantly view the incoming version while easily comparing it to your currently installed version below.
- **Live Release Notes**
	- The System Update side panel has been completely rebuilt with a sleek, translucent aesthetic. 
	- More importantly, it now fetches release notes live from the GitHub API. This means patch notes are always perfectly up-to-date, allowing developers to correct typos or add information on GitHub and have it instantly reflect inside the OS without pushing a new build.

---
### **Bug Fixes**
- **Settings Files [Dynamic Config Watcher]**
	- The underlying Windows file-watching API was leaking subdirectory events up to the Airgap Sentinel. 
	- Will use mc_settings.cfg as the example:
		- When MCCC modified mc_settings.cfg deep inside the Mods/MCCC folder, the Airgap Sentinel mistakenly intercepted it. 
		- Because the Airgap Sentinel is only designed to handle top-level files, it stripped away the MCCC/ folder path and flattened the copy straight into the root of Vault > Mods.
		- Every time a citizen deleted it from the Vault root, the moment MCCC ran or a Playset deployed, the Airgap Sentinel would aggressively snatch the event again and recreate it in the root.
	- The Fix: Injected a strict path validation check into the Airgap Sentinel (initialize_airgap_watch in main.rs).
	- It will now explicitly reject any file events that do not originate directly in the root directory it is assigned to monitor.
- **Automated Exception Log Purge** 
	- Fixed lastCrash.txt not being auto purged
	- The code converts every filename it checks into pure lowercase to make matching easier.
	- However, when "lastCrash.txt" was added, the capital C in the check meant it would never match the fully lowercase filename the system was testing it against.
	- Changed it to “lastcrash.txt" so it matches the case-flattened string perfectly.