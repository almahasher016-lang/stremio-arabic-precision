import { requestJson, requestBytes, RateGate } from '../lib/network.js';
import {VERSION} from '../version.js';
const API='https://api.opensubtitles.com/api/v1';
const domains=['opensubtitles.com'];
const gate = new RateGate({interval:650,concurrency:2});
export function opensubtitles(config,transport={json:requestJson,bytes:requestBytes}) {
  const active=Boolean(config.opensubtitlesKey && config.opensubtitlesToken);
  const headers={'Api-Key':config.opensubtitlesKey,'Authorization':`Bearer ${config.opensubtitlesToken}`,'User-Agent':`StremioArabicPrecision v${VERSION}`};
  const query=async(params,signal)=>gate.run(()=>transport.json(`${API}/subtitles?${new URLSearchParams(params)}`,{signal,timeout:config.searchTimeout,domains,headers}),signal);
  return {name:'opensubtitles',active,
    async search(req,signal) {
      if(!active)return [];
      const params={languages:'ar',imdb_id:req.imdb.slice(2)};
      if(req.type==='series'){params.season_number=String(req.season);params.episode_number=String(req.episode);}
      const results=[];
      if(req.videoHash){const hashed=await query({...params,moviehash:req.videoHash},signal);results.push(...(hashed.data||[]).map(entry=>({...entry,_matchedHash:req.videoHash})));}
      if(!req.videoHash || results.length<3){const fallback=await query(params,signal);results.push(...(fallback.data||[]));}
      return results.flatMap(entry=>{
        const a=entry.attributes||{},f=a.feature_details||{};
        const imdb=f.parent_imdb_id||f.imdb_id;
        // Missing episode metadata is not proof of an exact episode match.
        const season=req.type==='series'?Number(f.season_number ?? a.season_number ?? NaN):null;
        const episode=req.type==='series'?Number(f.episode_number ?? a.episode_number ?? NaN):null;
        if(req.type==='series' && (!Number.isFinite(season)||!Number.isFinite(episode))) return [];
        return (a.files||[]).filter(file=>Number.isSafeInteger(file.file_id)).map(file=>({
          provider:'opensubtitles',id:String(file.file_id),imdb:imdb?`tt${String(imdb).replace(/^tt/,'')}`:req.imdb,
          lang: a.language==='ar'?'ara':a.language,season,episode,
          moviehash:a.moviehash||entry._matchedHash||'',videoSize:Number(a.moviebytesize)||null,
          release:file.file_name||a.release||'',downloads:a.download_count||0,
          hearingImpaired:Boolean(a.hearing_impaired),machineTranslated:Boolean(a.machine_translated),
          format:'srt',source:'api',
        }));
      });
    },
    async fetch(candidate,signal){
      const fileId=Number(candidate.id);if(!Number.isSafeInteger(fileId)||fileId<=0) throw new Error('bad_file_id');
      const result=await gate.run(()=>transport.json(`${API}/download`,{signal,timeout:config.downloadTimeout,domains,headers:{...headers,'Content-Type':'application/json'},method:'POST',body:JSON.stringify({file_id:fileId,sub_format:'srt'})}),signal);
      if(!result?.link) throw new Error('download_link_missing');
      return gate.run(()=>transport.bytes(result.link,{signal,timeout:config.downloadTimeout,maxBytes:config.maxDownloadBytes,domains}),signal);
    }
  };
}
