import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {normalizeSubtitle} from './subtitle.js';
// An operator-only feature: there is no automatic trusted reference supplied by Stremio.
export async function syncWithReference(source,reference,{enabled=false,binary='alass',signal,timeout=15000}={}) {
  if(!enabled)throw new Error('reference_sync_disabled');
  const before=normalizeSubtitle(source),ref=normalizeSubtitle(reference);
  if(before.count<12||ref.count<12)throw new Error('insufficient_reference_cues');
  const folder=await mkdtemp(join(tmpdir(),'arabic-sync-'));
  try {
    const input=join(folder,'input.srt'),referencePath=join(folder,'reference.srt'),output=join(folder,'output.srt');
    await Promise.all([writeFile(input,before.srt),writeFile(referencePath,ref.srt)]);
    await new Promise((resolve,reject)=>{
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);
      const onAbort=()=>controller.abort();signal?.addEventListener('abort',onAbort,{once:true});
      const child=spawn(binary,[referencePath,input,output],{signal:controller.signal,stdio:'ignore',shell:false});
      child.once('error',reject);child.once('close',code=>code===0?resolve():reject(new Error(`alass_exit_${code}`)));
      child.once('close',()=>{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);});
    });
    const after=normalizeSubtitle(await readFile(output,'utf8'));
    if(after.count<before.count*.9||after.count>before.count*1.1)throw new Error('sync_integrity_failed');
    return after.srt;
  }finally{await rm(folder,{recursive:true,force:true});}
}
