import test from 'node:test';
import assert from 'node:assert/strict';
import {stremioV3} from '../src/providers/stremio-v3.js';
import {parseIdentity} from '../src/lib/identity.js';
import {rankAll} from '../src/lib/rank.js';
const cfg={searchTimeout:1000,downloadTimeout:1000,maxDownloadBytes:500000};
test('official Stremio v3 maps only Arabic, restricts downloads to strem.io HTTPS',async()=>{
  const calls=[];
  const provider=stremioV3(cfg,{json:async(url)=>{calls.push(url);return {subtitles:[
    {id:'a',lang:'ara',url:'https://subs5.strem.io/file.srt',subtitleFileName:'Inception.ar.srt'},
    {id:'b',lang:'eng',url:'https://subs5.strem.io/file2.srt'},
    {id:'c',lang:'ara',url:'https://evil.example/secret.srt'}
  ]};},bytes:async(url)=>{calls.push(url);return Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nمرحبا\n');}});
  const req=parseIdentity('movie','tt1375666');
  const found=await provider.search(req);
  assert.equal(found.length,1);assert.equal(found[0].lang,'ara');
  assert.match(calls[0],/subtitles\/movie\/tt1375666\.json/);
  await provider.fetch(found[0]);assert.equal(calls[1],'https://subs5.strem.io/file.srt');
});
test('official episode search rejects any mismatched episode',async()=>{
  const provider=stremioV3(cfg,{json:async()=>({subtitles:[
    {id:'a',lang:'ara',url:'https://subs5.strem.io/a.srt',season:1,episode:2},
    {id:'b',lang:'ara',url:'https://subs5.strem.io/b.srt',season:1,episode:3}
  ]}),bytes:async()=>Buffer.alloc(0)});
  assert.deepEqual((await provider.search(parseIdentity('series','tt0903747:1:3'))).map(x=>x.id),['b']);
});
test('official Stremio fallback stays ahead of unverified SubDL while hashes remain highest',()=>{
 const req=parseIdentity('movie','tt1375666',{videoHash:'aaaaaaaaaaaaaaaa'});
 const list=rankAll([
  {provider:'subdl',id:'1',imdb:req.imdb,lang:'ara',release:'Inception',season:null,episode:null},
  {provider:'stremio_v3',id:'2',imdb:req.imdb,lang:'ara',release:'',season:null,episode:null}
 ],req);
 assert.equal(list[0].provider,'stremio_v3');
});
