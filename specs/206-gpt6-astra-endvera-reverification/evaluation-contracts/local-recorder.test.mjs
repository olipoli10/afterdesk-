import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync, cpSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, relative, join, isAbsolute } from "node:path";
import { createHash, randomUUID } from "node:crypto";

const root = process.cwd();
const spec = "specs/206-gpt6-astra-endvera-reverification";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
function fixture(run) {
  const temp = mkdtempSync(join(root,".campaign-recorder-test-"));
  const ownedRelative = relative(root,temp);
  assert(!isAbsolute(ownedRelative) && /^\.campaign-recorder-test-[^/\\]+$/u.test(ownedRelative));
  try {
    mkdirSync(join(temp,spec,"scripts"),{recursive:true});
    // Test the current recorder's exact bytes in an isolated evidence directory.
    cpSync(join(root,spec,"scripts"),join(temp,spec,"scripts"),{recursive:true});
    writeFileSync(join(temp,spec,"CAMPAIGN_IDENTITY.json"),JSON.stringify({campaignId:randomUUID()}));
    const invoke = (id, descriptor) => {
      const relativeDescriptor = `${spec}/${id}.json`;
      writeFileSync(join(temp,relativeDescriptor),JSON.stringify({id,phase:"G0",classification:"SETUP",executable:process.execPath,...descriptor}));
      const execution = spawnSync(process.execPath,[join(temp,spec,"scripts/record-command.mjs"),relativeDescriptor],{cwd:temp,encoding:"utf8",windowsHide:true,timeout:15000});
      const directory = join(temp,spec,"evidence/commands",id);
      return {execution,directory,read:name=>readFileSync(join(directory,name)),json:name=>JSON.parse(readFileSync(join(directory,name),"utf8"))};
    };
    run({temp,invoke});
  } finally {
    // Exact test-created directory, validated inside this worktree before deletion.
    const finalRelative = relative(root,resolve(temp));
    assert(finalRelative === ownedRelative && /^\.campaign-recorder-test-[^/\\]+$/u.test(finalRelative));
    rmSync(temp,{recursive:true,force:true});
  }
}
test("recorder retains native stdout/stderr bytes and matches their hashes",()=>fixture(({invoke})=>{
  const r=invoke("raw",{args:["-e","process.stdout.write(Buffer.from([255,0,65,10]));process.stderr.write('native-stderr');"]});
  assert.equal(r.execution.status,0,r.execution.stderr);
  assert.deepEqual(r.read("stdout.txt"),Buffer.from([255,0,65,10]));
  assert.equal(r.read("stderr.txt").toString(),"native-stderr");
  const command=r.json("command.json");
  assert.equal(command.stdoutSha256,digest(r.read("stdout.txt")));
  assert.equal(command.stderrSha256,digest(r.read("stderr.txt")));
}));
test("recorder keeps launch diagnostics separate from native stderr",()=>fixture(({invoke})=>{
  const r=invoke("launch-missing",{executable:"endvera-intentionally-missing-executable-206",args:[]});
  assert.notEqual(r.execution.status,0);
  assert.equal(r.read("stderr.txt").length,0);
  assert.equal(r.json("runner-diagnostic.json").launchError,"ENOENT");
}));
test("recorder reports the actual descriptor cwd",()=>fixture(({temp,invoke})=>{
  mkdirSync(join(temp,"nested"));
  const r=invoke("cwd",{cwd:"nested",args:["-e","process.stdout.write(process.cwd())"]});
  assert.equal(r.execution.status,0,r.execution.stderr);
  assert.equal(r.read("stdout.txt").toString(),join(temp,"nested"));
  assert.equal(r.json("command.json").workingDirectory,"nested");
}));
test("recorder refuses canonical synthetic key shape before writing raw streams",()=>fixture(({invoke})=>{
  // Deliberately constructed dummy bytes, never an actual credential.
  const r=invoke("synthetic-secret-shape",{args:["-e","process.stdout.write('sk-'+String.fromCharCode(65).repeat(24))"]});
  assert.notEqual(r.execution.status,0);
  assert(!existsSync(join(r.directory,"stdout.txt")));
  assert(!existsSync(join(r.directory,"stderr.txt")));
  assert.equal(r.json("INCIDENT.json").rawStreamsPersisted,false);
}));
test("recorder timeout stops its owned child tree and preserves stderr",()=>fixture(({invoke})=>{
  const code="const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'inherit'});process.stdout.write(JSON.stringify({direct:process.pid,descendant:child.pid})+'\\n');process.stderr.write('timeout-native');setInterval(()=>{},1000);";
  const r=invoke("timeout",{args:["-e",code],timeoutMs:700});
  assert(!r.execution.error,r.execution.error?.message);
  assert.notEqual(r.execution.status,0);
  assert.equal(r.read("stderr.txt").toString(),"timeout-native");
  assert.equal(r.json("runner-diagnostic.json").cleanupStatus,"OWNED_PROCESS_TREE_STOPPED");
  const pids=JSON.parse(r.read("stdout.txt").toString());
  for(const pid of [pids.direct,pids.descendant]) assert.throws(()=>process.kill(pid,0),error=>error.code==="ESRCH");
}));
