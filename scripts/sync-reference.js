import {readFile,writeFile} from 'node:fs/promises';
import {syncWithReference} from '../src/lib/sync.js';
const [, ,source,reference,output]=process.argv;
if(!source||!reference||!output){console.error('Usage: ENABLE_REFERENCE_SYNC=true node scripts/sync-reference.js source.srt trusted-reference.srt output.srt');process.exitCode=2;}
else try{
  const srt=await syncWithReference(await readFile(source,'utf8'),await readFile(reference,'utf8'),{enabled:process.env.ENABLE_REFERENCE_SYNC==='true',binary:process.env.ALASS_BINARY||'alass'});
  await writeFile(output,srt,{flag:'wx'});console.log('Reference sync completed; manually verify timings against the video before publication.');
}catch(err){console.error(`Synchronization failed: ${err.message}`);process.exitCode=1;}
