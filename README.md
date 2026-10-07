# BidManager · 投标管理

A web-based bid management system for tracking projects, bidding schedules, tender documents, payment status, and business statistics, with PDF export support.

面向体检业务的投标管理系统，支持业务录入、报名与投标时间跟踪、标书和投标状态管理、收款记录、变更历史、统计图表及 PDF 导出。

## 功能

- 业务新增、查看、编辑和管理员删除
- 搜索、分页、报名与投标日期排序、状态筛选
- 截止日期提示、业务变更历史
- 业务总数、投标数、中标数、中标金额与趋势图
- 按当前筛选条件导出完整 PDF 业务列表
- 用户登录、管理员权限和命令行用户管理
- 响应式界面、手机端统计四宫格、长名称省略显示

## 技术栈

Python / Flask / SQLAlchemy / SQLite；HTML / JavaScript / Tailwind CSS / Chart.js；Node.js / Express / Puppeteer。

## 本地启动（Windows PowerShell）

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm install
npm --prefix static/figma/BDpage install
.\.venv\Scripts\python.exe manage_users.py add YOUR_USERNAME YOUR_PASSWORD --role admin
$env:SECRET_KEY = 'replace-with-a-long-random-secret'
.\.venv\Scripts\python.exe -m flask --app app run --host 127.0.0.1 --port 5000
```

另开一个终端启动 PDF 服务：

```powershell
npm run start:pdf
```

访问 http://127.0.0.1:5000/ui/login 。

PDF 导出需要 3001 端口的 Node.js 服务。页面使用在线 Tailwind、Chart.js 和图标资源，需要联网加载。首次使用 Puppeteer 需要可用的 Chromium。

## 数据与备份

SQLite 数据库在 `instance/business_management.db`。数据库、备份、上传头像、虚拟环境和 node_modules 不提交到 GitHub，需要另行备份。当前界面源文件为 `static/figma/BDpage/order-management.html`，作为普通项目文件保存。

## 账户管理

项目不预置管理员密码。使用 `manage_users.py` 创建账户、修改密码、设置角色及启停账户。部署时设置固定且随机的 `SECRET_KEY`；未设置时每次启动自动生成，重启会使旧会话失效。
