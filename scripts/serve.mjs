import http from 'node:http';
import path from 'node:path';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

export const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
export function publicFile(url,base=root){
  let pathname;try{pathname=decodeURIComponent(new URL(url,'http://localhost').pathname);}catch{return null;}
  if(pathname.includes('\\')||pathname.includes('\0')||pathname.split('/').includes('..'))return null;
  if(pathname==='/')pathname='/index.html';
  const allowed=/^\/(index\.html|(?:README|START-HERE|AGENTS|CLAUDE|LICENSE-ASSETS|THIRD_PARTY_NOTICES)\.md|LICENSE|(?:docs|prompts)\/[a-z0-9-]+\.md|config\/catalog\.json|src\/[a-z0-9-]+\.(js|css)|public\/(fixtures\/[a-z0-9/-]+\.(webp|json|jpg)|fonts\/[a-zA-Z0-9.-]+\.(ttf|txt)))$/;
  if(!allowed.test(pathname))return null;
  const file=path.resolve(base,'.'+pathname);if(!file.startsWith(base+path.sep))return null;return file;
}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8','.webp':'image/webp','.jpg':'image/jpeg','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8'};
export function makeServer(base=root){return http.createServer(async(req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  const file=publicFile(req.url,base);if(!file){res.writeHead(404);res.end('Not found');return;}
  try{const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':data.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(404);res.end('Not found');}
});}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||5264);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT.');
  makeServer().listen(port,'127.0.0.1',()=>console.log(`Garment starter: http://127.0.0.1:${port}`));
}
