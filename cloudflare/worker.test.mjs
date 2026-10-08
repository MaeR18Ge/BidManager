import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import worker, { digest, passwordHash, passwordProof, validateBusiness } from './worker.js';

function database() {
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON;');
 for(const file of readdirSync(new URL('migrations/',import.meta.url)).filter(file=>file.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('migrations/'+file,import.meta.url),'utf8'));
 const wrap=(query,params=[])=>({bind(...args){return wrap(query,args);},async first(){return sql.prepare(query).get(...params)||null;},async all(){return {results:sql.prepare(query).all(...params)};},async run(){const result=sql.prepare(query).run(...params);return {meta:{last_row_id:Number(result.lastInsertRowid),changes:result.changes}};}});
 return {sql,prepare:wrap,async batch(statements){sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
}
test('production HTTP redirects to HTTPS before database access and rejects insecure writes',async()=>{
 for(const method of ['GET','HEAD']) {
  const response=await worker.fetch(new Request('http://bid.example.test/ui/login?from=wechat',{method}),{});
  assert.equal(response.status,308);
  assert.equal(response.headers.get('Location'),'https://bid.example.test/ui/login?from=wechat');
  assert.equal(response.headers.get('Cache-Control'),'no-store');
 }
 const admin=await worker.fetch(new Request('http://bid.example.test/admin'),{});
 assert.equal(admin.headers.get('Location'),'https://bid.example.test/admin');
 const write=await worker.fetch(new Request('http://bid.example.test/ui/login',{method:'POST',headers:{Origin:'http://bid.example.test'},body:new URLSearchParams({username:'test'})}),{});
 assert.equal(write.status,403);
 assert.match((await write.json()).message,/HTTPS/);
});
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
 const longName='重庆市南岸区税务局在职员工健康体检项目及服务采购投标报名工作管理 AbCd';
 for(let i=0;i<23;i++)assert.equal((await call('/business/new','POST',new URLSearchParams({name:i===0?longName:`项目${i}`,customer:'单位',registration_time:'2026-10-01',bid_time:'2026-10-02'}))).status,303);
 let listing=await (await call('/api/listing?per_page=20')).json();assert.equal(listing.items.length,20);assert.equal(listing.total,23);
 listing=await (await call('/api/listing?page=2&per_page=20')).json();assert.equal(listing.items.length,3);
 assert.equal((await (await call('/api/listing?per_page=11')).json()).items.length,10);
 assert.equal((await (await call('/api/listing?search=%25')).json()).total,0);
 assert.equal((await (await call('/api/listing?search='+encodeURIComponent(longName))).json()).total,1);
 assert.equal((await (await call('/api/listing?search='+encodeURIComponent('中文'.repeat(100)))).json()).total,0);
 assert.equal((await (await call('/api/listing?search=abcd')).json()).total,1);
 assert.equal((await call('/api/business/1/status','POST',JSON.stringify({type:'bid',value:'已中标'}))).status,200);
 assert.equal((await (await call('/api/listing?bid_status=已投标')).json()).total,1);
 assert.equal((await (await call('/api/stats')).json()).totals.won,1);
 const selectedExport=await (await call('/api/export_data?ids=1,2')).json();
 assert.equal(selectedExport.items.length,2);assert.equal(selectedExport.exporter,'admin');
 assert.equal((await (await call('/api/export_data?search=none')).json()).items.length,0);
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
test('filtered export matches the complete listing across pagination, search, status groups and ordering',async()=>{
 const db=database(),env={DB:db};
 try {
  await db.prepare('INSERT INTO app_user(username,password_hash,role) VALUES (?,?,?)').bind('export-test','test-only','admin').run();
  const token='a'.repeat(64);
  await db.prepare('INSERT INTO session VALUES (?,?,?)').bind(await digest(token),1,Math.floor(Date.now()/1000)+60).run();
  const call=path=>worker.fetch(new Request('http://localhost'+path,{headers:{Cookie:'bid_session='+token}}),env);
  const statuses=['未报名','已报名','未投标','已投标','未中标','已中标'];
  const longName='重庆市南岸区税务局在职员工健康体检项目及服务采购投标报名工作管理 AbCd % _';
  for(let i=0;i<27;i++)await db.prepare('INSERT INTO business(name,customer,bid_status,bid_amount,registration_time,bid_time,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(i===0?longName:`项目${i}`,i%2?'单位乙':'单位甲',statuses[i%6],(i%7)*1000,`2026-10-${String(i%9+1).padStart(2,'0')}`,`2026-11-${String(i%9+1).padStart(2,'0')}`,`2026-09-${String(i+1).padStart(2,'0')}`,'2026-10-08').run();
  const cases=[{}, {bid_status:'已投标'}, {bid_status:'已中标'}, {bid_status:'已中标',sort:'amount_desc'}, {search:'单位甲',bid_status:'已投标'}, {search:longName}, {search:'abcd'}, {search:'%'}, {search:'_'}, {search:'不存在'}, {search:'项目',sort:'registration_time'}, {sort:'bid_time'}];
  for(const filters of cases) {
   const params=new URLSearchParams(filters),ids=[];
   let total=0;
   for(let page=1;;page++) {
    const listing=await (await call('/api/listing?'+params+'&page='+page+'&per_page=10')).json();
    total=listing.total;ids.push(...listing.items.map(item=>item.id));
    if(ids.length>=total)break;
   }
   const response=await call('/api/export_data?'+params+'&page=2&per_page=10');
   assert.equal(response.status,200);
   const exported=await response.json();
   assert.equal(exported.exporter,'export-test');
   assert.equal(exported.items.length,total);
   assert.deepEqual(exported.items.map(item=>item.id),ids,JSON.stringify(filters));
   if(filters.sort==='amount_desc')assert.ok(exported.items.every((item,index)=>index===0||item.bid_amount<=exported.items[index-1].bid_amount));
   if(filters.search===longName||['abcd','%','_'].includes(filters.search))assert.equal(total,1);
   if(filters.search==='不存在')assert.equal(total,0);
   if(filters.bid_status==='已投标')assert.ok(exported.items.every(item=>statuses.slice(3).includes(item.bid_status)));
  }
  assert.equal((await (await call('/api/export_data?ids=1,2&search=不存在&bid_status=已中标')).json()).items.length,2);
  db.sql.exec("UPDATE app_user SET role='user'");
  assert.equal((await call('/api/export_data?bid_status=已中标')).status,403);
 }finally{db.sql.close();}
});

test('failed login is rate limited',async()=>{
 const env={DB:database()};for(let i=0;i<10;i++)await worker.fetch(new Request('http://localhost/ui/login',{method:'POST',headers:{Origin:'http://localhost'},body:new URLSearchParams({username:'absent',password:'bad'})}),env);
 const response=await worker.fetch(new Request('http://localhost/ui/login',{method:'POST',headers:{Origin:'http://localhost'},body:new URLSearchParams({username:'absent',password:'bad'})}),env);assert.equal(response.status,429);env.DB.sql.close();
});

test('HTTPS login preserves avatars and rejects oversized uploads; expired and disabled sessions cannot access assets',async()=>{
 const db=database(),env={DB:db,ASSETS:{fetch:()=>new Response('asset')}};
 const password='Test-only-Password!';
 await db.prepare('INSERT INTO app_user(username,password_hash,role) VALUES (?,?,?)').bind('avatar-test',await passwordHash(password),'admin').run();
 let cookie='';
 const call=(path,method='GET',body)=>worker.fetch(new Request('https://bidmanager.example'+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(method==='POST'?{Origin:'https://bidmanager.example'}:{})},...(body?{body}:{})}),env);
 const challenge=await (await call('/api/auth/challenge?username=avatar-test')).json();
 const proof=await passwordProof(password,challenge.salt);
 const loginForm=(avatar)=>{const form=new FormData();form.set('username','avatar-test');form.set('proof',proof);if(avatar)form.set('avatar',avatar,'avatar.png');return form;};
 const initialLogin=await call('/ui/login','POST',loginForm());assert.equal(initialLogin.status,303);cookie=initialLogin.headers.get('Set-Cookie').split(';')[0];
 const defaultProfile=await (await call('/api/user/avatar')).json();assert.match(decodeURIComponent(defaultProfile.avatar_url),/>A<\/text>/);assert.equal(db.sql.prepare('SELECT avatar_url FROM app_user').get().avatar_url,null);
 const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='),x=>x.charCodeAt(0));
 const login=await call('/ui/login','POST',loginForm(new Blob([bytes],{type:'image/png'})));
 assert.equal(login.status,303);assert.match(login.headers.get('Set-Cookie'),/Secure/);assert.match(login.headers.get('Set-Cookie'),/SameSite=Lax/);cookie=login.headers.get('Set-Cookie').split(';')[0];
 const profile=await (await call('/api/user/avatar')).json();assert.equal(profile.username,'avatar-test');assert.equal(profile.avatar_url,'data:image/png;base64,'+btoa(String.fromCharCode(...bytes)));
 const again=await call('/ui/login','POST',loginForm());assert.equal(again.status,303);cookie=again.headers.get('Set-Cookie').split(';')[0];assert.deepEqual(await (await call('/api/user/avatar')).json(),profile);
 assert.equal((await call('/ui/login','POST',loginForm(new Blob([new Uint8Array(524289)],{type:'image/png'})))).status,400);
 assert.equal((await call('/ui/login','POST',loginForm(new Blob(['<svg/>'],{type:'image/svg+xml'})))).status,400);
 assert.equal((await call('/static/default-avatar.svg')).status,200);
 db.sql.exec('UPDATE session SET expires_at=0');assert.equal((await call('/api/listing')).status,401);assert.equal((await call('/static/default-avatar.svg')).headers.get('Location'),'/ui/login');
 db.sql.exec('UPDATE session SET expires_at=9999999999; UPDATE app_user SET is_active=0');assert.equal((await call('/api/listing')).status,401);
 db.sql.close();
});
