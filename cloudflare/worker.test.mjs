import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker, { passwordHash, passwordProof, validateBusiness } from './worker.js';

function database() {
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON;'+readFileSync(new URL('migrations/0001_initial.sql',import.meta.url),'utf8'));
 const wrap=(query,params=[])=>({bind(...args){return wrap(query,args);},async first(){return sql.prepare(query).get(...params)||null;},async all(){return {results:sql.prepare(query).all(...params)};},async run(){const result=sql.prepare(query).run(...params);return {meta:{last_row_id:Number(result.lastInsertRowid),changes:result.changes}};}});
 return {sql,prepare:wrap,async batch(statements){sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
}
test('validation rejects incorrect dates, amounts and statuses',()=>{
 const valid={name:'体检项目',customer:'测试单位',registration_time:'2026-10-01',bid_time:'2026-10-02'};
 assert.equal(validateBusiness(valid).service_people,0);
 assert.throws(()=>validateBusiness({...valid,bid_time:'2026-09-30'}),/早于/);
 assert.throws(()=>validateBusiness({...valid,registration_time:'2026-02-30'}),/不存在/);
 assert.throws(()=>validateBusiness({...valid,service_people:1.5}),/整数/);
 assert.throws(()=>validateBusiness({...valid,bid_amount:'Infinity'}),/金额/);
 assert.throws(()=>validateBusiness({...valid,bid_status:'x'}),/状态/);
 assert.throws(()=>validateBusiness({...valid,document_url:'javascript:alert(1)'}),/http/);
});
test('login, authorization, business lifecycle, paging, export and logout',async()=>{
 const db=database(),env={DB:db,ASSETS:{fetch:()=>new Response('asset')}};
 await db.prepare('INSERT INTO app_user(username,password_hash,role) VALUES (?,?,?)').bind('admin',await passwordHash('Test-only-Password!'),'admin').run();
 await db.prepare('INSERT INTO app_user(username,password_hash,role) VALUES (?,?,?)').bind('reader',await passwordHash('Test-only-Password!'),'user').run();
 let cookie='';
 const call=(path,method='GET',body=null,origin='http://localhost')=>worker.fetch(new Request('http://localhost'+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(method==='POST'?{Origin:origin}:{}),...(body instanceof URLSearchParams?{'Content-Type':'application/x-www-form-urlencoded'}:typeof body==='string'?{'Content-Type':'application/json'}:{})},...(body?{body}:{})}),env);
 assert.equal((await call('/api/listing')).status,401);
 assert.equal((await call('/ui/login','POST',new URLSearchParams({username:'admin',password:'bad'}))).status,401);
 const adminChallenge=await (await call('/api/auth/challenge?username=admin')).json();
 const login=await call('/ui/login','POST',new URLSearchParams({username:'admin',proof:await passwordProof('Test-only-Password!',adminChallenge.salt)}));assert.equal(login.status,303);cookie=login.headers.get('Set-Cookie').split(';')[0];assert.match(login.headers.get('Set-Cookie'),/HttpOnly/);
 assert.equal((await call('/business/new','POST',new URLSearchParams({name:'x',customer:'y'}),'https://evil.test')).status,403);
 for(let i=0;i<23;i++)assert.equal((await call('/business/new','POST',new URLSearchParams({name:`项目${i}`,customer:'单位',registration_time:'2026-10-01',bid_time:'2026-10-02'}))).status,303);
 let listing=await (await call('/api/listing?per_page=20')).json();assert.equal(listing.items.length,20);assert.equal(listing.total,23);
 listing=await (await call('/api/listing?page=2&per_page=20')).json();assert.equal(listing.items.length,3);
 assert.equal((await (await call('/api/listing?per_page=11')).json()).items.length,10);
 assert.equal((await (await call('/api/listing?search=%25')).json()).total,0);
 assert.equal((await call('/api/business/1/status','POST',JSON.stringify({type:'bid',value:'已中标'}))).status,200);
 assert.equal((await (await call('/api/listing?bid_status=已投标')).json()).total,1);
 assert.equal((await (await call('/api/stats')).json()).totals.won,1);
 assert.equal((await (await call('/api/export_data?ids=1,2')).json()).items.length,2);
 assert.equal((await (await call('/api/export_data?search=none')).json()).items.length,23);
 assert.equal((await call('/api/export_data?ids=0')).status,400);
 assert.equal((await call('/api/export_data?ids=999')).status,404);
 assert.equal(db.sql.prepare('SELECT count(*) n FROM status_history WHERE business_id=1').get().n,1);
 const edit=await call('/business/1/edit','POST',new URLSearchParams({name:'<script>alert(1)</script>',customer:'单位',bid_status:'已中标'}));assert.equal(edit.status,303);
 const detail=await (await call('/ui/business/1/detail')).text();assert.ok(detail.includes('&lt;script&gt;'));assert.ok(!detail.includes('<script>alert(1)</script>'));
 assert.equal((await call('/business/1/delete','POST')).status,200);assert.equal(db.sql.prepare('SELECT count(*) n FROM status_history WHERE business_id=1').get().n,0);
 const oldCookie=cookie;assert.equal((await call('/ui/logout')).status,303);assert.equal((await call('/api/listing')).status,401);
 const readerChallenge=await (await call('/api/auth/challenge?username=reader')).json();
 const reader=await call('/ui/login','POST',new URLSearchParams({username:'reader',proof:await passwordProof('Test-only-Password!',readerChallenge.salt)}));cookie=reader.headers.get('Set-Cookie').split(';')[0];assert.equal((await call('/business/2/delete','POST')).status,403);assert.equal((await call('/api/export_data')).status,403);
 cookie=oldCookie;assert.equal((await call('/api/listing')).status,401);
 db.sql.close();
});
test('failed login is rate limited',async()=>{
 const env={DB:database()};for(let i=0;i<10;i++)await worker.fetch(new Request('http://localhost/ui/login',{method:'POST',headers:{Origin:'http://localhost'},body:new URLSearchParams({username:'absent',password:'bad'})}),env);
 const response=await worker.fetch(new Request('http://localhost/ui/login',{method:'POST',headers:{Origin:'http://localhost'},body:new URLSearchParams({username:'absent',password:'bad'})}),env);assert.equal(response.status,429);env.DB.sql.close();
});
