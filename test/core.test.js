import test from 'node:test';
import assert from 'node:assert/strict';
import {parseIdentity,episodeMatches} from '../src/lib/identity.js';
import {rank,rankAll} from '../src/lib/rank.js';
import {sign,verify} from '../src/lib/tokens.js';
import {TTLCache} from '../src/lib/cache.js';
import {loadConfig} from '../src/lib/config.js';
const req=parseIdentity('series','tt1234567:2:4',{videoHash:'0123456789abcdef',videoSize:'1000',filename:'Show.S02E04.WEB-DL.mkv'});
test('strict IMDb + season + episode identification',()=>{
  assert.equal(req.episode,4);assert.equal(req.videoSize,1000);
  assert.throws(()=>parseIdentity('series','tt1234567:2:5/../'),/Episode/);
  assert.throws(()=>parseIdentity('movie','tt1234567:1:1'),/Movie/);
  assert.equal(episodeMatches({season:2,episode:5},req),false);
});
test('reject wrong episode, IMDb, video hash and size',()=>{
  const baseline={id:'1',provider:'subdl',lang:'ara',season:2,episode:4,imdb:req.imdb,release:'Show.S02E04.WEB-DL.srt'};
  assert.ok(rank(baseline,req)>0);
  assert.equal(rank({...baseline,episode:3},req),-Infinity);
  assert.equal(rank({...baseline,imdb:'tt9876543'},req),-Infinity);
  assert.equal(rank({...baseline,moviehash:'ffffffffffffffff'},req),-Infinity);
  assert.equal(rank({...baseline,videoSize:2000},req),-Infinity);
  assert.equal(rankAll([baseline,baseline],req).length,1);
});
test('HMAC signed links reject tampering and expiry',()=>{
  const secret='a'.repeat(40),value=sign({v:1,exp:10000,items:[]},secret);
  assert.equal(verify(value,secret,1000).v,1);
  assert.throws(()=>verify(value.slice(0,-2)+'zz',secret,1000));
  assert.throws(()=>verify(value,secret,10001));
});
test('TTL expires, bounds entries and deduplicates ongoing work',async()=>{
  let now=100;const c=new TTLCache(2,()=>now);c.set('a',1,10);now=110;assert.equal(c.get('a'),undefined);
  c.set('a',1,100);c.set('b',2,100);c.set('c',3,100);assert.equal(c.get('a'),undefined);
  let calls=0;const fn=async()=>{calls++;await new Promise(r=>setTimeout(r,10));return 8;};
  assert.deepEqual(await Promise.all([c.once('same',fn),c.once('same',fn)]),[8,8]);assert.equal(calls,1);
});
test('production requires explicitly configured HTTPS and persistent link signing secret',()=>{
  assert.throws(()=>loadConfig({NODE_ENV:'production'}),/PUBLIC_BASE_URL/);
  assert.throws(()=>loadConfig({NODE_ENV:'production',PUBLIC_BASE_URL:'https://test.example'}),/LINK_SIGNING_SECRET/);
  const c=loadConfig({NODE_ENV:'production',PUBLIC_BASE_URL:'https://test.example/foo',LINK_SIGNING_SECRET:'a'.repeat(40)});
  assert.equal(c.base,'https://test.example');
});

test('memory cache enforces a byte budget as well as entry count',()=>{
  const c=new TTLCache(100,Date.now,10);c.set('a',Buffer.alloc(8),1000);c.set('b',Buffer.alloc(8),1000);
  assert.equal(c.get('a'),undefined);assert.equal(c.get('b').length,8);assert.ok(c.bytes<=10);
});
test('reference synchronization refuses to run while disabled',async()=>{
  const {syncWithReference}=await import('../src/lib/sync.js');
  await assert.rejects(syncWithReference('invalid','invalid'),/reference_sync_disabled/);
});
