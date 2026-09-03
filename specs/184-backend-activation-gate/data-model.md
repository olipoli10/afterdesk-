# Data Model

`ExternalCapabilityDecision` contains capability, enabled boolean and missing requirement codes. It never contains environment values.

Capabilities: AI, EMAIL and GOOGLE_OAUTH. Shared prerequisites: global transport token, authority reference and owner reference. Each capability adds one explicit token and named configuration-presence requirements.

