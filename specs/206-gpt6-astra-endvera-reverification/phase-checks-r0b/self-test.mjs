import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const guard=fileURLToPath(new URL('./network-guard.cjs',import.meta.url)).replaceAll('\\','/');
const env={};
for(const key of ['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','COMSPEC','PATHEXT'])if(process.env[key])env[key]=process.env[key];
env.NODE_OPTIONS=`--require="${guard}"`;
test('forwardslash NODE_OPTIONS loads the guard and refuses external fetch before I/O',()=>{
 const result=execFileSync(process.execPath,['-e',`try { fetch('https://example.invalid/'); process.exitCode=1; } catch(error) { if(error.message!=='CAMPAIGN_EXTERNAL_NETWORK_DENIED')throw error; console.log('PRELOAD_EXTERNAL_FETCH_REFUSED'); }`],{env,encoding:'utf8',windowsHide:true});
 assert.equal(result.trim(),'PRELOAD_EXTERNAL_FETCH_REFUSED');
});
test('guard allows a bounded loopback socket exchange',()=>{
 const code=`const net=require('node:net');const server=net.createServer(socket=>{socket.end('synthetic');});server.listen(0,'127.0.0.1',()=>{const socket=net.connect(server.address().port,'127.0.0.1');let bytes='';socket.on('data',chunk=>{bytes+=chunk;});socket.on('end',()=>{server.close(()=>{if(bytes!=='synthetic')process.exitCode=1;else console.log('LOOPBACK_EXCHANGE_VERIFIED');});});});`;
 const result=execFileSync(process.execPath,['-e',code],{env,encoding:'utf8',windowsHide:true,timeout:10000});
 assert.equal(result.trim(),'LOOPBACK_EXCHANGE_VERIFIED');
});
test('guard refuses external numeric and DNS targets before connection',()=>{
 const code=`const net=require('node:net');const dns=require('node:dns');let refused=0;for(const f of [()=>net.connect(443,'203.0.113.1'),()=>dns.lookup('example.invalid',()=>{})]){try{f();}catch(error){if(error.message==='CAMPAIGN_EXTERNAL_NETWORK_DENIED')refused++;}}if(refused!==2)process.exitCode=1;else console.log('EXTERNAL_SOCKET_AND_DNS_REFUSED');`;
 const result=execFileSync(process.execPath,['-e',code],{env,encoding:'utf8',windowsHide:true,timeout:10000});
 assert.equal(result.trim(),'EXTERNAL_SOCKET_AND_DNS_REFUSED');
});
test('wildcard listener requests are clamped to loopback, not allowed externally',()=>{
 const code=`const net=require('node:net');const server=net.createServer();server.listen(0,'0.0.0.0',()=>{const host=server.address().address;server.close(()=>{if(host!=='127.0.0.1')process.exitCode=1;else console.log('WILDCARD_BIND_CLAMPED_TO_LOOPBACK');});});`;
 const result=execFileSync(process.execPath,['-e',code],{env,encoding:'utf8',windowsHide:true,timeout:10000});
 assert.equal(result.trim(),'WILDCARD_BIND_CLAMPED_TO_LOOPBACK');
});
test('non-loopback requested IP listeners remain confined to loopback',()=>{
 const code=`const net=require('node:net');const server=net.createServer();server.listen({port:0,host:'192.0.2.1'},()=>{const host=server.address().address;server.close(()=>{if(host!=='127.0.0.1')process.exitCode=1;else console.log('NON_LOOPBACK_BIND_CLAMPED_TO_LOOPBACK');});});`;
 const result=execFileSync(process.execPath,['-e',code],{env,encoding:'utf8',windowsHide:true,timeout:10000});
 assert.equal(result.trim(),'NON_LOOPBACK_BIND_CLAMPED_TO_LOOPBACK');
});
