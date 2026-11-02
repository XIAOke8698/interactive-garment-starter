import {mkdir,cp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const out=path.resolve(root,'dist');
if(path.dirname(out)!==root||path.basename(out)!=='dist')throw Error('Invalid build directory');
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
for(const entry of ['index.html','rack.html','src','config','public','README.md','START-HERE.md','AGENTS.md','CLAUDE.md','docs','prompts','LICENSE','LICENSE-ASSETS.md','THIRD_PARTY_NOTICES.md'])await cp(path.join(root,entry),path.join(out,entry),{recursive:true});
console.log('Built static site in dist/. No credentials, generation inputs or paid API helper copied.');
