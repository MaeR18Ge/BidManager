// Test-only HTTP adapter. Production runs on Cloudflare Workers, never this server.
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import worker, { passwordHash } from './worker.js';
const sql=new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys=ON;'+readFileSync(new URL('migrations/0001_initial.sql',import.meta.url),'utf8'));
sql.exec(readFileSync(new URL('business.private.sql',import.meta.url),'utf8'));
sql.prepare('INSERT INTO app_user(username,password_hash,role) VALUES (?,?,?)').run('smoke',await passwordHash('Test-only-Password!'),'admin');
const wrap=(query,params=[])=>({bind(...args){return wrap(query,args)},async first(){return sql.prepare(query).get(...params)||null},async all(){return {results:sql.prepare(query).all(...params)}},async run(){const result=sql.prepare(query).run(...params);return {meta:{last_row_id:Number(result.lastInsertRowid)}}}});
const db={prepare:wrap,async batch(statements){sql.exec('BEGIN');try{const out=[];for(const statement of statements)out.push(await statement.run());sql.exec('COMMIT');return out}catch(error){sql.exec('ROLLBACK');throw error}}};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf'};
const env={DB:db,ASSETS:{async fetch(request){const path=new URL(request.url).pathname;const file=new URL('public'+path,import.meta.url);if(!fileURLToPath(file).startsWith(fileURLToPath(new URL('public/',import.meta.url))))return new Response('Forbidden',{status:403});try{const body=await readFile(file);return new Response(body,{headers:{'Content-Type':mime[path.slice(path.lastIndexOf('.'))]||'application/octet-stream'}})}catch{return new Response('Not found',{status:404})}}}};
createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const response=await worker.fetch(new Request('http://127.0.0.1:8788'+req.url,{method:req.method,headers:req.headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})}),env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))}catch(error){console.error(error);res.writeHead(500);res.end('Error')}}).listen(8788,'127.0.0.1',()=>console.log('Test-only server http://127.0.0.1:8788'));
