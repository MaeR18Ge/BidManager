import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const PAGE_WIDTH = 960;
const CONTENT_WIDTH_MM = 180;
const CONTENT_HEIGHT_MM = 257;
const MAX_HEIGHT = PAGE_WIDTH * CONTENT_HEIGHT_MM / CONTENT_WIDTH_MM;
const columns = [
    ['name', '业务名称', 35, 'pdf-name'],
    ['service_people', '服务人数', 8, 'pdf-right'],
    ['bid_amount', '招标金额', 13, 'pdf-amount'],
    ['registration_time', '报名时间', 7, 'pdf-center'],
    ['bid_time', '投标时间', 7, 'pdf-center'],
    ['document_status', '标书状态', 8, 'pdf-center'],
    ['bid_status', '投标状态', 8, 'pdf-center'],
    ['priority', '优先级', 6, 'pdf-center'],
    ['created_at', '录入时间', 8, 'pdf-center']
];
const statusColors = {
    '已获取':'#28a745', '已下载':'#17a2b8', '已报名':'#17a2b8',
    '已投标':'#007bff', '已中标':'#28a745'
};
const priorityColors = {'低':'#6c757d', '中':'#ffc107', '高':'#dc3545'};
const currency = value => '¥' + Number(value || 0).toLocaleString('zh-CN', {minimumFractionDigits:2, maximumFractionDigits:2});

function cellHTML(row, key) {
    const value = row[key];
    if (key === 'service_people') return Number(value) > 0 ? escapeHTML(value) + '人' : '-';
    if (key === 'bid_amount') return Number(value) > 0 ? escapeHTML(currency(value)) : '-';
    if (key.endsWith('_time') || key === 'created_at') return /^\d{4}-\d{2}-\d{2}/.test(String(value || '')) ? escapeHTML(String(value).slice(5, 10)) : '-';
    if (key === 'document_status' || key === 'bid_status' || key === 'priority') {
        if (!value) return '-';
        const priority = key === 'priority';
        const background = (priority ? priorityColors : statusColors)[value] || '#6c757d';
        const color = priority && value === '中' ? '#000' : '#fff';
        return `<span class="pdf-badge${priority ? ' pdf-priority' : ''}" style="background:${background};color:${color}">${escapeHTML(value)}</span>`;
    }
    return escapeHTML(value || '-');
}

const stylesheet = `
    [data-bidmanager-pdf] { box-sizing:border-box; background:#fff; color:#111; font:14px/1.4 "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",Arial,sans-serif; }
    [data-bidmanager-pdf] * { box-sizing:border-box; font-family:inherit; }
    [data-bidmanager-pdf] .pdf-header { text-align:center; margin-bottom:30px; border-bottom:2px solid #333; padding:0 0 12px; }
    [data-bidmanager-pdf] h1 { color:#333; margin:0 0 12px; font-size:26px; font-weight:700; line-height:1.4; }
    [data-bidmanager-pdf] .pdf-header p { color:#666; margin:5px 0; font-size:13px; }
    [data-bidmanager-pdf] table { width:100%; table-layout:fixed; border-collapse:collapse; font-size:14px; }
    [data-bidmanager-pdf] th, [data-bidmanager-pdf] td { border:0; border-bottom:1px solid #dee2e6; padding:12px 5px; text-align:left; vertical-align:middle; white-space:nowrap; line-height:1.4; }
    [data-bidmanager-pdf] th { background:#f8f9fa; color:#495057; font-weight:600; border-bottom:2px solid #dee2e6; }
    [data-bidmanager-pdf] .pdf-name { font-weight:700; white-space:normal; overflow-wrap:anywhere; }
    [data-bidmanager-pdf] .pdf-right, [data-bidmanager-pdf] .pdf-amount { text-align:right; font-variant-numeric:tabular-nums; }
    [data-bidmanager-pdf] .pdf-amount { font-weight:700; }
    [data-bidmanager-pdf] .pdf-center { text-align:center; }
    [data-bidmanager-pdf] .pdf-badge { display:inline-block; min-width:56px; padding:3px 6px; border-radius:3px; text-align:center; font-size:11px; font-weight:700; line-height:1.4; }
    [data-bidmanager-pdf] .pdf-priority { width:38px; min-width:0; padding:3px 0; }
    [data-bidmanager-pdf] .pdf-footer { margin-top:24px; padding:12px 0 4px; border-top:1px solid #ddd; color:#666; text-align:center; font-size:12px; }
    /* html2canvas measures font baselines with a hidden inline image in the original document. */
    body > div[style*="visibility: hidden"][style*="white-space: nowrap"] > img { display:inline-block !important; }
`;

window.BidManagerPDF = async function(items, options = {}) {
    if (!items.length) throw new Error('没有可导出的业务');
    const pdf = new jsPDF({orientation:'portrait', unit:'mm', format:'a4', compress:true});
    const parts = Object.fromEntries(new Intl.DateTimeFormat('zh-CN', {
        timeZone:'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit',
        hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'
    }).formatToParts(new Date()).map(part => [part.type, part.value]));
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    const time = `${parts.hour}:${parts.minute}:${parts.second}`;
    const displayTime = `${parts.year}年${parts.month}月${parts.day}日 ${time}`;
    const totalAmount = items.reduce((total, row) => total + Number(row.bid_amount || 0), 0);
    const header = `<header class="pdf-header"><h1>六院体检业务管理系统 - 业务列表</h1><p>导出时间: ${displayTime}</p><p>总记录数: ${items.length} 条 | 导出人: ${escapeHTML(options.exporter || '系统')}</p></header>`;
    const footer = `<footer class="pdf-footer">总金额: ${escapeHTML(currency(totalAmount))} | 生成时间: ${date} ${time}</footer>`;
    const host = document.createElement('div');
    host.dataset.bidmanagerPdf = '';
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = `position:fixed;left:-2000px;top:0;width:${PAGE_WIDTH}px;margin:0;padding:0;`;
    document.body.appendChild(host);
    let page = 0;

    try {
        let index = 0;
        while (index < items.length) {
            host.innerHTML = `<style>${stylesheet}</style>${page === 0 ? header : ''}<table><colgroup>${columns.map(([, , width]) => `<col style="width:${width}%">`).join('')}</colgroup><thead><tr>${columns.map(([, label, , cls]) => `<th class="${cls}">${label}</th>`).join('')}</tr></thead><tbody></tbody></table>`;
            await document.fonts.ready;
            const tbody = host.querySelector('tbody');
            let count = 0;

            while (index < items.length) {
                const tr = document.createElement('tr');
                tr.innerHTML = columns.map(([key, , , cls]) => `<td class="${cls}">${cellHTML(items[index], key)}</td>`).join('');
                tbody.appendChild(tr);
                // Include the final summary in pagination so it never creates an empty trailing page.
                if (index === items.length - 1) host.insertAdjacentHTML('beforeend', footer);
                if (host.getBoundingClientRect().height > MAX_HEIGHT) {
                    if (count === 0) throw new Error('单条业务内容超过一页，请缩短业务名称后重试');
                    tr.remove();
                    host.querySelector('.pdf-footer')?.remove();
                    break;
                }
                count++;
                index++;
            }

            const canvas = await html2canvas(host, {scale:2, backgroundColor:'#fff', logging:false});
            if (page++) pdf.addPage();
            // Preserve the measured aspect ratio instead of compressing tall content to fit.
            pdf.addImage(canvas.toDataURL('image/jpeg', .95), 'JPEG', 15, 20, CONTENT_WIDTH_MM, canvas.height * CONTENT_WIDTH_MM / canvas.width);
            canvas.width = 0;
            canvas.height = 0;
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        const totalPages = pdf.getNumberOfPages();
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(130);
        for (let number = 1; number <= totalPages; number++) {
            pdf.setPage(number);
            pdf.text(`${number} / ${totalPages}`, 105, 286, {align:'center'});
        }
        pdf.save(`业务列表_${date}.pdf`);
    } finally {
        host.remove();
    }
};
