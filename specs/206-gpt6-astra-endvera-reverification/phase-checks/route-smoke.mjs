import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { safeOutput } from './output-safe.mjs';
export async function routeSmoke({root,safeEnv}) {
 const port=await new Promise((done,reject)=>{const socket=createServer();socket.on('error',reject);socket.listen(0,'127.0.0.1',()=>{const port=socket.address().port;socket.close(()=>done(port));});});
 const child=spawn(process.execPath,[resolve(root,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{cwd:root,env:{...safeEnv,NODE_ENV:'production'},stdio:['ignore','pipe','pipe'],windowsHide:true});
 let closed=false;let spawnError;
 child.on('error',error=>{spawnError=error;});
 const ended=new Promise(done=>child.on('close',()=>{closed=true;done();}));
 let stdout='',stderr='';
 child.stdout.on('data',data=>{stdout+=data;});child.stderr.on('data',data=>{stderr+=data;});
 const origin=`http://127.0.0.1:${port}`;
 try {
  let ready=false;
  for(let attempt=0;attempt<120;attempt++) {
   if(spawnError)throw spawnError;if(closed)throw new Error('LOCAL_WEB_EXITED_BEFORE_READY');
   try {const response=await fetch(`${origin}/api/health`,{signal:AbortSignal.timeout(1000)});if(response.ok){const data=await response.json();ready=data.service==='ENDVERA_WEB'&&data.status==='alive';if(ready)break;}}catch{}
   await delay(500);
  }
  if(!ready)throw new Error('LOCAL_WEB_HEALTH_TIMEOUT');
  const checks=[['GET','/',200],['GET','/login',200],['GET','/account-deletion',200],['GET','/api/endvera/v1/mobile/bootstrap',401],['POST','/api/endvera/v1/mobile/prepared-actions',401]];
  let failures=0;
  for(const [method,path,status] of checks) {
   const response=await fetch(`${origin}${path}`,{method,redirect:'manual',signal:AbortSignal.timeout(20000),...(method==='POST'?{headers:{'content-type':'application/json'},body:'{}'}:{})});
   const body=await response.text();
   const correct=response.status===status&&body.length>0&&(status!==401||body.includes('Not signed in'));
   console.log(`ROUTE_SMOKE method=${method} path=${path} expectedStatus=${status} observedStatus=${response.status} bodyNonempty=${body.length>0} verified=${correct}`);
   if(!correct)failures++;
  }
  if(failures)throw new Error(`CRITICAL_ROUTE_SMOKE_FAILED:${failures}`);
  console.log(`CRITICAL_ROUTE_SMOKE_VERIFIED routes=${checks.length} realSession=false`);
 } finally {
  if(!closed)child.kill();
  await Promise.race([ended,delay(10000)]);
  if(!closed)throw new Error('OWNED_WEB_PROCESS_SHUTDOWN_NOT_CONFIRMED');
  process.stdout.write(safeOutput(stdout));process.stderr.write(safeOutput(stderr));
  console.log('OWNED_WEB_PROCESS_SHUTDOWN_CONFIRMED');
 }
}
