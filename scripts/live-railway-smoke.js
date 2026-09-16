// One-shot deployment verification; never print secrets, signed links, or subtitle text.
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/lib/config.js';
const cfg=loadConfig();
const app=createApp({config:cfg});
await app.engine.ready;
const server=app.server();
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const base=`http://127.0.0.1:${server.address().port}`;
const checks=[];
const read=async path=>{const response=await fetch(`${base}${path}`,{signal:AbortSignal.timeout(20000)});return {status:response.status,body:await response.text()};};
try {
  const health=await read('/health');
  const h=JSON.parse(health.body);
  if(health.status!==200||h.providerCount<1)throw Error('health_not_ready');
  checks.push({route:'health',status:health.status,providers:h.providerCount});
  const manifest=await read('/manifest.json');
  const m=JSON.parse(manifest.body);
  if(manifest.status!==200||!m.resources?.includes('subtitles'))throw Error('invalid_manifest');
  checks.push({route:'manifest',status:manifest.status});
  let verified=false;
  for(const path of ['/subtitles/movie/tt0133093.json','/subtitles/series/tt0903747:1:1.json']){
    const response=await read(path);
    const parsed=JSON.parse(response.body);
    const candidates=parsed.subtitles||[];
    checks.push({route:path.includes('/movie/')?'movie':'series',status:response.status,candidates:candidates.length});
    if(response.status!==200||!Array.isArray(candidates))throw Error('provider_search_failed');
    if(!verified&&candidates.length){
      const signed=new URL(candidates[0].url);
      if(signed.origin!==cfg.base||!signed.pathname.startsWith('/file/'))throw Error('untrusted_subtitle_link');
      const downloaded=await read(signed.pathname);
      const arabic=/[\u0600-\u06ff]/u.test(downloaded.body);
      const cues=/\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/.test(downloaded.body);
      checks.push({route:'subtitle_download',status:downloaded.status,arabic,cues,bytes:Buffer.byteLength(downloaded.body)});
      if(downloaded.status!==200||!arabic||!cues)throw Error('subtitle_download_not_usable');
      verified=true;
    }
  }
  if(!verified)throw Error('no_live_arabic_subtitles');
  console.log(JSON.stringify({event:'live_smoke',status:'pass',checks}));
} catch(error) {
  console.error(JSON.stringify({event:'live_smoke',status:'fail',reason:/^[a-z_]+$/.test(error.message||'')?error.message:error.code||error.name||'error',checks}));
  process.exitCode=1;
} finally {
  await new Promise(resolve=>server.close(resolve));
}
