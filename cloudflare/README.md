# Cloudflare 部署指南

适用版本：**BidManager v2.0.3**。从项目根目录执行命令，以下示例使用 Windows PowerShell。

Workers 处理页面、身份验证和业务接口，D1 保存业务、变更历史、账户及会话；静态资源随 Worker 发布，PDF 在浏览器生成。线上无需 Flask、Python、Node PDF 服务、R2 或 Browser Run。

## 本地准备

安装 Node.js 22.18 或更新版本及 Git：

```powershell
git clone https://github.com/MaeR18Ge/BidManager.git
Set-Location BidManager
$env:PUPPETEER_SKIP_DOWNLOAD = 'true'
npm.cmd ci
npm.cmd run build:cloudflare
npx.cmd wrangler d1 migrations apply bidmanager --local
npm.cmd run test:cloudflare
npm.cmd run dev:cloudflare
```

本地管理页为 `http://127.0.0.1:8787/admin`，登录页为 `http://127.0.0.1:8787/ui/login`。本地和远程 D1 数据互相独立；`--local` 不会修改线上数据库。

线上分享登录链接时使用完整的 HTTPS 地址。微信等内置浏览器通过 HTTP 打开时，可能不提供登录所需的 `crypto.subtle` 接口；当前 Worker 会将生产环境 HTTP 页面访问自动跳转到 HTTPS，并拒绝 HTTP 写请求。仍出现旧报错时关闭旧页面，重新打开完整 HTTPS 链接。自定义域名应同时记录在 `wrangler.jsonc` 的 `routes` 中，使用 `custom_domain: true`，保证后续发布沿用该域名。

## 首次上线

### 1. 登录并创建数据库

保持 Workers Free 计划，在项目根目录执行：

```powershell
npx.cmd wrangler login
npx.cmd wrangler d1 create bidmanager
```

将创建结果中的真实 `database_id` 填入 `wrangler.jsonc`，替换全零占位值。保留数据库绑定名 `DB`、数据库名 `bidmanager` 和迁移目录 `cloudflare/migrations`。

### 2. 应用迁移并部署

```powershell
npx.cmd wrangler d1 migrations apply bidmanager --remote
npm.cmd run deploy:cloudflare
```

迁移依次创建业务、历史、账户及会话表，并增加测试业务来源标记。部署命令会先构建资源，再输出 `workers.dev` 地址，无需购买域名。

### 3. 设置首个管理员

先为已部署的 Worker 配置初始化密钥，按提示输入自行生成的随机密钥：

```powershell
npx.cmd wrangler secret put ADMIN_SETUP_KEY
```

访问部署地址的 `/admin`，输入初始化密钥，设置管理员用户名、密码及可选的普通用户。密码为 6 至 200 个字符。线上空库未配置密钥时不开放初始化；存在管理员后不允许重复初始化。

初始化完成后管理页已登录，主界面仍需从 `/ui/login` 单独登录。两处登录和退出互不影响，普通用户不能登录管理页。没有来自业务页的管理入口。

### 4. 验证线上功能

- 分别登录普通用户和管理员，确认删除、PDF 导出和用户管理权限。
- 检查新增、编辑、状态修改、搜索、分页、变更记录及统计。
- 检查选中 PDF、确认导出当前筛选列表及所有分页，以及两个标签页的独立登录与退出。
- 如需演示数据，可由管理员导入 200 条；完成演示后可按来源清除。
- 查看 Cloudflare 的实际 CPU、数据库读取量及错误指标，确认满足所选计划额度。

v2.0.3 已通过 12 组后端测试、资源构建、部署模拟及浏览器筛选导出回归，并于 2026-10-09 部署到 Cloudflare。统计卡与搜索筛选、所有分页、选中导出、取消及空结果均已检查，实际导出的 53 条中标业务为 3 页，业务名称可完整提取为原生文字。线上登录入口、HTTPS 跳转及导出接口的登录保护检查通过。免费计划 CPU 指标仍需在控制台观察。

## 日常更新

从 GitHub 拉取新版本后，在项目根目录执行：

```powershell
git pull --ff-only
npm.cmd ci
npm.cmd run test:cloudflare
npx.cmd wrangler d1 migrations apply bidmanager --remote
npm.cmd run deploy:cloudflare
```

更新前先备份 D1，保留真实数据库 ID 和已有 Worker 密钥。迁移只增加结构，不清空业务；已有迁移不要改写。不要用本地数据库文件替换线上数据。

## 用户与测试数据

管理员可创建账户、调整角色、启停账户和重设密码。不能取消当前账户的管理员权限或停用当前账户；系统保留至少一名启用的管理员。角色、状态或密码变化会撤销该账户在主界面和管理页的旧会话。

普通用户可查看、新增、编辑业务及修改状态，不能删除或导出 PDF；受限操作提示“当前用户不具有此权限”，后端同时拒绝请求。

每次导入 200 条测试业务，支持重复导入。测试业务具有独立来源标记，编辑、重命名或状态修改都不改变标记；清除会删除所有已标记测试业务及其历史，保留手动录入的正式业务和既有未标记数据。不依据名称、备注或操作人判断来源。

测试业务分布在近 12 个北京时间自然周，统计曲线有起伏且总体上升。录入早于报名，报名早于投标；已投标及结果状态使用已过去的投标日期，已报名及后续状态均已获取标书。既有业务会继续参与统计。

## 迁移 Flask 旧业务

需要 Python 3。先备份原 SQLite，把下面的数据库路径替换为实际路径，仅向空业务库执行一次导入：

```powershell
python cloudflare/export-sqlite.py .\instance\business_management.db
npx.cmd wrangler d1 execute bidmanager --remote --file=cloudflare/business.private.sql
Remove-Item -LiteralPath cloudflare/business.private.sql
```

工具以只读方式打开 SQLite，只导出业务与有效历史，跳过已删除业务的孤立历史；不导出账户、密码或头像。旧账号需在新系统重新建立，旧密码哈希不直接迁移。重复向非空业务库导入会产生主键冲突。

可先将 `--remote` 改为 `--local` 验证导入结果。原 SQLite 与 D1 不自动双向同步，应确定上线后使用哪套数据。

## 命令行管理员恢复

无法使用管理页时，可由拥有 Cloudflare 权限的维护者生成账户 SQL：

```powershell
$env:BID_USERNAME = Read-Host '管理员用户名'
$adminPassword = Read-Host '管理员密码（6至200个字符）' -AsSecureString
$env:BID_PASSWORD = [System.Net.NetworkCredential]::new('', $adminPassword).Password
$env:BID_ROLE = 'admin'
node cloudflare/create-user.mjs
Remove-Item Env:BID_PASSWORD
npx.cmd wrangler d1 execute bidmanager --remote --file=cloudflare/user.private.sql
Remove-Item -LiteralPath cloudflare/user.private.sql
Remove-Item Env:BID_USERNAME, Env:BID_ROLE
```

若用户名已经存在，该工具会重设密码和角色、启用账户并撤销其旧会话。生成的 SQL 含密码验证值，不要提交或公开。对本地恢复时使用 `--local`。

## 备份与恢复

备份整个远程 D1：

```powershell
npx.cmd wrangler d1 export bidmanager --remote --output=cloudflare/backup.private.sql
```

备份包含正式业务、历史和账户信息，需存放到项目之外的安全位置；`cloudflare/*.private.sql` 已被 Git 忽略。恢复前先保留当前备份，并按 Cloudflare 的 [D1 备份与 Time Travel 指南](https://developers.cloudflare.com/d1/reference/time-travel/)操作，恢复后验证业务数量与登录。

本地开发数据在 `.wrangler` 中。关闭开发服务后另行备份该目录；它不会随源码上传。Flask 数据库和上传头像另按 [旧版本地运行说明](../docs/LEGACY_FLASK.md)备份。

## 免费计划与使用边界

2026-10-08 核对官方文档，Workers Free 为每天 10 万次请求、每次 10ms CPU。参见 [Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/)。

D1 免费计划每天读取 500 万行、写入 10 万行，总存储 5GB；单库上限 500MB。读取按扫描行计算，搜索及统计需关注实际用量。参见 [D1 定价](https://developers.cloudflare.com/d1/platform/pricing/)与 [D1 限制](https://developers.cloudflare.com/d1/platform/limits/)。免费额度与政策可能调整，超出额度时操作可能失败。

本地验证不能代替线上 CPU 测量。大量业务导出还受用户设备的内存与浏览器速度影响；单次选中导出最多 500 条，未选中时需确认导出当前筛选列表的所有分页。PDF 文字可选中、搜索和复制，中文字体随静态资源发布，约 10MB，仅在首次导出时加载并在当前页面复用。表格线条与状态色块保留图像背景，应用继续使用 html2canvas + jsPDF，不需要新的运行服务。

统计曲线按录入时间、最后更新时间和当前投标状态汇总，后续编辑会影响时间段归属；它不是每次投标和中标事件的历史快照。
