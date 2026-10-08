# 开发维护指南

适用版本：v2.0.0。用户使用入口见 [README](../README.md)，线上配置与备份见 [Cloudflare 部署指南](../cloudflare/README.md)。

## 代码结构

- `cloudflare/worker.js`：Workers 入口、登录与会话、业务接口、统计及权限校验。
- `cloudflare/admin.js`、`admin-page.js`：管理员初始化、用户设置及测试数据管理。
- `cloudflare/pages.js`：登录页和业务详情、编辑、新增页面。
- `cloudflare/avatar.js`：用户名默认头像，共用英文大写及中文首字规则。
- `cloudflare/test-data.js`：近 12 周的 200 条测试业务生成器。
- `cloudflare/browser-pdf.js`：html2canvas + jsPDF 导出、分页和金额汇总。
- `cloudflare/build.mjs`：复制并转换列表页，打包图标、图表及 PDF 依赖到 `cloudflare/public`。
- `static/figma/BDpage/order-management.html`：共用列表页源文件；不要直接修改生成的 `cloudflare/public`。
- `cloudflare/migrations`：按顺序应用的 D1 迁移；已发布迁移不要修改，应追加新的 SQL 文件。
- `cloudflare/create-user.mjs`、`export-sqlite.py`：账户恢复及旧业务只读导出工具。
- `app.py`、`templates`、`pdf-server.js`：保留的 Flask 本地入口及 PDF 服务。

## 业务流程

主界面登录后载入用户、业务列表和统计；用户可以新增业务、编辑字段、直接修改标书或投标状态。业务修改同时保存更新时间与操作人，并将字段前后值记录到历史；详情页按时间倒序展示。

管理员可删除选中业务及其关联历史；导出时服务端先校验管理员权限及业务编号，返回业务数据，再由浏览器生成 PDF。没有选择时先确认全部导出。

管理页使用独立登录，管理员可管理账户或导入测试业务。每批测试数据保存来源标记，清除按来源删除，正式业务及其历史保留。

## 数据与会话

D1 保存五类数据：`business`、`status_history`、`app_user`、`session`、`login_attempt`。`status_history.business_id` 删除级联；`0002_test_data.sql` 给业务增加 `test_batch_id` 及索引。

`test_batch_id` 是来源依据，新建正式业务不能提交该字段，编辑和状态更新不覆盖它。现有未标记记录视为需要保留的数据，不根据业务内容补标或猜测来源。

主界面使用 `bid_session`，管理页使用路径限定为 `/admin` 的 `bid_admin_session`。后端按页面选择对应会话，不相互回退。会话 24 小时过期，数据库只保存随机令牌的 SHA256 验证值；HTTPS 使用 Secure Cookie。角色、密码或启停状态变化撤销该账户所有旧会话。

浏览器用 PBKDF2-SHA256、31 万次迭代产生登录凭据，服务器保存其 SHA256 验证值。该方案保留既有技术依赖；线上必须使用 HTTPS，登录需要 JavaScript。写请求校验 Origin，登录失败按账户和来源限流。

头像压缩后存入 D1；未设置时动态生成文字头像，不写入账户记录。上传新头像才替换旧图片，普通登录不会清除原头像。

## 主要接口

- `/ui/login`、`/ui/logout`：业务页面登录和退出；`/api/auth/challenge` 返回密码派生参数。
- `/api/user/avatar`：当前业务登录账户、角色及头像。
- `/api/listing`：业务列表，支持 `page`、`per_page`、`search`、`bid_status` 和 `sort`。
- `/api/stats`：总数、趋势与近 12 周曲线；统计基于当前状态和录入/更新时间，并非事件快照。
- `/ui/business/new`、`/ui/business/{id}/detail`、`/ui/business/{id}/edit`：业务页面，新增和编辑通过 POST 提交。
- `/api/business/{id}/status`：POST 修改标书或投标状态。
- `/business/{id}/delete`：管理员 POST 删除业务；`/api/export_data` 返回管理员导出数据，`ids` 最多 500 个。
- `/admin`、`/admin/setup`、`/admin/login`、`/admin/logout`：独立管理页面、首个管理员初始化及会话。
- `/admin/users`、`/admin/users/{id}`：管理员读取、新建和更新账户。
- `/admin/test-data/import`、`/admin/test-data/clear`：管理员 POST 导入 200 条及确认清除测试业务。

普通用户可增改查和修改状态。删除、导出、账户设置及测试数据操作必须由后端鉴权，不能仅依赖按钮表现。

## 常规检查

Node.js 22.18+，在根目录执行：

```powershell
npm.cmd run test:cloudflare
npm.cmd run build:cloudflare
npx.cmd wrangler deploy --dry-run
```

后端 10 组测试使用独立内存数据库，覆盖业务流程、输入校验、权限、登录限流、会话过期与撤销、管理员初始化与并发保护、测试来源、修改后清除、曲线时间逻辑及头像保留。

构建和部署模拟不会上传 Worker，也不能证明真实免费计划 CPU 指标符合限制。

## 管理功能浏览器回归

使用全新的隔离目录，不能复用正式本地 `.wrangler` 数据。在终端一执行：

```powershell
npx.cmd wrangler d1 migrations apply bidmanager --local --persist-to cloudflare/test-artifacts/admin-release-check
npx.cmd wrangler dev --port 8788 --ip 127.0.0.1 --persist-to cloudflare/test-artifacts/admin-release-check
```

在终端二执行：

```powershell
node cloudflare/admin-check.cjs
```

脚本只访问 8788，初始化临时账户、创建一条正式业务，并导入、编辑和清除测试业务；验证角色、密码重设、普通用户权限、同一浏览器的独立登录退出、默认头像及手机布局。已有管理员的目录需换成新的隔离目录才能再次运行。

浏览器检查需要 Puppeteer 使用的 Chrome。可执行 `npx.cmd puppeteer browsers install chrome` 安装，或用 `TEST_CHROME` 指定现有 Chrome 的完整路径；2.0 应用本身不需要 Chrome 安装。

## PDF 与状态菜单浏览器检查

另有测试用 HTTP 适配器，它只创建内存数据库，自动生成 200 条测试业务，不读取任何正式数据库或私有 SQL。在 8788 无其他服务时，终端一设置临时测试账户并启动：

```powershell
$env:BID_TEST_USERNAME = 'release-test'
$env:BID_TEST_PASSWORD = 'Local-Fixture-Only!'
node cloudflare/smoke-server.mjs
```

终端二设置相同的临时凭据：

```powershell
$env:BID_TEST_USERNAME = 'release-test'
$env:BID_TEST_PASSWORD = 'Local-Fixture-Only!'
$env:TEST_BASE_URL = 'http://127.0.0.1:8788'
node cloudflare/smoke-browser.cjs
node cloudflare/dropdown-scroll-check.cjs
node cloudflare/pdf-layout-check.cjs
Remove-Item Env:BID_TEST_USERNAME, Env:BID_TEST_PASSWORD, Env:TEST_BASE_URL
```

检查 PDF 下载、选中/全部导出、取消、分页内容完整性、长文本和 HTML 转义，以及菜单滚动跟随、边缘翻转和离屏关闭。PDF、截图及临时数据库保存在被忽略的 `cloudflare/test-artifacts`。适配器只验证应用行为，不能替代真实 Wrangler / D1 或线上运行环境。

## 发布约定

保持 `VERSION`、根目录 `package.json` / `package-lock.json` 和 `cloudflare/package.json` 的版本号一致，更新 `CHANGELOG.md`。提交源码、迁移和文档，排除数据库、私有 SQL、密钥、上传头像、生成资源及测试产物。

发布前运行常规检查及相关浏览器回归，再创建对应版本标签。标签标记实际发布提交，不改写已经发布的标签。上传 GitHub 不等于部署 Cloudflare。

详细开发过程保存在 [历史开发记录](archive/development-2.0.md)，其中早期参数和界面讨论为历史信息，当前行为以代码、本指南及部署文档为准。
