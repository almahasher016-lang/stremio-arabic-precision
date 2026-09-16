import test from 'node:test';
import assert from 'node:assert/strict';
import {opensubtitles} from '../src/providers/opensubtitles.js';
import {subdl} from '../src/providers/subdl.js';
import {subsource} from '../src/providers/subsource.js';
import {parseIdentity} from '../src/lib/identity.js';
const req=parseIdentity('series','tt1234567:1:3',{filename:'Example.S01E03.WEB-DL.mkv'});
const config={opensubtitlesKey:'key',opensubtitlesToken:'token',subdlKey:'key',subsourceKey:'key',subsourceBase:'https://api.subsource.net/api/v1',searchTimeout:1000,downloadTimeout:1000,maxDownloadBytes:300000};
test('OpenSubtitles search uses episode and extracts exact file_id, download posts authenticated id',async()=>{
  const calls=[];
  const p=opensubtitles(config,{json:async(url,opts)=>{calls.push({url,opts});return url.endsWith('/download')?{link:'https://dl.opensubtitles.com/file.srt'}:{data:[{attributes:{language:'ar',feature_details:{parent_imdb_id:1234567,season_number:1,episode_number:3},files:[{file_id:123,file_name:'Example.S01E03.srt'}]}}]};},bytes:async()=>Buffer.from('abc')});
  const found=await p.search(req);assert.equal(found[0].id,'123');assert.match(calls[0].url,/episode_number=3/);
  await p.fetch(found[0]);assert.match(calls[1].opts.body,/"file_id":123/);
});
test('SubDL maps unpacked episode and refuses unexpected languages',async()=>{
  const p=subdl(config,{json:async()=>({status:true,results:[{imdb_id:req.imdb}],subtitles:[{season:1,episode:3,release_name:'Example',unpack_files:[{file_n_id:'a',language:'AR',season:1,episode:3,url:'/subtitle/abc/file'},{file_n_id:'b',language:'EN',season:1,episode:3,url:'/subtitle/abc/other'}]}]}),bytes:async()=>Buffer.from('abc')});
  const found=await p.search(req);assert.equal(found.length,1);assert.equal(found[0].id,'a');
  assert.equal((await p.fetch(found[0])).toString(),'abc');
});
test('Subsource resolves IMDb with documented parameter names then exact episode',async()=>{
  const urls=[];
  const p=subsource(config,{json:async(url)=>{urls.push(url);return urls.length===1?{data:[{id:99,imdbId:req.imdb}]}:{data:[{id:90,season:1,episode:3,release_name:'Example.S01E03.ar.srt'},{id:91,season:1,episode:2}]};},bytes:async()=>Buffer.from('abc')});
  const found=await p.search(req);assert.equal(found.length,1);assert.equal(found[0].id,'90');
  assert.match(urls[0],/searchType=imdb/);assert.match(urls[1],/movieId=99/);
  assert.equal((await p.fetch(found[0])).toString(),'abc');
});
