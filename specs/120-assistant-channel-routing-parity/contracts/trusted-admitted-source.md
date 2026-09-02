# Contract: Trusted Admitted Source

For `SMS`, `EMAIL` and `VOICE_TRANSCRIPT`, the server caller supplies an admitted source containing a bounded sender address and a provider/provider-message pair. R36C rejects incomplete pairs and absent metadata before execution.

For `MOBILE_APP` and `PORTAL`, R36C derives `user:{authenticatedUserId}` and does not accept transport provenance from the client request.

All client results remain provider-neutral and retain `externalDispatchPerformed=false`.
