# espeak-rs-sys 0.2.0 Vendor and Distribution Decision

Status: approved for source vendoring and local QA builds only; production
binary distribution is blocked pending approval by the VibeSpace licensing
owner.

Canonical policy:
`source-and-local-qa-only; production-object-code-blocked-pending-license-owner-approval`.

## Decision

VibeSpace may retain the exact `espeak-rs-sys` 0.2.0 crate source under
`app/src-tauri/vendor/espeak-rs-sys-0.2.0/` and may use it for local,
non-distributed `--no-bundle` verification. The one VibeSpace modification
removes the Windows debug-only `cargo:rustc-link-lib=dylib=msvcrtd` block from
`build.rs`; it does not modify the embedded eSpeak NG source.

No production installer, updater, portable binary, or other object-code
distribution containing this statically linked eSpeak build may be published
until the VibeSpace licensing owner has approved a written distribution plan.
That review must resolve GPL-3.0-or-later combined-work and Corresponding Source
obligations, appropriate legal notices, and the authoritative MIT notice for
the Rust wrapper. Adding a license file to the bundle does not clear this
release blocker.

## Exact provenance

- Crate: `espeak-rs-sys` 0.2.0.
- crates.io archive size: `9,099,457` bytes.
- crates.io checksum / archive SHA-256:
  `2d45d148019084e930df6cc3964a58c4c211342451ec5d3c328d8a6cc6b3464d`.
- Upstream repository: `https://github.com/thewh1teagle/piper-rs`.
- Upstream VCS commit:
  `d70b0970a87453f3476b5fd6cf9edf329be8b445`.
- Upstream path: `crates/espeak-rs-sys`.
- Embedded eSpeak NG version: `1.52.0.1`.
- The crate archive does not preserve the eSpeak submodule gitlink commit. No
  submodule commit is claimed. The complete embedded contents are bound by the
  crate checksum and the repository contract test's deterministic file hash.
- Audited crate archive/vendor tree: 2,193 files. The Cargo extraction marker
  `.cargo-ok` is forbidden and excluded.
- Audited unmodified-file aggregate: 2,192 files, SHA-256
  `c5c54dbf1b182d72993f3b10e8de17be86eb7c58b9c8ce179316edcbc21aded3`.
- Patched `build.rs` SHA-256:
  `92e93feb490b86fa030185595a711db1abd747a63d5fbaf82209d40367692f05`.

## License record

- The Rust wrapper's Cargo metadata declares `license = "MIT"`, but the pinned
  crate archive contains no standalone authoritative MIT notice. No copyright
  attribution is inferred or invented here; production distribution remains
  blocked until that notice is obtained or otherwise resolved.
- The embedded eSpeak NG sources state GPL version 3 or, at the recipient's
  option, any later version (`GPL-3.0-or-later`). The full GPLv3 text is
  preserved at `licenses/GPL-3.0-or-later-espeak-ng.txt` and is byte-identical
  to the text in the vendored source.
- The native build links the embedded eSpeak library statically. This fact is
  recorded in the SBOM and is the reason a notice-only treatment is
  insufficient for production distribution.

This is a repository release-control decision, not legal advice. The licensing
owner's approval and distribution plan must be recorded before the blocker is
removed.
