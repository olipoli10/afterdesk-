# Native pgvector toolchain — inspected candidate and bounded build recipe

Date: 2026-09-10. State: **SECOND_BUILD_PASS / STATIC_INSPECTION_PASS / SCRATCH_RUNTIME_PUBLISHED / NATIVE_GOOGLE_7_OF_11_PASS**.

## Current observed state — supersedes historical recipe below

The second separately reviewed build used script SHA256 `979a137d55afc4706e7d705ca7bb51ef7857934b6ded1263bdf19f1936501463` and complementary pinned OLDNAMES package, with no source/Makefile/flag change. Root `personal-pgvector-build-18726cfe44b84ef69791bd5960df77d3`: exit0,5733ms,no timeout,owned Job treeStopped=true. Build receipt filesystem timestamp:2026-09-10T07:08:46.460Z (local evidence timestamp, not signed attestation).

Static inspection at2026-09-10T07:09:37.299Z: DLL280064bytes,SHA256 `1d54ce81495fc481da3d261edf4f797c837340a51648d3456afa3d72e4431cef`,AMD64,imports postgres.exe and KERNEL32.dll present,no delayed imports,212 exports including Pg_magic_func. SQL0.8.6 SHA256 `7fb5bb279ef83bf9204bfac7405bb5c9a05e49f5ac7d64d1eb4464d103b80f32`; control SHA256 `f1e1717c0c1da9c200ff3a53acf1d14eba5e3f70da928a723b247b0b1059417d`.

Controller validated then published all43 files with no overwrite to the disposable17.11 runtime. Receipt: `.scratch/personal-pgvector-build-18726cfe44b84ef69791bd5960df77d3/runtime-publication-f31c260de5cd4ce6a8f94e23ef8c6f2a.json`, filesystem timestamp2026-09-10T07:15:47.088Z. This is per-file atomic publication, not global atomicity. Four original PostgreSQL executable pins remain unchanged. See [publication contract](NATIVE_EXTENSION_PUBLICATION_PLAN.md).

Subsequent native Google run `evidence/postgres-native-1789024560494/output.txt` verified17.11, simultaneous distinct backend PIDs and **all migrations applied**, then **7/11 tests passed,4 failed**; owned server stopped. The vector migration is no longer blocked. Exact calendar write claim/dispatch behavior remains defective; timestamp-without-time-zone versus timestamptz comparisons are being diagnosed under the actual America/New_York server zone. No full-native-suite pass or live provider success is claimed.

## Historical first bounded build result — preserved failure

After complete controller review and independent STARTUPINFOEX/HANDLE_LIST review, exactly one invocation of `build-pgvector-native.ps1` ran. Script SHA256: `8868adb39bbacf039ba47e9350c1f8d0cb9b4e6908f69f6a1983dda5809e3300`.

Retained root: `C:/dev/endvera-astra-r03/.scratch/personal-pgvector-build-f6faa4a8282842bb8e77ebfc6801c3fb`.

All 19 C objects compiled. The final link failed with **LNK1104: cannot open file OLDNAMES.lib**; nmake exit2. Receipt: `build-receipt.json`, logs: `build.stdout.log`, `build.stderr.log`. Duration4994ms, timedOut=false, treeStopped=true (owned Job active-process count reached zero). A subsequent process-path check found no matching nmake/cl/link/mspdbsrv/vctip from this build root. No final DLL, no extension-load proof, no PostgreSQL process, no runtime change and no new download. Fresh copied build inputs total652854610bytes. The compiler's plain-C path worked; complete linker dependency closure did not.

At that first-build checkpoint OLDNAMES.lib was absent. The subsequent reviewed acquisition, inspection and second attempt are recorded above and in `OLDNAMES_PUBLISHER_PACKAGE_CANDIDATE.md`. The first failure and cleanup evidence remain unchanged. NOT_RUN paragraphs below are historical pre-execution contracts, not the current result.

## Historical initial decision

The exact six Microsoft packages and pgvector 0.8.6 source are available locally. The required plain-C toolchain files are present and signed. A bounded, isolated build attempt is feasible, but this custom portable assembly has not been executed and its dynamic dependency closure is not proven. No additional download is proposed.

This document supersedes the acquisition-state statements in [the initial research](PGVECTOR_NATIVE_TOOLCHAIN_RESEARCH.md), without changing its historical provenance. [The license review](MICROSOFT_TOOLCHAIN_LICENSE_REVIEW.md) remains applicable. Complete archives, extracted packages and notices remain preserved. This is not a claim that the user submitted license acceptance, that Microsoft supports this portable layout, or that the SDK/compiler has passed runtime verification.

## Recorded inspection

Exact inspection root:

`C:/dev/endvera-astra-r03/.scratch/personal-msvc-inspection-e96ff70434b44156958620ac96e0c1e5`

Generated receipts in that root:

- `inspection.json`: acquisition, exact URLs and complete archive digests.
- `signature-inspection.json`: package certificates and individual PE signatures.
- `pe-import-inspection.json`: byte-only architecture/import inspection; no DLL loaded.

Observed cumulative payload: **295586127 bytes**, including the first retained 2116223-byte transfer. Limit: 419430400 bytes (400 MiB). Complete extraction: **1180879177 bytes**; limit 4294967296 bytes (4 GiB). Six Microsoft full-archive digests match the publisher pins. Four VSIX transfer lengths differ from catalog metadata; both catalog and actual lengths are retained and the publisher digests did not change.

Fresh byte checks also matched all **416 extracted VSIX manifest-file SHA256 entries** (headers317, CRT38, tools53, resources8), with zero missing/mismatched files. The inspection PowerShell parser reported zero errors. These checks did not launch downloaded code.

pgvector immutable source commit: `8ee86c96f0fd72390f890aa8a336fda6d3ab4c6c`; source ZIP SHA256 `bf0e885aeea36c555da5e0c68869d2282ed53020b4388202dae20368f4a9b5ae`, 227406 bytes. This is locally computed archive identity plus official HTTPS/Git-tag provenance, not a publisher signature.

| Check | Observed result | Limit |
| --- | --- | --- |
| Four VSIX OPC XML signatures | `VerifySignatures(false) = Success`, all Microsoft signers | CRT headers/x64 signing certificates expired 2026-05-06; standalone current-time chain returns `NotTimeValid`. Do not call these chains currently valid. |
| Tools/resources OPC certificate chains | Local chain valid, revocation disabled in explicit chain check | No fresh revocation assurance from this explicit check. |
| Two SDK CMS signatures | `CheckSignature(true)` succeeds, Microsoft signer; local chain valid without revocation | Full NuGet unsigned-archive-hash/signature binding not implemented. Independent full-archive SHA512 pins are verified. |
| Tool directory PE Authenticode | **48/48 Valid**, using installed Windows verifier | Does not prove tool behavior or network isolation. |
| Resource DLL Authenticode | **8/8 Valid**, including clui/nmakeui/linkui | Resource loading has not been observed. |
| Critical tools | cl, nmake, link, c1, c2, cvtres, mspdb140, mspdbcore present, AMD64 | No executable launched. |

All eager imports have a same-directory or existing System32 file, or a Windows API-set contract. API-set resolution remains unobserved. Missing delay imports: `c1xx.dll → TLBREF.dll`; `c2.dll`, `c2dd.dll`, `link.exe → pgodb140.dll`. A plain-C non-PGO build may not need these delayed components; that is an inference, not closure proof. Stop on a missing dependency; do not download a substitute automatically.

The tools package declares additional installer-level Props/Servicing dependencies that were not acquired. Direct nmake use does not run MSBuild props or servicing hooks, but this remains an incomplete installation subset, not a full supported Visual Studio install. The complete tool package contains `vctip.exe` and telemetry libraries. A sanitized child environment is not a network sandbox; do not claim native telemetry is prevented. No unverified telemetry flag should be represented as enforcement.

Both extracted SDK `.nuspec` files point to the already reviewed `https://aka.ms/WinSDKLicenseURL` and declare license acceptance required; x64 depends on the matching CPP package. No installer, package script, MSBuild props/targets or downloaded binary was executed during inspection.

## Exact input layout

All relative paths below are under the inspection root. Internal MSVC directory is **14.44.35207**, despite higher package patch versions.

| Input | Relative path |
| --- | --- |
| Full tool bin | `msvc-tools-x64-complete/Contents/VC/Tools/MSVC/14.44.35207/bin/Hostx64/x64` |
| English resources | `msvc-tools-resources-complete/Contents/VC/Tools/MSVC/14.44.35207/bin/Hostx64/x64/1033` |
| CRT headers | `msvc-crt-headers-complete/Contents/VC/Tools/MSVC/14.44.35207/include` |
| CRT x64 libraries | `msvc-crt-x64-complete/Contents/VC/Tools/MSVC/14.44.35207/lib/x64` |
| SDK headers | `windows-sdk-cpp-complete/c/Include/10.0.26100.0/{ucrt,shared,um}` |
| SDK x64 libraries | `windows-sdk-x64-complete/c/{ucrt,um}/x64` |
| pgvector source | `pgvector-source-complete/pgvector-8ee86c96f0fd72390f890aa8a336fda6d3ab4c6c` |

Presence verified: `vcruntime.h`, `libcmt.lib`, `libvcruntime.lib`, SDK `stdio.h`, `Windows.h`, `windef.h`, `Kernel32.Lib`, `ucrt.lib`, `libucrt.lib`. This is presence evidence, not a linker execution result.

PostgreSQL input is the already pinned EDB ZIP in `.scratch/postgres-native-17.11-3/postgresql-17.11-3-windows-x64-binaries.zip`, SHA256 `4b8db0930c38f6ef845db919551dedda3b6b845aeb0927b3d79a6e8e9e4537cf`. Reuse its `pgsql/include/` and `pgsql/lib/postgres.lib` in a separate build input directory. Do not replace approved runtime binaries or skip any application migration.

## Historical proposed execution contract — now executed in two separately reviewed attempts

Controller review is required before implementing/invoking this recipe. No new download, administrator action, registry write, service, global PATH update, installer, real provider credential or product API is involved.

The authored implementation is `build-pgvector-native.ps1`, not yet invoked. It makes fresh byte copies directly from the pinned archives for source, toolbin and build headers/libraries, instead of trusting mutable extracted copies; complete original packages remain untouched. It rejects Command Processor AutoRun hooks in both registry views and uses a process Job Object (start suspended, assign, resume) so descendants belong to the build before downloaded code runs. The script parser and the authored C# declarations compiled successfully with installed PowerShell; no runner method or downloaded tool was invoked for that check.

1. Create a new unique ignored `.scratch/personal-pgvector-build-<guid>` with current-user ACL and at least 2 GiB free. Reject reparse ancestors, archive traversal and destination collisions. Revalidate archive pins, source identity and executable hashes against the recorded receipts before any launch. Preserve inputs unchanged.
2. Copy the complete source into `source/`. Copy the complete inspected tool-bin directory into `toolbin/`, then add the inspected resource directory as `toolbin/1033/`; allow a collision only when both bytes/hashes match. Keep the complete original packages/notices in their inspection root. Build files are disposable local copies, not redistribution artifacts.
3. Extract only the already pinned PostgreSQL headers and import library into `pg-sdk/`, with the same safe path/size validation. Do not extract or execute another PostgreSQL binary. Verify `postgres.h`, `pg_config.h`, Windows port headers and `postgres.lib` exist.
4. Create a child-only environment from an explicit allowlist. `PATH` contains only this `toolbin` and verified existing Windows System32; `INCLUDE` contains the exact CRT + SDK ucrt/shared/um paths above; `LIB` contains exact CRT x64 + SDK ucrt/um x64 paths. `PGROOT` is the new `pg-sdk`. Set SystemRoot/WINDIR/ComSpec to existing Windows values, TEMP/TMP to the new scratch temp, and do not forward product secrets, user PATH, CL/_CL_/LINK injection variables, SDK hooks or project `.env` values. This reduces accidental input, but is not OS-level confinement or a telemetry-blocking guarantee.
5. Use installed PowerShell/.NET ProcessStartInfo to launch the exact copied, hash-checked `nmake.exe`, hidden, with working directory `source`, arguments `/NOLOGO /F Makefile.win all`. The checked-in upstream Makefile is unchanged. `CC` must resolve only to the approved copied `cl.exe` (pass an exact quoted macro path or validate the exclusive tool PATH). Built-in `copy` uses verified Windows ComSpec. One attempt, 120-second total wall-clock deadline; capture local stdout/stderr and exit status; kill only the exact owned process tree on timeout and retain evidence. Do not run `install`, `installcheck`, `clean` or `uninstall`.
6. The read upstream `all` target compiles 19 plain-C objects, links those with `postgres.lib` to `vector.dll`, then creates `sql/vector--0.8.6.sql`. No network command appears in these make recipes. Nevertheless, native compiler behavior is not sandboxed or yet observed. Fail on any missing dependency, build error, timeout or unexpected output; do not relax flags or fetch another DLL automatically.
7. If successful, inspect/hash the produced AMD64 DLL without loading it, enumerate its imports and compare the required libraries with the approved PostgreSQL runtime. Record source/package/Makefile digests, environment path list (never secret values), command, exit status, timing and all generated extension hashes. A successful compile is not extension-load or test proof.
8. Return the build receipt to the controller. Adding `vector.dll`, `vector.control`, version/upgrade SQL files to the existing scratch runtime is a **separate reviewed action** with CreateNew/no-overwrite behavior, exact target checks and unchanged four core executable pins. No extension copy or PostgreSQL start is authorized by this document.

## Subsequent test gate

After the controller reviews the built extension and allows scratch runtime addition: fresh native loopback-only disposable cluster, two distinct concurrent backend PIDs, all current unchanged migrations, targeted Google concurrency tests, then outbox tests. The migration count may have advanced beyond the earlier 72 during parallel work; use and record the current repository count, never filter out the new migration to manufacture a baseline. Parent owns timing/schema coordination and test invocation.

Stop criteria: provenance mismatch, a reparse/collision, missing runtime import, unexpected tool child, owned-process cleanup uncertainty, failed build/extension load/migration/test, or need for another download. Retain exact local artifacts; no recursive deletion is part of this recipe.

Current result: **zero compiler/SDK tool launches, zero PostgreSQL launches in this inspection phase, zero runtime modifications, zero product/provider calls**. Native Google/outbox verification remains blocked until the reviewed build and runtime-extension gates pass.
