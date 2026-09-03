# Research: Provider Delivery Orchestration R37F

R37A intentionally fingerprints but does not retain the adapter body, so the
existing R37C evidence snapshot cannot reconstruct canonical provider evidence.
The smallest safe composition adds nullable canonical snapshot and fingerprint
fields to `ControlledProviderRun`. An R37F adapter wrapper normalizes and writes
them while R37C owns the live lease, before R37C records its transport-free
envelope and settles spend. A retry can reuse the durable canonical snapshot
without reinvoking the fixture adapter. No transport is added.
