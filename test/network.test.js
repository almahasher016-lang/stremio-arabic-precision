import test from 'node:test';
import assert from 'node:assert/strict';
import {RateGate,ProviderError,requestBytes,requestJson,allowedUrl} from '../src/lib/network.js';
test('URL allow list protects against SSRF',()=>{
  assert.throws(()=>allowedUrl('http://subdl.com/path',['subdl.com']),/blocked_url/);
  assert.throws(()=>allowedUrl('https://subdl.com.evil.test',['subdl.com']),/blocked_url/);
  assert.equal(allowedUrl('https://dl.subdl.com/subtitle/abc',['subdl.com']).hostname,'dl.subdl.com');
});
test('download rejects redirects outside provider domains',async()=>{
  await assert.rejects(requestBytes('https://api.subdl.com/test',{domains:['subdl.com'],fetchImpl:async()=>new Response(null,{status:302,headers:{Location:'http://127.0.0.1/secrets'}})}),/blocked_url/);
});
test('download rejects oversized Content-Length and malformed JSON',async()=>{
  await assert.rejects(requestBytes('https://api.subdl.com/test',{domains:['subdl.com'],maxBytes:8,fetchImpl:async()=>new Response('oversized',{headers:{'Content-Length':'100'}})}),/response_too_large/);
  await assert.rejects(requestJson('https://api.subdl.com/test',{domains:['subdl.com'],fetchImpl:async()=>new Response('{garbage')}),/malformed_json/);
});
test('429 carries retry-after for provider backoff',async()=>{
  await assert.rejects(requestBytes('https://api.subdl.com/test',{domains:['subdl.com'],fetchImpl:async()=>new Response(null,{status:429,headers:{'Retry-After':'2'}})}),err=>err instanceof ProviderError && err.retryAfterMs===2000);
});
test('queued work can be aborted while waiting',async()=>{
  const gate=new RateGate({interval:100,concurrency:1});
  const one=gate.run(async()=>{await new Promise(r=>setTimeout(r,30));return 1;});
  const controller=new AbortController();const two=gate.run(()=>2,controller.signal);controller.abort();
  await assert.rejects(two);assert.equal(await one,1);
});
test('provider redirect strips authentication at hostname boundary',async()=>{
  const calls=[];
  const fetchImpl=async(url,opts)=>{
    calls.push({host:url.hostname,headers:opts.headers});
    return calls.length===1?new Response(null,{status:302,headers:{Location:'https://cdn.subdl.com/subtitle/test.srt'}}):new Response('subtitle');
  };
  assert.equal((await requestBytes('https://dl.subdl.com/subtitle/test.srt',{domains:['subdl.com'],headers:{'x-api-key':'private-token'},fetchImpl})).toString(),'subtitle');
  assert.equal(calls[0].headers['x-api-key'],'private-token');
  assert.equal(calls[1].headers['x-api-key'],undefined);
});
