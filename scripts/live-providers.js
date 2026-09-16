import {loadConfig} from '../src/lib/config.js';
import {parseIdentity} from '../src/lib/identity.js';
import {opensubtitles} from '../src/providers/opensubtitles.js';
import {subdl} from '../src/providers/subdl.js';
import {subsource} from '../src/providers/subsource.js';
if(process.env.RUN_LIVE_PROVIDER_TESTS!=='true'){
  console.error('Live contract tests disabled. Set RUN_LIVE_PROVIDER_TESTS=true and configure keys.');process.exitCode=2;
}else{
  const cfg=loadConfig({...process.env,NODE_ENV:'test'}),providers=[opensubtitles(cfg),subdl(cfg),subsource(cfg)].filter(p=>p.active&&cfg.providers.includes(p.name));
  if(!providers.length){console.error('No configured provider credentials. Live test did not run.');process.exitCode=2;}
  else{
    const req=parseIdentity('movie','tt0133093');let errors=0;
    for(const p of providers){const abort=AbortSignal.timeout(cfg.searchTimeout+1500);try{
      const items=await p.search(req,abort);
      if(!Array.isArray(items))throw new Error('non_array_result');
      console.log(JSON.stringify({provider:p.name,status:'search_ok',count:items.length}));
      if(process.env.RUN_LIVE_DOWNLOAD==='true'&&items.length){const content=await p.fetch(items[0],AbortSignal.timeout(cfg.downloadTimeout));
        if(!Buffer.isBuffer(content)||content.length<10)throw new Error('invalid_download_bytes');
        console.log(JSON.stringify({provider:p.name,status:'download_ok',bytes:content.length}));}
    }catch(err){errors++;console.error(JSON.stringify({provider:p.name,status:'failed',error:err.code||err.name||'error'}));}}
    if(errors)process.exitCode=1;
  }
}
