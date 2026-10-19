import test from 'node:test';
import assert from 'node:assert/strict';
import {GarmentController} from '../src/controller.js';
import {rackPositions,slideStep} from '../src/rack-layout.js';
import {mobileRailPositions,mobileSwipeDestination} from '../src/mobile-rail.js';
import {validateCatalog,validateManifest} from '../src/catalog.js';
import {readFile} from 'node:fs/promises';

test('a partial turn reverses continuously and lands on the exact profile',()=>{
  const frames=[];const c=new GarmentController({frameCount:30,durationMs:360,returnDurationMs:280,endpointWindow:.3,onFrame:i=>frames.push(i)});
  c.setTarget(1);for(let i=0;i<10;i++)c.step(10);
  const p=c.position,v=c.velocity;c.setTarget(0);
  assert.equal(c.position,p);assert.equal(c.velocity,v);
  for(let i=0;i<80;i++){c.step(10);assert.ok(c.position>=0&&c.position<=1);}
  assert.equal(c.position,0);assert.equal(c.frame,0);assert.equal(c.segment,null);
  assert.ok(frames.some(i=>i>0));
});
test('repeated retargets remain bounded and reduced motion is immediate',()=>{
  const c=new GarmentController({frameCount:30,durationMs:360,returnDurationMs:280,endpointWindow:.3});
  for(let n=0;n<20;n++){c.setTarget(n%2);for(let i=0;i<6;i++){c.step(16);assert.ok(Number.isFinite(c.position)&&c.position>=0&&c.position<=1);}}
  c.setTarget(1,{immediate:true});assert.equal(c.frame,29);assert.equal(c.segment,null);
  c.setTarget(0,{immediate:true});assert.equal(c.frame,0);
});
test('full turn visits all frames monotonically and finishes at the front',()=>{
  const c=new GarmentController({frameCount:30,durationMs:360,returnDurationMs:280,endpointWindow:.3});c.setTarget(1);let previous=0;
  for(let i=0;i<360;i++){c.step(1);assert.ok(c.position>=previous-1e-8);previous=c.position;}
  assert.equal(c.position,1);assert.equal(c.frame,29);assert.equal(c.velocity,0);
});
test('neighbors move aside without shifting the selected suspension point',()=>{
  const rest=rackPositions({count:3,width:1100,garmentWidth:370});
  const active=rackPositions({count:3,width:1100,garmentWidth:370,active:1,minimumSpread:35});
  assert.equal(active[1],rest[1]);assert.ok(active[0]<rest[0]);assert.ok(active[2]>rest[2]);
  for(let i=0;i<3;i++){const p=rackPositions({count:3,width:720,garmentWidth:370,active:i,minimumSpread:35});assert.ok(p.every(Number.isFinite));assert.ok(p.every((x,n)=>!n||x>p[n-1]));}
});
test('spring reaches the new target and does not overshoot from rest',()=>{
  let p=0,v=0;for(let i=0;i<120;i++){const s=slideStep(p,v,100,16);p=s.position;v=s.velocity;assert.ok(p>=0&&p<=100);}
  assert.equal(p,100);assert.equal(v,0);
});
test('mobile reserves space around a front silhouette and settles a deliberate flick',()=>{
  const p=mobileRailPositions({width:390,items:[{half:25},{half:135},{half:25}],focus:1,gap:12});
  assert.equal(p[1],195);assert.ok(p[1]-p[0]>=172);assert.ok(p[2]-p[1]>=172);
  assert.equal(mobileSwipeDestination({positions:[80,185,290],width:390,focus:1,delta:-24,velocity:-.6}),2);
  assert.equal(mobileSwipeDestination({positions:[195,300,405],width:390,focus:0,delta:40,velocity:.8}),0);
});
test('catalog and atlas contracts reject unsafe paths, oversized data and missing fields',async()=>{
  const catalog=JSON.parse(await readFile(new URL('../config/catalog.json',import.meta.url),'utf8'));validateCatalog(catalog);
  const manifest=JSON.parse(await readFile(new URL('../public/fixtures/tee/manifest.json',import.meta.url),'utf8'));validateManifest(manifest);
  assert.throws(()=>validateCatalog({...catalog,items:[{id:'x',name:'x',motion:'../private.json'}]}));
  assert.throws(()=>validateCatalog({...catalog,items:[{...catalog.items[0],productUrl:'javascript:alert(1)'}]}));
  assert.throws(()=>validateManifest({...manifest,width:1024,height:1024,frameCount:120}));
});
