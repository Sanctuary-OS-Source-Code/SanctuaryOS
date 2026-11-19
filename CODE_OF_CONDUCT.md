# Sanctuary OS Code of Conduct

## 1. Purpose & Covenant

Sanctuary OS exists to provide a fast, transparent, zero-fee, censorship-resistant modding operating system where players (**Citizens**), creators (**Masons**), community staff (**Architects**, **Oversight**, **Wayfinders**), and Foundry stewards (**Keepers**) collaborate safely across independent communities.

Participation across Keepers Core repositories, issue trackers, Foundry dispatches, and Keepers-hosted channels constitutes agreement to uphold this Code of Conduct.

---

## 2. Expected Conduct

All participants commit to:
- **Respectful Collaboration:** Critique code, mod compatibility, and architecture constructively without personal attacks, dogpiling, or gatekeeping.
- **Transparency & Honesty:** Accurately label mod compatibility, dependencies, AI/generated assets where required by a Spoke, and compliance metadata (**Compliance Tiers `0–6`**).
- **Creator & Citizen Sovereignty:** Respect intellectual property, creator licensing terms, `0%` fee non-custodial attribution links, and a Citizen's absolute control over their local hard drive.
- **Confidentiality on Sensitive Reports:** Protect Citizen privacy when reviewing **Ghost Scrubber** sanitized crash logs, security advisories (`SECURITY.md`), or Tier `1` DMCA notices.

---

## 3. Strictly Prohibited Behavior

The following behaviors are prohibited across all Sanctuary OS repositories and Foundry hubs:
1. **Malware & Credential Theft (`Tier 6 Malware`):** Uploading, distributing, obfuscating, or concealing viruses, webhook exfiltrators, keyloggers, wallet drainers, or unauthorized remote-code payloads (`Zero-Choice Lockdown`).
2. **CSAM & Non-Consensual Exploitation:** Strictly prohibited (`ZERO tolerance`). Because neither Keepers Core nor any Partner Spoke can inspect, read, or modify local Vaults—and cloud transfers in `citizen_staging_queue` are AES-256-GCM ciphertext—violations can surface **only** via explicit public/cloud submissions (e.g., Mason Queue, Scout Queue, Nexus Assets/Storage uploads, Comm-Link dispatches, or Support Tickets). When detected on a cloud surface, the operating database owner immediately purges the cloud submission, permanently terminates the offending pseudonymous account (`UUID`), blocks the SHA-256 hash from cloud indexing/uploads, and—where statutory reporting (`18 U.S.C. § 2258A`) applies—submits **only** the minimal cloud-submitted record in its possession (offending external URL or cloud storage object, SHA-256 hash, timestamp, and pseudonymous `UUID` / one-way `zk-*@blind.sanctuaryos.net` alias). External authorities are never granted read access to Hub or Spoke databases, and cloud compliance flags never delete or alter local files (local Quarantine Lockdown applies strictly to **Tier `6` Malware** code threats and requires the Citizen's local Secure Shred signature).
3. **Harassment, Doxxing & Targeted Abuse:** Threats of violence, publishing private PII (`doxxing`), stalking, hate speech, or coordinated brigading against Citizens, Masons, or Maintainers.
4. **Mod Theft & Fraudulent DMCA Abuse:** Re-uploading stolen creator work as one's own or filing knowingly false `17 U.S.C. § 512(f)` takedown claims or false-flag harassment reports.
5. **Security & Governance Circumvention:** Exploiting moderation APIs, bypassing FIDO2/Passkey controls, impersonating Keepers/Wayfinders, or falsifying security telemetry.

---

## 4. Hub vs. Sovereign Partner Spoke Boundaries

Sanctuary OS enforces architectural separation between **Keepers Core (Core OS Hub)** and independent **Partner Spokes**:
- **Spoke Moderation Autonomy:** Individual game communities (`schema.sql`) govern their own community guidelines, **Tiers `2–5`** self-hosted boundaries, support queues, and `is_comm_banned` mutes independently through their **Architect**, **Oversight**, and **Wayfinder** officers. Neither Keepers Core nor any Spoke database has technical access to read, scan, or delete files inside a Citizen's local Vault; cloud enforcement is strictly non-destructive cloud-indexing suppression and hash upload blocking (with local Quarantine Lockdown reserved exclusively for **Tier `6` Malware**). Keepers Core does **not** override routine local community moderation unless an issue escalates into an unaddressed **Tier `1` DMCA (`48h` SLA breach)**, a **Tier `6` Malware Threat**, an illegal public/cloud submission (`§ 2258A`), or a **Partners Agreement** violation.
- **Core Hub & Open-Source Governance:** Keepers Core enforces this Code of Conduct directly within the source repository (`CONTRIBUTING.md`, GitHub Issues/PRs, Foundry release channels) and global SSO abuse cases.

---

## 5. Reporting & Appeals

- **Community Spoke Conduct or Flag Disputes:** File through the Spoke's Oversight queue or review [Moderation Appeals & Remediation SOP](./Docs/moderation_appeals_and_remediation_sop.md).
- **IP / Ownership Disputes (`Tier 1 DMCA`):** Follow [DMCA & Ownership Dispute SOP](./Docs/dmca_and_ownership_dispute_sop.md).
- **Repository, Maintainer, or Global Abuse Reports:** Report privately to `conduct@sanctuaryos.net` (or `security@sanctuaryos.net` for security-related abuse). Reports are acknowledged within **48 hours** and reviewed impartially.
