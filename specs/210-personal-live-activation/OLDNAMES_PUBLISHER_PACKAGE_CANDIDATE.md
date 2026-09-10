# OLDNAMES.lib — publisher package acquired, inspected and used in second build

2026-09-10. **ACQUIRED_AND_CONTENT_VERIFIED / SECOND_BUILD_PASS / CATALOG_DIGEST_DISCREPANCY_PRESERVED**.

The controller ran the separately reviewed second build: exit0,5733ms,owned Job treeStopped=true at `.scratch/personal-pgvector-build-18726cfe44b84ef69791bd5960df77d3`. Only the six reviewed dependency additions changed the first script; no library suppression, source, Makefile or flags changed. The resulting AMD64 DLL was statically inspected and43 extension files subsequently published without overwrite to the disposable PostgreSQL runtime. Native Google then applied every migration and reported7/11PASS,4FAIL; no full-native success is claimed. See [current build evidence](NATIVE_TOOLCHAIN_INSPECTION_AND_BUILD_RECIPE.md). The first OLDNAMES failure and all provenance caveats remain preserved.

## Acquisition and inspection result (supersedes candidate-only status below)

Controller approved acquisition/inspection only; another agent reviewed the downloader's one-package diff before invocation. Retained root:

`C:/dev/endvera-astra-r03/.scratch/personal-msvc-inspection-9ec9decbdfb5472caad50da4b87ead64`

Receipts: `inspection.json` and `oldnames-inspection.json`. Actual package27596908bytes, full SHA256 exactly `9135b03c0df53c7a0aa9bef7230a1c2ff4263a0ee7baa7e419d034f484f6bb56`. Cumulative payload **323183035bytes**, remaining96247365bytes. Complete extraction94304000bytes,103 archive entries, within1GiB. No installer or downloaded executable was invoked.

OPC package verification: **Success**. `/manifest.json` is explicitly covered by the package signature and was read from the signed read-locked archive. Package ID/version match; all **96 manifest file hashes** match extracted bytes. Signer is Microsoft Corporation, thumbprint `8D68C42C0E1487E33AFCD85B764E514AFC2F8772`; its certificate expired2026-05-06, so the standalone current-time chain reports **NotTimeValid**, with revocation disabled in that check. Do not claim currently valid certificate trust or resolve the upstream catalog discrepancy by this result.

The exact required root x64 library **is now confirmed**:

`msvc-crt-x64-store-complete/Contents/VC/Tools/MSVC/14.44.35207/lib/x64/oldnames.lib`

Size157422bytes, SHA256 **`35bd82cfb02a0146ff9c0ca6bf7dbde61d49c6d4f3493befe584218c370ff41d`**, matching the signed manifest. Byte-only COFF inspection found231 archive members, including228 object members with Machine=0, no executable/code sections and no foreign machine IDs. This is **not 228 AMD64 objects**: Microsoft's [PE format definition](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format) distinguishes the unspecified/any-machine value. The first parser attempt required AMD64 and refused; it was corrected to report and validate these non-executable unspecified-machine objects honestly. No linker flags or library bytes changed.

**Zero path collisions** against manifest-listed files in the four prior extracted MSVC packages. Complementary root x64 libraries include `msvcrt.lib`, `vcruntime.lib`, `legacy_stdio_definitions.lib` and `oldnames.lib`; separate `uwp/` copies also exist and are not proposed as LIB search paths. No license/notice-named standalone file was found in this package; its full source notices, props and package files are preserved. Previously reviewed Build Tools terms remain the applicable reviewed terms; no props or source from this package was executed and no user acceptance click is claimed.

### Exact symbol/section examination, not a blanket Machine=0 exemption

Detailed byte-only receipt: `oldnames-symbol-inspection.json` in the retained inspection root; producer `inspect-oldnames-symbols.mjs`. It pins this exact library hash and refuses any different member structure. Official references: [Microsoft Machine Types](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format#machine-types) and [Auxiliary Format 3: Weak Externals](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format#auxiliary-format-3-weak-externals).

Observed complete archive: two linker members named `/` (3142 and3602bytes), one longnames member `//` (22728bytes), and228 object members. Every object has Machine0, optional-header size0, **one `.debug$S` section** with characteristics **0x42100040**, no CODE or EXECUTE bit, no relocations or line-number records. Each has exactly five COFF symbol slots, representing four symbols and one auxiliary slot:

| Index | Symbol | Storage class | Section | Auxiliary |
| --- | --- | --- | --- | --- |
| 0 | `@comp.id` | STATIC3 | ABSOLUTE-1 | none |
| 1 | `@feat.00` | STATIC3 | ABSOLUTE-1 | none |
| 2 | target external name | EXTERNAL2 | UNDEFINED0, value0 | none |
| 3 | compatibility alias name | WEAK_EXTERNAL105 | UNDEFINED0, value0 | one slot: TagIndex2, Characteristics3 (`SEARCH_ALIAS`), remaining10bytes zero |

For example, the first member aliases `__imp_utime` to `__imp__utime32`. All228 alias/target pairs and exact section sizes are preserved in the receipt; no executable native-code section was found. This supports the narrower classification **exact pinned COFF weak-alias objects with unspecified machine**, not generic acceptance of every Machine0 file, not AMD64 object proof, and not observed link compatibility. The initial stricter parser refusal remains recorded above.

## Revised build input recipe — historical reviewed contract, now executed once

After controller review only, extend the existing audited build script with one fixed additional archive path/pin for this Store package. Verify its bytes again on the stream used to copy files; copy `Contents/VC/Tools/MSVC/14.44.35207/lib/x64/` into a **new separate** `crt-store-lib` directory under a fresh build root. Keep complete original packages and the first failed build unchanged. Pin copied `oldnames.lib` explicitly to the verified hash above.

Change only the child `LIB` path list: existing Desktop CRT directory first, then complementary Store root x64 directory, then the same SDK ucrt/um directories. Do not add `uwp/`, replace a Desktop file, patch pgvector, remove a default library, modify Makefile/CC/CFLAGS, or fetch another package. All existing archive/tool/Makefile pins, private scratch, AutoRun checks, handle allowlist, Job Object, one120-second nmake-all attempt and tree cleanup remain unchanged. Report static final DLL imports if successful; still no runtime copy/load or PostgreSQL start. A second build requires the controller's new review.

The authored script SHA256 is now `979a137d55afc4706e7d705ca7bb51ef7857934b6ded1263bdf19f1936501463`. Exactly six delta operations: add fixed StoreArchive path; add its archive-hash check; add isolated `crtStoreLib` path; copy its lib/x64 prefix; verify the exact oldnames hash; append that directory immediately after Desktop in child LIB. Removing exactly those additions reconstructs the prior observed script SHA256 `8868adb39bbacf039ba47e9350c1f8d0cb9b4e6908f69f6a1983dda5809e3300`; thus the source flags, Makefile pins and Job launcher are byte-identical. Static contract tests7/7, scoped ESLint and PowerShell parsing pass. No second nmake invocation occurred while validating the delta.

The historical candidate analysis follows unchanged so its uncertainty and provenance are not rewritten as prior certainty.

## Decision for controller

The matching next package candidate is **Microsoft.VC.14.44.17.14.CRT.x64.Store.base**, version **14.44.35226**, from Microsoft's current Visual Studio 2022 release metadata. This supplies the missing complementary CRT category to the Desktop package already acquired. Do not infer that its Store label changes pgvector into a Store application.

**Limit:** Microsoft's installer catalog provides package metadata, not its internal file list. No catalog entry mentions OLDNAMES, and this candidate's VSIX body has not been fetched. Therefore this document does **not** certify that this precise archive contains OLDNAMES.lib. Content must be established from its own verified package manifest after an acquisition-only gate. Do not acquire the larger OneCore alternative or fetch individual third-party libraries automatically.

## Exact candidate

- Package: `Microsoft.VC.14.44.17.14.CRT.x64.Store.base`
- Version: `14.44.35226`, matching the acquired Desktop CRT package.
- Publisher-declared SHA256: `9135b03c0df53c7a0aa9bef7230a1c2ff4263a0ee7baa7e419d034f484f6bb56`
- Publisher catalog length: **28032384 bytes**.
- Read-only HEAD response length: **27596908 bytes**, HTTP200, 2026-09-10.
- HEAD Last-Modified: `Wed, 15 Apr 2026 20:06:56 GMT`.
- Exact URL: https://download.visualstudio.microsoft.com/download/pr/67cf767c-5e71-47c2-a54a-cd5631e28942/9135b03c0df53c7a0aa9bef7230a1c2ff4263a0ee7baa7e419d034f484f6bb56/Microsoft.VC.14.44.17.14.CRT.x64.Store.base.vsix

The size mismatch repeats the pattern already observed for four acquired VSIX packages. Record both values; never change the cryptographic pin merely to accept a response. Proposed hard transfer maximum is the larger catalog length, within the **123844273-byte remaining payload budget**. If the HEAD length holds, cumulative payload becomes **323183035 bytes**, leaving **96247365 bytes**. No payload bytes from this candidate have been downloaded in this research.

## Metadata provenance discrepancy — unresolved, do not hide

The [official release channel](https://aka.ms/vs/17/release/channel) currently resolves to:

https://download.visualstudio.microsoft.com/download/pr/f8d58e41-102a-4347-a567-60d7235da3b5/6b3c2fa48fca73bf296bf59ce63a12c9632380cab039882dc33e8a650534b1d3/VisualStudio.17.Release.chman

Observed channel bytes91748; local SHA256 `b2631afb766b66de6c75da91efe3cecc8a56c8ca5c59c0beaa6227d963189b0f`. Build version remains `17.14.37628.2` / display17.14.40.

It declares the same [installer manifest URL](https://download.visualstudio.microsoft.com/download/pr/f8d58e41-102a-4347-a567-60d7235da3b5/469b3396a3493df91870ce13c52015a92283a2d1c6fd12e5f7e55669be8050ca/VisualStudio.vsman), length30442868 and SHA256 `469b3396a3493df91870ce13c52015a92283a2d1c6fd12e5f7e55669be8050ca`.

However, that URL currently returns a valid installer JSON of **17954404 bytes**, SHA256 **`b60efac8768e31b4b0bb74d312a3fd3145de9bef7f794c050d498d079e540e11`**, HTTP200, Last-Modified2026-08-28. A second fetch with Accept-Encoding:identity gives the same bytes/hash; Content-Length itself is17954404 and no Content-Encoding was reported. Its internal version remains17.14.37628.2.

Therefore the retrieved catalog's full digest does **not** match the channel-declared digest. The explanation is unknown. Do not label this cryptographically verified manifest provenance or silently replace the declaration. The candidate URL/hash above are observed through official HTTPS but this discrepancy must be accepted or resolved by the controller before acquisition. Subsequent full payload digest and OPC signature checks remain mandatory and separate. Existing acquired archive pins and recorded signatures are unchanged by this metadata observation.

## License and acquisition-only plan

The package belongs to the same Visual Studio 2022 C++ Build Tools family as the CRT already reviewed. Applicable reviewed terms: [Microsoft Visual Studio 2022 Diagnostic and Build Tools](https://visualstudio.microsoft.com/license-terms/vs2022-ga-diagnosticbuildtools/), plus any package-specific notices discovered inside. See [the full prior license review](MICROSOFT_TOOLCHAIN_LICENSE_REVIEW.md). Proposed use remains compilation of the unmodified third-party OSS pgvector dependency, not proprietary C++ development, redistribution, installer acceptance or a claim that the user clicked an agreement.

After controller review only:

1. Acquire this exact complete VSIX under a new private ignored scratch root, with the prior cumulative295586127bytes recorded. Single120-second body deadline, no retry, exact Microsoft HTTPS URL/pin, maximum28032384bytes, no additional packages.
2. Verify full SHA256 against the declared candidate pin. Preserve both catalog and actual lengths. Refuse on any hash mismatch; no metadata exception automatically weakens the archive pin.
3. Inspect/verify OPC signature and embedded signer chain with the same explicit expiry/revocation caveats used previously. Fully extract with existing traversal/reparse/collision/size bounds; keep complete archive/notices. Maximum additional extraction1GiB and at least2GiB free space.
4. Find exactly `Contents/VC/Tools/MSVC/14.44.35207/lib/x64/oldnames.lib` (case-insensitive), corroborate against the signed package manifest's SHA256, and inspect COFF archive metadata without executing tools. If absent, stop; do not assert the candidate solved the failure.
5. Report other complementary libraries, notice/license findings, collisions against acquired CRT and exact file hashes. Do not replace different-content Desktop libraries or mix OneCore paths automatically. Prepare a separate isolated LIB directory for the complementary package if the needed root x64 files exist; retain the existing Desktop directory first.
6. Return an updated build-input recipe to the controller. No second nmake, flag/Makefile change, default-library removal, runtime copy or PostgreSQL start is authorized by this metadata proposal.

First failed build remains unchanged at `.scratch/personal-pgvector-build-f6faa4a8282842bb8e77ebfc6801c3fb`:19 C objects compiled, LNK1104 OLDNAMES.lib, exit2,4994ms, owned Job treeStopped=true, no orphan found, no final DLL. See [the build report](NATIVE_TOOLCHAIN_INSPECTION_AND_BUILD_RECIPE.md).
