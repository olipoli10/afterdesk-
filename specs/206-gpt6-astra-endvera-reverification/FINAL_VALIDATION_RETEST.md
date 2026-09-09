# Final validation retest — preserved first observation

First frozen observation F1: `2326aa6aca05859bb58a0b2e747827b364dee1fb`, tree
`c45a4328ee0022ffe3a76f8649f01b5e1c005a4b`. Its 36 G7 checks and nine supplemental
checks are retained unchanged; `G7-execution-summary.json` is that historical
index, not a claim about a subsequent commit.

The root suite observed 2715 tests: 2709 passed, three failed, three skipped.
Two failures were stale literal copy assertions after the truthfulness fix.
The corrected assertions require conditional FR/EN copy, rendered bindings and
absence of the old live-service promise. Product copy was not weakened.

The third failure was the synchronous whole-checkout test at 10836.46 ms under
a 5000 ms unit deadline. Its earlier dirty-checkout branch could exit early,
unlike the clean final checkout. A small real Git fixture now always verifies
clean acceptance, unchanged declared-input acceptance after a non-input edit,
and whole-tree rejection of that edit. No production guard or deadline changed.
The actual checkout remains validated by the release CLI in G7 static checks.

Distinct read-only agents proposed both bounded corrections. The focused
`g3-final-test-alignment` and lint records pass. A new full suite and additive
G7 retest use fresh IDs suffixed `-r2`; the original commands, phase contracts,
wrappers, attempts and verdicts are neither overwritten nor reclassified.

F1 corrected R0b G7: sixteen PASS, one FAIL (secret scanner), one NOT_APPLICABLE
(no campaign device crash evidence). All seventeen applicable original frozen
checks failed; this remains visible. The scanner flag is an intentional mocked
private-key header in a secret-rejection test, proven without serializing its
value by `g7-secret-flag-provenance-r2`; the scanner FAIL is retained.

F1 mobile suite: 195 passes. Voice spend: seven SQL integration passes with
owned PrismaDev/PGlite servers closed. Web build compiles/typechecks but page
collection refuses missing storage configuration; no dummy provider credential
is inserted. Mobile export completes, but two Expo Doctor checks cannot complete
offline. Production route smoke lacks a completed production build and closes
its owned web process. The old spec090 queue lacks its required plan hash.
These limitations are not resolved by changing the two unit test files.

The canonical seal remains structurally blocked by the frozen scanner and audit
attempt representation. A retest at a new HEAD adds another exact historical
observation; it cannot remove the first final-validation attempt from the ledger.
No runtime candidate, device observation, transport or external authority added.
