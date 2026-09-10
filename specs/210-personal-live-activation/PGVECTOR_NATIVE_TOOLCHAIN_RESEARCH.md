# Native PostgreSQL pgvector prerequisite — publisher-only acquisition candidate

Date: 2026-09-10. State: **RESEARCH_ONLY / PAYLOAD_DOWNLOAD_NOT_AUTHORIZED / BUILD_NOT_OBSERVED**.

## Decision for controller review

The existing approved EDB PostgreSQL 17.11 runtime starts locally and proves two simultaneous distinct backends. Its 72-migration deployment stops at `20260730003000_ai_pricing_suggestions` because `vector.control` is absent. Do not skip or alter this migration. Latest stopped-cluster evidence: `evidence/postgres-native-1789019537773/result.json`.

No upstream pgvector release binaries were found: the [official releases page](https://github.com/pgvector/pgvector/releases) contains no releases. EDB's [installation documentation](https://www.enterprisedb.com/docs/pg_extensions/pgvector/installing/) describes RPM/DEB packages, not a Windows DLL. This search does not prove no Windows package exists anywhere.

The least-disruptive identified candidate is to extract publisher Microsoft MSVC VSIX and Windows SDK NuGet packages into a new ignored scratch directory, then compile official pgvector source against the existing approved PostgreSQL headers/import library. This is a custom portable assembly, **not a Microsoft-documented supported portable installation and not a demonstrated build**. No third-party DLL or portable compiler repack is proposed.

## Fixed source and download envelope

### PostgreSQL: already downloaded, no additional payload required

Approved runtime: `C:/dev/endvera-astra-r03/.scratch/postgres-native-17.11-3/runtime/pgsql`.

Existing ZIP: `.scratch/postgres-native-17.11-3/postgresql-17.11-3-windows-x64-binaries.zip`, SHA256 `4b8db0930c38f6ef845db919551dedda3b6b845aeb0927b3d79a6e8e9e4537cf`, 341325378 bytes. The ZIP contains `pgsql/include/server/postgres.h` and `pgsql/include/server/pg_config.h`; the extracted runtime already contains `lib/postgres.lib`. Selective extraction of headers can use this same pinned archive, without replacing core binaries.

### pgvector: prefer current corrected source, not historical 0.8.1

Official repository: https://github.com/pgvector/pgvector

Read-only `git ls-remote` resolved `refs/tags/v0.8.6` to `8ee86c96f0fd72390f890aa8a336fda6d3ab4c6c`.

Proposed immutable source URL: https://codeload.github.com/pgvector/pgvector/zip/8ee86c96f0fd72390f890aa8a336fda6d3ab4c6c

Archive bytes/size have **not** been downloaded or hashed. Bound the future response within the remaining total download envelope; compute SHA256 and inspect extraction paths before using source. HTTPS plus verified Git object identifies provenance; this is not a publisher signature claim.

The [official changelog](https://github.com/pgvector/pgvector/blob/v0.8.6/CHANGELOG.md) records fixes after 0.8.1, including parallel HNSW buffer overflow in 0.8.2 and later index fixes. Therefore the earlier historical-parity suggestion of 0.8.1 is superseded by this 0.8.6 candidate. [Windows instructions](https://github.com/pgvector/pgvector/blob/v0.8.6/README.md#windows) use MSVC/nmake and PGROOT. The [makefile](https://github.com/pgvector/pgvector/blob/v0.8.6/Makefile.win) is the authoritative build recipe; inspect the downloaded exact commit before executing it.

### Microsoft compiler and CRT: metadata verified, payloads not downloaded

Publisher discovery URL: https://aka.ms/vs/17/release/channel

Observed channel manifest version: `17.14.37628.2`. Manifest size: 30442868 bytes. Its declared SHA256: `469b3396a3493df91870ce13c52015a92283a2d1c6fd12e5f7e55669be8050ca`.

Manifest URL: https://download.visualstudio.microsoft.com/download/pr/f8d58e41-102a-4347-a567-60d7235da3b5/469b3396a3493df91870ce13c52015a92283a2d1c6fd12e5f7e55669be8050ca/VisualStudio.vsman

The following exact publisher payloads are candidates. Manifest signer references are metadata only; actual signature validation remains required after download.

| Package | Version | Download bytes | Manifest SHA256 |
| --- | --- | ---: | --- |
| CRT.Headers.base | 14.44.35220 | 2128977 | `852382a9aa73502b7849c1bcadfb603ba7175c4e8b60e6aba03c7de711d4ece5` |
| CRT.x64.Desktop.base | 14.44.35226 | 51521199 | `f01f701a7bcd9587a340898c851424f6a52bb913a70c185ff0d5bf0288c5831a` |
| Tools.HostX64.TargetX64.base | 14.44.35228 | 26660160 | `ee0baaa3a112d255f19f6c27dcc0ff6e496949eb9f1f37be0ac908c562a7076c` |
| Tools.HostX64.TargetX64.Res.base en-US | 14.44.35228 | 225537 | `6e31f47833bfa585f56d55716a1ef081f1434f93ad77160eab49c6e193765832` |

Exact URLs:

- https://download.visualstudio.microsoft.com/download/pr/c610cd8c-801b-44b8-a80a-82cc382aeb43/852382a9aa73502b7849c1bcadfb603ba7175c4e8b60e6aba03c7de711d4ece5/Microsoft.VC.14.44.17.14.CRT.Headers.base.vsix
- https://download.visualstudio.microsoft.com/download/pr/67cf767c-5e71-47c2-a54a-cd5631e28942/f01f701a7bcd9587a340898c851424f6a52bb913a70c185ff0d5bf0288c5831a/Microsoft.VC.14.44.17.14.CRT.x64.Desktop.base.vsix
- https://download.visualstudio.microsoft.com/download/pr/bbc72d8e-2acd-4229-8f6a-85e23c5e3456/ee0baaa3a112d255f19f6c27dcc0ff6e496949eb9f1f37be0ac908c562a7076c/Microsoft.VC.14.44.17.14.Tools.HostX64.TargetX64.base.vsix
- https://download.visualstudio.microsoft.com/download/pr/bbc72d8e-2acd-4229-8f6a-85e23c5e3456/6e31f47833bfa585f56d55716a1ef081f1434f93ad77160eab49c6e193765832/Microsoft.VC.14.44.17.14.Tools.HostX64.TargetX64.Res.base.enu.vsix

Subtotal: **80535873 bytes**. These four are a candidate subset, not a proven complete transitive installation. Contents such as `nmake.exe`, linker runtime DLLs, resource DLL locations and CRT availability must be inspected before first execution. Stop if additional dependencies cannot be acquired from Microsoft within the reviewed boundary; never fetch third-party replacements.

### Microsoft Windows SDK: NuGet ZIP acquisition, no MSI needed for candidate inspection

The [Microsoft-owned CPP package](https://www.nuget.org/packages/Microsoft.Windows.SDK.CPP/10.0.26100.9169) documents SDK acquisition for C++ CI/CD; the [x64 package](https://www.nuget.org/packages/Microsoft.Windows.SDK.CPP.x64/10.0.26100.9169) depends on the exact same CPP version. Version 26100 is listed as supported in the [official SDK overview](https://learn.microsoft.com/en-us/windows/apps/windows-sdk/).

| Package | Version | HEAD bytes | Publisher SHA512 (base64) |
| --- | --- | ---: | --- |
| Microsoft.Windows.SDK.CPP | 10.0.26100.9169 | 160512239 | `MqsFt32HBBS/8VDK3Z0SlLFqWtm4wwZjZ8laUqJGRw6iboobY7LV7CZXjzs1xPzhbZNQEkGpvid/6+ajttO8Sg==` |
| Microsoft.Windows.SDK.CPP.x64 | 10.0.26100.9169 | 53001499 | `d8D2Bw+8GYiZOHR8JTdCB5IlXeliIyPNy6/Bc37R4HIaN3z3L2XMy+bi2rcXIvR/7gMfW7v4KRDhgpIGnvKA6g==` |

Exact URLs:

- https://api.nuget.org/v3-flatcontainer/microsoft.windows.sdk.cpp/10.0.26100.9169/microsoft.windows.sdk.cpp.10.0.26100.9169.nupkg
- https://api.nuget.org/v3-flatcontainer/microsoft.windows.sdk.cpp.x64/10.0.26100.9169/microsoft.windows.sdk.cpp.x64.10.0.26100.9169.nupkg

Sizes and SHA512 values were retrieved using HEAD, not binary-body downloads. CPP hash/size were additionally corroborated against NuGet registration/catalog metadata. Future verification must validate full payload digests and package signatures; recorded HTTP metadata alone is not signature proof.

Known selected compiler+SDK subtotal: **294049611 bytes (~280.4 MiB)**, excluding the source archive and any additional verified runtime prerequisite. Controller's proposed maximum remains **400 MiB total new payload**, not permission to silently exceed it. Disk extraction size is unknown; Microsoft documents 4 GB free space for the general SDK, not this exact subset.

## Licensing prerequisites, not an acceptance action

Follow-up: both complete publisher licenses were retrieved and read on 2026-09-10. See [MICROSOFT_TOOLCHAIN_LICENSE_REVIEW.md](MICROSOFT_TOOLCHAIN_LICENSE_REVIEW.md) for original local paths, hashes and current operational findings. Preserve complete SDK package copies/notices; no installer does not mean no acceptance through use. Controller approval remains pending. The historical unread-text notes below describe this research's initial acquisition state, not the follow-up result.

- pgvector's [PostgreSQL-style license](https://github.com/pgvector/pgvector/blob/v0.8.6/LICENSE) permits use/modification/distribution while requiring notices to remain. Preserve the source license with local artifacts.
- Microsoft's [Build Tools licensing announcement](https://devblogs.microsoft.com/cppblog/updates-to-visual-studio-build-tools-license-for-c-and-cpp-open-source-projects/) explicitly covers compiling open-source dependencies for commercial projects without a paid Visual Studio license. This supports the intended pgvector-only use; it is not blanket permission for proprietary C++ development or toolchain redistribution.
- Current Build Tools license identified by the publisher manifest: https://go.microsoft.com/fwlink/?LinkId=2179911 ; [canonical terms page](https://visualstudio.microsoft.com/license-terms/vs2022-ga-diagnosticbuildtools/), embedded document https://visualstudio.microsoft.com/wp-content/uploads/2024/03/Visual-Studio-2022-Diagnostic-Build-Tools-Agent-License_Update-March-2024_EN.docx . Full embedded terms have not yet been parsed in this research pass; must review before acquisition/use approval.
- NuGet CPP catalog states `requireLicenseAcceptance:true`, license https://aka.ms/WinSDKLicenseURL . Full SDK license must be reviewed before acquisition/use approval. No license acceptance has been submitted by this lane.
- Do not run Visual Studio bootstrapper/layout, msiexec, registry registration, installer custom actions, or any script from an unreviewed archive. Microsoft's documented offline-layout route uses installer/admin and is outside this proposal.

## Proposed post-approval gates

1. Resolve licensing and approve exact package set/envelope; record controller decision separately from this research.
2. Author an auditable downloader/extractor confined to a new ignored scratch path; allowlist publisher HTTPS hosts, bound redirects and bytes, verify hashes, reject archive traversal/links/collisions. Never execute package install hooks.
3. Inspect PE architecture, signatures, imports and exact dependency closure. Preserve notices. Verify compiler/nmake can launch only in a sanitized child environment; PATH/INCLUDE/LIB changes are process-local only.
4. Extract PostgreSQL headers from the already pinned ZIP to a separate build root, preserving the original core executable hashes. Compile exact pgvector commit locally with reviewed Makefile commands; do not invoke its `install` target blindly.
5. Review/hash resulting extension files. Only after controller review, add the approved `vector.dll`, `vector.control`, and version SQL files to the scratch PostgreSQL runtime; no existing runtime files overwritten, no service/global install. Keep core hash pins unchanged and record extension provenance separately.
6. Fresh native disposable cluster: actual `CREATE EXTENSION`/72 unchanged migrations, Google11, then outbox10. Stop and retain sanitized evidence on failure; no increased deadlines, no retries of real actions and no migration substitution.

Outstanding uncertainties: exact compiler/runtime dependency closure, custom portable assembly support, full license text review, package signatures, build result, and application concurrency tests on the completed native runtime.

Research mutations: this handoff document only. No compiler/SDK/pgvector payload downloaded, no package installed, no runtime modification, no new database process, and no provider calls.
