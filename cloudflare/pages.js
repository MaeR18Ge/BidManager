import { fields } from './worker.js';
import { avatarInitial } from './avatar.js';
export const escapeHTML = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels = ['业务名称','客户单位','投标联系人','投标联系电话','客户联系人','客户联系电话','服务内容','招标金额','服务人数','标书地址','过往服务商','报名时间','投标时间','标书状态','投标状态','优先级','收款情况','备注'];
const style = `*{box-sizing:border-box}body{margin:0;padding:24px;background:#242424;color:#f3f4f6;font:15px/1.6 system-ui,'Microsoft YaHei',sans-serif}main{max-width:1440px;margin:auto}header,section{border:1px solid #484848;border-radius:10px;padding:24px;margin-bottom:24px}h1{font-size:24px;color:#9ca3af;margin:0}a{color:#c4b5fd}nav{display:flex;gap:20px;margin-top:16px}form,.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}label{display:block;color:#9ca3af}input,select,textarea{width:100%;margin-top:6px;background:#242424;color:#f3f4f6;border:1px solid #484848;border-radius:6px;padding:10px;font:inherit}textarea{min-height:90px}.wide{grid-column:1/-1}button{background:#7c3aed;color:white;border:0;border-radius:6px;padding:10px 24px;font:inherit;cursor:pointer}.error{color:#f87171}dt{color:#9ca3af}dd{margin:4px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse}td,th{padding:10px;text-align:left;border-bottom:1px solid #484848;overflow-wrap:anywhere}@media(max-width:600px){body{padding:12px}header,section{padding:16px}form,.fields{grid-template-columns:1fr}.history{overflow-x:auto}}`;
const shell=(title,content,extraStyle='',bodyClass='')=>`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(title)} · BidManager</title><style>${style}${extraStyle}</style></head><body class="${bodyClass}"><main>${content}</main></body></html>`;
const detailStyle = `
 body.business-detail{padding:0;background:#242424;font:16px/1.5 'Microsoft YaHei',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
 .business-detail main{max-width:1200px;padding:0 24px}
 .business-detail .detail-header{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:64px;margin:0;padding:12px 20px;background:#080808;border:1px solid #484848;border-top:0;border-radius:0 0 8px 8px}
 .business-detail .detail-header h1{display:flex;align-items:center;gap:8px;font-size:24px;font-weight:400;line-height:1.2;white-space:nowrap}
 .business-detail .detail-header h1 svg{width:26px;height:26px}
 .business-detail .detail-actions{display:flex;justify-content:flex-end;gap:8px;margin:0;flex-shrink:0}
 .business-detail .detail-button{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:5px 12px;border:1px solid #484848;border-radius:6px;background:#242424;color:#9ca3af;font-size:14px;text-decoration:none;white-space:nowrap}
 .business-detail .detail-button:hover{border-color:#7c3aed;color:#f3f4f6}
 .business-detail a:focus-visible{outline:2px solid #7c3aed;outline-offset:3px}
 .business-detail .detail-primary-button,.business-form .form-save{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:5px 16px;background:#7c3aed;border:1px solid #7c3aed;border-radius:6px;color:#fff;font:14px/1.5 'Microsoft YaHei',system-ui,sans-serif}
 .business-detail .detail-primary-button:hover,.business-form .form-save:hover{background:#4f46e5;border-color:#4f46e5;color:#fff}
 .business-detail .detail-primary-button:focus-visible,.business-form .form-save:focus-visible{outline:2px solid #a78bfa;outline-offset:3px}
 .business-detail .detail-card{margin:16px 0 24px;padding:16px;background:#242424;border:1px solid #484848;border-radius:8px}
 .business-detail .detail-group+.detail-group{margin-top:16px;padding-top:16px;border-top:1px solid #484848}
 .business-detail .detail-group h2{display:flex;align-items:center;gap:8px;margin:0 0 24px;color:#9ca3af;font-size:20px;line-height:1.2;font-weight:400}
 .business-detail .detail-icon{display:block;width:20px;height:20px;flex-shrink:0}
 .business-detail .detail-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
 .business-detail .detail-fields{display:grid;align-content:start;gap:8px;margin:0;min-width:0}
 .business-detail .detail-row{display:grid;grid-template-columns:112px minmax(0,1fr);align-items:start;min-width:0}
 .business-detail dt{color:#9ca3af}
 .business-detail dd{min-width:0;margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
 .business-detail .detail-name{font-weight:500}
 .business-detail .detail-status-value{display:block;font:inherit}
 .business-detail .detail-link{color:#7c3aed;text-decoration:none}
 .business-detail .detail-link:hover{text-decoration:underline}
 .business-detail .detail-timeline{display:grid;grid-auto-rows:auto;list-style:none;padding:0;margin:0}
 .business-detail .detail-history-head,.business-detail .detail-history-grid{display:grid;grid-template-columns:144px 80px 88px repeat(2,minmax(0,1fr));column-gap:16px;row-gap:8px;min-width:0}
 .business-detail .detail-history-head{margin-left:36px;padding-bottom:10px;border-bottom:1px solid #484848;color:#9ca3af;font-size:14px}
 .business-detail .detail-history-entry{display:grid;position:relative;padding:8px 0 9px 36px;overflow-wrap:anywhere}
 .business-detail .detail-history-entry:not(:last-child)::before{content:'';position:absolute;left:36px;right:0;bottom:0;height:1px;background:#484848}
 .business-detail .detail-history-entry:not(:last-child)::after{content:'';position:absolute;left:9px;top:36px;bottom:-4px;width:2px;background:#374151}
 .business-detail .detail-history-entry>.detail-icon{position:absolute;left:0;top:10px;color:#10b981;width:20px;height:20px}
 .business-detail .detail-history-grid{align-content:start;margin:0}
 .business-detail .detail-history-cell{min-width:0}
 .business-detail .detail-history-cell-label{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
 .business-detail .detail-history-time,.business-detail .detail-history-actor{color:#9ca3af;font-size:14px;line-height:24px}
 .business-detail .detail-history-time dd{white-space:nowrap}
 .business-detail .detail-history-field{font-weight:500}
 .business-detail .detail-history-before dd{color:#9ca3af}
 .business-detail .detail-history-after dd{color:#f3f4f6}
 .business-detail .detail-history-note{grid-column:4/-1;display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;min-width:0;font-size:14px}
 .business-detail .detail-history-note dt,.business-detail .detail-history-note dd{color:#9ca3af}
 .business-detail .detail-empty{color:#9ca3af;margin:0}
 .business-detail .detail-bottom-actions{margin-top:16px;padding-top:24px;border-top:0}
 @media(max-width:767px){.business-detail main{padding:0 12px}.business-detail .detail-header{padding:12px}.business-detail .detail-header h1{font-size:20px}.business-detail .detail-header h1 svg{width:22px;height:22px}.business-detail .detail-columns{grid-template-columns:1fr}.business-detail .detail-row{grid-template-columns:96px minmax(0,1fr)}.business-detail .detail-group h2{margin-bottom:18px}}
 @media(max-width:767px){.business-detail .detail-history-head{display:none}.business-detail .detail-history-grid{grid-template-columns:minmax(0,1fr);gap:10px}.business-detail .detail-history-cell-label{position:static;width:auto;height:auto;margin:0 0 2px;overflow:visible;clip-path:none;white-space:normal;font-size:12px;line-height:1.5;font-weight:400}.business-detail .detail-history-time,.business-detail .detail-history-actor{display:grid;grid-template-columns:60px minmax(0,1fr);gap:8px;line-height:1.5}.business-detail .detail-history-time .detail-history-cell-label,.business-detail .detail-history-actor .detail-history-cell-label{font-size:14px;margin:0}.business-detail .detail-history-field .detail-history-cell-label{display:none}.business-detail .detail-history-note{grid-column:1/-1;display:block}.business-detail .detail-history-note dt{font-size:12px;margin-bottom:2px}}
`;
const formStyle = `
 .business-form .edit-form{display:block;margin:0}
 .business-form .detail-group+.detail-group{margin-top:24px;padding-top:0;border-top:0}
 .business-form .form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
 .business-form .form-field{min-width:0}
 .business-form .form-field-wide{grid-column:1/-1}
 .business-form label{display:block;margin:0;color:#9ca3af}
 .business-form .required-mark{margin-left:4px;color:#ef4444}
 .business-form input,.business-form select,.business-form textarea{display:block;min-width:0;width:100%;margin:4px 0 0;padding:6px 12px;background:#242424;border:1px solid #484848;border-radius:6px;color:#f3f4f6;font:inherit;line-height:1.5;color-scheme:dark}
 .business-form input,.business-form select{height:36px}
 .business-form textarea{min-height:90px;padding:8px 12px;resize:vertical}
 .business-form input:focus,.business-form select:focus,.business-form textarea:focus{outline:none;border-color:#7c3aed;box-shadow:0 0 0 1px #7c3aed}
 .business-form input::placeholder,.business-form textarea::placeholder{color:#9ca3af}
 .business-form .form-error{margin:0 0 20px;padding:10px 12px;border:1px solid #7f1d1d;border-radius:6px;color:#f87171;background:#301515;overflow-wrap:anywhere}
 .business-form .form-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:24px;padding-top:16px;border-top:0}
 @media(max-width:767px){.business-form .form-grid{grid-template-columns:1fr}}
`;
const iconPaths = {
 briefcase:'<path d="M9 7V5h6v2"/><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M3 13h18"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
 people:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3H3m13-17a3 3 0 0 1 0 6m2 5a5 5 0 0 1 3 5v1h-3"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
 flag:'<path d="M4 22V3m0 1c6-4 10 4 16 0v11c-6 4-10-4-16 0"/>',
 history:'<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7m2-4v5l3 2"/>',
 note:'<path d="M14 3H5v18h14V8l-5-5v5h5M8 12h8m-8 4h8"/>',
 check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>'
};
const detailIcon = (name,color='currentColor') => `<svg class="detail-icon" style="color:${color}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]}</svg>`;
const displayValue = value => escapeHTML(value === null || value === undefined || value === '' ? '-' : value);
const displayDate = (value,time=false) => value ? escapeHTML(String(value).replace('T',' ').slice(0,time?16:10)) : '-';
const detailField = (key,label,value,cls='') => `<div class="detail-row" data-field="${key}"><dt>${label}</dt><dd${cls?` class="${cls}"`:''}>${value}</dd></div>`;
const detailFields = rows => `<dl class="detail-fields">${rows.join('')}</dl>`;
const detailColumns = (left,right) => `<div class="detail-columns">${detailFields(left)}${detailFields(right)}</div>`;
const detailGroup = (title,icon,color,content) => `<div class="detail-group"><h2>${detailIcon(icon,color)}${title}</h2>${content}</div>`;

function businessDetailPage(business,history) {
 const value = key => displayValue(business[key]);
 const field = (key,label,formatted=value(key),cls='') => detailField(key,label,formatted,cls);
 const statusValue = key => `<span class="detail-status-value">${value(key)}</span>`;
 const amount = Number(business.bid_amount)>0 ? '¥'+Number(business.bid_amount).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}) : '-';
 let documentLink = value('document_url');
 try {
  const url = new URL(business.document_url);
  if(['http:','https:'].includes(url.protocol)) documentLink = `<a class="detail-link" href="${escapeHTML(url.href)}" target="_blank" rel="noopener noreferrer">${value('document_url')}</a>`;
 } catch {}
 const actions = `<nav class="detail-actions" aria-label="业务操作"><a class="detail-button" href="/ui/console">返回</a><a class="detail-button detail-primary-button" href="/ui/business/${business.id}/edit">编辑</a></nav>`;
 const groups = [
  detailGroup('基本信息','info','#7c3aed',detailColumns([
   field('name','业务名称',value('name'),'detail-name'),field('customer','客户单位'),field('service_people','服务人数')
  ],[
   field('bid_amount','招标金额',escapeHTML(amount)),field('previous_suppliers','过往服务商')
  ])),
  detailGroup('联系人信息','people','#4f46e5',detailColumns([
   field('bid_contact_name','投标联系人'),field('bid_contact_phone','联系电话')
  ],[
   field('customer_contact_name','客户联系人'),field('customer_contact_phone','联系电话')
  ])),
  detailGroup('业务信息','briefcase','#f59e0b',detailFields([
   field('service_content','服务内容'),field('document_url','标书地址',documentLink)
  ])),
  detailGroup('时间信息','calendar','#10b981',detailColumns([
   field('registration_time','报名时间',displayDate(business.registration_time)),field('bid_time','投标时间',displayDate(business.bid_time))
  ],[
   field('created_at','录入时间',displayDate(business.created_at,true)),field('updated_at','更新时间',displayDate(business.updated_at,true))
  ])),
  detailGroup('状态信息','flag','#8b5cf6',detailColumns([
   field('document_status','标书状态',statusValue('document_status')),field('bid_status','投标状态',statusValue('bid_status'))
  ],[
   field('priority','优先级',statusValue('priority')),field('payment_status','收款情况',statusValue('payment_status'))
  ]))
 ];
 if(business.notes) groups.push(detailGroup('备注','note','#9ca3af',detailFields([field('notes','备注')])));
 const historyEntries = history.map(record => {
  const label = labels[fields.indexOf(record.field_name)] || record.field_name;
  return `<li class="detail-history-entry">${detailIcon('check','#10b981')}<dl class="detail-history-grid"><div class="detail-history-cell detail-history-time"><dt class="detail-history-cell-label">时间</dt><dd><time>${displayDate(record.changed_at,true)}</time></dd></div><div class="detail-history-cell detail-history-actor"><dt class="detail-history-cell-label">操作人</dt><dd>${displayValue(record.changed_by)}</dd></div><div class="detail-history-cell detail-history-field"><dt class="detail-history-cell-label">变更字段</dt><dd>${escapeHTML(label)}</dd></div><div class="detail-history-cell detail-history-before"><dt class="detail-history-cell-label">修改前</dt><dd>${displayValue(record.old_value)}</dd></div><div class="detail-history-cell detail-history-after"><dt class="detail-history-cell-label">修改后</dt><dd>${displayValue(record.new_value)}</dd></div>${record.notes?`<div class="detail-history-note"><dt>变更说明</dt><dd>${escapeHTML(record.notes)}</dd></div>`:''}</dl></li>`;
 }).join('');
 groups.push(detailGroup('变更历史','history','#ef4444',historyEntries?`<div class="detail-history-head" aria-hidden="true"><span>时间</span><span>操作人</span><span>变更字段</span><span>修改前</span><span>修改后</span></div><ol class="detail-timeline">${historyEntries}</ol>`:'<p class="detail-empty">暂无变更记录</p>'));
 return shell(`${business.name || '业务'} - 业务详情`,`<header class="detail-header"><h1>${detailIcon('briefcase')}业务详情</h1>${actions}</header><section class="detail-card">${groups.join('')}<div class="detail-bottom-actions">${actions}</div></section>`,detailStyle,'business-detail');
}
const loginStyle = `
 .login-page{min-height:100vh;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:16px;background:linear-gradient(135deg,#0f0f0f 0%,#1a1a1a 100%);color:#e5e5e5;font:14px/1.6 'Microsoft YaHei','PingFang SC',system-ui,sans-serif;-webkit-text-size-adjust:100%;text-size-adjust:100%}
 .login-page main{width:390px;max-width:100%;margin:auto}
 .login-container{width:100%;margin:0;padding:40px;background:rgba(26,26,26,.95);backdrop-filter:blur(20px);border:1px solid #333;border-radius:16px;box-shadow:0 25px 50px -12px rgba(0,0,0,.5)}
 .login-header{margin:0 0 24px;padding:0;border:0;text-align:center}
 .login-title{margin:0;color:#f3f4f6;font-size:24px;font-weight:600;line-height:32px;white-space:nowrap;letter-spacing:-.35px}
 .login-form{--login-control-radius:8px;display:block;margin:0}
 .avatar-section{text-align:center;margin-bottom:24px}
 .avatar-upload{position:relative;display:inline-block;margin-bottom:16px}
 .avatar-preview{display:flex;align-items:center;justify-content:center;width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#374151,#4b5563);border:3px solid #7c3aed;overflow:hidden;transition:transform .2s,border-color .2s}
 .avatar-upload:hover .avatar-preview{border-color:#8b5cf6;transform:scale(1.05)}
 .avatar-upload:focus-within .avatar-preview{outline:2px solid #a78bfa;outline-offset:3px}
 .avatar-preview img{width:100%;height:100%;object-fit:cover}
 .avatar-preview svg{width:32px;height:32px;color:#9ca3af}
 .avatar-initial{font-size:36px;font-weight:600;line-height:1;color:#f3f4f6}
 .login-page .avatar-input{position:absolute;inset:0;width:100%;height:100%;margin:0;padding:0;opacity:0;cursor:pointer}
 .avatar-text{margin:0 0 8px;color:#9ca3af;font-size:14px}
 .login-form .form-group{margin-bottom:16px}
 .login-form .form-group:last-of-type{margin-bottom:32px}
 .login-form .form-label{display:block;margin:0 0 8px;color:#d1d5db;font-weight:500;font-size:14px;line-height:20px}
 .login-form .input-group{position:relative;height:34px;overflow:hidden;background:#101211;border:1px solid #1c1e1d;border-radius:var(--login-control-radius);transition:box-shadow .2s,border-color .2s}
 .login-form .input-group:focus-within{border-color:#8b5cf6;box-shadow:0 0 0 3px rgba(139,92,246,.15)}
 .login-form .input-icon{position:absolute;left:12px;top:50%;transform:translateY(-50%);width:16px;height:16px;color:#9ca3af;pointer-events:none}
 .login-form .input-icon svg{display:block;width:100%;height:100%}
 .login-form .form-input{display:block;width:100%;height:100%;margin:0;padding:0 12px 0 32px;background:#101211;color:#e5e7eb;border:0;border-radius:0;font:inherit;font-size:14px;line-height:20px;outline:none;color-scheme:dark}
 .login-form .form-input:focus{outline:none}
 .login-form .form-input::placeholder{color:#6b7280}
 .login-form .form-input:-webkit-autofill,.login-form .form-input:autofill{-webkit-text-fill-color:#e5e7eb;caret-color:#e5e7eb;box-shadow:0 0 0 1000px #101211 inset;transition:background-color 9999s ease-out 0s}
 .login-form .login-button{display:flex;align-items:center;justify-content:center;width:100%;height:34px;margin:0 0 16px;padding:0 16px;background:#7c3aed;background-clip:padding-box;border:1px solid transparent;border-radius:var(--login-control-radius);color:#fff;font:600 14px/20px 'Microsoft YaHei',system-ui,sans-serif;transition:background-color .2s,transform .2s,box-shadow .2s}
 .login-button:hover{background-color:#6d28d9;transform:translateY(-1px);box-shadow:0 10px 25px -5px rgba(124,58,237,.35)}
 .login-button:active{transform:translateY(0)}
 .login-button:focus-visible{outline:2px solid #a78bfa;outline-offset:3px}
 .login-button:disabled{opacity:.65;cursor:wait;transform:none}
 .login-footer{text-align:center;color:#9ca3af;font-size:12px}
 .login-footer p{margin:0}
 .login-page .error-message{margin:0 0 16px;padding:12px;border:1px solid rgba(239,68,68,.3);border-radius:8px;background:rgba(239,68,68,.1);color:#fca5a5;font-size:14px;overflow-wrap:anywhere}
 .login-page .error-message[hidden]{display:none}
 @media(max-width:480px){.login-container{padding:32px}.login-title{font-size:clamp(17px,4.8vw,22px);letter-spacing:0}}
 @media(prefers-reduced-motion:reduce){.login-page *{transition:none}}
`;
export function loginPage(error='') {
 const personIcon='<path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z"/><path d="M12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7z"/>';
 const icon=paths=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
 return shell('登录',`<section class="login-container" aria-labelledby="loginTitle"><header class="login-header"><h1 class="login-title" id="loginTitle">六院体检业务投标管理系统</h1></header><p class="error error-message" role="alert" aria-live="polite"${error?'':' hidden'}>${escapeHTML(error)}</p><form id="loginForm" class="login-form" method="POST" action="/ui/login" enctype="multipart/form-data"><div class="avatar-section"><div class="avatar-upload"><div class="avatar-preview" id="avatarPreview">${icon(personIcon)}</div><input class="avatar-input" type="file" name="avatar" id="avatarInput" accept="image/png,image/jpeg,image/webp" aria-label="上传头像（可选）" aria-describedby="avatarHint" title="支持2MB以内 PNG、JPEG、WebP 图片，自动调整尺寸"></div><p class="avatar-text" id="avatarHint">点击上传头像（可选）</p></div><div class="form-group"><label class="form-label" for="username">用户名</label><div class="input-group"><span class="input-icon">${icon(personIcon)}</span><input class="form-input" type="text" id="username" name="username" placeholder="请输入用户名" required maxlength="80" autocomplete="username"></div></div><div class="form-group"><label class="form-label" for="password">密码</label><div class="input-group"><span class="input-icon">${icon('<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>')}</span><input class="form-input" type="password" id="password" name="password" placeholder="请输入密码" required maxlength="200" autocomplete="current-password"></div></div><button class="login-button" type="submit">登录</button></form><footer class="login-footer"><p>©2026 MaeR 保留所有权利</p></footer><noscript><p class="error-message">登录需要启用 JavaScript。</p></noscript></section><script>
const errorMessage=document.querySelector('.error');
function showLoginError(message){errorMessage.textContent=message;errorMessage.hidden=!message;}
async function prepareAvatar(file) {
 if(!file || !file.size) return null;
 if(file.size>2*1024*1024) throw new Error('头像最大支持2MB，请选择稍小的图片');
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)) throw new Error('请选择 PNG、JPEG 或 WebP 图片');
 let bitmap;
 try { bitmap=await createImageBitmap(file); } catch { throw new Error('无法读取该图片，请更换头像后重试'); }
 try {
  const scale=Math.min(1,512/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const context=canvas.getContext('2d');context.fillStyle='#242424';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.85));
  if(!blob || blob.size>512*1024) throw new Error('头像处理失败，请更换图片后重试');
  return new File([blob],'avatar.jpg',{type:'image/jpeg'});
 } finally { bitmap.close(); }
}
let avatarPreviewURL;
const avatarPreview=document.getElementById('avatarPreview'),avatarPlaceholder=avatarPreview.firstElementChild.cloneNode(true);
const avatarInitial=${avatarInitial.toString()};
function showUsernameAvatar(){
 if(document.getElementById('avatarInput').files.length)return;
 const initial=avatarInitial(document.getElementById('username').value);
 if(initial){const label=document.createElement('span');label.className='avatar-initial';label.textContent=initial;avatarPreview.replaceChildren(label);}
 else avatarPreview.replaceChildren(avatarPlaceholder.cloneNode(true));
}
function resetAvatarPreview(){if(avatarPreviewURL)URL.revokeObjectURL(avatarPreviewURL);avatarPreviewURL=null;showUsernameAvatar();}
for(const event of ['input','change'])document.getElementById('username').addEventListener(event,showUsernameAvatar);
showUsernameAvatar();
document.getElementById('avatarInput').addEventListener('change',async function(){
 showLoginError('');const selected=this.files[0];
 try {
  const file=await prepareAvatar(selected);if(this.files[0]!==selected)return;if(!file){resetAvatarPreview();return;}
  const image=document.createElement('img');image.alt='头像预览';
  if(avatarPreviewURL)URL.revokeObjectURL(avatarPreviewURL);
  avatarPreviewURL=URL.createObjectURL(file);image.src=avatarPreviewURL;
  avatarPreview.replaceChildren(image);
 } catch(error){if(this.files[0]!==selected)return;this.value='';resetAvatarPreview();showLoginError(error.message);}
});
document.getElementById('loginForm').addEventListener('submit', async function(event){
 event.preventDefault();const button=this.querySelector('.login-button');button.disabled=true;button.textContent='登录中…';showLoginError('');
 try {
  const data=new FormData(this);data.set('username',String(data.get('username')).trim());
  const avatar=await prepareAvatar(data.get('avatar'));if(avatar)data.set('avatar',avatar);else data.delete('avatar');
  const response=await fetch('/api/auth/challenge?username='+encodeURIComponent(data.get('username')));
  if(!response.ok)throw new Error('登录服务暂不可用');const challenge=await response.json();
  const encoder=new TextEncoder();const key=await crypto.subtle.importKey('raw',encoder.encode(data.get('password')),'PBKDF2',false,['deriveBits']);
  const result=await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(challenge.salt),iterations:challenge.iterations,hash:'SHA-256'},key,256);
  data.delete('password');data.set('proof',Array.from(new Uint8Array(result),x=>x.toString(16).padStart(2,'0')).join(''));
  const login=await fetch('/ui/login',{method:'POST',body:data});
  if(login.redirected){location.assign(login.url);return;}
  const body=await login.text();const doc=new DOMParser().parseFromString(body,'text/html');showLoginError(doc.querySelector('.error')?.textContent||'登录失败');
 }catch(error){showLoginError(error.message||'登录失败');}finally{button.disabled=false;button.textContent='登录';}
});</script>`,loginStyle,'login-page');
}
export function businessPage(business={},edit=false,history=[],error='') {
 if(!edit) return businessDetailPage(business,history);
 const options={document_status:['未获取','已获取'],bid_status:['未报名','已报名','未投标','已投标','未中标','已中标'],priority:['低','中','高'],payment_status:['','未收款','部分收款','已收款','延期收款']};
 const title=business.id?'编辑业务':'新增业务';
 const inputField=(key,label=labels[fields.indexOf(key)],wide=false)=>{
  const value=String(business[key]??''),required=['name','customer'].includes(key);
  const id=`business-${key}`;
  let control;
  if(options[key]){
   const choices=[...options[key]];
   // Preserve imported/custom payment values rather than silently changing them on save.
   if(value&&!choices.includes(value))choices.push(value);
   const selected=value||choices[0];
   control=`<select id="${id}" name="${key}">${choices.map(option=>`<option value="${escapeHTML(option)}" ${option===selected?'selected':''}>${escapeHTML(option||'请选择收款情况')}</option>`).join('')}</select>`;
  } else if(['service_content','notes','change_notes'].includes(key)){
   control=`<textarea id="${id}" name="${key}" rows="3" maxlength="${key==='change_notes'?2000:20000}">${escapeHTML(value)}</textarea>`;
  } else {
   const type=['registration_time','bid_time'].includes(key)?'date':['bid_amount','service_people'].includes(key)?'number':key==='document_url'?'url':key.endsWith('_phone')?'tel':'text';
   control=`<input id="${id}" type="${type}" name="${key}" value="${escapeHTML(type==='date'?value.slice(0,10):value)}" ${required?'required maxlength="200"':''} ${type==='number'?`min="0" step="${key==='bid_amount'?'0.01':'1'}"`:''}>`;
  }
  return `<div class="form-field${wide?' form-field-wide':''}"><label for="${id}">${label}${required?'<span class="required-mark" aria-hidden="true">*</span>':''}</label>${control}</div>`;
 };
 const group=(title,icon,color,rows)=>detailGroup(title,icon,color,`<div class="form-grid">${rows.join('')}</div>`);
 const content=[
  group('基本信息','info','#7c3aed',[inputField('name'),inputField('customer')]),
  group('联系人信息','people','#4f46e5',[
   inputField('bid_contact_name'),inputField('bid_contact_phone','联系电话'),inputField('customer_contact_name'),inputField('customer_contact_phone','联系电话')
  ]),
  group('业务信息','briefcase','#f59e0b',[
   inputField('bid_amount'),inputField('service_people'),inputField('document_url','标书获取地址',true),inputField('service_content','服务内容',true),inputField('previous_suppliers','过往服务商',true)
  ]),
  group('时间信息','calendar','#10b981',[inputField('registration_time'),inputField('bid_time')]),
  group('状态信息','flag','#8b5cf6',[inputField('document_status'),inputField('bid_status'),inputField('priority'),inputField('payment_status')]),
  group('备注信息','note','#ef4444',[inputField('notes','备注',true),inputField('change_notes','变更说明',true)])
 ].join('');
 const back=`<a class="detail-button" href="/ui/console">返回</a>`;
 return shell(title,`<header class="detail-header"><h1>${detailIcon('briefcase')}${title}</h1><nav class="detail-actions" aria-label="业务操作">${back}</nav></header><section class="detail-card">${error?`<p class="form-error" role="alert">${escapeHTML(error)}</p>`:''}<form id="editBizForm" class="edit-form" method="POST" action="${business.id?'/business/'+business.id+'/edit':'/business/new'}">${content}<div class="form-actions">${back}<button class="form-save" type="submit">保存</button></div></form></section>`,detailStyle+formStyle,'business-detail business-form');
}
