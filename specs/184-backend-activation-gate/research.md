# Research

Three older runtime paths treated credential presence as activation: `aiEnabled`, email dispatch and `googleEnabled`. This is a configuration footgun because secret injection can silently change external capability. The selected design separates configuration presence from authority, ownership and explicit activation.

