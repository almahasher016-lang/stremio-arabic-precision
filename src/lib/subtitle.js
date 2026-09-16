import {inflateRawSync} from 'node:zlib';
import {createHash} from 'node:crypto';
export const TRANSFORM_VERSION='decode3-parse2-zip2';
function arabicRatio(text){const letters=(text.match(/\p{L}/gu)||[]).length;return letters?(text.match(/[\u0600-\u06ff]/g)||[]).length/letters:0;}
export function decodeSubtitle(buffer) {
  if(!Buffer.isBuffer(buffer)||buffer.length<10||buffer.length>20971520) throw new Error('invalid_subtitle_bytes');
  let text,encoding='utf-8';
  if(buffer[0]===0xef&&buffer[1]===0xbb&&buffer[2]===0xbf)text=new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(3));
  else if(buffer[0]===0xff&&buffer[1]===0xfe){encoding='utf-16le';text=new TextDecoder(encoding,{fatal:true}).decode(buffer.subarray(2));}
  else if(buffer[0]===0xfe&&buffer[1]===0xff){encoding='utf-16be';text=new TextDecoder(encoding,{fatal:true}).decode(buffer.subarray(2));}
  else {
    try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}
    catch {encoding='windows-1256';text=new TextDecoder(encoding,{fatal:true}).decode(buffer);}
  }
  if(text.includes('\u0000')||text.includes('\ufffd'))throw new Error('invalid_subtitle_text');
  // Arabic-first: reject apparent legacy decoding garbage, but allow valid UTF-8 punctuation and numbering.
  if(encoding==='windows-1256'&&arabicRatio(text)<0.08)throw new Error('legacy_encoding_unverified');
  return {text:text.replace(/^\ufeff/,'').replace(/\r\n?/g,'\n'),encoding};
}
const time = value => {
  const match=/^(?:(\d{1,3}):)?([0-5]?\d):([0-5]\d)[,.](\d{1,3})$/.exec(value.trim());
  if(!match)return null;
  return ((Number(match[1]||0)*3600+Number(match[2])*60+Number(match[3]))*1000+Number(match[4].padEnd(3,'0')));
};
const stamp=milliseconds=>{const n=Math.floor(milliseconds);const h=Math.floor(n/3600000),m=Math.floor(n/60000)%60,s=Math.floor(n/1000)%60,ms=n%1000;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`;};
const unescapeMarkup=text=>text.replace(/<[^>]*>/g,'').replace(/\{\\[^}]*\}/g,'').replace(/\\N/g,'\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim();
function extractSrt(text){
  const blocks=text.replace(/^WEBVTT[^\n]*\n(?:[^\n]*\n)*?\n/m,'').split(/\n\s*\n/);
  const cues=[];
  for(const block of blocks){const lines=block.trim().split('\n');const idx=lines.findIndex(x=>x.includes('-->'));if(idx<0)continue;
    const match=/^\s*(\S+)\s*-->\s*(\S+)/.exec(lines[idx]);if(!match)continue;
    const start=time(match[1]),end=time(match[2]);const content=unescapeMarkup(lines.slice(idx+1).join('\n'));
    if(start===null||end===null||end<=start||!content)continue;
    cues.push({start,end,text:content});
    if(cues.length>12000)throw new Error('too_many_cues');
  }
  return cues;
}
function extractAss(text){
  const lines=text.split('\n');let inEvents=false,fields=[];const cues=[];
  for(const line of lines){
    if(/^\s*\[/.test(line)){inEvents=/^\s*\[Events\]/i.test(line);continue;}
    if(!inEvents)continue;
    if(/^Format:\s*/i.test(line)){fields=line.replace(/^Format:\s*/i,'').split(',').map(x=>x.trim().toLowerCase());continue;}
    if(!/^Dialogue:\s*/i.test(line)||!fields.length)continue;
    const components=line.replace(/^Dialogue:\s*/i,'').split(',');
    if(components.length<fields.length)continue;
    const values=components.slice(0,fields.length-1).concat([components.slice(fields.length-1).join(',')]);
    const start=assTime(values[fields.indexOf('start')]),end=assTime(values[fields.indexOf('end')]);
    const body=unescapeMarkup(values[fields.indexOf('text')]||'');
    if(start===null||end===null||end<=start||!body)continue;
    cues.push({start,end,text:body});if(cues.length>12000)throw new Error('too_many_cues');
  }
  return cues;
}
function assTime(value){const m=/^(\d+):([0-5]\d):([0-5]\d)\.(\d{1,3})$/.exec(value||'');return m?(Number(m[1])*3600+Number(m[2])*60+Number(m[3]))*1000+Number(m[4].padEnd(3,'0')):null;}
export function normalizeSubtitle(text,format='') {
  if(typeof text!=='string'||text.length>20971520)throw new Error('invalid_subtitle_text');
  const ass=/^\[Script Info\]/im.test(text)||['ass','ssa'].includes(format);
  const cues=(ass?extractAss(text):extractSrt(text)).sort((a,b)=>a.start-b.start||a.end-b.end);
  if(cues.length<1)throw new Error('no_valid_cues');
  const valid=cues.filter(x=>x.end<=12*3600*1000&&x.text.length<=8000);
  if(!valid.length)throw new Error('no_valid_cues');
  const result=valid.map((x,i)=>`${i+1}\n${stamp(x.start)} --> ${stamp(x.end)}\n${x.text}`).join('\n\n')+'\n';
  return {srt:result,count:valid.length,arabicRatio:arabicRatio(result)};
}
export function unzipSubtitle(bytes,req={}) {
  if(bytes.subarray(0,4).toString('hex')!=='504b0304')return {buffer:bytes,format:''};
  const end=Math.max(0,bytes.length-65557);let eocd=-1;
  for(let i=bytes.length-22;i>=end;i--){if(bytes.readUInt32LE(i)===0x06054b50){eocd=i;break;}}
  if(eocd<0)throw new Error('zip_directory_missing');
  const count=bytes.readUInt16LE(eocd+10),offset=bytes.readUInt32LE(eocd+16);
  if(!count||count>100||offset>=bytes.length)throw new Error('zip_bounds');
  let cursor=offset;const candidates=[];
  for(let i=0;i<count;i++){
    if(cursor+46>bytes.length||bytes.readUInt32LE(cursor)!==0x02014b50)throw new Error('zip_corrupt');
    const flags=bytes.readUInt16LE(cursor+8),method=bytes.readUInt16LE(cursor+10),compressed=bytes.readUInt32LE(cursor+20),uncompressed=bytes.readUInt32LE(cursor+24);
    const nameLen=bytes.readUInt16LE(cursor+28),extraLen=bytes.readUInt16LE(cursor+30),commentLen=bytes.readUInt16LE(cursor+32),localOffset=bytes.readUInt32LE(cursor+42);
    if(cursor+46+nameLen+extraLen+commentLen>bytes.length)throw new Error('zip_corrupt');
    const name=bytes.subarray(cursor+46,cursor+46+nameLen).toString('utf8');
    if((flags&1)===0&&[0,8].includes(method)&&uncompressed<=5242880&&compressed>0&&/^([^\\/]+\/)*[^\\/]+\.(srt|vtt|ass|ssa)$/i.test(name)&&!name.split('/').includes('..')){
      let score=0;
      const episode=new RegExp(`s${String(req.season||0).padStart(2,'0')}e${String(req.episode||0).padStart(2,'0')}`,'i');
      if(req.type==='series'){if(episode.test(name)) score+=60;else if(/s\d{1,2}e\d{1,2}/i.test(name))score-=100;}
      if(/\b(arabic|ara|ar)\b/i.test(name))score+=20;
      if(/\.srt$/i.test(name))score+=10;
      candidates.push({name,score,localOffset,method,compressed,uncompressed});
    }
    cursor+=46+nameLen+extraLen+commentLen;
  }
  candidates.sort((a,b)=>b.score-a.score);
  const chosen=candidates[0];if(!chosen||chosen.score<0||req.type==='series'&&candidates.length>1&&chosen.score<60)throw new Error('zip_no_matching_subtitle');
  const pos=chosen.localOffset;
  if(pos+30>bytes.length||bytes.readUInt32LE(pos)!==0x04034b50)throw new Error('zip_local_corrupt');
  const dataStart=pos+30+bytes.readUInt16LE(pos+26)+bytes.readUInt16LE(pos+28);
  if(dataStart+chosen.compressed>bytes.length)throw new Error('zip_truncated');
  const zipped=bytes.subarray(dataStart,dataStart+chosen.compressed);
  const output=chosen.method===0?Buffer.from(zipped):inflateRawSync(zipped,{maxOutputLength:5242880});
  if(output.length!==chosen.uncompressed)throw new Error('zip_size_mismatch');
  return {buffer:output,format:chosen.name.split('.').pop().toLowerCase()};
}
export function processSubtitle(bytes,req={},format='') {
  const unpacked=unzipSubtitle(bytes,req);
  const decoded=decodeSubtitle(unpacked.buffer);
  const normalized=normalizeSubtitle(decoded.text,unpacked.format||format);
  if(normalized.arabicRatio<0.08)throw new Error('arabic_validation_failed');
  return {...normalized,encoding:decoded.encoding,digest:createHash('sha256').update(unpacked.buffer).digest('hex')};
}
