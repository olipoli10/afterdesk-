import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {observeChild} from './observe-child.mjs';
function fake(){const c=new EventEmitter();c.stdout=new PassThrough();c.stderr=new PassThrough();c.kill=()=>false;c.unref=()=>{};return c;}
test('termination failure still records a bounded incident',async()=>{
 const c=fake(),start=Date.now();
 const r=await observeChild(c,{timeoutMs:10,graceMs:10,terminate(){throw new Error('synthetic OS failure');}});
 assert.equal(r.incident,'CHILD_STOP_UNCONFIRMED');assert.equal(r.exitCode,null);assert.ok(Date.now()-start<1000);
});
test('capture overflow remains bounded without close',async()=>{
 const c=fake(),p=observeChild(c,{timeoutMs:1000,graceMs:10,maxBytes:2,terminate(){}});
 c.stdout.write('overflow');const r=await p;assert.equal(r.incident,'CHILD_STOP_UNCONFIRMED');assert.equal(r.stdout.length,0);
});
test('normal close retains exact bytes and native exit',async()=>{
 const c=fake(),p=observeChild(c,{timeoutMs:1000,terminate(){throw new Error('unexpected');}});
 c.stdout.write('ok');c.emit('close',0,null);const r=await p;assert.equal(r.incident,null);assert.equal(r.exitCode,0);assert.equal(r.stdout.toString(),'ok');
});
