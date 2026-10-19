import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {prepare,summary,runJob} from '../pipeline/ltx.mjs';
const input={image_uri:'https://example.com/profile.png',last_frame_uri:'https://example.com/front.png',prompt:'One stable turn',model:'ltx-2-5-pro',duration:6,resolution:'1920x1080',fps:50};
test('preparation is local, rejects unknown parameters and redacts inline images',async()=>{
  const p=await prepare(input);assert.equal(p.generate_audio,false);
  await assert.rejects(()=>prepare({...input,key:'secret'}),/Unsupported request field/);
  await assert.rejects(()=>prepare({...input,image_uri:'http://example.com/x.png'}),/HTTPS/);
  const inline={...p,image_uri:'data:image/png;base64,AAAA'};assert.ok(!JSON.stringify(summary(inline)).includes('base64'));
});
test('one POST, saved job, polling and credential-free MP4 download; resume does not POST',async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'garment-api-test-')),dir=path.join(temp,'take');let posts=0,downloads=0,polls=0;
  const mock=async(url,init)=>{
    if(init?.method==='POST'){posts++;return Response.json({id:'test-job'});}
    if(String(url).includes('test-job')){polls++;return Response.json({status:'completed',result:{video_url:'https://storage.example/video.mp4'}});}
    downloads++;assert.equal(init?.headers?.Authorization,undefined);return new Response(Buffer.from('0000ftypisom')); // signature only; no network
  };
  try{
    const file=await runJob({payload:await prepare(input),directory:dir,key:'mock-only',fetcher:mock,wait:async()=>{},log:()=>{}});
    assert.equal(posts,1);assert.equal(downloads,1);assert.equal(JSON.parse(await readFile(path.join(dir,'job.json'))).id,'test-job');assert.equal((await readFile(file)).toString(),'0000ftypisom');
    await assert.rejects(()=>runJob({payload:input,directory:dir,key:'mock-only',fetcher:mock,wait:async()=>{},log:()=>{}}));assert.equal(posts,1);
    await assert.rejects(()=>runJob({directory:dir,key:'mock-only',resume:true,fetcher:mock,wait:async()=>{},log:()=>{}}),/already exists/);assert.equal(posts,1);assert.ok(polls>=2);
  }finally{await rm(temp,{recursive:true,force:true});}
});
test('an uncertain submission is never automatically retried',async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'garment-api-test-')),dir=path.join(temp,'take');let calls=0;
  try{
    await assert.rejects(()=>runJob({payload:input,directory:dir,key:'mock-only',fetcher:async()=>{calls++;throw Error('timeout');},wait:async()=>{},log:()=>{}}),/do not blindly resubmit/);
    assert.equal(calls,1);await readFile(path.join(dir,'submission-started.json'));
    await assert.rejects(()=>runJob({directory:dir,key:'mock-only',resume:true,fetcher:async()=>{calls++;},log:()=>{}}),/No saved job ID/);assert.equal(calls,1);
  }finally{await rm(temp,{recursive:true,force:true});}
});
