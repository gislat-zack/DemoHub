# 静态网页托管系统部署指引

本文说明三种部署方式：用 Node.js 直接运行源码、在 Linux 上以 systemd 常驻运行，或在 Windows 上打包成可执行文件后分发。服务端代码不区分操作系统。Windows 安装包和图形启动器不能在 Linux 上使用。默认只监听本机 `127.0.0.1:3000`。

## 环境要求

源码运行：

- Node.js 20 或更高版本
- 安装 `better-sqlite3` 时需要能编译原生模块
  - Windows：Visual Studio Build Tools，含“使用 C++ 的桌面开发”
  - Linux（Debian/Ubuntu）：`build-essential` 和 `python3`

Windows 安装包：

- 构建机需要 Node.js 20+、npm，以及上述 C++ 构建工具
- 目标机器不需要安装 Node.js
- 可选的 Python 管理器需要 Python 3.9+，仅构建时需要

## 方式一：源码运行

在项目根目录执行：

```powershell
npm install
npm start
```

启动成功时控制台会输出：

```text
Static HTML Host running at http://127.0.0.1:3000/admin
```

浏览器打开该地址。数据库为空时，第一个注册用户自动成为已审批管理员；之后注册的用户需要管理员审批。

停止服务：在运行 `npm start` 的终端按 `Ctrl+C`。

## 方式二：Linux 部署

以下命令以 Debian/Ubuntu 为例，项目目录使用 `/opt/static-html-host`，数据目录使用 `/var/lib/static-html-host`。其他发行版把安装包命令换成对应的包管理器即可。

安装 Node.js 20+ 和编译依赖：

```bash
sudo apt update
sudo apt install -y build-essential python3
```

将项目放到 `/opt/static-html-host` 后安装依赖并前台验证：

```bash
cd /opt/static-html-host
npm install
npm start
```

确认管理页可访问后，按 `Ctrl+C` 停止前台进程，再交给 systemd。创建 `/etc/systemd/system/static-html-host.service`：

```ini
[Unit]
Description=Static HTML Host
After=network.target

[Service]
WorkingDirectory=/opt/static-html-host
Environment=HOST=127.0.0.1
Environment=PORT=3000
Environment=STATIC_HTML_HOST_DATA_DIR=/var/lib/static-html-host
ExecStart=/usr/bin/node src/server.js
Restart=on-failure
User=www-data

[Install]
WantedBy=multi-user.target
```

`ExecStart` 里的 `node` 路径需与 `command -v node` 的结果一致。`User` 必须对项目目录和数据目录有写权限。

```bash
sudo mkdir -p /var/lib/static-html-host
sudo chown www-data:www-data /var/lib/static-html-host
sudo systemctl daemon-reload
sudo systemctl enable --now static-html-host
sudo systemctl status static-html-host
```

也可以不设 `STATIC_HTML_HOST_DATA_DIR`，改在项目根目录写 `config.json`。该文件存在且 `data_dir` 有效时，优先级高于环境变量：

```json
{
  "data_dir": "/var/lib/static-html-host"
}
```

查看日志和停止服务：

```bash
sudo journalctl -u static-html-host -f
sudo systemctl stop static-html-host
```

只给本机使用时保持 `HOST=127.0.0.1`，再用 Nginx 反向代理到公网。需要局域网直接访问时，把 `HOST` 改为 `0.0.0.0`，并在防火墙放行对应端口。不要把管理端口直接暴露到公网。

## 方式三：Windows 可执行文件

在项目根目录执行：

```powershell
npm run build:win
```

也可以双击或运行 [build-win.cmd](build-win.cmd)、[build-win.ps1](build-win.ps1)，它们都会调用同一条命令。

注意：[build-win.ps1](build-win.ps1) 会先结束本机全部 `node.exe` 进程。构建前请保存其他正在运行的 Node 程序。

构建产物在 `dist`：

| 文件 | 作用 |
|---|---|
| `static-html-host-server.exe` | 后端服务 |
| `Static HTML Host.exe` | 图形启动器，默认自动拉起同目录下的后端并打开管理页 |

把这两个 exe 放在同一目录。首次启动会在该目录生成 `data`，以及启动器自己的 `launcher-settings.json`（监听地址、端口、是否自动启动）。

可选的 Python 管理器：

```powershell
npm run build:python-launcher
```

产物为 `dist\Static HTML Host Manager.exe`。它只负责启动、停止和设置开机任务，仍然依赖同目录或项目中的后端程序。脚本未安装 PyInstaller 时会自动执行 `pip install pyinstaller`。

## 配置

监听地址和端口使用环境变量，未设置时为 `127.0.0.1` 和 `3000`：

```powershell
$env:HOST = "0.0.0.0"
$env:PORT = "3000"
npm start
```

数据目录按下面的顺序决定：

1. 项目根目录 `config.json` 里的 `data_dir`（文件存在且字段有效时优先）
2. 环境变量 `STATIC_HTML_HOST_DATA_DIR`
3. 项目根目录下的 `data`

`config.json` 示例：

```json
{
  "data_dir": "D:\\static-html-host-data"
}
```

打包后的项目根目录是 exe 所在目录。`server-entry.js` 会把数据目录默认设为 exe 旁的 `data`，但同目录的 `config.json` 仍然可以覆盖它。

`data` 目录包含：

- `app.db`：站点、用户、会话和系统设置
- `sites`、`uploads`：已发布站点
- `logo`、`nav-icons`：界面资源

迁移或备份时，停止服务后复制整个 `data` 目录。不要在服务运行时复制 `app.db`。

上传限制（代码内固定，不由配置文件修改）：单个上传 50 MB；ZIP 最多 1000 个条目、解压后合计 200 MB、单个文件 25 MB。

## 对外访问

默认只允许本机访问。需要局域网访问时，把 `HOST` 设为 `0.0.0.0`，或在 Windows 图形启动器里把监听地址改成 `0.0.0.0` 后重启服务。同时在系统防火墙中放行对应端口。Linux 上修改 systemd 单元中的 `Environment=HOST=...` 后执行 `sudo systemctl daemon-reload` 和 `sudo systemctl restart static-html-host`。

不要把管理端口直接暴露到公网。如需公网使用，放在反向代理后面，并只开放代理端口。

## 开机启动

Linux 使用方式二中的 systemd 单元，`systemctl enable` 之后会随系统启动。

Windows 上，Python 管理器可以把后端注册为计划任务 `StaticHtmlHostService`。注册或删除该任务需要以管理员身份运行管理器。不使用管理器时，把 `static-html-host-server.exe` 加入任务计划程序，并将起始目录设为 exe 所在目录，以便找到 `config.json` 和 `data`。

## 升级

源码升级：拉取新代码后执行 `npm install`，再重启服务。Linux 上执行 `sudo systemctl restart static-html-host`。数据库迁移会在启动时自动执行。

安装包升级：停止正在运行的 `Static HTML Host.exe` 和 `static-html-host-server.exe`，替换这两个 exe，保留原目录中的 `data`、`config.json` 和 `launcher-settings.json`。

## 常见问题

- 端口被占用：修改 `PORT`，或结束已有的 `node`、`node.exe`、`static-html-host-server.exe` 进程。Linux 上可用 `sudo ss -ltnp | grep 3000` 查看占用进程。
- `npm install` 在 `better-sqlite3` 失败：确认 Node.js 为 20 或更高版本。Windows 安装 C++ 构建工具；Linux 安装 `build-essential` 和 `python3`。然后删除 `node_modules` 再安装。
- Linux 上 systemd 启动失败：用 `journalctl -u static-html-host -n 50` 查看原因。常见情况是 `node` 路径不对，或运行用户不能写数据目录。
- 打包后的页面没有原来的站点：数据仍在源码目录的 `data`，而 exe 默认使用自己目录下的 `data`。用 `config.json` 的 `data_dir` 指回原来的数据目录。
- 图形启动器没有反应：确认 `static-html-host-server.exe` 与 `Static HTML Host.exe` 在同一目录，并且该目录可写。
