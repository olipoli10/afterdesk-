# R37T RED evidence

The CommonJS namespace form is not tracked:

`const moduleApi = require("node:module"); const loader = moduleApi.createRequire(import.meta.url); loader(target);`

Expected `R37O_UNRESOLVED_DYNAMIC_MODULE`; observed no violation before implementation.
