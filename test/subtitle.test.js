import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSubtitle,decodeSubtitle,processSubtitle,unzipSubtitle} from '../src/lib/subtitle.js';
import {deflateRawSync} from 'node:zlib';
const arabic='1\n00:00:01,000 --> 00:00:02,400\nمرحبا بالعالم\n';
function zip(files){let parts=[],centrals=[],offset=0;for(const [name,text] of files){const input=Buffer.from(text),deflate=deflateRawSync(input),filename=Buffer.from(name),local=Buffer.alloc(30),central=Buffer.alloc(46);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(8,8);local.writeUInt32LE(deflate.length,18);local.writeUInt32LE(input.length,22);local.writeUInt16LE(filename.length,26);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(8,10);central.writeUInt32LE(deflate.length,20);central.writeUInt32LE(input.length,24);central.writeUInt16LE(filename.length,28);central.writeUInt16LE(offset,42);parts.push(local,filename,deflate);centrals.push(central,filename);offset+=local.length+filename.length+deflate.length;}const cd=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...parts,cd,end]);}
test('UTF-8 Arabic SRT and VTT normalized as valid SRT',()=>{
  assert.match(processSubtitle(Buffer.from(arabic)).srt,/مرحبا بالعالم/);
  assert.equal(normalizeSubtitle('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nمرحبا\n').count,1);
});
test('fatal UTF-8 fallback decodes Arabic legacy byte sequence',()=>{
  const legacy=Buffer.concat([Buffer.from('1\n00:00:01,000 --> 00:00:02,000\n'),Buffer.from([0xe3,0xd1,0xcd,0xc8,0xc7])]);
  assert.equal(decodeSubtitle(legacy).encoding,'windows-1256');
  assert.match(processSubtitle(legacy).srt,/مرحبا/);
});
test('reject corrupted cues and non Arabic language',()=>{
  assert.throws(()=>normalizeSubtitle('not a subtitle'),/no_valid_cues/);
  assert.throws(()=>processSubtitle(Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nhello world')),/arabic_validation_failed/);
});
test('ASS dialogue can be normalized without leaking formatting tags',()=>{
  const ass='[Script Info]\nTitle: test\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\i1}مرحبا\\Nالعالم';
  const result=normalizeSubtitle(ass,'ass');assert.equal(result.count,1);assert.match(result.srt,/مرحبا\nالعالم/);assert.doesNotMatch(result.srt,/\\i1/);
});
test('ZIP episode selection is exact, and ambiguous season packs rejected',()=>{
  const multi=zip([['Show.S01E02.ar.srt',arabic.replace('مرحبا','خطأ')],['Show.S01E03.ar.srt',arabic]]);
  const result=unzipSubtitle(multi,{type:'series',season:1,episode:3});assert.match(result.buffer.toString(),/مرحبا/);
  assert.throws(()=>unzipSubtitle(multi,{type:'series',season:1,episode:4}),/zip_no_matching_subtitle/);
});
