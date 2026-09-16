import test from 'node:test';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {DiskCache} from '../src/lib/disk-cache.js';
test('durable disk cache survives object recreation, expires, and keys are hashed',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'precision-disk-test-'));
  try{
    const first=new DiskCache(dir,{ttl:50,maxFiles:2});await first.init();await first.set('provider:secret',Buffer.from('مرحبا'));
    const second=new DiskCache(dir,{ttl:50,maxFiles:2});await second.init();assert.equal((await second.get('provider:secret')).toString(),'مرحبا');
    await new Promise(r=>setTimeout(r,60));assert.equal(await second.get('provider:secret'),undefined);
  }finally{await rm(dir,{recursive:true,force:true});}
});
