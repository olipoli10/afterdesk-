# Contract: Authenticated Portal Command

The legacy API accepts only `channel=PORTAL`, `senderAddress=user:{authenticatedUserId}` and no provider/providerMessageId. The server maps command ID, workspace, body and occurrence time to R36C. Other transport channels must use their admitted connector boundary.
