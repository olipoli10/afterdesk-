# R37U RED evidence

The module namespace capability is not propagated through a second identifier:

`const first = require("node:module"); const second = first; const loader = second.createRequire(import.meta.url); loader(target);`

Expected `R37O_UNRESOLVED_DYNAMIC_MODULE`; observed no violation before implementation.
