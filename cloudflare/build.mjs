import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { build } from 'esbuild';
const root=new URL('../',import.meta.url),output=new URL('public/static/',import.meta.url);
await mkdir(new URL('figma/BDpage/',output),{recursive:true});
await mkdir(new URL('vendor/',output),{recursive:true});
let page=await readFile(new URL('static/figma/BDpage/order-management.html',root),'utf8');
page=page.replace('https://cdn.tailwindcss.com','/static/vendor/tailwindcdn.js').replace('https://cdn.jsdelivr.net/npm/chart.js@4.4.8/dist/chart.umd.min.js','/static/vendor/chart.umd.js').replace('https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/css/font-awesome.min.css','/static/vendor/font-awesome/css/font-awesome.min.css').replace('node_modules/bootstrap-icons/font/bootstrap-icons.css','/static/vendor/bootstrap-icons/font/bootstrap-icons.css');
page=page.replace('</head>','<script defer src="/static/vendor/browser-pdf.js"></script></head>');
page=page.replace('id="btnDelete"','id="btnDelete" disabled').replace('id="btnExport"','id="btnExport" disabled');
page=page.replace("const btnExport = document.getElementById('btnExport');","const btnExport = document.getElementById('btnExport');\n            let currentUserRole = null;");
for(const id of ['btnDelete','btnExport']) {
    const hook=`if(${id}){ ${id}.onclick = async ()=>{`;
    if(!page.includes(hook))throw new Error('Permission hook not found: '+id);
    page=page.replace(hook,hook+"\n                if(currentUserRole !== 'admin'){ showTip('当前用户不具有此权限'); return; }");
}
page=page.replace('const cellTexts = {',`const escapeCell = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));\n                    const cellTexts = {`);
page=page.replace(/\$\{cellTexts\.(\w+)\}/g, '${escapeCell(cellTexts.$1)}');
const start=page.indexOf("                    if(!resp.ok || !resp.headers.get('Content-Type')?.includes('application/pdf')){");
const end=page.indexOf("                    showTip('PDF 已生成，开始下载');",start);
if(start<0||end<0)throw new Error('PDF export hook not found');
page=page.slice(0,start)+`                    const data = await resp.json();\n                    if(!resp.ok) throw new Error(data.message || '导出失败');\n                    await window.BidManagerPDF(data.items, {exporter:data.exporter});\n`+page.slice(end);
page=page.replaceAll('https://picsum.photos/id/1005/200/200','/static/default-avatar.svg');
page=page.replace(/async function updateUserInfo\(\) \{[\s\S]*?\n            \}/,`async function updateUserInfo() {
                try {
                    const response = await fetch('/api/user/avatar');
                    if(!response.ok) return;
                    const data = await response.json();
                    currentUserRole=data.role;
                    ['userAvatar','dropdownAvatar'].forEach(id => { const el=document.getElementById(id); if(el) el.src=data.avatar_url; });
                    const username=document.getElementById('dropdownUsername'),role=document.getElementById('dropdownRole');
                    if(username) username.textContent=data.username;
                    if(role) role.textContent=data.role==='admin'?'管理员':'用户';
                    for(const id of ['btnDelete','btnExport']) {
                        const button=document.getElementById(id);
                        if(button) button.disabled=false;
                    }
                } catch(error) { console.error('获取用户信息失败',error); }
            }`);
await writeFile(new URL('figma/BDpage/order-management.html',output),page);
await copyFile(new URL('static/vendor/tailwind/tailwindcdn.js',root),new URL('vendor/tailwindcdn.js',output));
await mkdir(new URL('vendor/pdf-fonts/',output),{recursive:true});
for (const file of ['BidManagerSansSC-Regular.ttf', 'OFL.txt']) {
 await copyFile(new URL('static/vendor/pdf-fonts/'+file,root),new URL('vendor/pdf-fonts/'+file,output));
}
await copyFile(new URL('node_modules/chart.js/dist/chart.umd.js',root),new URL('vendor/chart.umd.js',output));
for(const [pkg,files] of [['font-awesome',['css/font-awesome.min.css','fonts/fontawesome-webfont.woff2','fonts/fontawesome-webfont.woff','fonts/fontawesome-webfont.ttf']],['bootstrap-icons',['font/bootstrap-icons.css','font/fonts/bootstrap-icons.woff2','font/fonts/bootstrap-icons.woff']]]) {
 for(const file of files){const target=new URL('vendor/'+pkg+'/'+file,output);await mkdir(new URL('./',target),{recursive:true});await copyFile(new URL('node_modules/'+pkg+'/'+file,root),target);}
}
await writeFile(new URL('default-avatar.svg',output),'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="50" fill="#35303f"/><circle cx="50" cy="35" r="18" fill="#9ca3af"/><path d="M18 90a32 32 0 0 1 64 0" fill="#9ca3af"/></svg>');
await build({entryPoints:[new URL('browser-pdf.js',import.meta.url).pathname.replace(/^\/(\w:)/,'$1')],bundle:true,minify:true,format:'iife',outfile:new URL('vendor/browser-pdf.js',output).pathname.replace(/^\/(\w:)/,'$1')});
console.log('Cloudflare assets built');
