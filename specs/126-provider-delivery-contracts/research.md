# Research: Provider Delivery Contracts R37D

This release does not claim current external API compatibility. It defines the
internal ENDVERA boundary using the already accepted R36B candidate packets and
R37A sealed request. Live provider documentation and observed payloads remain a
separate R37 authority step.

Decision: normalize a narrow supported subset and refuse drift. This prevents a
future adapter from making arbitrary provider JSON part of canonical state.
