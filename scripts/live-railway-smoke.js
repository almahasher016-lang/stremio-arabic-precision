// A one-shot Railway pre-deploy check. Never print credentials, signed URLs or subtitle text.
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/lib/config.js';
import {verify} from '../src/lib/tokens.js';
const cfg=loadConfig();
const app=createApp({config:cfg});
await app.engine.ready;
const server=app.server();
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const base=`http://127.0.0.1:${server.address().port}`;
const results=[];
const read=async path=>{const response=await fetch(`${base}${path}`,{signal:AbortSignal.timeout(20000)});return {status:response.status,body:await response.text()};};
try {
  const health=await read('/health');
  const h=JSON.parse(health.body);
  if(health.status!==200||h.providerCount<1)throw Error('health_not_ready');
  results.push({route:'health',status:health.status,providers:h.providerCount});
  const manifest=await read('/manifest.json');
  const m=JSON.parse(manifest.body);
  if(manifest.status!==200||!m.resources?.includes('subtitles'))throw Error('invalid_manifest');
  results.push({route:'manifest',status:manifest.status});
  try {
    const upstream=await fetch('https://opensubtitles-v3.strem.io/subtitles/movie/tt0133093.json',{signal:AbortSignal.timeout(12000)});
    const data=await upstream.json();
    const subtitles=Array.isArray(data.subtitles)?data.subtitles:[];
    const arabic=subtitles.filter(s=>['ar','ara','arabic'].includes(String(s.lang||'').toLowerCase()));
    results.push({route:'official_stremio_source',status:upstream.status,total:subtitles.length,arabic:arabic.length,languages:[...new Set(subtitles.map(s=>String(s.lang||s.language||'?')))].slice(0,30),sampleFields:subtitles.length?Object.keys(subtitles[0]):[],downloadHosts:[...new Set(subtitles.slice(0,5).map(s=>{try{return new URL(s.url).hostname;}catch{return 'invalid_url';}}))]});
    const more=await fetch('https://opensubtitles-v3.strem.io/subtitles/movie/tt1375666.json',{signal:AbortSignal.timeout(12000)});
    const extra=await more.json();
    results.push({route:'official_stremio_inception',status:more.status,total:extra.subtitles?.length||0,arabic:extra.subtitles?.filter(s=>['ar','ara','arabic'].includes(String(s.lang||'').toLowerCase())).length||0});
  } catch(error){results.push({route:'official_stremio_source',error:error.name||'error'});}
  let verified=false;
  for(const path of ['/subtitles/movie/tt0133093.json','/subtitles/series/tt0903747:1:1.json']){
    const response=await read(path);
    const parsed=JSON.parse(response.body);
    const candidates=parsed.subtitles||[];
    results.push({route:path.includes('/movie/')?'movie':'series',status:response.status,candidates:candidates.length});
    if(response.status!==200||!Array.isArray(candidates))throw Error('provider_search_failed');
    if(!verified&&candidates.length){
      const signed=new URL(candidates[0].url);
      if(signed.origin!==cfg.base||!signed.pathname.startsWith('/file/'))throw Error('untrusted_subtitle_link');
      if(cfg.subdlKey){
        try {
          const account=await fetch('https://api.subdl.com/api/v2/me',{headers:{Authorization:`Bearer ${cfg.subdlKey}`},signal:AbortSignal.timeout(12000)});
          const info=await account.json();
          results.push({route:'subdl_account',status:account.status,plan:info.plan?.name,downloadsRemaining:info.usage?.downloads?.remaining});
          const token=signed.pathname.split('/')[2].replace(/\.srt$/,'');
          const source=verify(token,cfg.secret).items[0];
          if(source?.provider==='subdl'){
            const parent=new URL(source.locator,'https://dl.subdl.com').pathname.split('/')[2];
            const upstream=await fetch(`https://api.subdl.com/api/v2/subtitles/${encodeURIComponent(parent)}/download?format=file`,{headers:{Authorization:`Bearer ${cfg.subdlKey}`},redirect:'manual',signal:AbortSignal.timeout(12000)});
            const contentType=(upstream.headers.get('content-type')||'').split(';')[0];
            let jsonKeys=[];
            if(upstream.ok && contentType.includes('json')){
              const json=await upstream.json();jsonKeys=Object.keys(json||{});
            }else await upstream.body?.cancel();
            results.push({route:'subdl_official_download',status:upstream.status,contentType,redirectHost:upstream.headers.has('location')?new URL(upstream.headers.get('location'),'https://api.subdl.com').hostname:null,jsonKeys});
          }
        }catch(error){results.push({route:'subdl_diagnostics',error:error.name||'error'});}
      }
      const downloaded=await read(signed.pathname);
      const arabic=/[\u0600-\u06ff]/u.test(downloaded.body);
      const cues=/\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/.test(downloaded.body);
      results.push({route:'subtitle_download',status:downloaded.status,arabic,cues,bytes:Buffer.byteLength(downloaded.body)});
      if(downloaded.status!==200||!arabic||!cues)throw Error('subtitle_download_not_usable');
      verified=true;
    }
  }
  if(!verified)throw Error('no_live_arabic_subtitles');
  console.log(JSON.stringify({event:'live_smoke',status:'pass',checks:results}));
} catch(error) {
  console.error(JSON.stringify({event:'live_smoke',status:'fail',reason:/^[a-z_]+$/.test(error.message||'')?error.message:error.code||error.name||'error',checks:results}));
  process.exitCode=1;
} finally {
  await new Promise(resolve=>server.close(resolve));
}
