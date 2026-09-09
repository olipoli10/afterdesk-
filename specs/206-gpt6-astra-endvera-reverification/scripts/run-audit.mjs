import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';

const lane = process.argv[2];
if (!['canon-provenance','architecture-security','mobile-ux','product-coverage'].includes(lane)) throw new Error('AUDIT_LANE_UNKNOWN');
const spec = 'specs/206-gpt6-astra-endvera-reverification';
const cli = 'C:/Users/oliro/AppData/Local/OpenAI/Codex/bin/8e5b6932251c2c1c/codex.exe';
const git = (...args) => execFileSync('git', args, { encoding:'utf8', windowsHide:true }).trim();
const promptPath = `${spec}/audit-prompts/${lane}.md`;
const prompt = readFileSync(promptPath);
const identity = JSON.parse(readFileSync(`${spec}/CAMPAIGN_IDENTITY.json`,'utf8'));
const envelope = {
 requestedModel:'gpt-6-astra',clientVersion:execFileSync(cli,['--version'],{encoding:'utf8',windowsHide:true}).trim(),
 campaignId:identity.campaignId, observedHead:git('rev-parse','HEAD'),observedTree:git('rev-parse','HEAD^{tree}'),
 runAt:new Date().toISOString(),commandId:`g2-${lane}`,promptPath,promptSha256:createHash('sha256').update(prompt).digest('hex')
};
const input = `${prompt.toString('utf8')}\nRUN_ENVELOPE\n${JSON.stringify(envelope)}\n\nOperational constraints: Worktree ${process.cwd()}. Canonical Brain C:/dev/afterdesk-project-brain. Do not access any .env, credential, auth/token config or actual user data. Do not read specs/206-gpt6-astra-endvera-reverification/corpus/grader-only/ or corpus/oracle-manifest.json or corpus/development-oracles.json. This audit is not a blinded runtime evaluation. No network or provider tools, no writes, no tests changing files. Read public source/docs and read-only git only. Current campaign files are evaluation infrastructure, distinguish them from product baseline. Read AGENTS.md. Output the requested JSON only, no markdown. Limit findings to actionable verified claims.\n`;
const args=['exec','--ignore-user-config','--ephemeral','-m','gpt-6-astra','-c','model_reasoning_effort="high"','-c','approval_policy="never"','--sandbox','read-only','--color','never','-'];
const child=spawn(cli,args,{cwd:resolve('.'),env:process.env,windowsHide:true,stdio:['pipe','inherit','inherit']});
child.stdin.end(input);
child.on('error',()=>{process.exitCode=125;});
child.on('close',code=>{process.exitCode=code ?? 125;});
