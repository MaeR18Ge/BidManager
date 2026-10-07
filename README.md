# BidManager · 投标管理

当前版本：**v1.1.0**（2026-10-08）

A web-based bid management system for tracking projects, bidding schedules, tender documents, payment status, and business statistics, with PDF export support.

面向体检业务的投标管理系统，支持业务录入、报名与投标时间跟踪、标书和投标状态管理、收款记录、变更历史、统计图表及 PDF 导出。

## 功能

- 业务新增、查看、编辑和管理员删除
- 搜索、分页、每页 10 / 20 / 50 条切换、报名与投标日期排序、状态筛选
- Ctrl / Command 点击追加或取消选择，Shift 点击选择当前页连续区间
- 跨页保留选中业务，再次点击选中行或点击列表外空白处取消选择
- 截止日期提示、业务变更历史
- 业务总数、投标数、中标数、中标金额与趋势图
- 选中业务时仅导出选中项；未选中时确认后导出全部业务，不受分页、搜索或筛选限制
- 用户登录、管理员权限和命令行用户管理
- 响应式界面、手机端统计四宫格、长名称省略显示

## 技术栈

Python / Flask / SQLAlchemy / SQLite；HTML / JavaScript / Tailwind CSS / Chart.js；Node.js / Express / Puppeteer。

## v1.1.0 更新说明

- 增加每页 10、20、50 条选择，以及多选和批量删除确认。
- 修复未选中业务时查看和编辑默认打开第一条的问题；查看、编辑仅支持单选。
- 统一查看、编辑、删除在未选中时的提示为“请先选择业务”。
- 修复选中行被悬停颜色覆盖的问题，选中后立即显示黑色背景。
- 执行业务操作后清除选择，翻页按业务 ID 保留选择，避免误选同一行位置的其他业务。
- 导出按钮增加规则说明；未选中时显示居中确认窗，提供“放弃”和“执行”，支持 Esc 取消。
- 页面内容最大宽度为 1440 CSS 像素；手机端统计块采用两列两行，长业务名称显示省略号并可悬停查看完整名称。
- 统一深灰背景和柔和边框，缩短截止提示为“剩XX天”“今截止”。

### 选择与导出

普通点击选择一条业务，再次点击该条取消选择。Ctrl（macOS 使用 Command）点击可追加或取消选择；Shift 点击从当前页锚点到目标行选择连续区间，Ctrl + Shift 可追加该区间。翻页保留选择；点击列表外空白处清空选择。

查看、编辑需要恰好选中一条业务；删除可操作多条业务并要求确认。PDF 导出可跨页导出所有选中业务；没有选择时，“执行”将导出整个数据库的业务，“放弃”或 Esc 不产生导出请求。

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
