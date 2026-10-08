# Flask 本地运行说明

2.0 保留原 Flask 本地入口，使用独立 SQLite 数据库和 Node PDF 服务。管理员网页与 Cloudflare 部署功能属于 Workers 入口；两套账户和数据不自动同步。

## 安装和启动

需要 Python 3、Node.js 和可用的 Chromium。在项目根目录执行：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm.cmd ci
npm.cmd --prefix static/figma/BDpage ci
.\.venv\Scripts\python.exe manage_users.py add YOUR_USERNAME YOUR_PASSWORD --role admin
$env:SECRET_KEY = 'replace-with-a-long-random-secret'
.\.venv\Scripts\python.exe -m flask --app app run --host 127.0.0.1 --port 5000
```

替换示例用户名、密码和密钥。项目不预置管理员密码，`SECRET_KEY` 应使用固定随机值；未设置时每次启动自动生成，重启会使已有会话失效。

另开终端启动 PDF 服务：

```powershell
npm.cmd run start:pdf
```

访问 `http://127.0.0.1:5000/ui/login`。PDF 服务默认使用 3001 端口，Puppeteer 需要 Chromium；页面部分依赖通过在线资源加载。

如果 3001 端口不可用，在 PDF 服务终端设置 `$env:PDF_SERVICE_PORT = '3030'`，在 Flask 终端设置 `$env:PDF_SERVICE_URL = 'http://127.0.0.1:3030/generate-pdf'`，再分别启动。

## 账户管理

使用 `manage_users.py` 创建账户、修改密码、调整角色或启停账户：

```powershell
.\.venv\Scripts\python.exe manage_users.py list
.\.venv\Scripts\python.exe manage_users.py passwd YOUR_USERNAME NEW_PASSWORD
.\.venv\Scripts\python.exe manage_users.py role YOUR_USERNAME user
```

## 数据和迁移

业务及账户保存在 `instance/business_management.db`，上传头像位于 `static/uploads`。关闭服务后单独备份这两处，它们不会提交到 GitHub。

Cloudflare 的数据库为 D1，不能直接把 SQLite 文件上传替换。业务迁移使用 [Cloudflare 部署指南](../cloudflare/README.md)中的只读导出工具；账户和密码需在 Workers 版本重新建立。
