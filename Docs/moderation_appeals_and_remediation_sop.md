# Moderation Appeals, False-Positive Quarantine & Remediation SOP

**Effective Date:** November 18, 2026 | **Document ID:** `SOP-GOV-02 (V1.0)`

---

## 1. Due-Process Commitment

Sanctuary OS restricts automated enforcement strictly to protecting hardware/OS security (**Tier `6` Malware**) and maintaining clean public feeds (**Tiers `1–5`**). Every moderation classification, compliance flag, heuristic quarantine, and account action is appealable through a transparent, auditable workflow.

---

## 2. Appealable Actions & Scopes

| Classification / Action | Authority Owner | Target SLA | Remediation Path |
| --- | --- | --- | --- |
| **Architect Registry Rejection (`Tier 0`)** | Spoke **Architect -> Oversight** | **72 hours** | Fix missing dependencies, metadata, or submit passing `_lab_cert_proof`. |
| **Compliance Tiers `2–5` Classification** (`Explicit`, `Illicit`, `Extreme Violence`, `Taboo`) | Spoke **Oversight -> Wayfinder** | **5 business days** | Re-review asset taxonomy; reclassify to `Tier 0` if misflagged, or document Edge Pulse `T2–T5` self-hosting path. |
| **Legal / DMCA Hold (`Tier 1`)** | Spoke **Oversight / Wayfinder** (Statutory Counter-Notice) | **`10–14` business days** (`§ 512(g)`) | File formal Counter-Notice under [DMCA & Ownership Dispute SOP](./dmca_and_ownership_dispute_sop.md). |
| **Bytecode Hound False Positive (`Tier 6 Malware`)** | Spoke **Oversight** (Spoke rule) OR **Keepers Core** (Core rule / SHA-256 blacklist) | **48 hours** | Supply clean SHA-256 + matched rule ID; refine terminal extension / regex signature and lift block. |
| **Verified Mason / Spoke Ban / `is_comm_banned`** | Spoke **Wayfinder** | **7 days** | Written remediation commitment and review of immutable `audit_logs`. |
| **Global Keepers SSO Suspension / Threat Manifest Dispute** | **Keepers Core** | **7 days** | File via `appeals@sanctuaryos.net` or Keepers OS Ticket (`keeper_tickets`). |

---

## 3. Submitting a Complete Appeal

To prevent back-and-forth delays, include:
1. **Target Identifier:** `mod_id`, full lowercase `SHA-256` hash, Ticket ID, or **Detection Source & Rule ID** displayed inside the Sanctuary OS Quarantine / Compliance drawer.
2. **Basis of Appeal:**
   - *Compliance Tier (`T2–T5`):* Explain why the asset satisfies **Tier `0` Clean** public criteria (or provide an edited public build with mature sub-modules split into optional Edge Pulse add-ons).
   - *Malware False Positive (`Tier 6`):* Provide the uncompiled/source build script or clear technical explanation of the legitimate API call (e.g., harmless config parser matching an overly broad pattern) so maintainers can tighten `heuristic_signatures` or `keeper_heuristic_signatures` without weakening security.
   - *Conduct / Account Action:* Acknowledge the underlying rule if applicable and outline corrective steps taken.
3. **Clean Evidence:** Only attach **Ghost Scrubber** PII-sanitized logs or reproducible open-source links—never upload raw credentials or unredacted OS paths.

---

## 4. Escalation Ladder & Conflict-of-Interest Rule

Appeals follow a strict upward ladder so no moderator judges their own contested decision alone:
1. **Tier 3 — Architect Review:** Clarifies metadata, broken dependencies, or Known Exception rule feedback (`Tier 0` only).
2. **Tier 4 — Oversight Review:** Evaluates contested `Pending` flags (`has_pending_flag`), Tier `2–5` classifications, and Spoke `heuristic_signatures` false positives.
3. **Tier 5 — Wayfinder Sovereign Determination:** Final authority for all Spoke-level moderation, role revocations, and `is_comm_banned` appeals.
4. **Tier 6 — Keepers Core Escalation:** Intervenes **only** when (a) a global `keeper_heuristic_signatures` or Core SHA-256 blacklist entry caused the false positive, (b) a Keepers Core account action is appealed, or (c) a Partner Spoke breaches contractual SLAs in [Partners Agreement](../Partners%20Agreement.md).

*Recusal Rule:* Whenever possible, contested appeals are reviewed by a different officer at the same or higher clearance tier than the original actioning moderator. All state changes append an immutable record to `audit_logs`.

---

## 5. Remediation Outcomes

- **Full Overturn:** Entry restored to **Tier `0` Clean**, `has_pending_flag` cleared, heuristic rule tightened/whitelisted across Core or Spoke rules, and repeat-infringer counters adjusted cleanly.
- **Scoped Coexistence (`Edge Pulse`):** If public Nexus display remains ineligible under **Tiers `2–5`**, Oversight provides clear notice while affirming the creator's freedom to distribute directly via decentralized **Edge Pulse** manifests (`.sanctuary.manifest.json`) for Citizens to manage in local Vaults.
- **Offline Sovereignty Guarantee:** Throughout any moderation or appeal cycle, Citizens may continue using local Sanctuary OS Vaults offline without restriction (and may toggle the offline 5-click **Nuclear Override** if testing local builds).
