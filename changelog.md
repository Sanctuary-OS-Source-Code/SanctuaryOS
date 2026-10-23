**Date: October 22, 2026**
**Version: 0.5-dev.3**

## Upstream TLS Certificate Store & CI/CD Runtime Security Hardening

### Security & Heuristic Engine
- **eMudhra / emSign CA Revocation & October 2026 Runtime Security Patch (`sanctuary-os/src-tauri/Cargo.lock`, `.github/workflows/release.yml`, `.github/workflows/dev-build.yml`, `sanctuary-os/.github/workflows/release.yml`, `sanctuary-os/.github/workflows/dev-build.yml`):**
  - **Rust TLS & WebPKI Trust Store Patch (`sanctuary-os/src-tauri/Cargo.lock`):** Upgraded `rustls-webpki` (`v0.103.13` $\rightarrow$ `v0.103.16`), `webpki-root-certs` (`v1.0.9` $\rightarrow$ `v1.0.10`), `rustls` (`v0.23.43` $\rightarrow$ `v0.23.46`), `aws-lc-rs` (`v1.17.3` $\rightarrow$ `v1.18.2`), and `aws-lc-sys` (`v0.43.0` $\rightarrow$ `v0.46.0`) to remediate `RUSTSEC-2026-0381` (`CVE-2026-111943`) and `RUSTSEC-2026-0382`, explicitly blocking the compromised eMudhra / emSign intermediate CA public keys and stripping affected root certificates across all Tauri `reqwest` and `tauri-plugin-updater` HTTPS connections.
  - **CI/CD Node.js LTS Upgrade (`.github/workflows/release.yml`, `.github/workflows/dev-build.yml`):** Upgraded GitHub Actions `actions/setup-node@v4` from End-of-Life Node `20` to active LTS Node `24` (`v24.22.1+`) across both Stable and Supporter Dev Build pipelines to pull in the October 2026 Node.js security release (`CVE-2026-111497` Brotli decoder fix, `CVE-2026-105483`/`CVE-2026-106069` TLS hostname verification fixes, `CVE-2026-105482` DNS resolution fix, and bundled eMudhra CA removal).