import { writeFile } from 'node:fs/promises';
import { passwordHash } from './worker.js';
const username=process.env.BID_USERNAME,password=process.env.BID_PASSWORD,role=process.env.BID_ROLE||'admin';
if(!username||username.length>80||!password||password.length<6||password.length>200||!['admin','user'].includes(role))throw new Error('设置 BID_USERNAME、BID_PASSWORD（6至200个字符）、可选 BID_ROLE（admin/user）');
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const hash=await passwordHash(password);
await writeFile(new URL('user.private.sql',import.meta.url),`INSERT INTO app_user(username,password_hash,role) VALUES (${quote(username)},${quote(hash)},${quote(role)}) ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash,role=excluded.role,is_active=1;\nDELETE FROM session WHERE user_id=(SELECT id FROM app_user WHERE username=${quote(username)});\n`,{mode:0o600});
console.log('已生成 cloudflare/user.private.sql（含密码哈希，不要提交）；执行 D1 SQL 后删除该文件。');
