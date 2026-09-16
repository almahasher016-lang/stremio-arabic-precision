import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../src/app.js';
import {createEngine} from '../src/engine.js';
import {loadConfig} from '../src/lib/config.js';
const silent=()=>{};
test('manifest, episode search, signed download, provider failure fallback, invalid links',async()=>{
  const config={...loadConfig({LINK_SIGNING_SECRET:'q'.repeat(48),SEARCH_TIMEOUT_MS:'1000',REQUEST_DEADLINE_MS:'1200'}),port:0};
  const providers=[{name:'broken',active:true,search:async()=>{throw Error('fail');},fetch:async()=>{throw Error('fail');}},
    {name:'mock',active:true,search:async req=>[{provider:'mock',id:'A',imdb:req.imdb,lang:'ara',season:req.season,episode:req.episode,release:'Show.S01E01.WEB-DL.srt'}],fetch:async()=>Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nمرحبا\n')}];
  config.providers=['broken','mock'];const engine=createEngine(config,{providers,logger:silent});
  const {server}=createApp({config,engine,logger:silent});const http=server();http.listen(0,'127.0.0.1');await once(http,'listening');config.port=http.address().port;
  const base=`http://127.0.0.1:${config.port}`;
  try{
    const manifest=await fetch(`${base}/manifest.json`);assert.equal(manifest.status,200);assert.equal((await manifest.json()).version,'1.0.0');
    const listing=await fetch(`${base}/subtitles/series/tt1234567:1:1/filename=Show.S01E01.WEB-DL.mkv.json`);
    assert.equal(listing.status,200);const {subtitles}=await listing.json();assert.equal(subtitles.length,1);
    const url=subtitles[0].url.replace(`http://localhost:${config.port}`,base);
    const file=await fetch(url);assert.equal(file.status,200);assert.match(await file.text(),/مرحبا/);
    assert.equal((await fetch(url.replace(/\.srt$/,'x.srt'))).status,403);
    assert.equal((await fetch(`${base}/subtitles/series/tt1234567:1:2.json`)).status,200);
    assert.equal((await fetch(`${base}/subtitles/series/tt1234567.json`)).status,400);
    assert.equal((await fetch(`${base}/health`)).status,200);
  }finally{await new Promise(r=>http.close(r));}
});
test('all providers failing gives 503 rather than cached false negative',async()=>{
  const config={...loadConfig({}),port:0,providers:['broken']};
  const engine=createEngine(config,{providers:[{name:'broken',active:true,search:async()=>{throw Error('no');}}],logger:silent});
  const http=createApp({config,engine,logger:silent}).server();http.listen(0,'127.0.0.1');await once(http,'listening');
  try{assert.equal((await fetch(`http://127.0.0.1:${http.address().port}/subtitles/movie/tt1234567.json`)).status,503);}
  finally{await new Promise(r=>http.close(r));}
});
test('invalid subtitle is not cached and valid alternative is delivered',async()=>{
  const config={...loadConfig({}),port:0,providers:['mock']};let badFetches=0;
  const items=[{provider:'mock',id:'bad',imdb:'tt1234567',lang:'ara',season:null,episode:null,downloads:1000},{provider:'mock',id:'good',imdb:'tt1234567',lang:'ara',season:null,episode:null}];
  const engine=createEngine(config,{providers:[{name:'mock',active:true,search:async()=>items,fetch:async c=>c.id==='bad'?(badFetches++,Buffer.from('invalid subtitles')):Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nمرحبا\n')}],logger:silent});
  const http=createApp({config,engine,logger:silent}).server();http.listen(0,'127.0.0.1');await once(http,'listening');config.port=http.address().port;
  try{
    const origin=`http://127.0.0.1:${config.port}`;
    const listing=await (await fetch(`${origin}/subtitles/movie/tt1234567.json`)).json();
    const file=await fetch(listing.subtitles[0].url.replace('http://localhost', 'http://127.0.0.1'));
    assert.equal(file.status,200);assert.match(await file.text(),/مرحبا/);assert.equal(badFetches,1);
  }finally{await new Promise(r=>http.close(r));}
});
