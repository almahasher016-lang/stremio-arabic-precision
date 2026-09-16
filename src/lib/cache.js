export class TTLCache {
  constructor(max = 1500, now = Date.now, maxBytes = Infinity) {
    this.map = new Map(); this.max = max; this.now = now; this.maxBytes=maxBytes;
    this.bytes=0; this.inflight=new Map();
  }
  drop(key) {const item=this.map.get(key);if(item){this.bytes-=item.size;this.map.delete(key);}}
  get(key) {
    const item=this.map.get(key);if(!item)return undefined;
    if(item.expires<=this.now()){this.drop(key);return undefined;}
    this.map.delete(key);this.map.set(key,item);return item.value;
  }
  set(key,value,ttl){
    if(ttl<=0)return;
    this.drop(key);
    const size=Buffer.isBuffer(value)?value.length:typeof value==='string'?Buffer.byteLength(value):Buffer.byteLength(JSON.stringify(value));
    if(size>this.maxBytes)return;
    this.map.set(key,{value,expires:this.now()+ttl,size});this.bytes+=size;
    while(this.map.size>this.max||this.bytes>this.maxBytes)this.drop(this.map.keys().next().value);
  }
  async once(key,fn){if(this.inflight.has(key))return this.inflight.get(key);
    const promise=Promise.resolve().then(fn).finally(()=>this.inflight.delete(key));this.inflight.set(key,promise);return promise;
  }
}
