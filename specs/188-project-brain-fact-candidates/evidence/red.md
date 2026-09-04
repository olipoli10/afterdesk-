# R36W RED evidence

**Label**: TEST / SYNTHETIC

Command:

`npm test -- --run test/construction-operating-assistant-r36w-fact-candidates-contracts.test.ts test/construction-operating-assistant-r36w-fact-candidates-api.test.ts test/construction-operating-assistant-r36w-fact-candidates-server.test.ts`

Observed before implementation on 2026-09-03:

- contract suite refused because the R36W library module did not exist;
- API suite refused because the R36W route did not exist;
- server sentinel refused because the R36W server module did not exist;
- zero product effect occurred.

This is the expected non-vacuous missing-contract RED. No provider, binary read, network, transport, external write or automatic confirmation was attempted.
