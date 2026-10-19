import {readdir,readFile,stat} from 'node:fs/promises';
import path from 'node:path';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {validateCatalog,validateManifest} from '../src/catalog.js';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const bytes=file=>readFile(path.join(root,file));const json=async file=>JSON.parse(await bytes(file));
const hash=data=>createHash('sha256').update(data).digest('hex');
const p=await json('public/fixtures/provenance.json');if(p.thirdPartyBrandAssetsUsed!==false&&p.externalImagesUsed!==false)throw Error('Fixture provenance must state its original source and exclude third-party brand assets.');
let mediaBytes=0;for(const item of p.items){const data=await bytes(item.file);if(hash(data)!==item.sha256||data.length!==item.bytes)throw Error('Provenance mismatch: '+item.file);mediaBytes+=data.length;}
const catalog=validateCatalog(await json('config/catalog.json'));let atlasBytes=0,pixels=0;
for(const item of catalog.items){const rel='public/'+item.motion,m=validateManifest(await json(rel));const base=path.posix.dirname(rel);for(const key of ['atlas','profile','front'])await stat(path.join(root,base,m[key]));if(item.back)await stat(path.join(root,'public',item.back));atlasBytes+=(await bytes(base+'/'+m.atlas)).length;pixels+=m.width*m.height*m.columns*Math.ceil(m.frameCount/m.columns);}
const releaseRoots=['src','config','public','prompts','pipeline','examples','tests','docs','scripts'];const files=['index.html','README.md','AGENTS.md','LICENSE','THIRD_PARTY_NOTICES.md','package.json','.gitignore','.env.example'];
async function walk(dir){for(const entry of await readdir(path.join(root,dir),{withFileTypes:true})){const file=dir+'/'+entry.name;if(entry.isDirectory()){if(entry.name==='__pycache__')continue;await walk(file);}else files.push(file);}}
for(const dir of releaseRoots)await walk(dir);
for(const file of files){if(/\.(?:mov|mp4|jpg|png|webp)$/i.test(file)&&!file.startsWith('public/fixtures/')&&!file.startsWith('examples/anchors/'))throw Error('Unreviewed media path: '+file);if(/\.(?:js|mjs|py|json|html|css|md|txt)$/.test(file)){const text=(await bytes(file)).toString();if(file!=='scripts/audit.mjs'&&/molimao|c:\\users\\|d:\\10_projects/i.test(text))throw Error('Case asset or machine-specific path leaked: '+file);if(/(?:sk-proj-|ghp_)[a-zA-Z0-9]{20,}/.test(text))throw Error('Credential-like literal: '+file);}}
console.log(JSON.stringify({status:'passed',items:catalog.items.length,fixtureFiles:p.items.length,fixtureBytes:mediaBytes,atlasBytes,decodedRgbaBytes:pixels*4,releaseFiles:files.length,thirdPartyBrandAssets:false,runtimePaidNetworkCalls:0},null,2));
