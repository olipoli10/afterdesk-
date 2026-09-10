# Mobile connection clarity — bounded interface correction

2026-09-10. Context: Olivier has installed an internal Android build and wants
to activate useful phone permissions and the separate ENDVERA SMS service.
The source Settings screen still asserts every package is unsigned/unpublished/
undeployed, while Permissions says all external providers remain disabled.
Neither screen queries deployment or personal-service state for those claims.
The build-preparation metadata is not a runtime service-status authority.

Plan: reproduce the misleading text and missing direct paths with rendered
screen tests; remove the blanket claims, retain exact version diagnostics, and
add navigation to the existing device-access and owner personal-service screens.
Keep workspace/connector policies distinct from Android/iOS permissions.
No permission is requested, grant created, provider enabled or readiness metric
changed by these links. Non-owner roles do not get a personal-service setup CTA.
Review, mobile tests/typecheck and Android export follow; no new APK is implied.

UX-copy guidance: concise Canadian French, explicit action labels and one clear
distinction between app installation, OS permission and connected service.

Recommended account note: "L’installation de l’app n’active pas tes connexions.
Vérifie ton numéro ENDVERA, Google Agenda et l’IA dans le service texto."
Alternative "Configuration à terminer" is rejected because some users may
already have active connections. Neither sentence claims observed readiness.
Recommended links: "Gérer les accès de mon téléphone" and
"Vérifier mon service texto ENDVERA". They navigate, never activate by themselves.
Existing detailed permission/status screens remain the source of their states.

Success: old blanket claims absent, configured version still rendered, both
existing paths correctly wired, role gating preserved and navigation-only new
links with no load/command effect of their own. The existing Permissions screen
still reads workspace authority on mount; server-rendered tests do not execute
those effects and do not prove the whole mounted screen makes no API request.
Stop on any need for OS access, network/provider or new account
authority; those are outside this interface-only correction.

Rendered pre-fix reproduction05:02:41:4 FAIL/3 controls PASS. Both blanket
statements were rendered; neither screen provided the two direct navigation
paths. A shared navigation-only component now exposes existing routes and
keeps personal-service setup owner-only. Build/preparation metrics remain intact.

Controller rendered regression7/7 and broader mobile467/467 across56files PASS
(`evidence/mobile-1789031050533`,09:04:19.186Z). Independent bounded review23/23
PASS is recorded in `audits/MOBILE_CONNECTION_CLARITY_REVIEW.md` at repository
root. Android Hermes export exited0 at09:05:22.866Z
(`evidence/mobile-export-1789031080614`); this is a local bundle, not a signed APK.
Mobile TypeScript rerun09:12Z exited0; scoped lint initially reported three
test-only style warnings, corrected by moving imports and using the array style.
No production behavior or release diagnostics changed during that cleanup.
Post-cleanup targeted23/23 PASS at05:13:08 local; scoped lint exited0 with no
warnings. Full mobile/export above were before this test-only style cleanup.
