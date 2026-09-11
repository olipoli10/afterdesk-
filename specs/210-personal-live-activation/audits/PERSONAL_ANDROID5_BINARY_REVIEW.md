# Android 5 APK — independent local binary inspection

## Later controller verification — 2026-09-11 03:22:56Z

The historical structural review below is unchanged. A subsequent authorized,
isolated verification with official Android Build-Tools36/apksigner0.9 and
Temurin17.0.20.1+1 now establishes valid v2 signatures for both this APK5 and the
previous locally retained APK (SHA f33de2e1076d6bffeaf644371197b04153c371649d2d2dd82495758caeb1907e).
Both commands exit0, one signer each, no warning or verification stderr;
certificate SHA256 matches ccdd90c46c734e3f97a8d1bc4344b8f10ea0537788f13d1d890c812bc8a5bc1b.
APK hashes before/after are unchanged. v1/v3/v3.1/v4/SourceStamp are not claimed.

Full exact receipt, helper and command output copies are retained under
evidence/apk-signature-20260911T032256Z; receipt SHA256
d64ff706a834be3197587e5234df20022c64b5b21a993a4676e91b7c3ed3a5ab.
Controller read the complete helper/receipt/audit and recomputed their hashes.
The tools/archives/licenses remain in the one .scratch directory, no global
installation/PATH change and no APK execution, build, deployment or signing.
Google supplier SHA1 and Temurin supplier SHA256 were checked before extraction;
Google local SHA256 is not misrepresented as a supplier-published SHA256.

Cryptographic signatures and certificate continuity are now verified for these
two local files. Actual Samsung install/upgrade/login, source reproducibility
and provider/customer Verified-E2E remain unobserved. No dashboard rubric crossed.

## Verdict

**Static manifest identity verified; cryptographic APK signature NOT verified.** Fresh inspection at 2026-09-11T01:37:37.346Z. No network, EAS, SDK installation, dependency installation, credential access, device operation, deployment or commit occurred in this review.

Parent associates this download with EAS build `cb38a5da-3fd0-46d3-bcd2-082097400a09` and source `68b29611c19cf1a7e5e97e0c3cf83324fe97af17`. This review independently inspects the supplied local artifact; it does not reauthenticate that remote association or prove source-to-binary reproducibility.

## Artifact and manifest

Local file: `C:/dev/endvera-astra-r03/.scratch/endvera-android-5-cb38a5da.apk`.

- Size: **127630488 bytes**.
- SHA-256 independently recomputed by PowerShell and Node: **bf034e6b8ce0b28ebe49228524714a9ba7e9120c7155d9e3ce0747fd9f788e9e**.
- ZIP central directory contains exactly one AndroidManifest.xml.
- Binary AXML manifest root has package **ai.endvera.mobile**, versionName **0.2.0**, and versionCode **5**.
- versionCode is typed integer decimal (`0x10`), with namespace `http://schemas.android.com/apk/res/android`; package has no namespace. These values were decoded from the binary manifest, not inferred from app.json or strings in the JavaScript bundle.

The isolated read-only parser is `.scratch/android5-binary-inspection.mjs`. It uses Node built-ins, validates ZIP/AXML chunk boundaries and expected fields, and prints only bounded metadata. This is a narrow structural inspection, not a general-purpose Android verifier or an independent validation of the parser by Android tooling.

## Signature boundary

No apksigner, aapt/aapt2, apkanalyzer, Java, jarsigner or Android SDK was found in the checked local command paths/standard locations. No installed Python APK inspection package was available. No tooling was downloaded or installed.

The APK has an `APK Sig Block 42` structure immediately before its central directory, with consistent leading/trailing size fields. Entries observed:

| Entry ID | Value bytes |
| --- | ---: |
| 0x7109871a (APK Signature Scheme v2 entry) | 1459 |
| 0x504b4453 | 16476 |
| 0x42726577 | 2477 |

Presence of the v2 block is **not proof of a valid signature**. This review did not verify signer signatures, content digests, certificate identity, certificate continuity with the prior APK, Android install acceptance, or absence of exploitable ZIP/parser ambiguities. No v3 entry was observed by this structural scan. Parent's earlier lack of v1 signature files does not establish that the APK is unsigned because v2 uses this separate signing block.

## Release interpretation

The hash binds this audit to one local APK and the manifest matches the intended package/code. `cryptographicSignatureVerified:false`, `deviceInstallVerified:false`; no new provider/customer Verified-E2E coverage. Parent separately reports finding the exact HTTPS origin inside the Hermes bundle; this reviewer did not repeat that check and does not infer runtime connectivity from it.

Remaining verification, outside this lane: a trusted Android verifier (for example installed/pinned apksigner) must verify the signature and report the signer certificate; an actual installation must separately verify device acceptance and upgrade identity continuity. No signature certificate fingerprint is invented here.
