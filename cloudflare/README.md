# BidManager v2.0.0 — Cloudflare 部署

本目录提供独立的 JavaScript Workers 后端、D1 数据库、浏览器 PDF 导出。本地 Flask 入口继续保留，二者各自使用独立数据库，不会自动双向同步。

## 功能

- 保留业务列表、搜索、状态筛选、截止日排序、统计卡片、10/20/50 条分页、多选和取消选中。
- 新增/查看/编辑业务、状态更新、完整变更记录；删除和导出仅管理员可用。
- 登录会话保存在 D1，24 小时过期，退出或重置密码会使相应会话失效。
- 不设默认管理员密码。浏览器使用 PBKDF2-SHA256（31万次）派生登录凭据，服务端保存其 SHA256 验证值，避免将耗时派生计算放在 Workers；登录需 JavaScript 和 HTTPS（localhost 本地验证除外）。另有登录限流、同源写请求检查和 HTML 转义。
- 头像保存在 D1，限 PNG/JPEG/WebP、100KB，无需另开 R2 计费服务。
- PDF 在用户浏览器生成，中文按图像嵌入，分页按实际行高分组，支持选中导出和确认全部导出；无需 Node PDF 服务和 Browser Run。
- PDF 是 A4 横向业务列表，文字暂不支持搜索或复制，与旧版服务端 PDF 的版式有所不同。
- 所需图标、Chart.js、Tailwind 和 PDF 依赖随静态资源发布，不依赖外部 CDN。

## 本地验证（Node.js 22.18+、Python 3）

在项目根目录执行。首次安装不需要下载 Chromium：

```powershell
$env:PUPPETEER_SKIP_DOWNLOAD = 'true'
npm.cmd ci
npm.cmd run build:cloudflare
npx.cmd wrangler d1 migrations apply bidmanager --local
npm.cmd run test:cloudflare
```

创建独立的云端管理员，旧版 Werkzeug 密码哈希不直接迁移：

```powershell
$env:BID_USERNAME = Read-Host '管理员用户名'
$securePassword = Read-Host '管理员密码（至少12个字符）' -AsSecureString
$env:BID_PASSWORD = [System.Net.NetworkCredential]::new('', $securePassword).Password
node cloudflare/create-user.mjs
Remove-Item Env:BID_PASSWORD
npx.cmd wrangler d1 execute bidmanager --local --file=cloudflare/user.private.sql
Remove-Item -LiteralPath cloudflare/user.private.sql
npm.cmd run dev:cloudflare
```

访问 http://localhost:8787/ui/login。运行测试会使用内存中的独立数据库，不改动本地业务库。

## 上线

1. 注册并登录 Cloudflare，保持 Workers Free 计划。
2. `npx.cmd wrangler login` 完成浏览器授权。
3. `npx.cmd wrangler d1 create bidmanager`，将返回的数据库 ID 填入根目录 `wrangler.jsonc` 的 `database_id`；占位 ID 不能直接部署。
4. `npx.cmd wrangler d1 migrations apply bidmanager --remote` 创建空数据库结构。
5. 按上面的步骤重新生成管理员 SQL，改用 `npx.cmd wrangler d1 execute bidmanager --remote --file=cloudflare/user.private.sql`；完成后删除 SQL 文件和密码环境变量。
6. 如需迁移旧数据，使用下一节；否则直接部署空业务库。
7. `npm.cmd run deploy:cloudflare`，访问输出的 `workers.dev` 地址，无需购买域名。

无需配置付费 Workers、R2、Browser Run 或外部数据库。不要把密码、头像、SQL 数据导出提交到 GitHub。

## 迁移现有业务

导出工具以只读方式打开 SQLite，仅导出业务和变更记录，不导出账号密码。首次向空 D1 导入：

```powershell
python cloudflare/export-sqlite.py F:\AI\BusinessMT\instance\business_management.db
npx.cmd wrangler d1 execute bidmanager --remote --file=cloudflare/business.private.sql
Remove-Item -LiteralPath cloudflare/business.private.sql
```

先将 `--remote` 改为 `--local` 可验证数据。不能重复向同一非空数据库导入，否则主键冲突；工具不会清空现有数据。工具会跳过旧库中已删除业务的孤立历史并报告数量，原 SQLite 不作改动。迁移后旧版账号需单独重建。先备份原 SQLite，再确定上线后的数据以哪一端为准。

## 免费额度与验证边界

按当前官方政策：Workers 每日 10 万请求、每次 10ms CPU；D1 总存储5GB，每日读500万行、写10万行。D1 的读取按扫描行计费，需要定期关注用量。免费计划有额度限制，不能承诺永久不变或无条件可用。

本地验证不等于线上10ms CPU预算验证。首次上线后需核查登录校验、统计及大量业务导出的实际 CPU 指标；超限时需优化，不能静默升级付费计划。浏览器 PDF 的速度和文件大小受用户设备及导出条数影响。

相关文档：[Workers 免费额度](https://developers.cloudflare.com/workers/platform/pricing/)、[D1 额度](https://developers.cloudflare.com/d1/platform/pricing/)、[D1 数据备份](https://developers.cloudflare.com/d1/reference/time-travel/)。

上线后应验证登录、编辑、新增、删除、历史记录、统计、选中和全部 PDF、手机布局，并定期备份 D1 数据。
