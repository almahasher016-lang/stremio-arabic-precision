import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {loadConfig} from './lib/config.js';
import {parseIdentity} from './lib/identity.js';
import {sign,verify} from './lib/tokens.js';
import {createEngine} from './engine.js';
import {log} from './lib/log.js';
import {VERSION} from './version.js';
const manifest={id:'com.m7md.arabicprecision',version:VERSION,name:'Arabic Precision Subtitles',description:'Arabic-first subtitle search with release matching and safe UTF-8 normalization',resources:['subtitles'],types:['movie','series'],idPrefixes:['tt'],catalogs:[],behaviorHints:{configurable:false}};
const write=(res,status,payload,contentType='application/json; charset=utf-8',headers={})=>{
  if(res.destroyed)return;
  res.writeHead(status,{'Content-Type':contentType,'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,HEAD,OPTIONS','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});
  res.end(typeof payload==='string'||Buffer.isBuffer(payload)?payload:JSON.stringify(payload));
};
function parseRequest(url) {
  const match=/^\/subtitles\/(movie|series)\/([^/]+?)(?:\/([^/]+))?\.json$/.exec(url.pathname);
  if(!match)return null;
  const extras=new URLSearchParams((match[3]||'').replace(/\+/g,'%20'));
  for(const [k,v] of url.searchParams)extras.set(k,v);
  return parseIdentity(match[1],decodeURIComponent(match[2]),{
    videoHash:extras.get('videoHash')||extras.get('video_hash')||'',
    videoSize:extras.get('videoSize')||'',filename:extras.get('filename')||'',
  });
}
export function createApp({config=loadConfig(),engine=createEngine(config),logger=log}={}) {
  const handler=async(req,res)=>{
    const correlationId=randomUUID();res.setHeader('X-Request-ID',correlationId);
    try {
      if(req.method==='OPTIONS')return write(res,204,'');
      if(!['GET','HEAD'].includes(req.method))return write(res,405,{error:'method_not_allowed'});
      const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
      if(url.pathname==='/health')return write(res,config.production&&!engine.enabled.length?503:200,{status:engine.enabled.length?'ok':'no_providers_configured',version:VERSION,providerCount:engine.enabled.length});
      if(url.pathname==='/manifest.json')return write(res,200,manifest,'application/json; charset=utf-8',{'Cache-Control':'public, max-age=3600'});
      if(url.pathname==='/')return write(res,200,{name:manifest.name,version:VERSION,install:`${config.base||`http://localhost:${config.port}`}/manifest.json`});
      if(url.pathname.startsWith('/file/')){
        const match=/^\/file\/([A-Za-z0-9_.-]+)\.srt$/.exec(url.pathname);
        if(!match)return write(res,404,{error:'not_found'});
        let payload;try{payload=verify(match[1],config.secret);}catch{return write(res,403,{error:'invalid_or_expired_link'});}
        if(payload.v!==1||!payload.req||!Array.isArray(payload.items)||payload.items.length>3)return write(res,403,{error:'invalid_link'});
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),config.downloadTimeout*3);
        const onClose=()=>{if(!res.writableEnded)controller.abort();};res.once('close',onClose);
        try {
          for(const item of payload.items){
            try {const result=await engine.fetchOne(item,payload.req,{correlationId,signal:controller.signal});
              return write(res,200,result.srt,'application/x-subrip; charset=utf-8',{'Cache-Control':'private, max-age=600','Content-Disposition':'inline; filename="subtitle.srt"'});
            } catch(err) {logger('warn','download_failed',{correlationId,provider:item?.provider||'unknown',status:err.code||err.name||'error'});if(controller.signal.aborted)break;}
          }
          return write(res,502,{error:'all_candidate_downloads_failed',correlationId});
        }finally{clearTimeout(timer);res.off('close',onClose);}
      }
      let identity;
      try{identity=parseRequest(url);}catch{return write(res,400,{error:'invalid_video_identity'});}
      if(!identity)return write(res,404,{error:'not_found'});
      if(req.url.length>1600)return write(res,414,{error:'request_too_long'});
      const start=Date.now();
      try{
        const candidates=await engine.search(identity,{correlationId});
        const base=config.base||`http://localhost:${config.port}`;
        const subtitles=candidates.map((item,index)=>{
          const token=sign({v:1,exp:Date.now()+20*60*1000,req:identity,items:candidates.slice(index,index+3).map(({score,...c})=>c)},config.secret);
          return {id:`arabic-precision-${item.provider}-${item.id}`,lang:'ara',url:`${base}/file/${token}.srt`};
        });
        logger('info','request_finished',{correlationId,status:200,count:subtitles.length,ms:Date.now()-start});
        return write(res,200,{subtitles},'application/json; charset=utf-8',{'Cache-Control':'public, max-age=60'});
      }catch(err){logger('error','search_failed',{correlationId,status:err.message||'error'});return write(res,503,{subtitles:[],error:'providers_unavailable',correlationId});}
    }catch(err){logger('error','unhandled',{correlationId,status:err.name||'error'});return write(res,500,{error:'internal_error',correlationId});}
  };
  return {manifest,engine,handler,server:()=>createServer(handler)};
}
