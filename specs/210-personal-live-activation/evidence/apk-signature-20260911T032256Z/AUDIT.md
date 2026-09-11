# Local APK signature verification — 2026-09-11

## Observed verdict

Both supplied local APKs pass the official Android `apksigner verify --verbose --print-certs` command with exit code 0. Both report exactly one signer, with the same certificate SHA-256:

`ccdd90c46c734e3f97a8d1bc4344b8f10ea0537788f13d1d890c812bc8a5bc1b`

Both report APK Signature Scheme v2 verified=true. v1, v3, v3.1, v4 and SourceStamp are false. This is a successful v2 verification, not a claim that all schemes are present. Both verification stderr files are empty; no warnings occurred in stdout. Signer RSA key size is 2048 bits. The matching public-key SHA-256 is `54c11b37ea30593313770085bbd0d3f0fb357d6441df979202649f780acb1e2e`. Continuity is based on the certificate digest, not the empty distinguished-name fields.

The one real local run started at 2026-09-11T03:22:40.3550904Z and finished at 2026-09-11T03:22:56.5318224Z. PowerShell exited 0. No failed verification attempt preceded it. Prior structural inspection correctly retained cryptographicSignatureVerified:false before this run; this new observation does not rewrite that historical evidence.

## Inputs, unchanged before and after

| Input | SHA-256 |
| --- | --- |
| `C:/dev/endvera-astra-r03/.scratch/endvera-android-5-cb38a5da.apk` | `bf034e6b8ce0b28ebe49228524714a9ba7e9120c7155d9e3ce0747fd9f788e9e` |
| `C:/Users/oliro/Downloads/application-fccebc0b-b48f-4a99-99e2-5eda00d37711.apk` | `f33de2e1076d6bffeaf644371197b04153c371649d2d2dd82495758caeb1907e` |

The shorthand android5/android4 names identify these supplied files. This run does not independently reauthenticate their EAS/source association or decode the old APK version. Parent's earlier new-APK manifest inspection established ai.endvera.mobile / 0.2.0 / code 5 separately.

## Tool provenance and integrity

Supplier metadata was read over HTTPS before authorization to download. Only two ZIP archives were subsequently downloaded:

- Google Android SDK Build-Tools 36.0.0, `https://dl.google.com/android/repository/build-tools_r36_windows.zip`: 58,699,878 bytes; supplier SHA-1 `f16ccffd34de8790dede813a6c7d8e2c11a27b50` matched before extraction. Source: `https://dl.google.com/android/repository/repository2-1.xml`, exact `build-tools;36.0.0` Windows entry. Locally computed ZIP SHA-256: `aa1095cb14d83e483818a748a2c06faaeb8e601561b06a356a119a1b2ca280d3`. Google metadata supplied SHA-1 only; this local SHA-256 is not presented as an independently published Google digest.
- Eclipse Temurin JRE 17.0.20.1+1 Windows x64, `https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.20.1%2B1/OpenJDK17U-jre_x64_windows_hotspot_17.0.20.1_1.zip`: 43,780,109 bytes; supplier SHA-256 `bc21a93923103cdaac93ee337b0ae4365e739fde36df823dd456bc67c8a9d352` matched before extraction. Source: official `https://api.adoptium.net/v3/assets/feature_releases/17/ga` Windows x64 JRE metadata and corresponding Adoptium release. This run did not independently verify a detached publisher signature.

Extracted executable tools:

- `android/android-16/lib/apksigner.jar`: SHA-256 `3716d9311e55d2b0918a2fd9d54ba9e406c5f6abeea700b287f11259bc163dec`; actual `version` output `0.9`.
- `java/jdk-17.0.20.1+1-jre/bin/java.exe`: SHA-256 `1977f302375adbb920d41dac65c7e22eb9c2ed8e1e8d6258964154ff16f14406`; actual `-version` reports Temurin 17.0.20.1+1.
- Helper `verify-apks.ps1`: SHA-256 `8b0b05141c4a337128bb57bd05b1aa2ed5fa4ba7f119bab7620e39abaa1317a9`. PowerShell parser reported no syntax errors before execution. This is a bounded one-off verifier wrapper, not a broadly audited security framework.

## Commands and containment

Only four Java invocations ran: Java `-version`, apksigner `version`, and one apksigner `verify --verbose --print-certs` per APK. The default manifest minSdkVersion was not overridden. Java ran by absolute path with an explicitly cleared child environment, only Windows system-root variables and owned TEMP/TMP restored. No PATH/JAVA_HOME/shared dependencies were modified; Java option-injection variables were absent. Heap was bounded to 512 MiB, each child to 90 seconds and output to 1 MiB. Java temporary/user-home locations were inside this directory; perf-data writes were disabled.

HTTP was GET-only for the two explicit official archives, with bounded redirects restricted to Google or GitHub's release-asset host, HTTPS only, no credentials/cookies, 120-second cancellation and exact byte caps. ZIP paths, links/special entries, duplicate case-insensitive paths, entry counts and expanded sizes were checked before extraction. Actual Android extraction: 197 entries / 143,241,305 bytes. JRE extraction: 380 entries / 130,895,997 bytes. Complete archives and extracted license/legal files are retained. No cleanup or deletion was performed.

All created helper/download/extraction/log/receipt/audit files are under this one new `.scratch` directory. APKs were read only, never loaded as executable code, installed, signed, rotated, aligned, or rebuilt. No EAS, provider, database, credential, deployment or global installation action occurred.

## Retained evidence and limits

- `receipt.json`: SHA-256 `d64ff706a834be3197587e5234df20022c64b5b21a993a4676e91b7c3ed3a5ab`.
- Four command stdout/stderr pairs retain the complete observed output; the receipt also includes their exact contents, command arguments, exit codes and timings.
- `cryptographicSignatureVerified:true`, `certificateContinuityVerified:true`, `inputsUnchanged:true` for this exact two-file pair.
- `deviceInstallVerified:false`, `apkExecuted:false`, `installed:false`.

This establishes offline cryptographic signature validity and the same signer certificate for these two artifacts. It does not establish device acceptance, source-to-binary reproducibility, authentication to an EAS account, ownership identity of the signing key, runtime connectivity, absence of application vulnerabilities, or provider/customer Verified-E2E coverage. Android's reference: https://developer.android.com/tools/apksigner.
