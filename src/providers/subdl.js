import {requestJson,requestBytes,RateGate} from '../lib/network.js';
const domains=['subdl.com'];const API='https://api.subdl.com/api/v2';
const gate=new RateGate({interval:400,concurrency:2});
export function subdl(config,transport={json:requestJson,bytes:requestBytes}) {
  const active=Boolean(config.subdlKey),headers={Authorization:`Bearer ${config.subdlKey}`};
  return {name:'subdl',active,
    async search(req,signal) {
      if(!active)return [];
      const p=new URLSearchParams({imdb_id:req.imdb,languages:'ar',type:req.type==='movie'?'movie':'tv',subs_per_page:'30',unpack:'1'});
      if(req.type==='series'){p.set('season',String(req.season));p.set('episode',String(req.episode));}
      const response=await gate.run(()=>transport.json(`${API}/subtitles/search?${p}`,{signal,timeout:config.searchTimeout,domains,headers}),signal);
      if(response.status===false) throw new Error('provider_status_false');
      const feature=(response.results||[])[0];
      if(feature?.imdb_id && feature.imdb_id!==req.imdb) return [];
      return (response.subtitles||[]).flatMap(sub=>{
        const children=Array.isArray(sub.unpack_files)&&sub.unpack_files.length?sub.unpack_files:[sub];
        return children.map(file=>{
          const language=String(file.language||file.lang||sub.language||sub.lang||'ar').toLowerCase();
          if(!['ar','ara','arabic'].includes(language))return null;
          const season=Number(file.season ?? sub.season),episode=Number(file.episode ?? sub.episode ?? (sub.full_season ? req.episode : NaN));
          if(req.type==='series'&&(!Number.isFinite(season)||!Number.isFinite(episode)))return null;
          const raw=String(file.url||sub.url||'');
          // The URL is only persisted as an opaque provider locator, never trusted as arbitrary URL.
          if(!raw || !raw.startsWith('/subtitle/') && !/^https:\/\/dl\.subdl\.com\/subtitle\//.test(raw))return null;
          return {provider:'subdl',id:String(file.file_n_id||sub.n_id||sub.id||raw),imdb:req.imdb,lang:'ara',
            season:req.type==='series'?season:null,episode:req.type==='series'?episode:null,
            release:file.release_name||file.name||sub.release_name||sub.name||'',downloads:sub.downloads||0,
            format:String(file.format||sub.format||'').toLowerCase(),locator:raw,
            hearingImpaired:Boolean(file.hi??sub.hi),moviehash:'',videoSize:null};
        }).filter(Boolean);
      });
    },
    async fetch(candidate,signal){
      const url=candidate.locator.startsWith('/')?`https://dl.subdl.com${candidate.locator}`:candidate.locator;
      return gate.run(()=>transport.bytes(url,{signal,timeout:config.downloadTimeout,maxBytes:config.maxDownloadBytes,domains,headers:{'x-api-key':config.subdlKey}}),signal);
    }
  };
}
