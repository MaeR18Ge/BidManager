import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
const escapeHTML = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
window.BidManagerPDF = async function(items) {
 if(!items.length) throw new Error('没有可导出的业务');
 const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
 const host=document.createElement('div');
 host.style.cssText='position:fixed;left:-2000px;top:0;width:1120px;background:#fff;color:#111;font:14px/1.5 system-ui,"Microsoft YaHei",sans-serif;padding:24px;';
 document.body.appendChild(host);
 const cols=[['name','业务名称'],['service_people','服务人数'],['bid_amount','招标金额'],['registration_time','报名时间'],['bid_time','投标时间'],['document_status','标书状态'],['bid_status','投标状态'],['priority','优先级'],['created_at','录入时间']];
 let page=0;
 try {
  // Measure actual row heights before deciding page breaks, including long names.
  let index=0;
  while(index<items.length) {
   host.innerHTML=`<h1 style="font-size:22px;margin:0 0 10px">投标管理 · 业务列表</h1><p style="margin:0 0 12px">共 ${items.length} 条 · 第 ${page+1} 页 · ${escapeHTML(new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}))}</p><table style="width:100%;table-layout:fixed;border-collapse:collapse"><colgroup><col style="width:29%">${cols.slice(1).map(()=>'<col>').join('')}</colgroup><thead><tr>${cols.map(([,label])=>`<th style="text-align:left;border:1px solid #bbb;padding:8px;background:#eee">${label}</th>`).join('')}</tr></thead><tbody></tbody></table>`;
   const tbody=host.querySelector('tbody');let count=0;
   while(index<items.length) {
    const row=items[index],tr=document.createElement('tr');
    tr.innerHTML=cols.map(([key])=>{let value=row[key]??'—';if(key==='bid_amount')value='¥'+Number(value||0).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});if(key.endsWith('_time')||key==='created_at')value=String(value).slice(0,10);return `<td style="border:1px solid #bbb;padding:8px;overflow-wrap:anywhere;vertical-align:top">${escapeHTML(value)}</td>`;}).join('');
    tbody.appendChild(tr);
    if(host.scrollHeight>700 && count>0){tr.remove();break;}
    count++;index++;
   }
   await document.fonts.ready;
   const canvas=await html2canvas(host,{scale:1.5,backgroundColor:'#ffffff',logging:false});
   if(page++)pdf.addPage();
   const width=277,height=canvas.height*width/canvas.width;
   pdf.addImage(canvas.toDataURL('image/jpeg',.92),'JPEG',10,10,width,Math.min(height,190));
   canvas.width=0;canvas.height=0;
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  pdf.save(`业务列表_${new Date().toLocaleDateString('sv-SE')}.pdf`);
 }finally{host.remove();}
};
