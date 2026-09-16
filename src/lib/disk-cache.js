import {createHash} from 'node:crypto';
import {mkdir,readFile,rename,readdir,rm,stat,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const filename=key=>createHash('sha256').update(key).digest('hex')+'.bin';
export class DiskCache {
  constructor(directory,{ttl=86400000,maxFiles=120,maxBytes=5242880,maxTotalBytes=268435456}={}){
    this.directory=directory;this.ttl=ttl;this.maxFiles=maxFiles;this.maxBytes=maxBytes;this.maxTotalBytes=maxTotalBytes;this.writes=0;
  }
  async init(){if(!this.directory)return;await mkdir(this.directory,{recursive:true});const probe=join(this.directory,'.write-test');await writeFile(probe,'ok',{flag:'w'});await rm(probe);}
  async get(key){if(!this.directory)return undefined;const path=join(this.directory,filename(key));try{
    const bytes=await readFile(path);if(bytes.length<8||bytes.length>this.maxBytes+8||Number(bytes.readBigUInt64BE(0))<=Date.now()){await rm(path,{force:true});return undefined;}
    return bytes.subarray(8);
  }catch(err){if(err.code==='ENOENT')return undefined;throw err;}}
  async drop(key){if(this.directory)await rm(join(this.directory,filename(key)),{force:true});}
  async set(key,bytes){if(!this.directory||!Buffer.isBuffer(bytes)||bytes.length>this.maxBytes)return;
    const name=filename(key),path=join(this.directory,name),temp=`${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    const output=Buffer.allocUnsafe(bytes.length+8);output.writeBigUInt64BE(BigInt(Date.now()+this.ttl));bytes.copy(output,8);
    try{await writeFile(temp,output,{flag:'wx',mode:0o600});await rename(temp,path);}finally{await rm(temp,{force:true}).catch(()=>{});}
    if(++this.writes%10===0)await this.prune();
  }
  async prune(){if(!this.directory)return;
    const list=(await readdir(this.directory)).filter(x=>/^[a-f0-9]{64}\.bin$/.test(x));
    const items=(await Promise.all(list.map(async name=>{try{const info=await stat(join(this.directory,name));return {name,mtime:info.mtimeMs,size:info.size};}catch{return null;}}))).filter(Boolean).sort((a,b)=>b.mtime-a.mtime);
    let retainedBytes=0,retainedFiles=0;const expired=items.filter(x=>x.mtime+this.ttl<Date.now());
    const removals=[];for(const item of items){if(expired.includes(item)||retainedFiles>=this.maxFiles||retainedBytes+item.size>this.maxTotalBytes)removals.push(item);else{retainedFiles++;retainedBytes+=item.size;}}
    await Promise.all(removals.map(x=>rm(join(this.directory,x.name),{force:true})));
  }
}
