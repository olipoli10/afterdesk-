# R37L RED

The focused R37L test failed before the graph guard existed: the test module could not import `findProviderExecutionReachability`.

The fixture requires an exact two-hop chain from a public route through a neutral facade to the sealed R37F delivery module. R37K intentionally inspects only the public file itself, so neither a neutral intermediary name nor a renamed `run` symbol proves the terminal execution target. This establishes the missing transitive control without calling a provider, reading a credential or opening a network path.

Exact security scan `bbd21adc-83fa-47a2-bf0d-89db0fa19f52` then confirmed a low-severity parser bypass: the first graph implementation's line-bounded regex omitted normal multiline static imports. A multiline facade mutation and a TypeScript `import = require()` mutation were added before replacing regex parsing with the installed TypeScript parser.
