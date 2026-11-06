# -*- coding: utf-8 -*-
"""Static HTML Host Python GUI Manager.

A small Tkinter management tool for starting/stopping the packaged Node.js
static HTML hosting server. It intentionally uses only the Python standard
library so it can be packaged with PyInstaller easily.
"""

from __future__ import annotations

import ctypes
import json
import os
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, ttk

APP_TITLE = "静态网页托管系统管理器"
SETTINGS_FILE = "launcher-settings.json"
TASK_NAME = "StaticHtmlHostService"
DEFAULT_SETTINGS = {
    "host": "127.0.0.1",
    "port": 3000,
    "autoStart": False,
}


def is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def exe_dir() -> Path:
    if is_frozen():
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[1]


def app_root() -> Path:
    """Return the hosting project root.

    Source mode: repository root.
    Packaged mode: if the manager exe lives in a dist directory, use its parent
    as the project root so existing uploads under <project>/data remain visible.
    Otherwise use the exe directory for portable deployments.
    """
    base = exe_dir()
    if base.name.lower() == "dist" and (base.parent / "server-entry.js").exists():
        return base.parent
    return base


def settings_root() -> Path:
    """Store launcher settings next to the executable/source runtime."""
    return exe_dir()


def is_admin() -> bool:
    if os.name != "nt":
        return False
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def run_hidden(args, cwd=None, env=None, timeout=None):
    creationflags = 0
    startupinfo = None
    if os.name == "nt":
        creationflags = subprocess.CREATE_NO_WINDOW
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    return subprocess.run(
        args,
        cwd=str(cwd) if cwd else None,
        env=env,
        text=True,
        capture_output=True,
        timeout=timeout,
        creationflags=creationflags,
        startupinfo=startupinfo,
        shell=False,
    )


def open_with_explorer(path: Path):
    try:
        if os.name == "nt":
            os.startfile(str(path))  # type: ignore[attr-defined]
        else:
            subprocess.Popen(["xdg-open", str(path)])
    except Exception as exc:
        messagebox.showerror("打开失败", str(exc))


class StaticHtmlHostManager:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title(APP_TITLE)
        self.root.geometry("980x720")
        self.root.minsize(900, 640)

        self.runtime_root = app_root()
        self.launcher_root = settings_root()
        self.settings_path = self.launcher_root / SETTINGS_FILE
        self.server_process: subprocess.Popen | None = None
        self.settings = self.load_settings()

        self.host_var = tk.StringVar(value=str(self.settings["host"]))
        self.port_var = tk.StringVar(value=str(self.settings["port"]))
        self.auto_start_var = tk.BooleanVar(value=bool(self.settings.get("autoStart", False)))
        self.status_var = tk.StringVar(value="检测中...")
        self.pid_var = tk.StringVar(value="-")
        self.admin_url_var = tk.StringVar(value=self.admin_url())
        self.data_dir_var = tk.StringVar(value=str(self.resolve_data_dir()))
        self.root_dir_var = tk.StringVar(value=str(self.runtime_root))
        self.task_status_var = tk.StringVar(value="检测中...")
        self.admin_badge_var = tk.StringVar(value="管理员权限：是" if is_admin() else "管理员权限：否")

        self.create_widgets()
        self.refresh_status_async()
        self.refresh_task_status_async()

        if self.auto_start_var.get():
            self.root.after(400, self.start_service_async)

        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

    # ---- Settings and paths ----
    def load_settings(self) -> dict:
        settings = dict(DEFAULT_SETTINGS)
        try:
            if self.settings_path.exists():
                saved = json.loads(self.settings_path.read_text(encoding="utf-8"))
                if isinstance(saved, dict):
                    settings.update(saved)
        except Exception:
            pass

        try:
            settings["port"] = int(settings.get("port") or DEFAULT_SETTINGS["port"])
        except Exception:
            settings["port"] = DEFAULT_SETTINGS["port"]
        if not str(settings.get("host") or "").strip():
            settings["host"] = DEFAULT_SETTINGS["host"]
        settings["autoStart"] = bool(settings.get("autoStart", False))
        return settings

    def save_settings(self):
        host = self.host_var.get().strip()
        if not host:
            raise ValueError("监听地址不能为空")
        try:
            port = int(self.port_var.get().strip())
        except Exception as exc:
            raise ValueError("端口必须是数字") from exc
        if port < 1 or port > 65535:
            raise ValueError("端口必须在 1 到 65535 之间")

        self.settings = {
            "host": host,
            "port": port,
            "autoStart": bool(self.auto_start_var.get()),
        }
        self.settings_path.write_text(json.dumps(self.settings, ensure_ascii=False, indent=2), encoding="utf-8")
        self.admin_url_var.set(self.admin_url())
        self.data_dir_var.set(str(self.resolve_data_dir()))
        self.log("设置已保存。")

    def resolve_data_dir(self) -> Path:
        data_dir = self.runtime_root / "data"
        cfg_path = self.runtime_root / "config.json"
        try:
            if cfg_path.exists():
                cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
                if isinstance(cfg, dict) and cfg.get("data_dir"):
                    data_dir = Path(str(cfg["data_dir"])).expanduser().resolve()
        except Exception:
            pass
        return data_dir

    def admin_url(self) -> str:
        host = str(self.settings.get("host", DEFAULT_SETTINGS["host"]))
        port = str(self.settings.get("port", DEFAULT_SETTINGS["port"]))
        return f"http://{host}:{port}/admin"

    def health_url(self) -> str:
        host = str(self.settings.get("host", DEFAULT_SETTINGS["host"]))
        port = str(self.settings.get("port", DEFAULT_SETTINGS["port"]))
        return f"http://{host}:{port}/login"

    def find_server_command(self):
        launcher_server_exe = self.launcher_root / "static-html-host-server.exe"
        if launcher_server_exe.exists():
            return [str(launcher_server_exe)], self.launcher_root

        server_exe = self.runtime_root / "static-html-host-server.exe"
        if server_exe.exists():
            return [str(server_exe)], self.runtime_root

        server_entry = self.runtime_root / "server-entry.js"
        if server_entry.exists():
            return ["node", str(server_entry)], self.runtime_root

        server_js = self.runtime_root / "src" / "server.js"
        if server_js.exists():
            return ["node", str(server_js)], self.runtime_root

        raise FileNotFoundError(
            "未找到服务入口。请确认 static-html-host-server.exe、server-entry.js 或 src/server.js 存在。"
        )

    def build_env(self):
        env = os.environ.copy()
        env.update({
            "HOST": str(self.settings.get("host", DEFAULT_SETTINGS["host"])),
            "PORT": str(self.settings.get("port", DEFAULT_SETTINGS["port"])),
            "STATIC_HTML_HOST_PROJECT_ROOT": str(self.runtime_root),
            "STATIC_HTML_HOST_DATA_DIR": str(self.resolve_data_dir()),
        })
        return env

    # ---- UI ----
    def create_widgets(self):
        self.colors = {
            "bg": "#07111f",
            "panel": "#0d1b2f",
            "panel2": "#10243d",
            "border": "#1c3f66",
            "primary": "#19d3ff",
            "primary2": "#1677ff",
            "success": "#24f2a6",
            "warning": "#ffcc66",
            "danger": "#ff5b7d",
            "text": "#eaf6ff",
            "muted": "#8ba7c2",
            "terminal": "#030912",
        }
        self.root.configure(bg=self.colors["bg"])

        style = ttk.Style()
        try:
            style.theme_use("clam")
        except Exception:
            pass
        style.configure("Tech.TFrame", background=self.colors["bg"])
        style.configure("Card.TFrame", background=self.colors["panel"], relief="flat")
        style.configure("Tech.TLabel", background=self.colors["bg"], foreground=self.colors["text"], font=("Microsoft YaHei UI", 10))
        style.configure("Muted.TLabel", background=self.colors["bg"], foreground=self.colors["muted"], font=("Microsoft YaHei UI", 9))
        style.configure("Card.TLabel", background=self.colors["panel"], foreground=self.colors["text"], font=("Microsoft YaHei UI", 10))
        style.configure("CardMuted.TLabel", background=self.colors["panel"], foreground=self.colors["muted"], font=("Microsoft YaHei UI", 9))
        style.configure("Title.TLabel", background=self.colors["bg"], foreground=self.colors["text"], font=("Microsoft YaHei UI", 22, "bold"))
        style.configure("Accent.TLabel", background=self.colors["bg"], foreground=self.colors["primary"], font=("Microsoft YaHei UI", 9))
        style.configure("Status.TLabel", background=self.colors["panel"], foreground=self.colors["primary"], font=("Microsoft YaHei UI", 18, "bold"))
        style.configure("Tech.TEntry", fieldbackground="#081527", foreground=self.colors["text"], bordercolor=self.colors["border"], insertcolor=self.colors["primary"], padding=7)
        style.configure("Tech.TCheckbutton", background=self.colors["panel"], foreground=self.colors["text"], font=("Microsoft YaHei UI", 10))
        style.map("Tech.TCheckbutton", background=[("active", self.colors["panel"])], foreground=[("active", self.colors["primary"])])
        style.configure("Tech.TButton", background=self.colors["panel2"], foreground=self.colors["text"], bordercolor=self.colors["border"], focusthickness=0, padding=(14, 9), font=("Microsoft YaHei UI", 10))
        style.map("Tech.TButton", background=[("active", "#17385f")], foreground=[("active", self.colors["primary"])])
        style.configure("Primary.TButton", background=self.colors["primary2"], foreground="#ffffff", bordercolor=self.colors["primary"], focusthickness=0, padding=(16, 10), font=("Microsoft YaHei UI", 10, "bold"))
        style.map("Primary.TButton", background=[("active", "#19a7ff")], foreground=[("active", "#ffffff")])
        style.configure("Danger.TButton", background="#3a1830", foreground="#ffd6de", bordercolor=self.colors["danger"], padding=(14, 9), font=("Microsoft YaHei UI", 10))
        style.map("Danger.TButton", background=[("active", "#5a2340")], foreground=[("active", "#ffffff")])

        outer = tk.Frame(self.root, bg=self.colors["bg"], padx=22, pady=20)
        outer.pack(fill=tk.BOTH, expand=True)

        header = tk.Frame(outer, bg=self.colors["bg"])
        header.pack(fill=tk.X, pady=(0, 18))
        left_header = tk.Frame(header, bg=self.colors["bg"])
        left_header.pack(side=tk.LEFT, fill=tk.X, expand=True)
        tk.Label(left_header, text="STATIC HTML HOST", bg=self.colors["bg"], fg=self.colors["primary"], font=("Segoe UI", 9, "bold")).pack(anchor="w")
        tk.Label(left_header, text="静态网页托管系统 · 启动管理中心", bg=self.colors["bg"], fg=self.colors["text"], font=("Microsoft YaHei UI", 22, "bold")).pack(anchor="w", pady=(2, 0))
        tk.Label(left_header, text="Process Control / Health Monitor / Auto Start Scheduler", bg=self.colors["bg"], fg=self.colors["muted"], font=("Segoe UI", 9)).pack(anchor="w", pady=(4, 0))
        admin_chip = tk.Label(header, textvariable=self.admin_badge_var, bg="#0b2b45", fg=self.colors["primary"], padx=14, pady=8, font=("Microsoft YaHei UI", 9, "bold"))
        admin_chip.pack(side=tk.RIGHT, anchor="ne")

        top_grid = tk.Frame(outer, bg=self.colors["bg"])
        top_grid.pack(fill=tk.X, pady=(0, 14))
        top_grid.columnconfigure((0, 1, 2), weight=1, uniform="status")

        self.status_card = self.make_metric_card(top_grid, "服务状态", self.status_var, "HTTP HEALTH")
        self.status_card.grid(row=0, column=0, sticky="nsew", padx=(0, 10))
        self.make_metric_card(top_grid, "服务 PID", self.pid_var, "PROCESS ID").grid(row=0, column=1, sticky="nsew", padx=10)
        self.make_metric_card(top_grid, "后台任务", self.task_status_var, TASK_NAME).grid(row=0, column=2, sticky="nsew", padx=(10, 0))

        content = tk.Frame(outer, bg=self.colors["bg"])
        content.pack(fill=tk.BOTH, expand=True)
        content.columnconfigure(0, weight=1)
        content.columnconfigure(1, weight=1)
        content.rowconfigure(2, weight=1)

        config_card = self.make_card(content, "启动配置", "HOST / PORT / DATA")
        config_card.grid(row=0, column=0, sticky="nsew", padx=(0, 10), pady=(0, 14))
        config_card.columnconfigure(1, weight=1)
        self.form_label(config_card, "监听地址").grid(row=1, column=0, sticky="w", padx=16, pady=(12, 6))
        ttk.Entry(config_card, textvariable=self.host_var, style="Tech.TEntry").grid(row=1, column=1, sticky="ew", padx=(0, 16), pady=(12, 6))
        self.form_label(config_card, "端口").grid(row=2, column=0, sticky="w", padx=16, pady=6)
        ttk.Entry(config_card, textvariable=self.port_var, style="Tech.TEntry", width=12).grid(row=2, column=1, sticky="w", padx=(0, 16), pady=6)
        ttk.Checkbutton(config_card, text="启动管理器后自动启动服务", variable=self.auto_start_var, style="Tech.TCheckbutton").grid(row=3, column=0, columnspan=2, sticky="w", padx=16, pady=(8, 14))

        path_card = self.make_card(content, "运行路径", "ROOT / DATA / ADMIN URL")
        path_card.grid(row=0, column=1, sticky="nsew", padx=(10, 0), pady=(0, 14))
        path_card.columnconfigure(1, weight=1)
        self.form_label(path_card, "管理地址").grid(row=1, column=0, sticky="w", padx=16, pady=(12, 6))
        tk.Label(path_card, textvariable=self.admin_url_var, bg=self.colors["panel"], fg=self.colors["primary"], font=("Consolas", 10)).grid(row=1, column=1, sticky="w", padx=(0, 16), pady=(12, 6))
        self.form_label(path_card, "项目目录").grid(row=2, column=0, sticky="w", padx=16, pady=6)
        ttk.Entry(path_card, textvariable=self.root_dir_var, state="readonly", style="Tech.TEntry").grid(row=2, column=1, sticky="ew", padx=(0, 8), pady=6)
        ttk.Button(path_card, text="打开", command=lambda: open_with_explorer(self.runtime_root), style="Tech.TButton").grid(row=2, column=2, padx=(0, 16), pady=6)
        self.form_label(path_card, "数据目录").grid(row=3, column=0, sticky="w", padx=16, pady=(6, 16))
        ttk.Entry(path_card, textvariable=self.data_dir_var, state="readonly", style="Tech.TEntry").grid(row=3, column=1, sticky="ew", padx=(0, 8), pady=(6, 16))
        ttk.Button(path_card, text="选择", command=self.choose_data_dir, style="Tech.TButton").grid(row=3, column=2, padx=(0, 16), pady=(6, 16))

        action_card = self.make_card(content, "服务控制", "MANUAL CONTROL")
        action_card.grid(row=1, column=0, sticky="nsew", padx=(0, 10), pady=(0, 14))
        for i in range(3):
            action_card.columnconfigure(i, weight=1)
        ttk.Button(action_card, text="▶ 启动服务", command=self.start_service_async, style="Primary.TButton").grid(row=1, column=0, sticky="ew", padx=(16, 6), pady=(14, 8))
        ttk.Button(action_card, text="■ 停止服务", command=self.stop_service_async, style="Danger.TButton").grid(row=1, column=1, sticky="ew", padx=6, pady=(14, 8))
        ttk.Button(action_card, text="↻ 重启服务", command=self.restart_service_async, style="Tech.TButton").grid(row=1, column=2, sticky="ew", padx=(6, 16), pady=(14, 8))
        ttk.Button(action_card, text="保存设置", command=self.save_settings_clicked, style="Tech.TButton").grid(row=2, column=0, sticky="ew", padx=(16, 6), pady=(4, 16))
        ttk.Button(action_card, text="刷新状态", command=self.refresh_all_async, style="Tech.TButton").grid(row=2, column=1, sticky="ew", padx=6, pady=(4, 16))
        ttk.Button(action_card, text="打开后台", command=self.open_admin, style="Tech.TButton").grid(row=2, column=2, sticky="ew", padx=(6, 16), pady=(4, 16))

        task_card = self.make_card(content, "后台任务 / 开机自启", "WINDOWS SCHEDULER")
        task_card.grid(row=1, column=1, sticky="nsew", padx=(10, 0), pady=(0, 14))
        for i in range(3):
            task_card.columnconfigure(i, weight=1)
        ttk.Button(task_card, text="安装自启", command=self.install_task_async, style="Primary.TButton").grid(row=1, column=0, sticky="ew", padx=(16, 6), pady=(14, 8))
        ttk.Button(task_card, text="卸载自启", command=self.uninstall_task_async, style="Danger.TButton").grid(row=1, column=1, sticky="ew", padx=6, pady=(14, 8))
        ttk.Button(task_card, text="查询任务", command=self.refresh_task_status_async, style="Tech.TButton").grid(row=1, column=2, sticky="ew", padx=(6, 16), pady=(14, 8))
        ttk.Button(task_card, text="启动后台任务", command=self.run_task_async, style="Tech.TButton").grid(row=2, column=0, columnspan=2, sticky="ew", padx=(16, 6), pady=(4, 16))
        ttk.Button(task_card, text="停止后台任务", command=self.end_task_async, style="Tech.TButton").grid(row=2, column=2, sticky="ew", padx=(6, 16), pady=(4, 16))
        tk.Label(task_card, text="安装/卸载开机自启可能需要管理员权限", bg=self.colors["panel"], fg=self.colors["muted"], font=("Microsoft YaHei UI", 9)).grid(row=3, column=0, columnspan=3, sticky="w", padx=16, pady=(0, 14))

        log_card = self.make_card(content, "运行日志", "TERMINAL OUTPUT")
        log_card.grid(row=2, column=0, columnspan=2, sticky="nsew")
        log_card.rowconfigure(1, weight=1)
        log_card.columnconfigure(0, weight=1)
        self.log_text = scrolledtext.ScrolledText(log_card, height=10, wrap=tk.WORD, font=("Cascadia Mono", 10), bg=self.colors["terminal"], fg="#b7f7d4", insertbackground=self.colors["primary"], relief="flat", borderwidth=0)
        self.log_text.grid(row=1, column=0, sticky="nsew", padx=16, pady=(12, 16))
        self.log("管理器已启动。")

    def make_card(self, parent, title, subtitle):
        card = tk.Frame(parent, bg=self.colors["panel"], highlightbackground=self.colors["border"], highlightthickness=1, bd=0)
        header = tk.Frame(card, bg=self.colors["panel"])
        header.grid(row=0, column=0, columnspan=3, sticky="ew", padx=16, pady=(14, 0))
        tk.Label(header, text=title, bg=self.colors["panel"], fg=self.colors["text"], font=("Microsoft YaHei UI", 12, "bold")).pack(side=tk.LEFT)
        tk.Label(header, text=subtitle, bg=self.colors["panel"], fg=self.colors["primary"], font=("Segoe UI", 8, "bold")).pack(side=tk.RIGHT)
        return card

    def make_metric_card(self, parent, title, value_var, subtitle):
        card = tk.Frame(parent, bg=self.colors["panel"], highlightbackground=self.colors["border"], highlightthickness=1, bd=0, padx=16, pady=14)
        tk.Label(card, text=title, bg=self.colors["panel"], fg=self.colors["muted"], font=("Microsoft YaHei UI", 9)).pack(anchor="w")
        tk.Label(card, textvariable=value_var, bg=self.colors["panel"], fg=self.colors["primary"], font=("Microsoft YaHei UI", 18, "bold")).pack(anchor="w", pady=(5, 3))
        tk.Label(card, text=subtitle, bg=self.colors["panel"], fg="#4f7fa8", font=("Segoe UI", 8, "bold")).pack(anchor="w")
        return card

    def form_label(self, parent, text):
        return tk.Label(parent, text=text, bg=self.colors["panel"], fg=self.colors["muted"], font=("Microsoft YaHei UI", 10))

    def choose_data_dir(self):
        selected = filedialog.askdirectory(initialdir=str(self.resolve_data_dir()), title="选择数据目录")
        if not selected:
            return
        cfg_path = self.runtime_root / "config.json"
        try:
            cfg = {}
            if cfg_path.exists():
                cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
                if not isinstance(cfg, dict):
                    cfg = {}
            cfg["data_dir"] = str(Path(selected).resolve())
            cfg_path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
            self.data_dir_var.set(str(Path(selected).resolve()))
            self.log(f"数据目录已保存到 config.json：{selected}")
            messagebox.showinfo("保存成功", "数据目录已保存，重启服务后生效。")
        except Exception as exc:
            messagebox.showerror("保存失败", str(exc))

    def log(self, message: str):
        timestamp = time.strftime("%H:%M:%S")
        line = f"[{timestamp}] {message}\n"
        self.log_text.insert(tk.END, line)
        self.log_text.see(tk.END)

    def run_worker(self, func):
        def wrapper():
            try:
                func()
            except Exception as exc:
                self.root.after(0, lambda: self.log(f"错误：{exc}"))
                self.root.after(0, lambda: messagebox.showerror("操作失败", str(exc)))
        threading.Thread(target=wrapper, daemon=True).start()

    # ---- Service process management ----
    def save_settings_clicked(self):
        try:
            self.save_settings()
        except Exception as exc:
            messagebox.showerror("保存失败", str(exc))

    def start_service_async(self):
        try:
            self.save_settings()
        except Exception as exc:
            messagebox.showerror("保存失败", str(exc))
            return
        self.run_worker(self.start_service)

    def stop_service_async(self):
        self.run_worker(self.stop_service)

    def restart_service_async(self):
        try:
            self.save_settings()
        except Exception as exc:
            messagebox.showerror("保存失败", str(exc))
            return
        self.run_worker(lambda: (self.stop_service(), time.sleep(0.5), self.start_service()))

    def refresh_all_async(self):
        self.refresh_status_async()
        self.refresh_task_status_async()

    def start_service(self):
        self.root.after(0, lambda: self.status_var.set("启动中..."))
        self.root.after(0, lambda: self.log("正在启动服务..."))

        if self.check_http_ready(timeout=0.8):
            self.root.after(0, lambda: self.status_var.set("运行中（HTTP 已响应）"))
            self.root.after(0, lambda: self.log("服务已在运行。"))
            return

        cmd, cwd = self.find_server_command()
        env = self.build_env()
        creationflags = 0
        startupinfo = None
        if os.name == "nt":
            creationflags = subprocess.CREATE_NO_WINDOW
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        self.server_process = subprocess.Popen(
            cmd,
            cwd=str(cwd),
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            creationflags=creationflags,
            startupinfo=startupinfo,
        )
        self.root.after(0, lambda: self.pid_var.set(str(self.server_process.pid if self.server_process else "-")))
        self.root.after(0, lambda: self.log("启动命令：" + " ".join(cmd)))

        ready = self.check_http_ready(timeout=6)
        if ready:
            self.root.after(0, lambda: self.status_var.set("运行中"))
            self.root.after(0, lambda: self.log(f"服务已启动：{self.admin_url()}"))
        else:
            self.root.after(0, lambda: self.status_var.set("启动失败/未响应"))
            self.root.after(0, lambda: self.log("服务启动后未通过 HTTP 健康检查，请确认端口是否被占用。"))

    def stop_service(self):
        self.root.after(0, lambda: self.log("正在停止服务..."))
        stopped = False
        if self.server_process and self.server_process.poll() is None:
            try:
                self.server_process.terminate()
                self.server_process.wait(timeout=4)
                stopped = True
            except Exception:
                try:
                    self.server_process.kill()
                    stopped = True
                except Exception:
                    pass
        self.server_process = None
        self.root.after(0, lambda: self.pid_var.set("-"))

        # Fallback: stop process listening on configured port, if any.
        port = str(self.settings.get("port", DEFAULT_SETTINGS["port"]))
        if os.name == "nt" and port:
            try:
                ps = (
                    f"$pids=(Get-NetTCPConnection -LocalPort {int(port)} -ErrorAction SilentlyContinue | "
                    "Select-Object -ExpandProperty OwningProcess -Unique); "
                    "foreach($p in $pids){ if($p -and $p -ne 0){ Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } }"
                )
                run_hidden(["powershell", "-NoProfile", "-Command", ps], timeout=8)
                stopped = True
            except Exception:
                pass

        self.root.after(0, lambda: self.status_var.set("未运行"))
        self.root.after(0, lambda: self.log("服务已停止。" if stopped else "未找到需要停止的服务进程。"))

    def check_http_ready(self, timeout=3) -> bool:
        started = time.time()
        while time.time() - started < timeout:
            try:
                req = urllib.request.Request(self.health_url(), headers={"User-Agent": "StaticHtmlHostManager/1.0"})
                with urllib.request.urlopen(req, timeout=0.8) as res:
                    if 200 <= res.status < 500:
                        return True
            except Exception:
                time.sleep(0.25)
        return False

    def refresh_status_async(self):
        self.run_worker(self.refresh_status)

    def refresh_status(self):
        ready = self.check_http_ready(timeout=1.5)
        pid = "-"
        if self.server_process and self.server_process.poll() is None:
            pid = str(self.server_process.pid)
        self.root.after(0, lambda: self.status_var.set("运行中" if ready else "未运行"))
        self.root.after(0, lambda: self.pid_var.set(pid))
        self.root.after(0, lambda: self.admin_url_var.set(self.admin_url()))
        self.root.after(0, lambda: self.data_dir_var.set(str(self.resolve_data_dir())))

    def open_admin(self):
        webbrowser.open(self.admin_url())
        self.log("已打开管理后台。")

    # ---- Scheduled task management ----
    def task_command_line(self) -> str:
        cmd, _cwd = self.find_server_command()
        if len(cmd) == 1:
            return f'"{cmd[0]}"'
        return " ".join(f'"{part}"' if " " in part else part for part in cmd)

    def install_task_async(self):
        try:
            self.save_settings()
        except Exception as exc:
            messagebox.showerror("保存失败", str(exc))
            return
        self.run_worker(self.install_task)

    def uninstall_task_async(self):
        self.run_worker(self.uninstall_task)

    def run_task_async(self):
        self.run_worker(self.run_task)

    def end_task_async(self):
        self.run_worker(self.end_task)

    def refresh_task_status_async(self):
        self.run_worker(self.refresh_task_status)

    def install_task(self):
        cmd, cwd = self.find_server_command()
        # Use cmd.exe so we can set env vars and cwd before launching the server.
        env_prefix = (
            f'set "HOST={self.settings.get("host", DEFAULT_SETTINGS["host"])}" && '
            f'set "PORT={self.settings.get("port", DEFAULT_SETTINGS["port"])}" && '
            f'set "STATIC_HTML_HOST_PROJECT_ROOT={self.runtime_root}" && '
            f'set "STATIC_HTML_HOST_DATA_DIR={self.resolve_data_dir()}" && '
            f'cd /d "{cwd}" && '
        )
        server_cmd = " ".join(f'"{part}"' if " " in part else part for part in cmd)
        task_run = env_prefix + server_cmd
        args = [
            "schtasks", "/Create", "/TN", TASK_NAME,
            "/SC", "ONLOGON", "/TR", task_run,
            "/RL", "HIGHEST", "/F",
        ]
        result = run_hidden(args, cwd=self.runtime_root, timeout=15)
        if result.returncode != 0:
            raise RuntimeError((result.stderr or result.stdout or "安装任务失败").strip())
        self.root.after(0, lambda: self.log("开机自启后台任务已安装。"))
        self.refresh_task_status()

    def uninstall_task(self):
        result = run_hidden(["schtasks", "/Delete", "/TN", TASK_NAME, "/F"], cwd=self.runtime_root, timeout=15)
        if result.returncode != 0 and "找不到" not in (result.stderr + result.stdout):
            raise RuntimeError((result.stderr or result.stdout or "卸载任务失败").strip())
        self.root.after(0, lambda: self.log("开机自启后台任务已卸载。"))
        self.refresh_task_status()

    def run_task(self):
        result = run_hidden(["schtasks", "/Run", "/TN", TASK_NAME], cwd=self.runtime_root, timeout=15)
        if result.returncode != 0:
            raise RuntimeError((result.stderr or result.stdout or "启动后台任务失败").strip())
        self.root.after(0, lambda: self.log("后台任务已启动。"))
        time.sleep(1)
        self.refresh_status()

    def end_task(self):
        run_hidden(["schtasks", "/End", "/TN", TASK_NAME], cwd=self.runtime_root, timeout=15)
        self.stop_service()
        self.root.after(0, lambda: self.log("后台任务已停止。"))
        self.refresh_task_status()

    def refresh_task_status(self):
        if os.name != "nt":
            self.root.after(0, lambda: self.task_status_var.set("仅 Windows 支持"))
            return
        result = run_hidden(["schtasks", "/Query", "/TN", TASK_NAME], cwd=self.runtime_root, timeout=10)
        text = (result.stdout + result.stderr).strip()
        exists = result.returncode == 0
        self.root.after(0, lambda: self.task_status_var.set("已安装" if exists else "未安装"))
        if text:
            self.root.after(0, lambda: self.log("任务查询：" + ("已安装" if exists else "未安装")))

    def on_close(self):
        if self.server_process and self.server_process.poll() is None:
            if messagebox.askyesno("退出", "服务由当前管理器启动。退出时是否停止服务？\n\n选择“否”将保持服务继续运行。"):
                try:
                    self.stop_service()
                except Exception:
                    pass
        self.root.destroy()


def main():
    root = tk.Tk()
    try:
        root.iconbitmap(default="")
    except Exception:
        pass
    StaticHtmlHostManager(root)
    root.mainloop()


if __name__ == "__main__":
    main()
