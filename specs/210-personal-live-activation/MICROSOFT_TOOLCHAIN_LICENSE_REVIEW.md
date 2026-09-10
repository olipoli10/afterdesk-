# Microsoft toolchain licenses — controller review packet

2026-09-10. **Public documents retrieved/read; no toolchain payload acquired or used; no acceptance submitted.** This is an operational reading of the supplied contracts, not a legal opinion or an authorization.

## Original documents and provenance

Full copyrighted documents and extracted text remain only in ignored scratch, not committed:

| Document | Original local path | Publisher source | Bytes / SHA256 |
| --- | --- | --- | --- |
| Build Tools | `C:/dev/endvera-astra-r03/.scratch/microsoft-toolchain-license-review/build-tools.docx` | https://visualstudio.microsoft.com/wp-content/uploads/2024/03/Visual-Studio-2022-Diagnostic-Build-Tools-Agent-License_Update-March-2024_EN.docx | 34395 / `2f66b86a00e8d9833789897ce23d05a4a2dbea370cf39c8c1098dbc17d0e7bdc` |
| Windows SDK | `C:/dev/endvera-astra-r03/.scratch/microsoft-toolchain-license-review/windows-sdk.rtf` | https://download.microsoft.com/download/0/F/F/0FF2B061-47DD-4F55-89B6-FD1D8C44F14D/sdk_license.rtf | 246945 / `dd07eb178e00c6bba4148457fc00ff77cd4887eb521d504186fe59c9ec8bbe62` |

Same directory contains `build-tools.txt`, `windows-sdk.txt` and separate `.receipt.json` provenance files. Retrievals: 2026-09-10T06:06:18Z and 06:06:19Z. Build Tools is linked by the current publisher manifest/canonical terms page. SDK is the final redirect from https://aka.ms/WinSDKLicenseURL, referenced by the selected NuGet catalog, which requires license acceptance.

DOCX was parsed as OpenXML paragraphs after reading the DOCX skill; pandoc was unavailable. RTF was parsed through the installed Windows RichTextBox parser without displaying a window. No document macros, fields, installer or downloaded program executed.

## Build Tools: findings and boundaries

EULA ID: `VS_2022_Tools_2024Mar_ENU.1033`.

The no-Visual-Studio-license exception permits compiling/building third-party OSI-licensed dependencies reasonably required by an application. It excludes general development/testing of those dependencies, apart from minor build-compatibility changes. The build-device provision permits compilation, verification and build-process quality/performance tests of such dependencies on owned/dedicated devices.

Short excerpt, build-device provision: “You may copy and install files from the software onto your build devices”.

Application to this task: unmodified pgvector compilation is a plausible fit; do not use this exception as authority to develop proprietary C++ or materially modify pgvector. Preserve notices. Do not redistribute/share the toolchain, reverse-engineer it, or bypass technical restrictions. Separate Microsoft/third-party component terms may apply. Data collection provisions exist; an ordinary environment allowlist is not proof of zero native-tool telemetry.

**Inference:** file copying to an owned scratch build directory is supported by the build-device wording. The document does not specifically certify arbitrary VSIX subset extraction as a supported installation. No compiler activation or technical-limit bypass is proposed.

## SDK: findings and boundaries

EULA ID: `WIN10SDK.RTM.AUG_2018_en-US`. The official current NuGet license link resolves to this older document; any additional terms shipped with the actual package must still be checked.

Section 1 permits Windows-program development and internal build machines. Section 1(a): “Each copy must be complete, including all copyright and trademark notices.” Therefore retain complete publisher packages/extracted content and notices; do not assume a stripped header/library subset is enough.

The preamble states: “By using the software, you accept these terms.” Avoiding an installer does not avoid acceptance through use.

Section 7 prohibits technical-limit workarounds, reverse engineering and publishing/transferring the SDK. It also restricts external publication of SDK benchmark results; ENDVERA functional test evidence is not a benchmark claim about Microsoft's SDK. Separate included-program terms apply. Redistribution rules are outside this local-only proposal. Internet-service/data provisions do not establish that every compiler action contacts Microsoft, nor prove offline behavior.

**Inference:** complete official NuGet CPP+x64 package extraction for this owner's internal Windows build is plausible, but no blanket legal clearance is claimed for custom package assembly.

## Revised proposed controls before acquisition/use

1. Controller reads the original texts above and records the bounded development-dependency decision. This research is not acceptance or new authority.
2. Retain all files/notices of selected publisher packages; inspect embedded terms/signatures/dependency closure. No installer hooks, package script execution, license bypass or arbitrary third-party binary.
3. Keep toolchain private and local; do not commit it, distribute it in the app/APK, publish it or use it for unrelated C++ development. Keep pgvector source license with artifacts.
4. Any acquisition/build remains subject to the separate 400 MiB payload envelope and existing runtime-core hash pins. No source/build execution is approved by this document.
5. If embedded package terms materially differ, required completeness cannot be established, or execution requires technical-limit circumvention, stop this route and report that exact obstacle.

Controller decision pending. Public-license retrieval changed only ignored reference artifacts and this concise review note; no SDK/compiler payload, database process or provider call.
