# DMCA Safe Harbor, Spoke Forwarding & Ownership Dispute SOP (`Tier 1`)

**Effective Date:** November 18, 2026 | **Document ID:** `SOP-GOV-01 (V1.0)` | **Applicable Framework:** `17 U.S.C. § 512` (DMCA) & Florida Law

---

## 1. Zero-Hosting Architecture & Core Principle

Sanctuary OS **never hosts, caches, or mirrors mod binaries (`$0` bandwidth storage)**. All public Nexus entries (`public.mods` / `public.mod_versions`) and Cloud Blueprints store **cryptographic metadata (`SHA-256` hashes, compatibility manifests, version ranges, and creator download URLs)** pointing to external creator hosts.

Accordingly, Sanctuary OS designates **Compliance Tier `1` (`Legal / DMCA Hold`)** exclusively for valid copyright takedown notices (`17 U.S.C. § 512(c)(3)`) and verified creator-ownership / unauthorized re-upload disputes. **Tier `1` never touches, modifies, or deletes files on any Citizen's local drive.**

```
Claimant Notice ──▶ Keepers Core / Spoke Intake ──▶ Tier 1 Hold (`compliance_tier = 1`)
                           │                              │
                           │                              ├─ Public Nexus / Comm-Link / Cloud Blueprints Scrubbed Immediately
                           │                              ├─ Non-Destructive Local Support Lock (Vault untouched)
                           ▼
             Auto-Forwarded to Sovereign Partner Spoke (`Oversight` + `Wayfinder`, 48h SLA)
                           │
                           ├─ Keepers Core logs minimal immutable audit entry (`public.dmca_compliance_notices`)
                           │
                           ├─ Resolved / Upheld ──▶ Remains Tier 1 Suppressed (3-Strike Repeat Infringer Tracking)
                           ├─ Counter-Notice (§ 512(g)(3)) ──▶ 10–14 Business Day Window ──▶ Restored to Tier 0
                           └─ Unresolved Spoke Dispute ──▶ `AWAITING_AUTHORITY` Pause ──▶ Spoke SLA Review if >48h
```

---

## 2. Compliance Tier `1` Routing: Spoke Fulfillment + Keepers Core Audit Log

Because community catalogs live inside independent **Partner Spoke databases (`schema.sql`)** rather than on Keepers Core:
1. **Immediate Public Suppression (`Tier 1`):** Upon receipt of a prima facie valid DMCA or verified IP ownership notice targeting a Nexus catalog record, `compliance_tier = 1` is applied, immediately excluding the record from all public Nexus queries (`WHERE compliance_tier NOT IN (1, 2, 3, 4, 5)`) and stripping confirmed hashes from shared Cloud Blueprints (`purge_flagged_hash_from_blueprints`).
2. **Automatic Forwarding to Partner Spokes (`48h` Contractual SLA):** Notices received through Keepers Core or the designated DMCA Agent (`dmca@sanctuaryos.net`) are **automatically forwarded to the authoritative Partner Spoke Hub (`Oversight` and `Wayfinder`)**. Under the [Partners Agreement](../Partners%20Agreement.md), the Spoke must process and resolve or escalate forwarded Tier `1` notices within **48 hours** of delivery.
3. **Keepers Core Compliance Audit Log (`public.dmca_compliance_notices`):** To maintain statutory Safe Harbor evidence for Foundry infrastructure without invading Spoke database ownership, Keepers Core writes an **immutable compliance audit record** to `public.dmca_compliance_notices` (and mirrored Spoke audit table), recording:
   - Target `spoke_id`, affected `mod_id` / SHA-256 fingerprint, and notice category (`dmca_takedown` / `ownership_dispute` / `counter_notice`);
   - Notice submission timestamp, Spoke forwarding timestamp, SLA deadline (`+48h`), and resolution status;
   - Encrypted claimant/counter-claimant statutory contact envelope (`enc:dmca1:...` ciphertext — zero plaintext emails leaked into public views);
   - Resolution action (`TIERS_UPDATED`, `AWAITING_AUTHORITY`, `RESTORED_TIER_0`, or `SLA_ESCALATED`).
4. **Partner Spoke SLA Non-Compliance:** If a Partner Spoke ignores a forwarded statutory Tier `1` notice beyond **48 hours**, Keepers Core may suspend federation indexing (`is_active = false`) and initiate unilateral **Cut the Cord** review under the [Partners Agreement](../Partners%20Agreement.md).

---

## 3. Requirements for a Valid DMCA Takedown Notice (`17 U.S.C. § 512(c)(3)`)

To trigger a statutory **Tier `1`** hold, a claimant (copyright owner or authorized agent) must submit in writing to `dmca@sanctuaryos.net` or the Spoke's Oversight DMCA intake:
1. Physical or electronic signature of the copyright owner or authorized agent.
2. Identification of the original copyrighted work (or representative list) claimed to have been infringed.
3. Exact identification of the Sanctuary OS Nexus URL, `mod_id`, and/or `SHA-256` metadata entry requested to be suppressed (`compliance_tier = 1`), sufficient to locate the record.
4. Claimant contact details (name, mailing address, telephone number, and email address — stored sealed behind `enc:dmca1:`).
5. A good-faith statement that use of the material in the manner complained of is not authorized by the copyright owner, its agent, or the law.
6. A statement under **penalty of perjury** (`17 U.S.C. § 512(c)(3)(A)(vi)`) that the information in the notice is accurate and the submitter is authorized to act on behalf of the owner.

*Warning under `17 U.S.C. § 512(f)`: Materially misrepresenting that content is infringing exposes the claimant to statutory damages, costs, and attorney's fees.*

---

## 4. Creator Ownership Disputes & `AWAITING_AUTHORITY` Status Pause

When two creators claim original authorship of the same mod, ported asset, or Verified Mason identity (without a formal federal lawsuit or clear source provenance):
- **Immediate `Tier 1` Precautionary Hold:** Public visibility of the contested record is paused (`compliance_tier = 1`) and status enters **`AWAITING_AUTHORITY`**.
- **Provenance Review:** The Spoke's **Oversight** and **Wayfinder** officers request dated original project files, commit history, upstream host logs, or verifiable Ed25519 manifest keys (`.sanctuary.manifest.sig`).
- **Stalemate Lock:** If provenance remains genuinely contested by competing good-faith legal claims, the record stays in `AWAITING_AUTHORITY` (`Tier 1` non-public) until both parties reach written settlement or a court of competent jurisdiction enters an order.

---

## 5. Counter-Notice & `10–14` Business Day Restoration (`17 U.S.C. § 512(g)(3)`)

A **Mason** whose catalog entry was placed into **Tier `1`** hold by mistake or misidentification may submit a statutory Counter-Notice containing:
1. Electronic or physical signature.
2. Exact identification of the suppressed Nexus entry (`mod_id`, SHA-256) prior to Tier `1` suppression.
3. A statement **under penalty of perjury** that the submitter has a good-faith belief the record was suppressed as a result of mistake or misidentification.
4. Submitter name, address, telephone number, and **consent to the jurisdiction** of the U.S. Federal District Court for the judicial district in which the address is located (or the Middle District of Florida if outside the United States), agreeing to accept service of process from the original claimant.

### Statutory Waiting Window
1. Upon receipt of a compliant Counter-Notice, the Spoke / Keepers Core log notifies the original claimant (`§ 512(g)(2)(B)`).
2. Unless the original claimant provides written notice within **10 business days** that they have filed an action seeking a court order restraining the uploader, the suppressed metadata entry is restored to **Tier `0` Clean** between **10 and 14 business days** after receipt of the counter-notice.

---

## 6. Repeat Infringer Policy (`3-Strike` Escalation)

In compliance with `17 U.S.C. § 512(i)`:
- **Strike 1:** Confirmed Tier `1` infringement — entry stays suppressed; warning logged in Spoke `audit_logs`.
- **Strike 2:** Second adjudicated Tier `1` violation — temporary **Verified Mason (`Tier 2`)** publishing suspension (**30 days**).
- **Strike 3:** Third adjudicated Tier `1` violation — **permanent revocation** of Mason publishing privileges across the Spoke (and Keepers Core global SSO revocation if bad-faith ecosystem abuse persists). Successful statutory counter-notices or withdrawn claims do **not** count as strikes.

---

## 7. Zero Citizen File Deletion

Even when a catalog entry enters **Tier `1` (`Legal / DMCA Hold`)**, Sanctuary OS **never remotely deletes files from a Citizen's local Vault or game directory**. Citizens simply lose public Nexus discovery and Cloud Blueprint distribution for the held hash, and equipping it inside an active Blueprint triggers a non-destructive Community Mod Support Lock (`Keepers OS Bug Reports` remain unaffected).
