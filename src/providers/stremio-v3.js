import {requestJson,requestBytes,allowedUrl,RateGate} from '../lib/network.js';
const allowedDomains=['strem.io'];
const API='https://opensubtitles-v3.strem.io';
const gate=new RateGate({interval:450,concurrency:2});
const arabic = lang => ['ar','ara','arabic'].includes(String(lang||'').toLowerCase());
// The official Stremio OpenSubtitles v3 addon does not require exposing API credentials.
export function stremioV3(config,transport={json:requestJson,bytes:requestBytes}) {
  return {name:'stremio_v3',active:true,
    async search(req,signal){
      const url=`${API}/subtitles/${req.type}/${req.id}.json`;
      const data=await gate.run(()=>transport.json(url,{signal,timeout:config.searchTimeout,domains:allowedDomains}),signal);
      if(!Array.isArray(data?.subtitles))throw new Error('invalid_stremio_result');
      return data.subtitles.flatMap(sub=>{
        if(!arabic(sub.lang || sub.language)||typeof sub.url!=='string')return [];
        let download;try{download=allowedUrl(sub.url,allowedDomains).toString();}catch{return [];}
        const season=req.type==='series'?Number(sub.season??req.season):null;
        const episode=req.type==='series'?Number(sub.episode??req.episode):null;
        if(req.type==='series' && (season!==req.season||episode!==req.episode))return [];
        const release=String(sub.movieReleaseName||sub.subtitleFileName||'').slice(0,250);
        const filename=String(sub.subtitleFileName||'');
        return [{provider:'stremio_v3',id:String(sub.id||download),imdb:req.imdb,lang:'ara',season,episode,
          release,locator:download,format:/\.(srt|vtt|ass|ssa)(?:$|\?)/i.exec(filename||download)?.[1]?.toLowerCase()||'',
          downloads:0,hearingImpaired:/\b(sdh|hearing.?impaired)\b/i.test(filename),machineTranslated:false,
          moviehash:'',videoSize:null}];
      });
    },
    async fetch(candidate,signal){
      const url=allowedUrl(candidate.locator,allowedDomains).toString();
      return gate.run(()=>transport.bytes(url,{signal,timeout:config.downloadTimeout,maxBytes:config.maxDownloadBytes,domains:allowedDomains}),signal);
    }
  };
}
