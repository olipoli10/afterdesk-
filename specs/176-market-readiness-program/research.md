# R36G-R36K Research Notes

## Current primary-source findings

- Expo documents `eas.json` as the build configuration file and supports named profiles.
- In a monorepo, Expo directs teams to place `eas.json` in the application directory and run EAS commands from that directory.
- Expo distinguishes internal preview builds from production/store builds and recommends Android App Bundle for Play Store submission.
- Actual EAS builds, provisioning, signing and submission require external services/accounts; none are authorized in this program.

## Chosen design

Keep production-shaped build metadata in the repository but expose no executable submit path. Local validators parse files and compare closed values; they never invoke EAS, a shell, a network client or a provider.

## Rejected alternatives

- **Run `eas build:configure`**: rejected because it can initialize an external project and prompt for account context.
- **Add submit profiles now**: rejected because it creates an accidental upload path before authority exists.
- **Generate placeholder credentials**: rejected because fake credential material can be mistaken for operational readiness.
- **Build separate iOS and Android codebases**: rejected because the existing shared Expo app already carries the canonical mobile product.
