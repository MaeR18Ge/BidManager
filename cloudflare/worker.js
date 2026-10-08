import { loginPage, businessPage } from './pages.js';
import { adminPage } from './admin-page.js';
import { handleAdmin } from './admin.js';
import { defaultAvatarURL } from './avatar.js';

export const fields = ['name','customer','bid_contact_name','bid_contact_phone','customer_contact_name','customer_contact_phone','service_content','bid_amount','service_people','document_url','previous_suppliers','registration_time','bid_time','document_status','bid_status','priority','payment_status','notes'];
const bidStatuses = ['未报名','已报名','未投标','已投标','未中标','已中标'];
const books = ['未获取','已获取'];
const beijingNow = () => new Date(Date.now()+28800000).toISOString().slice(0,19);
const json = (data,status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const html = (body,status=200) => new Response(body,{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const redirect = (location,cookie) => new Response(null,{status:303,headers:{Location:location,...(cookie?{'Set-Cookie':cookie}:{}),'Cache-Control':'no-store'}});
const hex = bytes => Array.from(new Uint8Array(bytes), x=>x.toString(16).padStart(2,'0')).join('');
const encoder = new TextEncoder();
export const digest = async text => hex(await crypto.subtle.digest('SHA-256',encoder.encode(text)));
export async function passwordProof(password,salt) {
 const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations:310000,hash:'SHA-256'},key,256));
}
export async function passwordHash(password,salt=hex(crypto.getRandomValues(new Uint8Array(16)))) {
 return `client-pbkdf2-sha256$310000$${salt}$${await digest(await passwordProof(password,salt))}`;
}
async function verify(proof,stored) {
 const parts=stored.split('$');
 if(parts.length!==4 || parts[0]!=='client-pbkdf2-sha256' || parts[1]!=='310000' || !/^[a-f0-9]{64}$/.test(proof)) return false;
 const actual=await digest(proof),expected=parts[3];
 let diff=actual.length^expected.length;
 for(let i=0;i<actual.length;i++) diff|=actual.charCodeAt(i)^(expected.charCodeAt(i)||0);
 return diff===0;
}
function authCookie(name,path,token,request,maxAge=86400) {
 return `${name}=${token}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(request.url).protocol==='https:'?'; Secure':''}`;
}
const sessionCookie=(...args)=>authCookie('bid_session','/',...args);
const adminSessionCookie=(...args)=>authCookie('bid_admin_session','/admin',...args);
export function validateBusiness(input) {
 const data=Object.fromEntries(fields.map(k=>[k,String(input[k]??'').trim()]));
 if(!data.name || !data.customer) throw new Error('业务名称和客户单位不能为空');
 if(data.name.length>200 || data.customer.length>200 || Object.values(data).some(v=>v.length>20000)) throw new Error('输入内容过长');
 data.bid_amount=Number(data.bid_amount||0); data.service_people=Number(data.service_people||0);
 if(!Number.isFinite(data.bid_amount)||data.bid_amount<0||!Number.isSafeInteger(data.service_people)||data.service_people<0) throw new Error('金额和人数必须是非负数，人数必须是整数');
 for(const key of ['registration_time','bid_time']) {
  if(data[key] && (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?)?$/.test(data[key]) || Number.isNaN(Date.parse(data[key])))) throw new Error('日期格式不正确');
  if(data[key] && new Date(data[key].slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)!==data[key].slice(0,10)) throw new Error('日期不存在');
  data[key]=data[key]||null;
 }
 if(data.registration_time && data.bid_time && data.registration_time.slice(0,10)>=data.bid_time.slice(0,10)) throw new Error('报名时间必须早于投标时间');
 data.document_status=data.document_status||'未获取'; data.bid_status=data.bid_status||'未报名'; data.priority=data.priority||'低';
 if(!books.includes(data.document_status)||!bidStatuses.includes(data.bid_status)||!['低','中','高'].includes(data.priority)) throw new Error('状态或优先级不正确');
 if(data.document_url && !/^https?:\/\//i.test(data.document_url)) throw new Error('标书地址必须以 http:// 或 https:// 开头');
 return data;
}
export function orderSQL(sort) {
 if(['registration_time','bid_time'].includes(sort)) return `CASE WHEN ${sort} IS NULL THEN 3 WHEN date(${sort}) < date('now','+8 hours') THEN 2 WHEN date(${sort}) = date('now','+8 hours') THEN 0 ELSE 1 END, ${sort} ASC, id DESC`;
 return 'created_at DESC, id DESC';
}
async function stats(db) {
 const totals=await db.prepare(`SELECT count(*) total, coalesce(sum(bid_status IN ('已投标','未中标','已中标')),0) bidAll, coalesce(sum(bid_status='已中标'),0) won, coalesce(sum(CASE WHEN bid_status='已中标' THEN bid_amount ELSE 0 END),0)/10000 amountWan FROM business`).first();
 const now=new Date(beijingNow()+'Z'); const monday=new Date(now); monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7)); monday.setUTCHours(0,0,0,0); const first=new Date(+monday-11*604800000);
 const rows=(await db.prepare('SELECT created_at,updated_at,bid_status,bid_amount FROM business WHERE created_at>=? OR updated_at>=?').bind(first.toISOString().slice(0,10),first.toISOString().slice(0,10)).all()).results;
 const series={total:Array(12).fill(0),bidAll:Array(12).fill(0),won:Array(12).fill(0),amount:Array(12).fill(0)};
 const cur={total:0,bidAll:0,won:0,amount:0},prev={...cur};
 for(const row of rows) {
  for(const [dateKey,keys] of [['created_at',['total']],['updated_at',[...(bidStatuses.slice(3).includes(row.bid_status)?['bidAll']:[]),...(row.bid_status==='已中标'?['won','amount']:[])]]]) {
   const date=Date.parse(String(row[dateKey]||'').replace(' ','T').slice(0,19)+'Z'); if(!Number.isFinite(date)) continue;
   const index=Math.floor((date-+first)/604800000),age=(+now-date)/86400000;
   for(const key of keys){const value=key==='amount'?Number(row.bid_amount)/10000:1;if(index>=0&&index<12)series[key][index]+=value;if(age>=0&&age<=30)cur[key]+=value;else if(age>30&&age<=60)prev[key]+=value;}
  }
 }
 series.amount=series.amount.map(Math.round); totals.amountWan=Math.round(totals.amountWan);
 const trends=Object.fromEntries(Object.keys(cur).map(k=>[k,{pct:prev[k]?Math.round((cur[k]-prev[k])/prev[k]*1000)/10:(cur[k]?100:0),delta:Math.round(cur[k]-prev[k])}]));
 return {totals,trends,series};
}
async function handle(request,env) {
 const url=new URL(request.url),path=url.pathname,db=env.DB;
 if(request.method==='POST' && request.headers.get('Origin')!==url.origin) return json({message:'请求来源不合法'},403);
 if(Number(request.headers.get('Content-Length')||0)>1048576) return json({message:'请求内容过大'},413);
 if(path==='/api/auth/challenge') {
  const username=(url.searchParams.get('username')||'').trim().slice(0,80);
  const user=await db.prepare('SELECT password_hash FROM app_user WHERE username=? AND is_active=1').bind(username).first();
  return json({salt:user?.password_hash.split('$')[2]||(await digest('bidmanager:'+username)).slice(0,32),iterations:310000});
 }
 if(path==='/ui/login'||path==='/login'||path==='/admin/login') {
  const adminLogin=path==='/admin/login';
  const renderLogin=message=>adminLogin?adminPage({mode:'login',error:message}):loginPage(message);
  if(request.method!=='POST') return html(renderLogin());
  const form=await request.formData(),username=String(form.get('username')||'').trim().slice(0,80),proof=String(form.get('proof')||'');
  const key=await digest((request.headers.get('CF-Connecting-IP')||'local')+':'+username),now=Math.floor(Date.now()/1000);
  await db.prepare('INSERT INTO login_attempt(key,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END').bind(key,now+900,now,now).run();
  const limit=await db.prepare('SELECT attempts FROM login_attempt WHERE key=?').bind(key).first();
  if(limit.attempts>10) return html(renderLogin('尝试过于频繁，请15分钟后重试'),429);
  const user=await db.prepare('SELECT id,username,role,password_hash FROM app_user WHERE username=? AND is_active=1').bind(username).first();
  const stored=user?.password_hash||'client-pbkdf2-sha256$310000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000';
  const valid=await verify(proof,stored);
  if(!user||!valid) return html(renderLogin('用户名或密码错误'),401);
  if(adminLogin&&user.role!=='admin')return html(renderLogin('仅管理员可以进入用户设置'),403);
  const token=hex(crypto.getRandomValues(new Uint8Array(32)));
  const statements=[db.prepare('INSERT INTO session VALUES (?,?,?)').bind(await digest(token),user.id,now+86400),db.prepare('DELETE FROM session WHERE expires_at<?').bind(now),db.prepare('DELETE FROM login_attempt WHERE key=? OR expires_at<?').bind(key,now)];
  const avatar=form.get('avatar');
  if(avatar && typeof avatar!=='string' && avatar.size>0) {
   if(avatar.size>524288||!['image/png','image/jpeg','image/webp'].includes(avatar.type)) return html(renderLogin('头像处理失败，请更换图片后重试'),400);
   const bytes=new Uint8Array(await avatar.arrayBuffer()),chunks=[];
   for(let i=0;i<bytes.length;i+=8192)chunks.push(String.fromCharCode(...bytes.subarray(i,i+8192)));
   statements.push(db.prepare('UPDATE app_user SET avatar_url=? WHERE id=?').bind(`data:${avatar.type};base64,${btoa(chunks.join(''))}`,user.id));
  }
  await db.batch(statements);return redirect(adminLogin?'/admin':'/ui/console',(adminLogin?adminSessionCookie:sessionCookie)(token,request));
 }
 const adminRoute=path==='/admin'||path.startsWith('/admin/');
 // Settings authentication must never replace or fall back to the business-page session.
 const token=request.headers.get('Cookie')?.match(adminRoute?/(?:^|;\s*)bid_admin_session=([a-f0-9]{64})(?:;|$)/:/(?:^|;\s*)bid_session=([a-f0-9]{64})(?:;|$)/)?.[1];
 const user=token?await db.prepare('SELECT app_user.id,app_user.username,app_user.role FROM session JOIN app_user ON app_user.id=session.user_id WHERE token_hash=? AND expires_at>? AND is_active=1').bind(await digest(token),Math.floor(Date.now()/1000)).first():null;
 if(adminRoute)return handleAdmin(request,env,user,{digest,adminSessionCookie,sessionToken:token,fields});
 if(!user) return path.startsWith('/api/')?json({message:'请先登录'},401):redirect('/ui/login');
 if(path==='/logout'||path==='/ui/logout') {await db.prepare('DELETE FROM session WHERE token_hash=?').bind(await digest(token)).run();return redirect('/ui/login',sessionCookie('',request,0));}
 if(path==='/'||path==='/ui/console') return redirect('/static/figma/BDpage/order-management.html');
 if(path==='/api/user/avatar') {const profile=await db.prepare('SELECT avatar_url FROM app_user WHERE id=?').bind(user.id).first();return json({avatar_url:profile?.avatar_url||defaultAvatarURL(user.username),username:user.username,role:user.role});}
 if(path==='/api/stats') return json(await stats(db));
 if(path==='/api/listing') {
  const size=[10,20,50].includes(Number(url.searchParams.get('per_page')))?Number(url.searchParams.get('per_page')):10;
  const page=Math.max(1,Math.min(100000,parseInt(url.searchParams.get('page'))||1)); const conditions=[],params=[];
  const search=url.searchParams.get('search')?.slice(0,200),status=url.searchParams.get('bid_status');
  // D1 limits LIKE patterns to 50 bytes; literal substring search supports long Chinese names.
  if(search){const keys=fields.filter(k=>!['bid_amount','service_people','registration_time','bid_time','document_url','previous_suppliers'].includes(k));conditions.push('('+keys.map(k=>`instr(lower(coalesce(${k},'')),lower(?))>0`).join(' OR ')+')');params.push(...keys.map(()=>search));}
  if(status){conditions.push(status==='已投标'?"bid_status IN ('已投标','未中标','已中标')":'bid_status=?');if(status!=='已投标')params.push(status);}
  const where=conditions.length?' WHERE '+conditions.join(' AND '):'';
  const total=(await db.prepare('SELECT count(*) n FROM business'+where).bind(...params).first()).n;
  const items=(await db.prepare('SELECT * FROM business'+where+' ORDER BY '+orderSQL(url.searchParams.get('sort'))+' LIMIT ? OFFSET ?').bind(...params,size,(page-1)*size).all()).results;
  return json({page,per_page:size,total,items});
 }
 if(path==='/api/export_data') {
  if(user.role!=='admin')return json({message:'当前用户不具有此权限'},403);
  const raw=url.searchParams.get('ids');let ids=[];
  if(raw!==null){if(!/^[1-9]\d*(,[1-9]\d*)*$/.test(raw))return json({message:'业务编号不合法'},400);ids=[...new Set(raw.split(',').map(Number))];if(ids.length>500||ids.some(x=>!Number.isSafeInteger(x)))return json({message:'单次最多导出500条选中业务'},400);}
  const rows=(await db.prepare('SELECT * FROM business'+(ids.length?' WHERE id IN (SELECT value FROM json_each(?))':'')+' ORDER BY '+orderSQL(url.searchParams.get('sort'))).bind(...(ids.length?[JSON.stringify(ids)]:[])).all()).results;
  if(ids.length&&rows.length!==ids.length)return json({message:'部分选中业务已被删除，请刷新列表'},404);
  return json({items:rows,exporter:user.username});
 }
 const match=path.match(/^\/(?:ui\/)?business\/(\d+)(?:\/(detail|edit|delete))?$/),statusMatch=path.match(/^\/api\/business\/(\d+)\/status$/);
 if(match||statusMatch||path==='/ui/business/new'||path==='/business/new') {
  const id=Number((match||statusMatch)?.[1]||0),old=id?await db.prepare('SELECT * FROM business WHERE id=?').bind(id).first():null;
  if(id&&!old)return json({message:'业务不存在'},404);
  if(statusMatch&&request.method==='POST') {
   const body=await request.json(),field=body.type==='book'?'document_status':body.type==='bid'?'bid_status':null;
   if(!field||!(field==='document_status'?books:bidStatuses).includes(body.value))return json({message:'状态不合法'},400);
   const stamp=beijingNow();await db.batch([db.prepare(`UPDATE business SET ${field}=?,updated_at=?,updated_by=? WHERE id=?`).bind(body.value,stamp,user.username,id),db.prepare('INSERT INTO status_history(business_id,field_name,old_value,new_value,changed_at,changed_by) VALUES (?,?,?,?,?,?)').bind(id,field,old[field],body.value,stamp,user.username)]);return json({success:true});
  }
  if(match?.[2]==='delete') {
   if(request.method!=='POST')return json({message:'仅支持POST'},405);
   if(user.role!=='admin')return json({message:'当前用户不具有此权限'},403);
   await db.prepare('DELETE FROM business WHERE id=?').bind(id).run();return json({success:true});
  }
  if(request.method==='POST') {
   const form=Object.fromEntries(await request.formData());let data;try{data=validateBusiness(form);}catch(error){return html(businessPage({...old,...form},true,[],error.message),400);}
   const stamp=beijingNow();
   if(old){const statements=[db.prepare('UPDATE business SET '+fields.map(k=>k+'=?').join(',')+',updated_at=?,updated_by=? WHERE id=?').bind(...fields.map(k=>data[k]),stamp,user.username,id)];for(const key of fields)if(String(old[key]??'')!==String(data[key]??''))statements.push(db.prepare('INSERT INTO status_history(business_id,field_name,old_value,new_value,changed_at,changed_by,notes) VALUES (?,?,?,?,?,?,?)').bind(id,key,String(old[key]??''),String(data[key]??''),stamp,user.username,String(form.change_notes||'').slice(0,2000)));await db.batch(statements);return redirect(`/ui/business/${id}/detail`);}
   const result=await db.prepare('INSERT INTO business('+fields.join(',')+',created_at,updated_at,updated_by) VALUES ('+[...fields,'a','b','c'].map(()=>'?').join(',')+')').bind(...fields.map(k=>data[k]),stamp,stamp,user.username).run();return redirect(`/ui/business/${result.meta.last_row_id}/detail`);
  }
  const history=old?(await db.prepare('SELECT * FROM status_history WHERE business_id=? ORDER BY changed_at DESC,id DESC').bind(id).all()).results:[];
  return html(businessPage(old||{},!old||match?.[2]==='edit',history));
 }
 if(path.startsWith('/static/'))return env.ASSETS.fetch(request);
 return json({message:'页面不存在'},404);
}
export default { async fetch(request,env) {try{return await handle(request,env);}catch(error){console.error(error);return json({message:'服务处理失败，请稍后重试'},500);}} };
