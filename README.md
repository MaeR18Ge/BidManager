# BidManager

**投标管理系统 · v2.0.2 · 2026-10-08**

A bid management system for tracking projects, bidding schedules, tender documents, business changes, and PDF exports.

面向体检业务的投标管理系统，集中管理业务信息、报名与投标时间、标书状态、收款情况和变更记录。2.0 使用 **Cloudflare Workers + D1**，支持本地测试和云端部署；保留原 Flask 本地运行方式。

## 主要功能

- 业务新增、查看、编辑；管理客户、联系人、服务内容、人数、金额、标书地址及收款情况。
- 搜索、投标状态筛选、报名/投标时间排序，每页显示 10、20 或 50 条。
- 截止日期提示与时间校验，报名时间必须早于投标时间。
- 单选、Ctrl / Command 多选、Shift 区间选择，跨页保留选择。
- 自动记录字段变更，保留修改前后内容、操作人、时间和变更说明。
- 业务总数、已投标数、已中标数、中标金额及近 12 周统计曲线。
- 管理员删除业务及导出可选中、搜索和复制文字的 PDF：选中时导出所选业务，未选中时确认导出全部业务。
- 独立管理员页面，支持账户创建、角色调整、启停及密码重设。
- 管理员每次导入 200 条测试业务，并按来源一键清除；修改过的测试业务仍可清除，手动录入的正式业务保留。

## 账户与权限

**普通用户**可查看、新增、编辑业务及修改状态，不能删除业务或导出 PDF。点击受限操作时提示“当前用户不具有此权限”，后端同时校验权限。

**管理员**拥有业务管理权限，并可在 `/admin` 管理用户和测试数据。项目不预置账户或密码，首次运行需设置首个管理员；创建密码为 6 至 200 个字符。

主界面 `/ui/login` 与管理页 `/admin` 分别登录，登录或退出互不影响。已有页面不提供管理页入口，需要直接访问 `/admin`。角色、账户状态或密码变化后，该账户需要重新登录。

未设置头像时，自动显示用户名的大写首字母或第一个中文字；已上传头像优先使用。

## 本地运行 2.0

需要 Node.js **22.18 或更新版本**。以下命令适用于 Windows PowerShell，在项目根目录执行：

```powershell
git clone https://github.com/MaeR18Ge/BidManager.git
Set-Location BidManager
$env:PUPPETEER_SKIP_DOWNLOAD = 'true'
npm.cmd ci
npm.cmd run build:cloudflare
npx.cmd wrangler d1 migrations apply bidmanager --local
npm.cmd run dev:cloudflare
```

1. 访问 [本地管理页](http://127.0.0.1:8787/admin)，设置首个管理员及可选的普通用户。
2. 访问 [本地登录页](http://127.0.0.1:8787/ui/login)，登录后管理业务。

2.0 的 PDF 在用户浏览器生成，本地运行无需 Python、Node PDF 服务或下载 Chromium。依赖安装及首次 Cloudflare 授权需要联网，页面依赖随构建产物发布。

## 部署到 Cloudflare

部署使用 Workers 和 D1，可在免费计划额度内运行，无需 R2 或 Browser Run。

按 [Cloudflare 部署指南](cloudflare/README.md)创建 D1、替换 `wrangler.jsonc` 的数据库占位 ID、应用远程迁移、部署并设置首个管理员。线上初始化需要 `ADMIN_SETUP_KEY`，本地账户和业务不会自动上传。

v2.0.2 已通过本地功能测试、PDF 浏览器检查及部署模拟，用户已确认文字 PDF 导出正常。此前 v2.0.1 已部署到 Cloudflare，线上 HTTP 跳转及微信 HTTPS 登录已验证；v2.0.2 的线上更新需另行部署。免费计划 CPU 指标仍需在控制台观察。

## 使用说明

普通点击选择一条业务，再次点击取消；Ctrl（macOS 使用 Command）点击追加或取消选择；Shift 点击选择当前页连续区间，Ctrl + Shift 追加区间。翻页保留所选业务，点击列表外空白处取消选择。

查看和编辑需要恰好选择一条业务。管理员可以批量删除，操作前需要确认。选中业务时 PDF 仅导出所选项，单次最多 500 条；未选中时确认导出数据库全部业务，不受当前分页、搜索或筛选限制。

PDF 使用 html2canvas + jsPDF，在浏览器生成 A4 竖向文档，包含导出人、日期、金额汇总及页码。文字使用嵌入的中文字体，可选中、搜索和复制；表格线条与状态色块仍由 html2canvas 绘制。约 10MB 的中文字体仅在首次导出时按需加载，随后在当前页面复用，不依赖第三方字体服务。

## 数据与备份

Cloudflare 版本使用 D1；本地开发数据保存在 `.wrangler` 目录。Flask 版本使用 `instance/business_management.db`，两套数据库互相独立，不自动同步。

数据库、备份、上传头像、私有 SQL、密码、依赖目录及测试产物不会提交到 GitHub，需单独备份。迁移旧业务和 D1 备份步骤见部署指南。

## 开发与文档

```powershell
npm.cmd run test:cloudflare
npm.cmd run build:cloudflare
npx.cmd wrangler deploy --dry-run
```

- [Cloudflare 部署、初始化、迁移及备份](cloudflare/README.md)
- [开发维护指南与测试方法](docs/DEVELOPMENT.md)
- [保留的 Flask 本地运行方式](docs/LEGACY_FLASK.md)
- [版本更新记录](CHANGELOG.md)
- [开发记录索引](cloudflare/DEVELOPMENT_LOG.md)

核心技术：JavaScript、Cloudflare Workers、D1、HTML、Chart.js、html2canvas、jsPDF；旧版本地入口使用 Python、Flask、SQLAlchemy、SQLite 和 Puppeteer。
