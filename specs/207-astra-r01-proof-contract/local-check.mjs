import { execFileSync } from 'node:child_process';
import { calculateCanonicalMetrics } from '../206-gpt6-astra-endvera-reverification/evaluation-contracts/local-metrics.mjs';

try {
  if (process.argv[2] === 'metrics') {
    const cwd = 'C:/dev/afterdesk-project-brain';
    const head = execFileSync('git',['rev-parse','HEAD'],{cwd,encoding:'utf8'}).trim();
    if (head !== 'd96866623558ede5ac5f25274e636db12bd8e79b' ||
        execFileSync('git',['status','--porcelain'],{cwd,encoding:'utf8'}).trim()) throw new Error('BRAIN_CHANGED');
    const roadmap = execFileSync('git',['show',`${head}:ROADMAP_PROGRESS_MODEL.md`],{cwd,encoding:'utf8'});
    console.log(JSON.stringify(calculateCanonicalMetrics(roadmap)));
  } else if (process.argv[2] === 'boundary') {
    const text = execFileSync(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/validate-provider-boundary.ts'],
      {encoding:'utf8',windowsHide:true,timeout:55000,maxBuffer:8_000_000});
    if (!/^R37O_PROVIDER_BOUNDARY_PASS modules=[1-9]\d* violations=0\r?$/m.test(text)) throw new Error('BOUNDARY_REPORT_INVALID');
    console.log(JSON.stringify({kind:'STATIC_PROVIDER_BOUNDARY',passed:true,realProviderCalls:0,scope:'source-graph-not-OS-isolation'}));
  } else throw new Error('CHECK_UNKNOWN');
} catch {
  // Do not echo subprocess output or exception messages that may contain data.
  console.error('LOCAL_CHECK_REFUSED'); process.exitCode = 1;
}
