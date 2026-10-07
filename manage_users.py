#!/usr/bin/env python3
"""
用户管理脚本

功能：
  - add <username> <password> [--role user|admin]   添加用户（默认普通用户）
  - passwd <username> <password>                    修改密码
  - role <username> <user|admin>                    修改角色
  - activate <username>                             启用用户
  - deactivate <username>                           禁用用户
  - list                                            列出所有用户

示例：
  python manage_users.py add alice 123456 --role user
  python manage_users.py add admin2 123456 --role admin
  python manage_users.py passwd alice newpass
  python manage_users.py role alice admin
  python manage_users.py deactivate alice
  python manage_users.py list
"""

from __future__ import annotations

import argparse
import os
import sys

# 确保可以导入本项目的 app
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.append(CURRENT_DIR)

from app import app, db, User  # type: ignore


def ensure_tables_created() -> None:
    """确保数据库表存在（不会删除已有表）。"""
    with app.app_context():
        db.create_all()


def cmd_add(username: str, password: str, role: str = 'user') -> None:
    with app.app_context():
        if User.query.filter_by(username=username).first():
            print(f"❌ 用户已存在: {username}")
            return
        user = User(username=username, role=role, is_active=True)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        print(f"✅ 创建成功: {username} (role={role})")


def cmd_passwd(username: str, password: str) -> None:
    with app.app_context():
        user = User.query.filter_by(username=username).first()
        if not user:
            print(f"❌ 未找到用户: {username}")
            return
        user.set_password(password)
        db.session.commit()
        print(f"✅ 密码修改成功: {username}")


def cmd_role(username: str, role: str) -> None:
    if role not in ("user", "admin"):
        print("❌ 角色必须是 'user' 或 'admin'")
        return
    with app.app_context():
        user = User.query.filter_by(username=username).first()
        if not user:
            print(f"❌ 未找到用户: {username}")
            return
        user.role = role
        db.session.commit()
        print(f"✅ 角色修改成功: {username} -> {role}")


def cmd_activate(username: str, active: bool) -> None:
    with app.app_context():
        user = User.query.filter_by(username=username).first()
        if not user:
            print(f"❌ 未找到用户: {username}")
            return
        user.is_active = active
        db.session.commit()
        print(f"✅ {'启用' if active else '禁用'} 成功: {username}")


def cmd_list() -> None:
    with app.app_context():
        users = User.query.all()
        if not users:
            print("（空）暂无用户")
            return
        print(f"共 {len(users)} 个用户：")
        for u in users:
            status = "启用" if u.is_active else "禁用"
            print(f"- ID={u.id}  用户名={u.username}  角色={u.role}  状态={status}  创建时间={u.created_at}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="六院体检业务管理系统 - 用户管理工具",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command")

    p_add = sub.add_parser("add", help="添加用户")
    p_add.add_argument("username", help="用户名")
    p_add.add_argument("password", help="密码")
    p_add.add_argument("--role", choices=["user", "admin"], default="user", help="角色，默认为 user")

    p_pass = sub.add_parser("passwd", help="修改密码")
    p_pass.add_argument("username", help="用户名")
    p_pass.add_argument("password", help="新密码")

    p_role = sub.add_parser("role", help="修改角色")
    p_role.add_argument("username", help="用户名")
    p_role.add_argument("role", choices=["user", "admin"], help="新角色")

    p_act = sub.add_parser("activate", help="启用用户")
    p_act.add_argument("username", help="用户名")

    p_deact = sub.add_parser("deactivate", help="禁用用户")
    p_deact.add_argument("username", help="用户名")

    sub.add_parser("list", help="列出所有用户")

    return parser


def main(argv: list[str] | None = None) -> int:
    ensure_tables_created()
    parser = build_parser()
    args = parser.parse_args(argv)

    if not args.command:
        parser.print_help()
        return 1

    if args.command == "add":
        cmd_add(args.username, args.password, args.role)
    elif args.command == "passwd":
        cmd_passwd(args.username, args.password)
    elif args.command == "role":
        cmd_role(args.username, args.role)
    elif args.command == "activate":
        cmd_activate(args.username, True)
    elif args.command == "deactivate":
        cmd_activate(args.username, False)
    elif args.command == "list":
        cmd_list()
    else:
        parser.print_help()
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

