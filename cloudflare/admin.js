import { adminPage } from './admin-page.js';
import { generateTestBusinesses } from './test-data.js';

const json = (data,status=200,cookie) => Response.json(data,{status,headers:{'Cache-Control':'no-store',...(cookie?{'Set-Cookie':cookie}:{})}});
const html = (body,status=200) => new Response(body,{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const isLocal = request => ['localhost','127.0.0.1','[::1]'].includes(new URL(request.url).hostname);
const hasAdmin = async db => !!await db.prepare("SELECT id FROM app_user WHERE role='admin' LIMIT 1").first();
const validUsername = value => typeof value==='string' && value.trim().length>0 && value.trim().length<=80 && !/[\u0000-\u001f\u007f]/.test(value);

async function credentialHash(credential,digest) {
 if(!credential||!/^[a-f0-9]{32}$/.test(credential.salt)||!/^[a-f0-9]{64}$/.test(credential.proof))throw new Error('请设置6至200个字符的密码');
 return `client-pbkdf2-sha256$310000$${credential.salt}$${await digest(credential.proof)}`;
}
async function readBody(request) {
 try {const body=await request.json();if(body&&typeof body==='object'&&!Array.isArray(body))return body;} catch {}
 throw new Error('提交内容不正确');
}
async function overview(db) {
 const users=(await db.prepare('SELECT id,username,role,is_active FROM app_user ORDER BY role,username,id').all()).results;
 const data=await db.prepare('SELECT count(*) total,coalesce(sum(test_batch_id IS NOT NULL),0) test FROM business').first();
 return {users,data:{...data,manual:data.total-data.test}};
}
export async function handleAdmin(request,env,user,{digest,adminSessionCookie,sessionToken,fields}) {
 const path=new URL(request.url).pathname,db=env.DB;
 if(path==='/admin'||path==='/admin/') {
  if(request.method!=='GET')return json({message:'仅支持GET'},405);
  if(!await hasAdmin(db))return html(adminPage({mode:'setup',setupKeyRequired:!isLocal(request)||!!env.ADMIN_SETUP_KEY,setupAllowed:isLocal(request)||!!env.ADMIN_SETUP_KEY}));
  if(!user||user.role!=='admin')return html(adminPage({mode:'login',error:user?'仅管理员可以进入用户设置':''}),user?403:200);
  return html(adminPage({mode:'manage',user}));
 }
 if(path==='/admin/setup') {
  if(request.method!=='POST')return json({message:'仅支持POST'},405);
  if(await hasAdmin(db))return json({message:'已完成初始化，请使用管理员账户登录'},409);
  let body,adminHash,ordinaryHash;
  try {
   body=await readBody(request);
   if(env.ADMIN_SETUP_KEY){if(typeof body.setup_key!=='string'||await digest(body.setup_key)!==await digest(env.ADMIN_SETUP_KEY))return json({message:'初始化密钥不正确'},403);}
   else if(!isLocal(request))return json({message:'请先配置初始化密钥'},403);
   if(!validUsername(body.username))throw new Error('管理员用户名需要1至80个字符');
   adminHash=await credentialHash(body.credential,digest);
   if(body.ordinary){if(!validUsername(body.ordinary.username)||body.ordinary.username.trim()===body.username.trim())throw new Error('普通用户需要使用不同的用户名');ordinaryHash=await credentialHash(body.ordinary.credential,digest);}
  } catch(error){return json({message:error.message},400);}
  const accounts=[body.username.trim(),adminHash,...(body.ordinary?[body.ordinary.username.trim(),ordinaryHash]:[])];
  // Materialize the initialization guard once: concurrent requests cannot create a second administrator.
  let result;
  try {result=await db.prepare(`WITH initial AS MATERIALIZED (SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM app_user WHERE role='admin')), accounts(username,password_hash,role) AS (VALUES (?,?,'admin')${body.ordinary?",(?,?,'user')":''}) INSERT INTO app_user(username,password_hash,role,is_active) SELECT username,password_hash,role,1 FROM accounts,initial`).bind(...accounts).run();}
  catch(error){if(String(error).includes('UNIQUE'))return json({message:'用户名已存在，请换一个用户名'},409);throw error;}
  if(!result.meta.changes)return json({message:'已完成初始化，请使用管理员账户登录'},409);
  const admin=await db.prepare("SELECT id FROM app_user WHERE username=? AND role='admin'").bind(body.username.trim()).first();
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
  await db.prepare('INSERT INTO session VALUES (?,?,?)').bind(await digest(token),admin.id,Math.floor(Date.now()/1000)+86400).run();
  return json({success:true,message:'管理员和用户设置完成'},201,adminSessionCookie(token,request));
 }
 if(!user)return json({message:'请先使用管理员账户登录'},401);
 if(user.role!=='admin')return json({message:'仅管理员可以操作用户设置'},403);
 if(path==='/admin/logout'&&request.method==='POST') {
  if(sessionToken)await db.prepare('DELETE FROM session WHERE token_hash=?').bind(await digest(sessionToken)).run();
  return json({success:true},200,adminSessionCookie('',request,0));
 }
 if(path==='/admin/users'&&request.method==='GET')return json(await overview(db));
 if(path==='/admin/users'&&request.method==='POST') {
  let body,hash;
  try {body=await readBody(request);if(!validUsername(body.username))throw new Error('用户名需要1至80个字符');if(!['admin','user'].includes(body.role))throw new Error('请选择管理员或普通用户');hash=await credentialHash(body.credential,digest);}catch(error){return json({message:error.message},400);}
  try {await db.prepare('INSERT INTO app_user(username,password_hash,role,is_active) VALUES (?,?,?,1)').bind(body.username.trim(),hash,body.role).run();}
  catch(error){if(String(error).includes('UNIQUE'))return json({message:'用户名已存在'},409);throw error;}
  return json({success:true,message:'用户已创建'},201);
 }
 const match=path.match(/^\/admin\/users\/([1-9]\d*)$/);
 if(match&&request.method==='POST') {
  const id=Number(match[1]),old=await db.prepare('SELECT id,username,role,is_active FROM app_user WHERE id=?').bind(id).first();
  if(!old)return json({message:'用户不存在'},404);
  let body,hash;
  try {body=await readBody(request);if(!['admin','user'].includes(body.role)||![0,1].includes(body.is_active))throw new Error('用户角色或状态不正确');if(id===user.id&&(body.role!=='admin'||body.is_active!==1))throw new Error('不能取消当前账户的管理员权限或停用当前账户');if(body.credential)hash=await credentialHash(body.credential,digest);}catch(error){return json({message:error.message},400);}
  const result=await db.prepare(`UPDATE app_user SET role=?,is_active=?${hash?',password_hash=?':''} WHERE id=? AND (role<>'admin' OR is_active<>1 OR (?='admin' AND ?=1) OR EXISTS(SELECT 1 FROM app_user other WHERE other.role='admin' AND other.is_active=1 AND other.id<>app_user.id))`).bind(body.role,body.is_active,...(hash?[hash]:[]),id,body.role,body.is_active).run();
  if(!result.meta.changes)return json({message:'至少需要保留一名启用的管理员'},409);
  if(hash||old.role!==body.role||old.is_active!==body.is_active)await db.prepare('DELETE FROM session WHERE user_id=?').bind(id).run();
  const reauth=id===user.id&&!!hash;
  return json({success:true,message:reauth?'密码已更新，请重新登录':'用户设置已保存',reauth},200,reauth?adminSessionCookie('',request,0):undefined);
 }
 if(path==='/admin/test-data/import'&&request.method==='POST') {
  const rows=generateTestBusinesses(),keys=[...fields,'created_at','updated_at'],batch=crypto.randomUUID();
  await db.prepare(`INSERT INTO business(${keys.join(',')},updated_by,test_batch_id) SELECT ${keys.map(key=>`json_extract(value,'$.${key}')`).join(',')},?,? FROM json_each(?)`).bind(user.username,batch,JSON.stringify(rows)).run();
  return json({success:true,message:'已导入200条测试业务',count:200});
 }
 if(path==='/admin/test-data/clear'&&request.method==='POST') {
  let body;try{body=await readBody(request);}catch(error){return json({message:error.message},400);}
  if(body.confirm!==true)return json({message:'请确认清除测试数据'},400);
  const result=await db.prepare('DELETE FROM business WHERE test_batch_id IS NOT NULL').run();
  return json({success:true,message:`已清除${result.meta.changes}条测试业务，正式业务已保留`,count:result.meta.changes});
 }
 return json({message:'页面或操作不存在'},404);
}
