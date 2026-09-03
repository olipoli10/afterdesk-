# R37V RED

The focused regression test failed before implementation: the current validator returned no violation for `moduleApi["createRequire"](import.meta.url)` followed by a computed loader target. Expected `R37O_UNRESOLVED_DYNAMIC_MODULE`; observed `[]`.

