import {createHash,randomUUID} from 'node:crypto';
import {TTLCache} from './lib/cache.js';
import {DiskCache} from './lib/disk-cache.js';
import {rankAll} from './lib/rank.js';
import {processSubtitle,TRANSFORM_VERSION} from './lib/subtitle.js';
import {log} from './lib/log.js';
import {opensubtitles} from './providers/opensubtitles.js';
import {subdl} from './providers/subdl.js';
import {subsource} from './providers/subsource.js';
import {stremioV3} from './providers/stremio-v3.js';
const digest = object=>createHash('sha256').update(JSON.stringify(object)).digest('hex');
export function createEngine(config,{providers,logger=log}={}) {
  const all=providers || [opensubtitles(config),subdl(config),subsource(config),stremioV3(config)];
  const enabled=all.filter(provider=>config.providers.includes(provider.name)&&provider.active);
  const searchCache=new TTLCache(1200,Date.now,16*1048576),rawCache=new TTLCache(100,Date.now,32*1048576),processedCache=new TTLCache(100,Date.now,32*1048576);
  const disk=new DiskCache(config.dataDir,{ttl:config.contentTTL,maxBytes:config.maxDownloadBytes});
  const ready=disk.init();
  async function search(req,{correlationId=randomUUID()}={}) {
    const key=digest({v:2,req,providers:enabled.map(p=>p.name)});
    const cached=searchCache.get(key);if(cached!==undefined)return cached;
    return searchCache.once(key,async()=>{
      const deadline=AbortSignal.timeout(config.deadline);
      const jobs=enabled.map(async p=>{
        const start=Date.now();
        try{const results=await p.search(req,deadline);if(!Array.isArray(results))throw new Error('invalid_provider_result');
          logger('info','provider_search',{correlationId,provider:p.name,status:'ok',count:results.length,ms:Date.now()-start});return {ok:true,items:results};
        } catch(err){logger('warn','provider_search',{correlationId,provider:p.name,status:err.code||err.name||'error',ms:Date.now()-start});return {ok:false,items:[]};}
      });
      const outcomes=await Promise.all(jobs);
      const ok=outcomes.filter(x=>x.ok).length;
      if(enabled.length>0&&!ok)throw new Error('all_providers_failed');
      const ranked=rankAll(outcomes.flatMap(x=>x.items),req,config.maxSubtitles);
      // Partial failure is never recorded as a durable negative cache.
      const ttl=ok===enabled.length?(ranked.length?config.searchTTL:config.negativeTTL):Math.min(5000,config.negativeTTL);
      searchCache.set(key,ranked,ttl);
      logger('info','search_complete',{correlationId,providers:enabled.length,successful:ok,candidates:ranked.length});
      return ranked;
    });
  }
  async function fetchOne(candidate,req,{correlationId=randomUUID(),signal}={}) {
    const provider=enabled.find(p=>p.name===candidate?.provider);
    if(!provider||!candidate?.id)throw new Error('invalid_candidate');
    const key=digest({v:1,provider:candidate.provider,id:candidate.id,locator:candidate.locator||''});
    let fromProvider=false;
    const existing=rawCache.get(key);
    const raw=existing||await rawCache.once(key,async()=>{
      const persisted=await disk.get(`${TRANSFORM_VERSION}:${key}`);
      if(persisted)return persisted;
      const bytes=await provider.fetch(candidate,signal);
      if(!Buffer.isBuffer(bytes)||bytes.length>config.maxDownloadBytes)throw new Error('invalid_download');
      fromProvider=true;return bytes;
    });
    const processedKey=digest({v:TRANSFORM_VERSION,original:createHash('sha256').update(raw).digest('hex'),content:req.id,season:req.season,episode:req.episode,format:candidate.format||''});
    let processed=processedCache.get(processedKey);
    if(!processed){
      try{processed=processSubtitle(raw,req,candidate.format);}
      catch(err){rawCache.drop(key);await disk.drop(`${TRANSFORM_VERSION}:${key}`).catch(()=>{});throw err;}
      processedCache.set(processedKey,processed,config.contentTTL);
    }
    rawCache.set(key,raw,config.contentTTL);
    if(fromProvider)await disk.set(`${TRANSFORM_VERSION}:${key}`,raw).catch(err=>logger('warn','disk_cache_write_failed',{correlationId,status:err.code||'error'}));
    logger('info','subtitle_ready',{correlationId,provider:provider.name,cues:processed.count,encoding:processed.encoding});
    return processed;
  }
  return {enabled:enabled.map(x=>x.name),ready,search,fetchOne};
}
