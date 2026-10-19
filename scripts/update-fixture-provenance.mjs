import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=process.cwd(),base=path.join(root,'public/fixtures'),items=[];
async function walk(folder){for(const e of await readdir(folder,{withFileTypes:true})){const f=path.join(folder,e.name);if(e.isDirectory())await walk(f);else if(e.name!=='provenance.json'){const bytes=await readFile(f);items.push({file:path.relative(root,f).split(path.sep).join('/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}}}
await walk(base);
await writeFile(path.join(base,'provenance.json'),JSON.stringify({version:2,externalImagesUsed:true,thirdPartyBrandAssetsUsed:false,source:'User-supplied AI-generated original artwork; image-tool garment concepts; LTX-2.5 Pro and Kling 3.0 video; retained procedural test fixtures',mediaReleaseStatus:'Awaiting owner review and public-release license approval',items},null,2)+'\n');
console.log('Fixture provenance refreshed for '+items.length+' files.');
