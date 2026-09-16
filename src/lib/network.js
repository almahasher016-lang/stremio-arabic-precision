export class ProviderError extends Error {
  constructor(code, status = 0, retryAfterMs = 0) {super(code); this.code=code;this.status=status;this.retryAfterMs=retryAfterMs;}
}
export function allowedUrl(raw, domains) {
  let url; try {url=new URL(raw);} catch {throw new ProviderError('invalid_url');}
  if(url.protocol!=='https:'||url.username||url.password||url.port && url.port!=='443'||!domains.some(host=>url.hostname===host||url.hostname.endsWith(`.${host}`))) throw new ProviderError('blocked_url');
  return url;
}
const retryAfterMs = h => {if(!h) return 0;const n=Number(h);return Number.isFinite(n)?Math.min(Math.max(n*1000,0),60000):Math.min(Math.max(Date.parse(h)-Date.now(),0)||0,60000);};
export async function requestBytes(raw,{signal,timeout=8000,maxBytes=5242880,domains,headers={},method='GET',body,fetchImpl=fetch}={}) {
  if(!domains?.length) throw new ProviderError('no_allowed_domains');
  let url=allowedUrl(raw,domains);
  let requestHeaders={...headers};
  const timeoutSignal=AbortSignal.timeout(timeout), combined=signal?AbortSignal.any([signal,timeoutSignal]):timeoutSignal;
  for(let redirect=0;redirect<=3;redirect++) {
    const previousHostname=url.hostname;
    const response=await fetchImpl(url,{method,headers:requestHeaders,body,signal:combined,redirect:'manual'});
    if([301,302,303,307,308].includes(response.status)) {
      const loc=response.headers.get('location'); if(!loc||redirect===3) throw new ProviderError('redirect_rejected',response.status);
      url=allowedUrl(new URL(loc,url).toString(),domains);
      // Never forward secrets when a trusted provider redirects to another hostname.
      if(url.hostname!==previousHostname) requestHeaders=Object.fromEntries(Object.entries(requestHeaders).filter(([key])=>!/authorization|api.?key|token/i.test(key)));
      if(response.status===303){method='GET';body=undefined;}
      await response.body?.cancel();continue;
    }
    if(response.status===429) {await response.body?.cancel();throw new ProviderError('rate_limited',429,retryAfterMs(response.headers.get('retry-after')));}
    if(!response.ok) {await response.body?.cancel();throw new ProviderError(response.status===401||response.status===403?'authentication_failed':'upstream_http_error',response.status);}
    const declared=Number(response.headers.get('content-length')||0);
    if(declared>maxBytes) {await response.body?.cancel();throw new ProviderError('response_too_large');}
    if(!response.body) return Buffer.alloc(0);
    const reader=response.body.getReader();const chunks=[];let size=0;
    try {while(true){const {value,done}=await reader.read();if(done) break; size+=value.byteLength;if(size>maxBytes) throw new ProviderError('response_too_large');chunks.push(value);}}
    catch(e){await reader.cancel().catch(()=>{});throw e;}
    return Buffer.concat(chunks,size);
  }
  throw new ProviderError('redirect_rejected');
}
export async function requestJson(url,opts={}) {
  const buffer=await requestBytes(url,{...opts,maxBytes:Math.min(opts.maxBytes||1048576,1048576),headers:{accept:'application/json',...(opts.headers||{})}});
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));}catch{throw new ProviderError('malformed_json');}
}
export class RateGate {
  constructor({interval=500, concurrency=2, maxQueued=50,now=Date.now}={}) {
    this.interval=interval;this.concurrency=concurrency;this.maxQueued=maxQueued;this.now=now;this.next=0;this.active=0;this.queue=[];this.pausedUntil=0;this.timer=null;
  }
  pause(ms){this.pausedUntil=Math.max(this.pausedUntil,this.now()+ms);this.pump();}
  run(fn,signal){
    if(signal?.aborted)return Promise.reject(signal.reason);
    if(this.queue.length>=this.maxQueued)return Promise.reject(new ProviderError('queue_full'));
    return new Promise((resolve,reject)=>{
      const job={fn,signal,resolve,reject,started:false};
      job.onAbort=()=>{if(job.started)return;this.queue=this.queue.filter(x=>x!==job);reject(signal.reason);};
      signal?.addEventListener('abort',job.onAbort,{once:true});this.queue.push(job);this.pump();
    });
  }
  pump(){
    if(this.timer){clearTimeout(this.timer);this.timer=null;}
    if(this.active>=this.concurrency||!this.queue.length)return;
    const delay=Math.max(0,this.next-this.now(),this.pausedUntil-this.now());
    if(delay){this.timer=setTimeout(()=>{this.timer=null;this.pump();},delay);return;}
    const job=this.queue.shift();job.started=true;job.signal?.removeEventListener('abort',job.onAbort);
    if(job.signal?.aborted){job.reject(job.signal.reason);this.pump();return;}
    this.active++;this.next=this.now()+this.interval;
    Promise.resolve().then(job.fn).then(job.resolve,err=>{if(err?.retryAfterMs)this.pause(err.retryAfterMs);job.reject(err);}).finally(()=>{this.active--;this.pump();});
    this.pump();
  }
}
