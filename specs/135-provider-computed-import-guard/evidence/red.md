# R37M RED

The focused R37M run failed 4/4 before unresolved-load detection existed. Both public-reachable computed-load cases, the unreachable control and the actual-source assertion failed because `findUnresolvedDynamicModuleReachability` was absent.

The mutations use `import(target)` and `require(target)` behind neutral facades. Their destination cannot be proven by the literal R37L graph, establishing the need for a separate fail-closed result without contacting a provider, reading credentials or opening a network path.
