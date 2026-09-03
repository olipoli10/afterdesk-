# Quickstart: Product Experience Completion

## Local validation

1. Run the targeted Web and mobile navigation tests.
2. Start the Web application with the existing disposable local configuration.
3. Open `/` in French and English; confirm the original homepage remains and the TextAssist banner is visible.
4. Open `/textassist`; confirm target audience, daily loop, approvals, human support, availability, and CTA.
5. Open `/account-deletion`; confirm it is public and performs no destructive action.
6. Start/export the mobile application; confirm exactly five visible tabs.
7. Open More and visit every secondary destination group.
8. Run type checks, lint, provider-boundary validation, mobile export, production Web build, and `git diff --check`.

## Expected result

- Existing site preserved.
- TextAssist is discoverable and independently explainable.
- Mobile is assistant-first rather than an internal 24-tab console.
- No provider, credential, customer data, external effect, deployment, signing, or publication occurs.

