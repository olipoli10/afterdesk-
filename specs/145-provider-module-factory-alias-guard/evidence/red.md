# R37W RED

Before implementation, the focused test returned no violation for a `createRequire` factory extracted through `moduleApi["createRequire"]` and then used to create a computed loader. Expected `R37O_UNRESOLVED_DYNAMIC_MODULE`; observed `[]`.

