import { fields } from './worker.js';
export const escapeHTML = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels = ['业务名称','客户单位','投标联系人','投标联系电话','客户联系人','客户联系电话','服务内容','招标金额','服务人数','标书地址','过往服务商','报名时间','投标时间','标书状态','投标状态','优先级','收款情况','备注'];
const style = `*{box-sizing:border-box}body{margin:0;padding:24px;background:#242424;color:#f3f4f6;font:15px/1.6 system-ui,'Microsoft YaHei',sans-serif}main{max-width:1440px;margin:auto}header,section{border:1px solid #484848;border-radius:10px;padding:24px;margin-bottom:24px}h1{font-size:24px;color:#9ca3af;margin:0}a{color:#c4b5fd}nav{display:flex;gap:20px;margin-top:16px}form,.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}label{display:block;color:#9ca3af}input,select,textarea{width:100%;margin-top:6px;background:#242424;color:#f3f4f6;border:1px solid #484848;border-radius:6px;padding:10px;font:inherit}textarea{min-height:90px}.wide{grid-column:1/-1}button{background:#7c3aed;color:white;border:0;border-radius:6px;padding:10px 24px;font:inherit;cursor:pointer}.error{color:#f87171}dt{color:#9ca3af}dd{margin:4px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse}td,th{padding:10px;text-align:left;border-bottom:1px solid #484848;overflow-wrap:anywhere}@media(max-width:600px){body{padding:12px}header,section{padding:16px}form,.fields{grid-template-columns:1fr}.history{overflow-x:auto}}`;
const shell=(title,content)=>`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(title)} · BidManager</title><style>${style}</style></head><body><main>${content}</main></body></html>`;
export function loginPage(error='') {
 return shell('登录',`<section style="max-width:440px;margin:10vh auto"><h1>投标管理 · BidManager</h1><p class="error" role="alert">${escapeHTML(error)}</p><form method="POST" action="/ui/login" enctype="multipart/form-data" style="display:block"><label>用户名<input name="username" required maxlength="80" autocomplete="username"></label><label>密码<input type="password" name="password" required maxlength="200" autocomplete="current-password"></label><label>头像（可选，小于100KB）<input type="file" name="avatar" accept="image/png,image/jpeg,image/webp"></label><button style="margin-top:24px;width:100%">登录</button></form><p style="color:#9ca3af">v2.0.0</p><noscript>登录需要启用 JavaScript。</noscript></section><script>
document.querySelector('form').addEventListener('submit', async function(event){
 event.preventDefault();const button=this.querySelector('button');button.disabled=true;
 try {
  const data=new FormData(this);data.set('username',String(data.get('username')).trim());
  const response=await fetch('/api/auth/challenge?username='+encodeURIComponent(data.get('username')));
  if(!response.ok)throw new Error('登录服务暂不可用');const challenge=await response.json();
  const encoder=new TextEncoder();const key=await crypto.subtle.importKey('raw',encoder.encode(data.get('password')),'PBKDF2',false,['deriveBits']);
  const result=await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(challenge.salt),iterations:challenge.iterations,hash:'SHA-256'},key,256);
  data.delete('password');data.set('proof',Array.from(new Uint8Array(result),x=>x.toString(16).padStart(2,'0')).join(''));
  const login=await fetch('/ui/login',{method:'POST',body:data});
  if(login.redirected){location.assign(login.url);return;}
  const body=await login.text();const doc=new DOMParser().parseFromString(body,'text/html');document.querySelector('.error').textContent=doc.querySelector('.error')?.textContent||'登录失败';
 }catch(error){document.querySelector('.error').textContent=error.message||'登录失败';}finally{button.disabled=false;}
});</script>`);
}
export function businessPage(business={},edit=false,history=[],error='') {
 const options={document_status:['未获取','已获取'],bid_status:['未报名','已报名','未投标','已投标','未中标','已中标'],priority:['低','中','高']};
 const title=edit?(business.id?'编辑业务':'新增业务'):'业务详情';
 const content=fields.map((key,i)=>{
  const value=business[key]??'';const wide=['service_content','notes'].includes(key)?'wide':'';
  if(!edit)return `<div class="${wide}"><dt>${labels[i]}</dt><dd>${escapeHTML(value)||'—'}</dd></div>`;
  let control;
  if(options[key])control=`<select name="${key}">${options[key].map(option=>`<option ${option===value?'selected':''}>${option}</option>`).join('')}</select>`;
  else if(['service_content','notes'].includes(key))control=`<textarea name="${key}" maxlength="20000">${escapeHTML(value)}</textarea>`;
  else {const type=['registration_time','bid_time'].includes(key)?'date':['bid_amount','service_people'].includes(key)?'number':key==='document_url'?'url':'text';control=`<input type="${type}" name="${key}" value="${escapeHTML(type==='date'?String(value).slice(0,10):value)}" ${['name','customer'].includes(key)?'required maxlength="200"':''} ${type==='number'?`min="0" step="${key==='bid_amount'?'0.01':'1'}"`:''}>`;}
  return `<label class="${wide}">${labels[i]}${control}</label>`;
 }).join('');
 const historyHTML=history.map(row=>`<tr><td>${escapeHTML(row.changed_at)}</td><td>${escapeHTML(row.changed_by)}</td><td>${escapeHTML(labels[fields.indexOf(row.field_name)]||row.field_name)}</td><td>${escapeHTML(row.old_value)} → ${escapeHTML(row.new_value)}</td><td>${escapeHTML(row.notes)}</td></tr>`).join('');
 return shell(title,`<header><h1>${title}</h1><nav><a href="/ui/console">返回业务列表</a>${business.id&&!edit?`<a href="/ui/business/${business.id}/edit">编辑业务</a>`:''}<a href="/ui/logout">退出登录</a></nav></header><section><p class="error" role="alert">${escapeHTML(error)}</p>${edit?`<form method="POST" action="${business.id?'/business/'+business.id+'/edit':'/business/new'}">${content}<label class="wide">变更说明<textarea name="change_notes" maxlength="2000"></textarea></label><div class="wide"><button>保存业务</button></div></form>`:`<dl class="fields">${content}</dl>`}</section>${!edit?`<section class="history"><h2>变更记录</h2><table><thead><tr><th>时间</th><th>操作人</th><th>字段</th><th>变更</th><th>说明</th></tr></thead><tbody>${historyHTML||'<tr><td colspan="5">暂无变更记录</td></tr>'}</tbody></table></section>`:''}`);
}
