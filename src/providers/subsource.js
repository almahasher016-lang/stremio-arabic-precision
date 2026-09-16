import {requestJson,requestBytes,RateGate} from '../lib/network.js';
const domains=['subsource.net'];const gate=new RateGate({interval:1100,concurrency:1});
const entries = response => { const value=Array.isArray(response)?response:(response?.data?.items||response?.data?.results||response?.data?.movies||response?.data?.subtitles||response?.data||response?.results||response?.movies||response?.subtitles||[]); return Array.isArray(value)?value:(value&&typeof value==='object'&&value.id?[value]:[]); };
export function subsource(config,transport={json:requestJson,bytes:requestBytes}) {
  const active=Boolean(config.subsourceKey);const base=config.subsourceBase.replace(/\/$/,'');
  const headers={'X-API-Key':config.subsourceKey};
  const json=(url,signal)=>gate.run(()=>transport.json(url,{signal,timeout:config.searchTimeout,domains,headers}),signal);
  return {name:'subsource',active,
    async search(req,signal) {
      if(!active)return [];
      // Resolve the title by its IMDb identity; do not guess a title from the raw ID.
      const found=entries(await json(`${base}/movies/search?${new URLSearchParams({searchType:'imdb',imdb:req.imdb})}`,signal));
      const movie=found.find(x=>String(x.imdb_id||x.imdbId||x.imdb||'')===req.imdb);
      if(!(movie?.id||movie?.movieId)) return [];
      const movieId=movie.id||movie.movieId;
      const response=await json(`${base}/subtitles?${new URLSearchParams({movieId:String(movieId),language:'arabic',limit:'100'})}`,signal);
      return entries(response).map(sub=>{
        const language=String(sub.language?.name||sub.language||'arabic').toLowerCase();
        if(!['ar','ara','arabic'].includes(language))return null;
        const episodeTag=/s(\d{1,3})e(\d{1,3})/i.exec(sub.release_name||sub.release||sub.filename||'');
        const s=Number(sub.season??sub.season_number??episodeTag?.[1]);
        const e=Number(sub.episode??sub.episode_number??episodeTag?.[2]??(sub.full_season?req.episode:NaN));
        if(req.type==='series'&&(!Number.isFinite(s)||!Number.isFinite(e)))return null;
        if(!sub.id) return null;
        return {provider:'subsource',id:String(sub.id),imdb:req.imdb,lang:'ara',season:req.type==='series'?s:null,episode:req.type==='series'?e:null,
          release:sub.release_name||sub.release||sub.filename||'',downloads:sub.downloads||0,
          hearingImpaired:Boolean(sub.hearing_impaired),machineTranslated:Boolean(sub.machine_translated),
          moviehash:'',videoSize:null,format:sub.format||''};
      }).filter(Boolean).filter(x=>req.type!=='series'||x.season===req.season&&x.episode===req.episode);
    },
    async fetch(candidate,signal){
      if(!/^\d+$/.test(candidate.id))throw new Error('invalid_subtitle_id');
      return gate.run(()=>transport.bytes(`${base}/subtitles/${candidate.id}/download`,{signal,timeout:config.downloadTimeout,maxBytes:config.maxDownloadBytes,domains,headers}),signal);
    }
  };
}
