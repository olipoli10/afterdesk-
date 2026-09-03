# R37N RED

The focused R37N run failed 5/5 before dynamic-code detection existed. Reachable `eval`, `new Function`, and Node VM mutations plus the unreachable control and actual-source assertion all failed because `findDynamicCodeExecutionReachability` was absent.

These mutations establish that R37K-R37M cover module reachability but do not yet identify code generated or evaluated inside an otherwise neutral reachable module. No provider, credential, network or external transport was used.

Exact security scan `e4cd571f-f768-4981-ba99-1f6b881a4a85` then confirmed a low-severity indirection bypass: immediate callee-name matching missed parenthesized indirect `eval` and aliased imports from `node:vm`. Equivalent mutations were added before changing the guard to reject the dangerous intrinsic reference or VM module capability itself.
