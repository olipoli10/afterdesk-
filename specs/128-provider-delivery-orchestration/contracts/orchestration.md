# Orchestration Contract

Input combines the existing R37C command with an injected provider fixture
function. The fixture is normalized against the sealed attempt before R37C can
record evidence. Output contains the existing controlled-run disposition and a
strict canonical provider evidence object on success/replay, otherwise null.
External transport remains false.
