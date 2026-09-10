# Trial preflight credential transport — bounded controller procedure

Goal: execute only the reviewed T-only read-only preflight, with the existing
server-side credential used privately. No migration, new key, pilot connection,
deployment or provider messaging. Existing personal100CAD setup mandate applies.

Actual non-secret experiments: exec_command without a PTY immediately closes
stdin. PTY raw-mode kept input open; fixed35-byte sentinel was not echoed, a
non-TTY child received it through its pipe and EOF, and both processes exited0.
The tool returns after about10seconds. Thus runner's five-second bounded stdin
cannot be supplied by launching it directly and writing later.

Implement a narrow local bridge. It must enter and verify raw TTY mode BEFORE
printing a fixed READY marker, accept exactly one bounded canonical envelope
terminated by byte04 within45seconds, and never echo any input, length or hash.
Reject unexpected control bytes, extra frames, empty/oversize payloads, non-TTY
or failed raw mode. No retries. Disable terminal input listeners after the frame.
Launch only the reviewed runner through a non-TTY child pipe with EOF, fixed
PREFLIGHT_70 mode and controller-pinned HEAD/catalog. Do not launch a shell.
The runner still validates source and exact T target and has migration disabled.
Bridge validates expected arguments/source before READY; deadline on child plus
bounded output; child stdout is never forwarded raw. Emit a fixed success/refusal
code after validating the expected bounded receipt shape. Kill only its own child
on timeout. Restore terminal mode on every exit; no persistent server or secret
file. Do not import candidate-generated executable paths or raw command strings.

Controller must keep any connector-returned credential entirely within tool
orchestration/server-side memory. Never text(), log, store in project artifacts,
put in shell arguments, expose to the model, or ask Olivier to paste into chat.
The private orchestrated tool-input channel is not an end-to-end local vault:
tool-service audit retention remains a platform property. Raw terminal mode
only prevents terminal echo. Do not claim stronger confidentiality. If tool
output exposes input during the non-secret rehearsal, do not admit a credential.

Before any real secret is retrieved, run a full non-secret bridge rehearsal
through the actual tools and review code with another agent. Tests must prove
size/deadline/framing/echo/output/error/refusal and exact-child restrictions.
Do not fetch credentials in tests or helper. The current preserved Vercel link
file has neither DATABASE_URL nor DIRECT_URL (booleans only checked), so it is
not a credential source and must not be dumped or searched further.

Actual run needs a clean inspected source checkout, verified managed trial
identity, runtime pins and committed source. Successful preflight means only
real Prisma TLS connection and exact70 successful histories; no row preservation
or migration claim. Suspend only T endpoint after the bounded run. Continue
independent authorized work if no safe secret handoff can be established.
