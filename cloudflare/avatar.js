export function avatarInitial(username) {
 const first=Array.from(String(username??'').trim())[0]||'';
 return Array.from(first.toUpperCase())[0]||'';
}

export function defaultAvatarURL(username) {
 const initial=(avatarInitial(username)||'?').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="50" fill="#35303f"/><text x="50" y="50" dy=".35em" text-anchor="middle" fill="#f3f4f6" font-family="Microsoft YaHei,system-ui,sans-serif" font-size="44" font-weight="600">${initial}</text></svg>`;
 return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
