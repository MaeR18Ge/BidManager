import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import worker, { passwordProof } from './worker.js';
import { generateTestBusinesses, weeklyTestCounts } from './test-data.js';

const password='Ab3!xy';
async function credential(value=password) {const salt=crypto.randomUUID().replaceAll('-','');return {salt,proof:await passwordProof(value,salt)};}
function fixture(origin='http://localhost',extra={}) {
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync(new URL('migrations/',import.meta.url)).filter(file=>file.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('migrations/'+file,import.meta.url),'utf8'));
 const wrap=(query,params=[])=>({bind(...args){return wrap(query,args);},async first(){return sql.prepare(query).get(...params)||null;},async all(){return {results:sql.prepare(query).all(...params)};},async run(){const result=sql.prepare(query).run(...params);return {meta:{last_row_id:Number(result.lastInsertRowid),changes:result.changes}};}});
 const db={prepare:wrap,async batch(statements){sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
 const env={DB:db,ASSETS:{fetch:()=>new Response('asset')},...extra};
 const call=(path,{body,cookie='',method=body===undefined?'GET':'POST',requestOrigin=origin}={})=>worker.fetch(new Request(origin+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(method==='POST'?{Origin:requestOrigin}:{}),...(body instanceof URLSearchParams?{'Content-Type':'application/x-www-form-urlencoded'}:body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:body instanceof URLSearchParams?body:JSON.stringify(body)}:{})}),env);
 const login=async(username,value=password,path='/ui/login')=>{
  const challenge=await (await call('/api/auth/challenge?username='+encodeURIComponent(username))).json();
  return call(path,{body:new URLSearchParams({username,proof:await passwordProof(value,challenge.salt)})});
 };
 return {sql,db,call,login};
}
const cookieOf=response=>response.headers.get('Set-Cookie')?.split(';')[0]||'';
async function setup(f,ordinary=true) {
 const response=await f.call('/admin/setup',{body:{username:'admin',credential:await credential(),...(ordinary?{ordinary:{username:'member',credential:await credential()}}:{})}});
 assert.equal(response.status,201,await response.clone().text());return cookieOf(response);
}

test('admin and business logins remain independent in the same browser cookie jar',async t=>{
 const f=fixture();t.after(()=>f.sql.close());const setupCookie=await setup(f);
 assert.match(setupCookie,/^bid_admin_session=/);
 assert.equal((await f.call('/api/listing',{cookie:setupCookie})).status,401);
 const businessCookie=cookieOf(await f.login('member'));
 const adminLogin=await f.login('admin',password,'/admin/login'),adminCookie=cookieOf(adminLogin);
 assert.match(adminLogin.headers.get('Set-Cookie'),/^bid_admin_session=.+; Path=\/admin;/);
 const both=businessCookie+'; '+adminCookie;
 const profile=await (await f.call('/api/user/avatar',{cookie:both})).json();
 assert.equal(profile.username,'member');assert.equal(profile.role,'user');
 assert.equal((await f.call('/admin/users',{cookie:both,body:{username:'second',role:'admin',credential:await credential()}})).status,201);
 assert.equal(f.sql.prepare("SELECT role FROM app_user WHERE username='member'").get().role,'user');
 const created=await f.call('/business/new',{cookie:both,body:new URLSearchParams({name:'正式业务',customer:'正式客户'})});
 assert.equal(created.status,303);const id=created.headers.get('Location').match(/business\/(\d+)/)[1];
 for(const response of [await f.call('/api/export_data',{cookie:both}),await f.call('/business/'+id+'/delete',{cookie:both,body:{}})]){
  assert.equal(response.status,403);assert.equal((await response.json()).message,'当前用户不具有此权限');
 }
 const settingsLogout=await f.call('/admin/logout',{cookie:both,body:{}});
 assert.match(settingsLogout.headers.get('Set-Cookie'),/^bid_admin_session=; Path=\/admin;.*Max-Age=0/);
 assert.equal((await f.call('/admin/users',{cookie:both})).status,401);
 assert.equal((await (await f.call('/api/user/avatar',{cookie:both})).json()).username,'member');
 const secondAdminCookie=cookieOf(await f.login('second',password,'/admin/login')),secondBoth=businessCookie+'; '+secondAdminCookie;
 assert.match(await (await f.call('/admin',{cookie:secondBoth})).text(),/adminUsers/);
 const mainLogout=await f.call('/ui/logout',{cookie:secondBoth});
 assert.match(mainLogout.headers.get('Set-Cookie'),/^bid_session=; Path=\/;.*Max-Age=0/);
 assert.equal((await f.call('/api/listing',{cookie:secondBoth})).status,401);
 assert.equal((await f.call('/admin/users',{cookie:secondBoth})).status,200);
 const newMainCookie=cookieOf(await f.login('member'));
 assert.equal((await (await f.call('/api/user/avatar',{cookie:newMainCookie+'; '+secondAdminCookie})).json()).role,'user');
 assert.match(await (await f.call('/admin',{cookie:newMainCookie})).text(),/adminLoginForm/);
 // A main-page administrator also needs a separate login to the settings page.
 const mainAdminCookie=cookieOf(await f.login('admin'));
 assert.equal((await f.call('/admin/users',{cookie:mainAdminCookie})).status,401);
 const denied=await f.login('member',password,'/admin/login');assert.equal(denied.status,403);assert.equal(denied.headers.has('Set-Cookie'),false);
});

test('standalone admin setup is atomic, uses credentials and requires a secret online',async t=>{
 const f=fixture();t.after(()=>f.sql.close());
 assert.match(await (await f.call('/admin')).text(),/setupForm/);
 assert.equal((await f.call('/admin/setup',{body:{username:'admin',credential:await credential()},requestOrigin:'https://other.test'})).status,403);
 const cookie=await setup(f);
 const users=await (await f.call('/admin/users',{cookie})).json();assert.equal(users.users.length,2);
 assert.deepEqual(Object.keys(users.users[0]).sort(),['id','is_active','role','username']);assert.equal(JSON.stringify(users).includes('password_hash'),false);
 assert.equal((await f.call('/admin/setup',{body:{}})).status,409);
 assert.match(await (await f.call('/admin')).text(),/adminLoginForm/);
 const login=await f.login('admin',password,'/admin/login');assert.equal(login.status,303);assert.equal(login.headers.get('Location'),'/admin');
 assert.equal((await f.login('member',password,'/admin/login')).status,403);
 assert.equal((await f.call('/admin/users')).status,401);
 const member=cookieOf(await f.login('member'));
 assert.match(await (await f.call('/admin',{cookie:member})).text(),/adminLoginForm/);
 for(const path of ['/admin/users','/admin/test-data/import','/admin/test-data/clear'])assert.equal((await f.call(path,{cookie:member,body:{confirm:true}})).status,401);
 // Supplying an ordinary user's token as a settings cookie still cannot grant administrator rights.
 const forgedAdmin=member.replace('bid_session=','bid_admin_session=');
 assert.equal((await f.call('/admin/users',{cookie:forgedAdmin})).status,403);
 const online=fixture('https://bidmanager.example');t.after(()=>online.sql.close());
 assert.doesNotMatch(await (await online.call('/admin')).text(),/id="setupForm"/);
 assert.equal((await online.call('/admin/setup',{body:{username:'admin',credential:await credential()}})).status,403);
 const keyed=fixture('https://bidmanager.example',{ADMIN_SETUP_KEY:'fixture-secret'});t.after(()=>keyed.sql.close());
 const body={username:'admin',credential:await credential()};
 assert.equal((await keyed.call('/admin/setup',{body:{...body,setup_key:'wrong'}})).status,403);
 const responses=await Promise.all([keyed.call('/admin/setup',{body:{...body,setup_key:'fixture-secret'}}),keyed.call('/admin/setup',{body:{...body,username:'other',setup_key:'fixture-secret'}})]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);assert.equal(keyed.sql.prepare('SELECT count(*) n FROM app_user').get().n,1);
 const conflict=fixture();t.after(()=>conflict.sql.close());
 conflict.sql.prepare("INSERT INTO app_user(username,password_hash,role) VALUES ('member','fixture','user')").run();
 assert.equal((await conflict.call('/admin/setup',{body:{username:'admin',credential:await credential(),ordinary:{username:'member',credential:await credential()}}})).status,409);
 assert.equal(conflict.sql.prepare("SELECT count(*) n FROM app_user WHERE role='admin'").get().n,0);
});

test('user administration enforces roles, revokes sessions and keeps an active administrator',async t=>{
 const f=fixture();t.after(()=>f.sql.close());let cookie=await setup(f);
 assert.equal((await f.call('/admin/users',{cookie,body:{username:'member',role:'user',credential:await credential()}})).status,409);
 assert.equal((await f.call('/admin/users',{cookie,body:{username:'second',role:'admin',credential:await credential()}})).status,201);
 assert.equal((await f.call('/admin/users',{cookie,body:{username:'bad',role:'owner',credential:await credential()}})).status,400);
 const member=f.sql.prepare("SELECT id FROM app_user WHERE username='member'").get().id;
 let memberCookie=cookieOf(await f.login('member'));
 assert.equal((await f.call('/api/listing',{cookie:memberCookie})).status,200);
 assert.equal((await f.call('/admin/users/'+member,{cookie,body:{role:'user',is_active:0}})).status,200);
 assert.equal((await f.call('/api/listing',{cookie:memberCookie})).status,401);assert.equal((await f.login('member')).status,401);
 assert.equal((await f.call('/admin/users/'+member,{cookie,body:{role:'user',is_active:1}})).status,200);
 memberCookie=cookieOf(await f.login('member'));
 assert.equal((await f.call('/admin/users/'+member,{cookie,body:{role:'user',is_active:1,credential:await credential('R4!xyz')}})).status,200);
 assert.equal((await f.call('/api/listing',{cookie:memberCookie})).status,401);assert.equal((await f.login('member')).status,401);assert.equal((await f.login('member','R4!xyz')).status,303);
 const admin=f.sql.prepare("SELECT id FROM app_user WHERE username='admin'").get().id;
 assert.equal((await f.call('/admin/users/'+admin,{cookie,body:{role:'user',is_active:1}})).status,400);
 assert.equal((await f.call('/admin/users/'+admin,{cookie,body:{role:'admin',is_active:0}})).status,400);
 const second=f.sql.prepare("SELECT id FROM app_user WHERE username='second'").get().id,secondCookie=cookieOf(await f.login('second',password,'/admin/login'));
 const concurrent=await Promise.all([f.call('/admin/users/'+second,{cookie,body:{role:'user',is_active:1}}),f.call('/admin/users/'+admin,{cookie:secondCookie,body:{role:'user',is_active:1}})]);
 const statuses=concurrent.map(r=>r.status).sort();assert.equal(statuses[0],200);assert.ok([401,409].includes(statuses[1]));assert.equal(f.sql.prepare("SELECT count(*) n FROM app_user WHERE role='admin' AND is_active=1").get().n,1);
 const remaining=f.sql.prepare("SELECT id,username FROM app_user WHERE role='admin'").get();cookie=cookieOf(await f.login(remaining.username,password,'/admin/login'));
 const mainCookie=cookieOf(await f.login(remaining.username));
 const reset=await f.call('/admin/users/'+remaining.id,{cookie,body:{role:'admin',is_active:1,credential:await credential('Own-New-Password!')}});
 assert.equal((await reset.json()).reauth,true);assert.match(reset.headers.get('Set-Cookie'),/Max-Age=0/);assert.equal((await f.call('/admin/users',{cookie})).status,401);assert.equal((await f.call('/api/listing',{cookie:mainCookie})).status,401);
 cookie=cookieOf(await f.login(remaining.username,'Own-New-Password!','/admin/login'));assert.ok(cookie);
 assert.equal((await f.call('/admin/logout',{cookie,body:{}})).status,200);assert.equal((await f.call('/admin/users',{cookie})).status,401);
});

test('clear removes imported test businesses even after edits, preserving all manual business data',async t=>{
 const f=fixture();t.after(()=>f.sql.close());const cookie=await setup(f),member=cookieOf(await f.login('member'));
 // Names and notes never determine origin. A manually entered test-looking name is still formal.
 const manual=new URLSearchParams({name:'测试·手动录入的正式业务',customer:'正式单位',notes:'测试数据：也是手动录入',registration_time:'2026-10-01',bid_time:'2026-11-01',test_batch_id:'forged'});
 const created=await f.call('/business/new',{cookie:member,body:manual});assert.equal(created.status,303);const manualId=Number(created.headers.get('Location').match(/business\/(\d+)/)[1]);
 assert.equal((await f.call('/api/business/'+manualId+'/status',{cookie:member,body:{type:'bid',value:'已报名'}})).status,200);
 const original=f.sql.prepare('SELECT * FROM business WHERE id=?').get(manualId),history=f.sql.prepare('SELECT * FROM status_history WHERE business_id=?').all(manualId);
 assert.equal(original.test_batch_id,null);
 for(const response of [await f.call('/business/'+manualId+'/delete',{cookie:member,body:{}}),await f.call('/api/export_data',{cookie:member})]){assert.equal(response.status,403);assert.equal((await response.json()).message,'当前用户不具有此权限');}
 for(let i=0;i<2;i++)assert.equal((await (await f.call('/admin/test-data/import',{cookie,body:{}})).json()).count,200);
 const imported=f.sql.prepare('SELECT * FROM business WHERE test_batch_id IS NOT NULL').all();assert.equal(imported.length,400);assert.equal(new Set(imported.map(row=>row.test_batch_id)).size,2);
 for(const row of imported){assert.ok(row.created_at.slice(0,10)<=row.registration_time);assert.ok(row.registration_time<row.bid_time);assert.ok(row.created_at<=row.updated_at);}
 const row=imported[0],edit=new URLSearchParams(Object.fromEntries(Object.entries(row).map(([key,value])=>[key,String(value??'')])));edit.set('name','已修改名称的测试业务');edit.set('test_batch_id','');
 assert.equal((await f.call('/business/'+row.id+'/edit',{cookie:member,body:edit})).status,303);
 assert.equal((await f.call('/api/business/'+row.id+'/status',{cookie:member,body:{type:'book',value:'已获取'}})).status,200);
 assert.equal(f.sql.prepare('SELECT test_batch_id FROM business WHERE id=?').get(row.id).test_batch_id,row.test_batch_id);
 assert.ok(f.sql.prepare('SELECT count(*) n FROM status_history WHERE business_id=?').get(row.id).n>=2);
 assert.equal((await f.call('/admin/test-data/clear',{cookie,body:{confirm:false}})).status,400);assert.equal(f.sql.prepare('SELECT count(*) n FROM business').get().n,401);
 assert.equal((await f.call('/admin/test-data/clear',{cookie,body:[]})).status,400);
 const cleared=await (await f.call('/admin/test-data/clear',{cookie,body:{confirm:true}})).json();assert.equal(cleared.count,400);
 assert.deepEqual(f.sql.prepare('SELECT * FROM business').all(),[original]);assert.deepEqual(f.sql.prepare('SELECT * FROM status_history').all(),history);
 assert.equal((await (await f.call('/admin/test-data/clear',{cookie,body:{confirm:true}})).json()).count,0);
 const overview=await (await f.call('/admin/users',{cookie})).json();assert.deepEqual(overview.data,{total:1,test:0,manual:1});
});

test('migration preserves existing unmarked records',async t=>{
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
 sql.exec(readFileSync(new URL('migrations/0001_initial.sql',import.meta.url),'utf8'));
 sql.exec("INSERT INTO business(name,customer,created_at,updated_at) VALUES ('旧测试数据','旧单位','2026-10-01','2026-10-01')");
 sql.exec(readFileSync(new URL('migrations/0002_test_data.sql',import.meta.url),'utf8'));
 assert.equal(sql.prepare('SELECT test_batch_id FROM business').get().test_batch_id,null);
 sql.exec('DELETE FROM business WHERE test_batch_id IS NOT NULL');assert.equal(sql.prepare('SELECT count(*) n FROM business').get().n,1);
});

test('200 test businesses form visibly fluctuating upward curves with valid dates and document logic on any weekday',async t=>{
 const snapshots=['2026-10-04T16:00:00Z','2026-10-05T03:00:00Z','2026-10-06T03:00:00Z','2026-10-07T03:00:00Z','2026-10-08T03:00:00Z','2026-10-09T03:00:00Z','2026-10-10T03:00:00Z','2026-10-11T15:59:59Z','2026-12-31T16:00:00Z'];
 for(const snapshot of snapshots){
  const now=new Date(snapshot),clock=new Date(+now+28800000),today=clock.toISOString().slice(0,10),nowStamp=clock.toISOString().slice(0,19);
  const monday=Date.parse(today+'T00:00:00Z')-((clock.getUTCDay()+6)%7)*86400000,first=monday-11*604800000;
  const rows=generateTestBusinesses(now),series={total:Array(12).fill(0),bidAll:Array(12).fill(0),won:Array(12).fill(0),amount:Array(12).fill(0)};
  assert.equal(rows.length,200);assert.equal(new Set(rows.map(row=>row.name)).size,200);
  for(const row of rows){
   assert.ok(row.created_at.slice(0,10)<row.registration_time);assert.ok(row.registration_time<row.bid_time);
   assert.ok(row.created_at<=row.updated_at);assert.ok(row.updated_at<=nowStamp);
   const createdIndex=Math.floor((Date.parse(row.created_at+'Z')-first)/604800000),updatedIndex=Math.floor((Date.parse(row.updated_at+'Z')-first)/604800000);series.total[createdIndex]++;
   if(row.document_status==='未获取')assert.equal(row.bid_status,'未报名');
   if(row.bid_status!=='未报名')assert.equal(row.document_status,'已获取');
   if(['已投标','未中标','已中标'].includes(row.bid_status)){
    assert.ok(row.bid_time<=today);assert.ok(row.updated_at.slice(0,10)>=row.bid_time);series.bidAll[updatedIndex]++;
    if(row.bid_status==='已中标'){series.won[updatedIndex]++;series.amount[updatedIndex]+=row.bid_amount;assert.equal(row.payment_status,'未收款');}
   }
  }
  assert.deepEqual(series.total,weeklyTestCounts);
  for(const values of Object.values(series)){
   assert.ok(values.filter((value,i)=>i&&value<values[i-1]).length>=3,snapshot+': '+values.join(','));
   assert.ok(values.reduce((sum,value,i)=>sum+(i-5.5)*value,0)>0);
   assert.ok(values[11]>values[0]);assert.equal(values[11],Math.max(...values));
  }
 }
 const f=fixture();t.after(()=>f.sql.close());const cookie=await setup(f,false);
 await f.call('/admin/test-data/import',{cookie,body:{}});
 const mainCookie=cookieOf(await f.login('admin'));
 const stats=await (await f.call('/api/stats',{cookie:mainCookie})).json();assert.deepEqual(stats.series.total,weeklyTestCounts);assert.equal(stats.totals.total,200);
 for(const values of Object.values(stats.series)){assert.ok(values.filter((value,i)=>i&&value<values[i-1]).length>=3);assert.ok(values.reduce((sum,value,i)=>sum+(i-5.5)*value,0)>0);assert.equal(values[11],Math.max(...values));}
});
