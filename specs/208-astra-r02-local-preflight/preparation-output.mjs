import { writeFileSync } from 'node:fs';
import { fail, encode, secretFlags } from './protocol.mjs';

export function recordGenerationResult(path, result) {
  const stdout=result.stdout??Buffer.alloc(0),stderr=result.stderr??Buffer.alloc(0);
  fail(Buffer.isBuffer(stdout)&&Buffer.isBuffer(stderr),'RAW_PREPARATION_STREAMS_REQUIRED');
  // Scan the original bytes independently, before JSON escaping or UTF8 decode.
  fail(!secretFlags(stdout).length&&!secretFlags(stderr).length,'PREPARATION_OUTPUT_WITHHELD');
  writeFileSync(path,encode({exitCode:result.status,stdout:stdout.toString('utf8'),stderr:stderr.toString('utf8')}),{flag:'wx'});
}
