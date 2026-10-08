from flask import Flask, render_template, request, redirect, url_for, flash, jsonify, send_file, session
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timezone, timedelta
import random
from sqlalchemy import func
import requests
import tempfile
import os
import secrets
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import (
    LoginManager,
    login_user,
    logout_user,
    login_required,
    current_user,
    UserMixin,
)
from werkzeug.urls import url_parse
import time


app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY') or secrets.token_hex(32)
os.makedirs(app.instance_path, exist_ok=True)
db_path = os.path.join(app.instance_path, 'business_management.db')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + db_path.replace('\\', '/')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# 登录管理器
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'
login_manager.login_message = '请先登录'

# Node.js PDF服务配置
PDF_SERVICE_URL = os.environ.get('PDF_SERVICE_URL', 'http://localhost:3001/generate-pdf')

# 北京时间时区
BEIJING_TZ = timezone(timedelta(hours=8))

def get_beijing_time():
    """获取北京时间"""
    return datetime.now(BEIJING_TZ)

# 添加自定义过滤器
@app.template_filter('nl2br')
def nl2br_filter(text):
    if text:
        return text.replace('\n', '<br>')
    return text

@app.template_filter('format_money')
def format_money_filter(amount):
    if amount:
        return f"{amount:,.2f}"
    return "0.00"

# ------- 公共数据构建：列表页/预览共用 -------
def build_listing_context():
    """构建业务列表所需的上下文（与 index 预览路由共享）。"""
    page = request.args.get('page', 1, type=int)
    per_page = 10
    search = request.args.get('search', '')
    bid_status_filter = request.args.get('bid_status', '')
    sort_by = request.args.get('sort', 'created_at')
    
    query = Business.query
    if search:
        query = query.filter(
            db.or_(
                Business.name.contains(search),
                Business.customer.contains(search),
                Business.bid_contact_name.contains(search),
                Business.bid_contact_phone.contains(search),
                Business.customer_contact_name.contains(search),
                Business.customer_contact_phone.contains(search),
                Business.service_content.contains(search),
                Business.document_status.contains(search),
                Business.bid_status.contains(search),
                Business.priority.contains(search),
                Business.payment_status.contains(search),
                Business.notes.contains(search),
            )
        )
    
    if bid_status_filter:
        if bid_status_filter == '已投标':
            query = query.filter(Business.bid_status.in_(['已投标', '未中标', '已中标']))
        else:
            query = query.filter(Business.bid_status == bid_status_filter)
    
    now = get_beijing_time()
    if sort_by == 'registration_time':
        query = query.order_by(
            db.case(
                (Business.registration_time.is_(None), 3),
                (func.date(Business.registration_time) < func.date(now), 2),
                (func.date(Business.registration_time) == func.date(now), 0),
                else_=1,
            ),
            Business.registration_time.asc(),
        )
    elif sort_by == 'bid_time':
        query = query.order_by(
            db.case(
                (Business.bid_time.is_(None), 3),
                (func.date(Business.bid_time) < func.date(now), 2),
                (func.date(Business.bid_time) == func.date(now), 0),
                else_=1,
            ),
            Business.bid_time.asc(),
        )
    elif sort_by == 'amount_desc':
        query = query.order_by(Business.bid_amount.desc())
    else:
        query = query.order_by(Business.created_at.desc())
    
    businesses = query.paginate(page=page, per_page=per_page, error_out=False)

    total_businesses = Business.query.count()
    total_won_amount = db.session.query(db.func.sum(Business.bid_amount)).filter(
        Business.bid_status == '已中标'
    ).scalar() or 0
    bid_status_counts = db.session.query(
        Business.bid_status, db.func.count(Business.id)
    ).group_by(Business.bid_status).all()
    bid_count = db.session.query(db.func.count(Business.id)).filter(
        Business.bid_status.in_(['已投标', '未中标', '已中标'])
    ).scalar() or 0
    
    return dict(
                         businesses=businesses,
                         search=search,
                         sort_by=sort_by,
                         bid_status_filter=bid_status_filter,
                         total_businesses=total_businesses,
        total_amount=total_won_amount,
                         bid_status_counts=bid_status_counts,
                         bid_count=bid_count,
        now=now,
    )

@app.route('/api/stats')
@login_required
def api_stats():
    """返回统计卡片所需数据：总数、已投标数、已中标数、中标总额（万元），以及最近12周序列。
    系列与趋势口径与前端保持一致：以 created_at 落入周窗口统计；
    已投标口径 = ['已投标','未中标','已中标']。
    """
    bid_all_set = ['已投标', '未中标', '已中标']

    total = db.session.query(db.func.count(Business.id)).scalar() or 0
    bid_all = db.session.query(db.func.count(Business.id)).filter(Business.bid_status.in_(bid_all_set)).scalar() or 0
    won = db.session.query(db.func.count(Business.id)).filter(Business.bid_status == '已中标').scalar() or 0
    amount_total = db.session.query(db.func.coalesce(db.func.sum(Business.bid_amount), 0.0)).filter(Business.bid_status == '已中标').scalar() or 0.0

    # 最近12周序列（以周一为起点）
    now = get_beijing_time()
    weekday = now.weekday()  # Monday=0
    this_monday = (now - timedelta(days=weekday)).date()
    week0 = this_monday - timedelta(weeks=11)
    week_starts = [week0 + timedelta(weeks=i) for i in range(12)]
    week_ends = [ws + timedelta(days=7) for ws in week_starts]

    series_total = [0]*12
    series_bid_all = [0]*12
    series_won = [0]*12
    series_amount = [0]*12  # 万元

    # total 序列按 created_at 统计
    rows_created = db.session.query(Business.created_at).all()
    for created_at, in rows_created:
        if not created_at:
            continue
        d = created_at.date()
        if d < week_starts[0] or d >= week_ends[-1]:
            pass
        else:
            idx = (d - week_starts[0]).days // 7
            if 0 <= idx < 12:
                series_total[idx] += 1

    # 其余序列按 updated_at 统计
    rows = db.session.query(Business.updated_at, Business.bid_status, Business.bid_amount).all()
    for updated_at, status, amount in rows:
        if not updated_at:
            continue
        d = updated_at.date()
        if d < week_starts[0] or d >= week_ends[-1]:
            # 不在窗口
            pass
        else:
            idx = (d - week_starts[0]).days // 7
            if 0 <= idx < 12:
                if status in bid_all_set:
                    series_bid_all[idx] += 1
                if status == '已中标':
                    series_won[idx] += 1
                    try:
                        series_amount[idx] += float(amount or 0.0) / 10000.0
                    except Exception:
                        pass

    # 趋势：最近30天与之前30天
    end_a = now
    start_a = now - timedelta(days=30)
    end_b = start_a
    start_b = end_a - timedelta(days=60)

    def in_range(dt, start, end):
        return dt and (start <= dt <= end)

    # total 环比按 created_at 统计
    cur_total = db.session.query(db.func.count(Business.id)).filter(Business.created_at.between(start_a, end_a)).scalar() or 0
    prev_total = db.session.query(db.func.count(Business.id)).filter(Business.created_at.between(start_b, end_b)).scalar() or 0

    cur_bid_all = db.session.query(db.func.count(Business.id)).filter(Business.updated_at.between(start_a, end_a), Business.bid_status.in_(bid_all_set)).scalar() or 0
    prev_bid_all = db.session.query(db.func.count(Business.id)).filter(Business.updated_at.between(start_b, end_b), Business.bid_status.in_(bid_all_set)).scalar() or 0

    cur_won = db.session.query(db.func.count(Business.id)).filter(Business.updated_at.between(start_a, end_a), Business.bid_status == '已中标').scalar() or 0
    prev_won = db.session.query(db.func.count(Business.id)).filter(Business.updated_at.between(start_b, end_b), Business.bid_status == '已中标').scalar() or 0

    cur_amount = db.session.query(db.func.coalesce(db.func.sum(Business.bid_amount), 0.0)).filter(Business.updated_at.between(start_a, end_a), Business.bid_status == '已中标').scalar() or 0.0
    prev_amount = db.session.query(db.func.coalesce(db.func.sum(Business.bid_amount), 0.0)).filter(Business.updated_at.between(start_b, end_b), Business.bid_status == '已中标').scalar() or 0.0

    def pct(cur, prev):
        if prev == 0:
            return 100 if cur > 0 else 0
        return round((cur - prev) / prev * 100, 1)

    return jsonify({
        'totals': {
            'total': int(total),
            'bidAll': int(bid_all),
            'won': int(won),
            'amountWan': round((amount_total or 0.0) / 10000.0)
        },
        'trends': {
            'total': {'pct': pct(cur_total, prev_total), 'delta': int(cur_total - prev_total)},
            'bidAll': {'pct': pct(cur_bid_all, prev_bid_all), 'delta': int(cur_bid_all - prev_bid_all)},
            'won': {'pct': pct(cur_won, prev_won), 'delta': int(cur_won - prev_won)},
            'amount': {'pct': pct(cur_amount, prev_amount), 'delta': int(round((cur_amount - prev_amount) / 10000.0))}
        },
        'series': {
            'total': series_total,
            'bidAll': series_bid_all,
            'won': series_won,
            'amount': [round(v) for v in series_amount]
        }
    })

# ========= 管理员：清空并按真实口径导入模拟数据 =========
@app.route('/admin/reset-seed/<int:n>', methods=['POST', 'GET'])
@login_required
def admin_reset_seed(n: int):
    if not (hasattr(current_user, 'role') and current_user.role == 'admin'):
        return jsonify({'success': False, 'message': '无权限'}), 403

    # 清库
    StatusHistory.query.delete()
    Business.query.delete()
    db.session.commit()

    now = get_beijing_time()
    rng = random.Random()
    names = [
        '天友乳业职工体检','重庆建筑科技职业学院体检','重庆传媒职业学院体检','重庆工程职业技术学院体检','重庆体育职业学院体检',
        '西南大学体检','重庆医药高等专科学校体检','重庆工业职业技术学院体检','重庆邮电大学体检','重庆商务职业学院体检'
    ]
    bid_status_chain_options = [
        # 各路径的末状态与概率（近似）
        ('未报名', 0.10),
        ('已报名', 0.15),
        ('未投标', 0.20),
        ('已投标', 0.25),
        ('未中标', 0.15),
        ('已中标', 0.15),
    ]

    def pick_status():
        r = rng.random()
        acc = 0.0
        for val, p in bid_status_chain_options:
            acc += p
            if r <= acc:
                return val
        return '未投标'

    def clamp(dt):
        # 不允许超过当前时间
        return min(dt, now)

    inserted = 0
    for i in range(n):
        # 录入时间：过去90天内
        created_days_ago = rng.randint(0, 90)
        created_at = now - timedelta(days=created_days_ago, hours=rng.randint(0, 23), minutes=rng.randint(0, 59))

        # 报名时间：录入后 1~14 天
        reg_time = created_at + timedelta(days=rng.randint(1, 14), hours=rng.randint(0, 23))
        reg_time = clamp(reg_time)

        # 投标时间：报名后 3~20 天
        bid_time = reg_time + timedelta(days=rng.randint(3, 20), hours=rng.randint(0, 23))
        bid_time = clamp(bid_time)

        # 目标最终状态
        final_status = pick_status()

        # 金额、人数
        amount = round(rng.uniform(50_000, 5_000_000), 2)
        people = rng.randint(50, 2000)

        b = Business(
            name=f"{rng.choice(names)}-{i+1:03d}",
            customer='示例客户',
            bid_amount=amount,
            service_people=people,
            registration_time=reg_time,
            bid_time=bid_time,
            document_status='已获取' if final_status in ['已投标','未中标','已中标'] else '未获取',
            bid_status='未报名',  # 初始
            priority=rng.choice(['低','中','高']),
            created_at=created_at,
            updated_at=created_at,
            updated_by='系统',
        )
        db.session.add(b)
        db.session.flush()  # 获得 b.id

        def add_history(field, old, new, when):
            h = StatusHistory(
                business_id=b.id,
                field_name=field,
                old_value=str(old) if old is not None else None,
                new_value=str(new) if new is not None else None,
                changed_at=when,
                changed_by='系统',
                notes=f'{field}: {old} -> {new}'
            )
            db.session.add(h)

        # 创建历史
        add_history('创建', None, '业务创建', created_at)

        # 生成状态流转时间：均不超过投标时间，唯有"已中标"允许在投标后≤5天
        cursor = created_at + timedelta(hours=rng.randint(1, 48))

        # 可能转为"已报名"
        if final_status in ['已报名','未投标','已投标','未中标','已中标']:
            cursor = clamp(min(cursor, reg_time - timedelta(hours=1)))
            if cursor < created_at:
                cursor = created_at
            add_history('投标状态', '未报名', '已报名', cursor)
            b.bid_status = '已报名'
            b.updated_at = cursor

        # 可能转为"未投标"（在投标时间之前）
        if final_status in ['未投标','已投标','未中标','已中标']:
            cursor = clamp(min(bid_time - timedelta(hours=rng.randint(12, 48)), reg_time + timedelta(hours=rng.randint(6, 48))))
            cursor = max(cursor, reg_time)
            add_history('投标状态', '已报名', '未投标', cursor)
            b.bid_status = '未投标'
            b.updated_at = cursor

        # 可能转为"已投标"（在投标时间之前或当天）
        if final_status in ['已投标','未中标','已中标']:
            cursor = clamp(bid_time - timedelta(hours=rng.randint(1, 24)))
            cursor = max(cursor, reg_time)
            add_history('投标状态', '未投标', '已投标', cursor)
            b.bid_status = '已投标'
            b.updated_at = cursor

        # 可能转为"未中标"（要求在投标时间之内）
        if final_status == '未中标':
            cursor = clamp(bid_time - timedelta(hours=rng.randint(0, 6)))
            add_history('投标状态', '已投标', '未中标', cursor)
            b.bid_status = '未中标'
            b.updated_at = cursor

        # 可能转为"已中标"（通常在投标后 <= 5 天）
        if final_status == '已中标':
            cursor = clamp(bid_time + timedelta(days=rng.randint(0, 5), hours=rng.randint(0, 20)))
            add_history('投标状态', '已投标', '已中标', cursor)
            b.bid_status = '已中标'
            b.updated_at = cursor

        db.session.add(b)
        inserted += 1

    db.session.commit()
    return jsonify({'success': True, 'cleared': True, 'inserted': inserted})

# 固定窗口数据导入：报名 6/4~8/20，投标 6/15~9/1
@app.route('/admin/reset-seed-window/<int:n>', methods=['POST', 'GET'])
@login_required
def admin_reset_seed_window(n: int):
    if not (hasattr(current_user, 'role') and current_user.role == 'admin'):
        return jsonify({'success': False, 'message': '无权限'}), 403

    StatusHistory.query.delete()
    Business.query.delete()
    db.session.commit()

    now = get_beijing_time()
    year = now.year
    rng = random.Random()

    reg_start = datetime(year, 6, 4, tzinfo=BEIJING_TZ)
    reg_end   = datetime(year, 8, 20, 23, 59, 59, tzinfo=BEIJING_TZ)
    bid_start = datetime(year, 6, 15, tzinfo=BEIJING_TZ)
    bid_end   = datetime(year, 9, 1, 23, 59, 59, tzinfo=BEIJING_TZ)

    def rand_dt(start: datetime, end: datetime) -> datetime:
        if end < start:
            start, end = end, start
        span = (end - start).total_seconds()
        off = rng.random() * max(span, 0)
        return start + timedelta(seconds=off)

    names = [
        '天友乳业职工体检','重庆建筑科技职业学院体检','重庆传媒职业学院体检','重庆工程职业技术学院体检','重庆体育职业学院体检',
        '西南大学体检','重庆医药高等专科学校体检','重庆工业职业技术学院体检','重庆邮电大学体检','重庆商务职业学院体检'
    ]

    def pick_final_status() -> str:
        r = rng.random()
        if r < 0.12: return '未报名'
        if r < 0.27: return '已报名'
        if r < 0.45: return '未投标'
        if r < 0.67: return '已投标'
        if r < 0.84: return '未中标'
        return '已中标'

    def clamp(dt: datetime) -> datetime:
        return min(dt, now)

    inserted = 0
    for i in range(n):
        reg_time = clamp(rand_dt(reg_start, min(reg_end, now)))
        bid_low = max(bid_start, reg_time + timedelta(days=3))
        bid_time = clamp(rand_dt(bid_low, min(bid_end, now)))
        if bid_time <= reg_time:
            bid_time = clamp(reg_time + timedelta(days=3))

        created_at = clamp(reg_time - timedelta(days=rng.randint(0, 7), hours=rng.randint(0, 23)))
        final_status = pick_final_status()
        amount = round(rng.uniform(50_000, 5_000_000), 2)
        people = rng.randint(50, 2000)

        b = Business(
            name=f"{rng.choice(names)}-{i+1:03d}",
            customer='示例客户',
            bid_amount=amount,
            service_people=people,
            registration_time=reg_time,
            bid_time=bid_time,
            document_status='未获取',
            bid_status='未报名',
            priority=rng.choice(['低','中','高']),
            created_at=created_at,
            updated_at=created_at,
            updated_by='系统',
        )
        db.session.add(b)
        db.session.flush()

        def add_history(field, old, new, when):
            db.session.add(StatusHistory(
                business_id=b.id,
                field_name=field,
                old_value=str(old) if old is not None else None,
                new_value=str(new) if new is not None else None,
                changed_at=when,
                changed_by='系统',
                notes=f'{field}: {old} -> {new}'
            ))

        add_history('创建', None, '业务创建', created_at)

        if final_status in ['已投标','未中标','已中标']:
            doc_time = clamp(reg_time - timedelta(hours=rng.randint(0, 24)))
            b.document_status = '已获取'
            add_history('标书状态', '未获取', '已获取', doc_time)
            b.updated_at = doc_time

        cursor = clamp(created_at + timedelta(hours=rng.randint(4, 36)))

        if final_status in ['已报名','未投标','已投标','未中标','已中标']:
            cursor = clamp(min(reg_time - timedelta(hours=1), reg_time))
            if cursor < created_at: cursor = created_at
            add_history('投标状态', '未报名', '已报名', cursor)
            b.bid_status = '已报名'; b.updated_at = cursor

        if final_status in ['未投标','已投标','未中标','已中标']:
            cursor = clamp(max(reg_time, min(bid_time - timedelta(hours=rng.randint(18, 48)), reg_time + timedelta(days=rng.randint(1, 3)))))
            add_history('投标状态', '已报名', '未投标', cursor)
            b.bid_status = '未投标'; b.updated_at = cursor

        if final_status in ['已投标','未中标','已中标']:
            cursor = clamp(max(reg_time, bid_time - timedelta(hours=rng.randint(6, 24))))
            add_history('投标状态', '未投标', '已投标', cursor)
            b.bid_status = '已投标'; b.updated_at = cursor

        if final_status == '未中标':
            cursor = clamp(bid_time - timedelta(hours=rng.randint(0, 6)))
            add_history('投标状态', '已投标', '未中标', cursor)
            b.bid_status = '未中标'; b.updated_at = cursor

        if final_status == '已中标':
            cursor = clamp(bid_time + timedelta(days=rng.randint(0, 5), hours=rng.randint(0, 20)))
            add_history('投标状态', '已投标', '已中标', cursor)
            b.bid_status = '已中标'; b.updated_at = cursor

        db.session.add(b)
        inserted += 1

    db.session.commit()
    return jsonify({'success': True, 'cleared': True, 'inserted': inserted, 'reg_window': ['6-04','8-20'], 'bid_window': ['6-15','9-01']})

# 比例含未来时间的数据导入：报名约5%在未来、投标约20%在未来
@app.route('/admin/reset-seed-future/<int:n>', methods=['POST', 'GET'])
@login_required
def admin_reset_seed_future(n: int):
    if not (hasattr(current_user, 'role') and current_user.role == 'admin'):
        return jsonify({'success': False, 'message': '无权限'}), 403

    # 清空
    StatusHistory.query.delete()
    Business.query.delete()
    db.session.commit()

    now = get_beijing_time()
    rng = random.Random()

    names = [
        '天友乳业职工体检','重庆建筑科技职业学院体检','重庆传媒职业学院体检','重庆工程职业技术学院体检','重庆体育职业学院体检',
        '西南大学体检','重庆医药高等专科学校体检','重庆工业职业技术学院体检','重庆邮电大学体检','重庆商务职业学院体检'
    ]

    def pick_final_status() -> str:
        r = rng.random()
        if r < 0.12: return '未报名'
        if r < 0.27: return '已报名'
        if r < 0.45: return '未投标'
        if r < 0.67: return '已投标'
        if r < 0.84: return '未中标'
        return '已中标'

    inserted = 0

    for i in range(n):
        # created_at：过去90天内
        created_at = now - timedelta(days=rng.randint(0, 90), hours=rng.randint(0, 23), minutes=rng.randint(0, 59))

        # 报名未来比例约5%
        reg_future = (rng.random() < 0.05)
        if reg_future:
            reg_time = now + timedelta(days=rng.randint(1, 14), hours=rng.randint(0, 23))
        else:
            reg_time = created_at + timedelta(days=rng.randint(1, 14), hours=rng.randint(0, 23))
            if reg_time > now:
                reg_time = now - timedelta(hours=rng.randint(0, 24))

        # 投标时间：至少在报名+3天后；未来比例约20%
        bid_future = (rng.random() < 0.20)
        min_bid = reg_time + timedelta(days=3)
        if bid_future:
            base = max(now + timedelta(days=1), min_bid)
            bid_time = base + timedelta(days=rng.randint(0, 30), hours=rng.randint(0, 20))
        else:
            # 确保不晚于现在
            latest = max(min_bid, now - timedelta(days=1))
            # 如果 min_bid 已经在未来，回退一点
            if min_bid > now:
                latest = now
            span_days = max(0, (latest - min_bid).days)
            bid_time = min_bid + timedelta(days=rng.randint(0, max(0, span_days)), hours=rng.randint(0, 20))
            if bid_time > now:
                bid_time = now

        final_status = pick_final_status()
        amount = round(rng.uniform(50_000, 5_000_000), 2)
        people = rng.randint(50, 2000)

        b = Business(
            name=f"{rng.choice(names)}-{i+1:03d}",
            customer='示例客户',
            bid_amount=amount,
            service_people=people,
            registration_time=reg_time,
            bid_time=bid_time,
            document_status='未获取',
            bid_status='未报名',
            priority=rng.choice(['低','中','高']),
            created_at=created_at,
            updated_at=created_at,
            updated_by='系统',
        )
        db.session.add(b)
        db.session.flush()

        def add_history(field, old, new, when):
            db.session.add(StatusHistory(
                business_id=b.id,
                field_name=field,
                old_value=str(old) if old is not None else None,
                new_value=str(new) if new is not None else None,
                changed_at=when,
                changed_by='系统',
                notes=f'{field}: {old} -> {new}'
            ))

        # 创建
        add_history('创建', None, '业务创建', created_at)

        # 标书状态：进入已投标/未中标/已中标路径视为已获取（时间在报名前后0~24h）
        if final_status in ['已投标','未中标','已中标']:
            doc_time = reg_time - timedelta(hours=rng.randint(0, 24))
            b.document_status = '已获取'
            add_history('标书状态', '未获取', '已获取', doc_time)
            b.updated_at = max(b.updated_at, doc_time)

        # 流转（非中标<=投标时间，已中标<=投标+5天）
        cursor = created_at + timedelta(hours=rng.randint(2, 36))
        if final_status in ['已报名','未投标','已投标','未中标','已中标']:
            cursor = min(reg_time, bid_time - timedelta(days=2))
            add_history('投标状态', '未报名', '已报名', cursor)
            b.bid_status = '已报名'; b.updated_at = max(b.updated_at, cursor)

        if final_status in ['未投标','已投标','未中标','已中标']:
            cursor = max(reg_time, min(bid_time - timedelta(days=1), reg_time + timedelta(days=rng.randint(1, 3))))
            add_history('投标状态', '已报名', '未投标', cursor)
            b.bid_status = '未投标'; b.updated_at = max(b.updated_at, cursor)

        if final_status in ['已投标','未中标','已中标']:
            cursor = max(reg_time, bid_time - timedelta(hours=rng.randint(6, 24)))
            add_history('投标状态', '未投标', '已投标', cursor)
            b.bid_status = '已投标'; b.updated_at = max(b.updated_at, cursor)

        if final_status == '未中标':
            cursor = bid_time - timedelta(hours=rng.randint(0, 8))
            add_history('投标状态', '已投标', '未中标', cursor)
            b.bid_status = '未中标'; b.updated_at = max(b.updated_at, cursor)

        if final_status == '已中标':
            cursor = bid_time + timedelta(days=rng.randint(0, 5), hours=rng.randint(0, 20))
            add_history('投标状态', '已投标', '已中标', cursor)
            b.bid_status = '已中标'; b.updated_at = max(b.updated_at, cursor)

        db.session.add(b)
        inserted += 1

    db.session.commit()
    return jsonify({'success': True, 'cleared': True, 'inserted': inserted, 'reg_future_pct': 0.05, 'bid_future_pct': 0.20})

# 认证与权限相关路由
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        user = User.query.filter_by(username=username).first()
        if not user or not user.check_password(password):
            flash('用户名或密码错误', 'error')
            return render_template('login.html')
        if not user.is_active:
            flash('账号已被禁用，请联系管理员', 'error')
            return render_template('login.html')
        login_user(user)
        return redirect(url_for('index'))
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

# 新UI登出：退出后跳转到新登录页 /ui/login
@app.route('/ui/logout')
@login_required
def ui_logout():
    logout_user()
    return redirect(url_for('ui_login'))

# 业务模型
class Business(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    # 基本信息
    name = db.Column(db.String(200), nullable=False, comment='业务名称')
    customer = db.Column(db.String(200), nullable=False, comment='客户单位')
    
    # 投标联系人
    bid_contact_name = db.Column(db.String(50), comment='投标联系人姓名')
    bid_contact_phone = db.Column(db.String(20), comment='投标联系人电话')
    
    # 客户联系人
    customer_contact_name = db.Column(db.String(50), comment='客户联系人姓名')
    customer_contact_phone = db.Column(db.String(20), comment='客户联系人电话')
    
    # 业务信息
    service_content = db.Column(db.Text, comment='服务内容')
    bid_amount = db.Column(db.Float, default=0.0, comment='招标金额')
    service_people = db.Column(db.Integer, default=0, comment='服务人数')
    document_url = db.Column(db.String(500), comment='标书获取地址')
    previous_suppliers = db.Column(db.String(500), comment='过往服务商')
    
    # 时间信息
    registration_time = db.Column(db.DateTime, comment='报名时间')
    bid_time = db.Column(db.DateTime, comment='投标时间')
    
    # 状态信息
    document_status = db.Column(db.String(20), default='未获取', comment='标书状态')
    bid_status = db.Column(db.String(20), default='未报名', comment='投标状态')
    priority = db.Column(db.String(20), default='低', comment='优先级')
    payment_status = db.Column(db.String(50), comment='收款情况')
    
    # 系统信息
    created_at = db.Column(db.DateTime, default=lambda: get_beijing_time(), comment='录入时间')
    updated_at = db.Column(db.DateTime, default=lambda: get_beijing_time(), onupdate=lambda: get_beijing_time(), comment='更新时间')
    updated_by = db.Column(db.String(50), comment='更新人')
    notes = db.Column(db.Text, comment='备注信息')

# 状态历史记录
class StatusHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    business_id = db.Column(db.Integer, db.ForeignKey('business.id'), nullable=False)
    field_name = db.Column(db.String(50), nullable=False, comment='变更字段')
    old_value = db.Column(db.String(200), comment='原值')
    new_value = db.Column(db.String(200), comment='新值')
    changed_at = db.Column(db.DateTime, default=lambda: get_beijing_time(), comment='变更时间')
    changed_by = db.Column(db.String(50), comment='变更人')
    notes = db.Column(db.Text, comment='变更备注')

# 用户模型
class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), default='user')  # 'admin' or 'user'
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=lambda: get_beijing_time())

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)


@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

def init_database():
    """初始化数据库，如果表不存在则创建，并预置管理员账户"""
    with app.app_context():
        # 仅确保表存在，不再强制删除
        db.create_all()

        # 管理员账户由 manage_users.py 创建，不在源代码中预置密码。
        if User.query.count() == 0:
            print('请先使用 manage_users.py add <username> <password> --role admin 创建管理员账户')

@app.route('/')
@login_required
def index():
    ctx = build_listing_context()
    # 补: 确保'已中标'键存在
    bid_status_dict = {status: count for status, count in ctx['bid_status_counts']}
    if '已中标' not in bid_status_dict:
        ctx['bid_status_counts'].append(('已中标', 0))
    return render_template('index.html', **ctx)

 

@app.route('/business/new', methods=['GET', 'POST'])
@login_required
def new_business():
    if request.method == 'POST':
        # 处理时间字段
        registration_time = None
        if request.form.get('registration_time'):
            try:
                registration_time = datetime.strptime(request.form['registration_time'], '%Y-%m-%d')
                registration_time = registration_time.replace(tzinfo=BEIJING_TZ)
            except:
                pass
        
        bid_time = None
        if request.form.get('bid_time'):
            try:
                bid_time = datetime.strptime(request.form['bid_time'], '%Y-%m-%d')
                bid_time = bid_time.replace(tzinfo=BEIJING_TZ)
            except:
                pass
        
        business = Business(
            name=request.form['name'],
            customer=request.form['customer'],
            bid_contact_name=request.form['bid_contact_name'],
            bid_contact_phone=request.form['bid_contact_phone'],
            customer_contact_name=request.form['customer_contact_name'],
            customer_contact_phone=request.form['customer_contact_phone'],
            service_content=request.form['service_content'],
            previous_suppliers=request.form.get('previous_suppliers', ''),
            bid_amount=float(request.form['bid_amount']) if request.form['bid_amount'] else 0.0,
            service_people=int(request.form['service_people']) if request.form['service_people'] else 0,
            document_url=request.form['document_url'],
            registration_time=registration_time,
            bid_time=bid_time,
            document_status=request.form['document_status'],
            bid_status=request.form['bid_status'],
            priority=request.form['priority'],
            payment_status=request.form['payment_status'],
            updated_by=current_user.username if current_user.is_authenticated else '系统',
            notes=request.form['notes']
        )
        
        db.session.add(business)
        db.session.commit()
        
        # 记录创建历史
        history = StatusHistory(
            business_id=business.id,
            field_name='创建',
            new_value='业务创建',
                changed_by=current_user.username if current_user.is_authenticated else '系统',
            notes=f"业务创建 - {business.name}"
        )
        db.session.add(history)
        db.session.commit()
        
        flash('业务信息添加成功！', 'success')
        return redirect(url_for('ui_business_detail', id=business.id))
    
    return render_template('business_form.html', business=None)

@app.route('/business/<int:id>')
@login_required
def view_business(id):
    business = Business.query.get_or_404(id)
    history = StatusHistory.query.filter_by(business_id=id).order_by(StatusHistory.changed_at.desc()).all()
    return render_template('business_detail.html', business=business, history=history)

# ========= 预览路由：仅保留 Figma Order =========

# 基于本地静态HTML的Figma预览（业务列表）
@app.route('/preview/figma/order')
@login_required
def preview_figma_order():
    # 加版本参数，避免浏览器缓存旧版静态文件
    return redirect(url_for('static', filename='figma/BDpage/order-management.html', v=int(get_beijing_time().timestamp())))


# 关闭其他预览：/preview/figma/busi 移除

# 新UI接入版：保留构建版视觉与交互，但接入后端数据，单选行 + 顶部工具栏
# 正式UI版（构建版）：统一入口 /ui/console
@app.route('/ui/console')
@login_required
def ui_console():
    return redirect(url_for('static', filename='figma/BDpage/order-management.html', v=int(get_beijing_time().timestamp())))

# 兼容旧地址，重定向到 /ui/console
@app.route('/ui/index-tailwind')
@login_required
def index_tailwind():
    return redirect(url_for('ui_console'))

# 独立直达：新版UI下的详情/编辑/新增入口（无需经首页）
@app.route('/ui/business/<int:id>')
@login_required
def ui_view_business(id: int):
    return redirect(url_for('view_business', id=id))

@app.route('/ui/business/<int:id>/edit')
@login_required
def ui_edit_business(id: int):
    business = Business.query.get_or_404(id)
    return render_template('ui_business_edit.html', business=business)

@app.route('/ui/business/new')
@login_required
def ui_new_business():
    return render_template('ui_business_new.html')

# 新版UI：业务详情直达模板（与列表页视觉一致）
@app.route('/ui/business/<int:id>/detail')
@login_required
def ui_business_detail(id: int):
    business = Business.query.get_or_404(id)
    history = StatusHistory.query.filter_by(business_id=id).order_by(StatusHistory.changed_at.desc()).all()
    return render_template('ui_business_detail.html', business=business, history=history)

# 仅供构建版接入数据使用的轻量API
@app.route('/api/listing')
@login_required
def api_listing():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)
    if per_page not in (10, 20, 50):
        per_page = 10
    search = request.args.get('search', '')
    bid_status_filter = request.args.get('bid_status', '')
    sort_by = request.args.get('sort', 'created_at')

    query = Business.query
    if search:
        query = query.filter(
            db.or_(
                Business.name.contains(search),
                Business.customer.contains(search),
                Business.bid_contact_name.contains(search),
                Business.bid_contact_phone.contains(search),
                Business.customer_contact_name.contains(search),
                Business.customer_contact_phone.contains(search),
                Business.service_content.contains(search),
                Business.document_status.contains(search),
                Business.bid_status.contains(search),
                Business.priority.contains(search),
                Business.payment_status.contains(search),
                Business.notes.contains(search),
            )
        )

    if bid_status_filter:
        if bid_status_filter == '已投标':
            query = query.filter(Business.bid_status.in_(['已投标', '未中标', '已中标']))
        else:
            query = query.filter(Business.bid_status == bid_status_filter)

    now = get_beijing_time()
    if sort_by == 'registration_time':
        query = query.order_by(
            db.case(
                (Business.registration_time.is_(None), 3),
                (func.date(Business.registration_time) < func.date(now), 2),
                (func.date(Business.registration_time) == func.date(now), 0),
                else_=1,
            ),
            Business.registration_time.asc(),
        )
    elif sort_by == 'bid_time':
        query = query.order_by(
            db.case(
                (Business.bid_time.is_(None), 3),
                (func.date(Business.bid_time) < func.date(now), 2),
                (func.date(Business.bid_time) == func.date(now), 0),
                else_=1,
            ),
            Business.bid_time.asc(),
        )
    else:
        query = query.order_by(Business.created_at.desc())

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    items = []
    for b in pagination.items:
        items.append(dict(
            id=b.id,
            name=b.name,
            service_people=b.service_people,
            bid_amount=b.bid_amount,
            registration_time=b.registration_time.isoformat() if b.registration_time else None,
            bid_time=b.bid_time.isoformat() if b.bid_time else None,
            document_status=b.document_status,
            bid_status=b.bid_status,
            priority=b.priority,
            created_at=b.created_at.isoformat() if b.created_at else None,
        ))

    return jsonify({
        'page': pagination.page,
        'per_page': pagination.per_page,
        'total': pagination.total,
        'items': items,
    })

@app.route('/api/business/<int:business_id>/status', methods=['POST'])
@login_required
def api_update_business_status(business_id: int):
    """更新业务的标书状态或投标状态，并记录历史。"""
    data = request.get_json(silent=True) or {}
    update_type = data.get('type')  # 'book' | 'bid'
    new_value = data.get('value')

    if update_type not in {'book', 'bid'} or not isinstance(new_value, str):
        return jsonify({'success': False, 'message': 'invalid params'}), 400

    biz = Business.query.get_or_404(business_id)
    field_name = None
    old_value = None
    if update_type == 'book':
        field_name = '标书状态'
        old_value = biz.document_status
        biz.document_status = new_value
    else:
        field_name = '投标状态'
        old_value = biz.bid_status
        biz.bid_status = new_value

    biz.updated_at = get_beijing_time()
    biz.updated_by = current_user.username if current_user.is_authenticated else '系统'
    db.session.add(biz)

    # 记录历史
    history = StatusHistory(
        business_id=biz.id,
        field_name=field_name,
        old_value=old_value,
        new_value=new_value,
        changed_at=get_beijing_time(),
        changed_by=biz.updated_by,
        notes=f"{field_name} 变更: {old_value} -> {new_value}"
    )
    db.session.add(history)
    db.session.commit()

    return jsonify({'success': True})


# 管理员快速导入测试数据（避免终端执行问题）
@app.route('/admin/seed/<int:n>', methods=['POST', 'GET'])
@login_required
def admin_seed(n: int):
    if not (hasattr(current_user, 'role') and current_user.role == 'admin'):
        return jsonify({'success': False, 'message': '无权限'}), 403
    names = [
        '天友乳业2025职工体检', '重庆建筑科技职业学院体检项目', '重庆传媒职业学院体检项目', '重庆工程职业技术学院体检项目',
        '重庆体育职业学院体检项目', '西南大学体检项目', '重庆医药高等专科学校体检项目', '重庆工业职业技术学院体检项目',
        '重庆邮电大学体检项目', '重庆商务职业学院体检项目'
    ]
    doc_status = ['已获取', '未获取']
    bid_status = ['未报名', '已报名', '未投标', '已投标', '未中标', '已中标']
    priority_opts = ['低', '中', '高']

    def rand_days(start_days_ago: int, end_days_ago: int = 0) -> datetime:
        now = get_beijing_time()
        delta = random.randint(end_days_ago, start_days_ago)
        return now - timedelta(days=delta)

    for i in range(n):
        b = Business(
            name=f"{random.choice(names)}-{i+1:03d}",
            customer='示例客户',
            bid_amount=round(random.uniform(50_000, 5_000_000), 2),
            service_people=random.randint(50, 2000),
            registration_time=rand_days(60, 10),
            bid_time=rand_days(30, 0),
            document_status=random.choice(doc_status),
            bid_status=random.choice(bid_status),
            priority=random.choice(priority_opts),
            created_at=rand_days(120, 30),
        )
        db.session.add(b)
    db.session.commit()
    return jsonify({'success': True, 'inserted': n})

@app.route('/business/<int:id>/edit', methods=['GET', 'POST'])
@login_required
def edit_business(id):
    business = Business.query.get_or_404(id)
    
    if request.method == 'POST':
        # 处理时间字段
        registration_time = None
        if request.form.get('registration_time'):
            try:
                registration_time = datetime.strptime(request.form['registration_time'], '%Y-%m-%d')
                registration_time = registration_time.replace(tzinfo=BEIJING_TZ)
            except:
                pass
        
        bid_time = None
        if request.form.get('bid_time'):
            try:
                bid_time = datetime.strptime(request.form['bid_time'], '%Y-%m-%d')
                bid_time = bid_time.replace(tzinfo=BEIJING_TZ)
            except:
                pass
        
        # 记录变更历史
        changes = []
        if business.name != request.form['name']:
            changes.append(('业务名称', business.name, request.form['name']))
        if business.customer != request.form['customer']:
            changes.append(('客户单位', business.customer, request.form['customer']))
        if business.bid_status != request.form['bid_status']:
            changes.append(('投标状态', business.bid_status, request.form['bid_status']))
        if business.document_status != request.form['document_status']:
            changes.append(('标书状态', business.document_status, request.form['document_status']))
        if business.priority != request.form['priority']:
            changes.append(('优先级', business.priority, request.form['priority']))
        
        # 更新业务信息
        business.name = request.form['name']
        business.customer = request.form['customer']
        business.bid_contact_name = request.form['bid_contact_name']
        business.bid_contact_phone = request.form['bid_contact_phone']
        business.customer_contact_name = request.form['customer_contact_name']
        business.customer_contact_phone = request.form['customer_contact_phone']
        business.service_content = request.form['service_content']
        business.previous_suppliers = request.form.get('previous_suppliers', '')
        business.bid_amount = float(request.form['bid_amount']) if request.form['bid_amount'] else 0.0
        business.service_people = int(request.form['service_people']) if request.form['service_people'] else 0
        business.document_url = request.form['document_url']
        business.registration_time = registration_time
        business.bid_time = bid_time
        business.document_status = request.form['document_status']
        business.bid_status = request.form['bid_status']
        business.priority = request.form['priority']
        business.payment_status = request.form['payment_status']
        business.updated_by = current_user.username if current_user.is_authenticated else '系统'
        business.notes = request.form['notes']
        business.updated_at = get_beijing_time()
        
        # 记录变更历史
        for field_name, old_value, new_value in changes:
            history = StatusHistory(
                business_id=business.id,
                field_name=field_name,
                old_value=old_value,
                new_value=new_value,
                changed_by=current_user.username if current_user.is_authenticated else '系统',
                notes=request.form.get('change_notes', f'{field_name}从 {old_value} 更改为 {new_value}')
            )
            db.session.add(history)
        
        db.session.commit()
        flash('业务信息更新成功！', 'success')
        return redirect(url_for('ui_business_detail', id=business.id))
    
    return render_template('business_form.html', business=business)

@app.route('/business/<int:id>/delete', methods=['POST'])
@login_required
def delete_business(id):
    # 仅管理员可删除
    if not (hasattr(current_user, 'role') and current_user.role == 'admin'):
        return jsonify({'success': False, 'message': '无删除权限'}), 403
    business = Business.query.get_or_404(id)
    db.session.delete(business)
    db.session.commit()
    flash('业务信息已删除！', 'success')
    return redirect(url_for('index'))

@app.route('/api/export_data')
@login_required
def export_data():
    """导出选中的业务；未提供选中 ID 时导出全部业务。"""
    try:
        # 仅管理员可导出
        if not (hasattr(current_user, 'role') and current_user.role == 'admin'):
            flash('无权限导出PDF', 'error')
            return redirect(url_for('index'))
        # 导出范围独立于列表搜索和状态筛选。
        search = ''
        sort_by = request.args.get('sort', 'created_at')
        bid_status_filter = ''
        page = request.args.get('page', 1, type=int)
        per_page = 10  # 与页面分页保持一致
        exporter = current_user.username if current_user.is_authenticated else '系统'
        
        # 构建查询
        query = Business.query
        if 'ids' in request.args:
            try:
                selected_ids = {int(value) for value in request.args['ids'].split(',')}
                if not selected_ids or any(value <= 0 for value in selected_ids):
                    raise ValueError
            except ValueError:
                return jsonify({'success': False, 'message': '无效的业务 ID'}), 400
            query = query.filter(Business.id.in_(selected_ids))
        
        # 搜索筛选 - 与index页面保持一致
        if search:
            query = query.filter(
                db.or_(
                    Business.name.contains(search),
                    Business.customer.contains(search),
                    Business.bid_contact_name.contains(search),
                    Business.bid_contact_phone.contains(search),
                    Business.customer_contact_name.contains(search),
                    Business.customer_contact_phone.contains(search),
                    Business.service_content.contains(search),
                    Business.document_status.contains(search),
                    Business.bid_status.contains(search),
                    Business.priority.contains(search),
                    Business.payment_status.contains(search),
                    Business.notes.contains(search)
                )
            )
        
        # 投标状态筛选 - 与index页面保持一致
        if bid_status_filter:
            if bid_status_filter == '已投标':
                # 已投标筛选包含已投标、未中标和已中标
                query = query.filter(Business.bid_status.in_(['已投标', '未中标', '已中标']))
            else:
                query = query.filter(Business.bid_status == bid_status_filter)
        
        # 排序逻辑（与index页面保持一致）
        now = get_beijing_time()
        if sort_by == 'registration_time':
            query = query.order_by(
                db.case(
                    (Business.registration_time.is_(None), 3),
                    (func.date(Business.registration_time) < func.date(now), 2),
                    (func.date(Business.registration_time) == func.date(now), 0),
                    else_=1
                ),
                Business.registration_time.asc()
            )
        elif sort_by == 'bid_time':
            query = query.order_by(
                db.case(
                    (Business.bid_time.is_(None), 3),
                    (func.date(Business.bid_time) < func.date(now), 2),
                    (func.date(Business.bid_time) == func.date(now), 0),
                    else_=1
                ),
                Business.bid_time.asc()
            )
        else:
            query = query.order_by(Business.created_at.desc())
        
        # 获取筛选后的所有业务数据（不分页）
        businesses = query.all()
        
        if not businesses:
            flash('没有数据可导出', 'warning')
            return redirect(url_for('index'))
        
        # 生成HTML内容，传递筛选参数以保持格式一致
        html_content = generate_pdf_html(
            businesses=businesses,
            search=search,
            sort_by=sort_by,
            bid_status_filter=bid_status_filter,
            exporter=exporter
        )
        
        # 使用Node.js服务生成PDF
        pdf_buffer = generate_pdf_with_nodejs(html_content)
        
        if not pdf_buffer:
            flash('PDF服务不可用，请确保Node.js PDF服务正在运行', 'error')
            return redirect(url_for('index'))
        
        # 创建临时文件
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp_file:
            tmp_file.write(pdf_buffer)
            pdf_file = tmp_file.name
        
        # 返回PDF文件
        filename = f'业务列表_{datetime.now().strftime("%Y%m%d_%H%M%S")}.pdf'
        return send_file(
            pdf_file,
            as_attachment=True,
            download_name=filename,
            mimetype='application/pdf'
        )
        
    except Exception as e:
        flash(f'导出PDF时出错: {str(e)}', 'error')
        return redirect(url_for('index'))

def generate_pdf_html(businesses, search='', sort_by='created_at', bid_status_filter='', exporter='系统'):
    """生成PDF的HTML内容，严格按照页面业务列表样式"""
    
    # 动态生成标题
    title_parts = ['六院体检业务管理系统']
    if bid_status_filter:
        title_parts.append(bid_status_filter)
    elif search:
        title_parts.append(f'搜索结果: "{search}"')
    else:
        title_parts.append('业务列表')
    
    pdf_title = ' - '.join(title_parts)
    
    html = '''
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>''' + pdf_title + '''</title>
        <style>
            @page {
                size: A4;
                margin: 20mm 15mm;
            }
            @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap');
            html, body {
                font-family: 'Noto Sans SC', 'Microsoft YaHei', 'SimSun', Arial, sans-serif;
                margin: 0;
                padding: 0;
                font-size: 12px;
                line-height: 1.4;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
                box-sizing: border-box;
                width: 100%;
                height: auto; /* 避免尾页空白 */
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
                border-bottom: 2px solid #333;
                padding-bottom: 10px;
            }
            .header h1 {
                color: #333;
                margin-bottom: 10px;
                font-size: 20px;
                font-weight: bold;
            }
            .header p {
                color: #666;
                margin: 5px 0;
                font-size: 11px;
            }
            .pdf-table-wrapper {
                width: 100%;
                margin: 0;
                padding: 0;
            }
            .pdf-table-wrapper table {
                width: 80%;
                min-width: 0;
                margin: 0 auto;
                border-collapse: collapse;
                background-color: white;
                font-size: 12px;
                page-break-inside: auto;
            }
            thead {
                display: table-header-group;
            }
            tr {
                page-break-inside: avoid;
                page-break-after: auto;
                border-bottom: 1px solid #dee2e6;
            }
            tr:hover {
                background-color: #f8f9fa;
            }
            th, td {
                border: none;
                border-bottom: 1px solid #dee2e6;
                padding: 12px 8px;
                text-align: left;
                vertical-align: middle;
                white-space: nowrap;
                box-sizing: border-box;
            }
            th {
                background-color: #f8f9fa;
                font-weight: 600;
                color: #495057;
                font-size: 12px;
                border-bottom: 2px solid #dee2e6;
            }
            .amount {
                text-align: right;
                font-weight: bold;
            }
            .center {
                text-align: center;
            }
            .right {
                text-align: right;
            }
            .status-badge {
                padding: 3px 6px;
                border-radius: 3px;
                font-size: 9px;
                font-weight: bold;
                display: inline-block;
                min-width: 40px;
            }
            .status-未报名 { background-color: #6c757d; color: white; }
            .status-未投标 { background-color: #6c757d; color: white; }
            .status-未中标 { background-color: #6c757d; color: white; }
            .status-已报名 { background-color: #17a2b8; color: white; }
            .status-已投标 { background-color: #007bff; color: white; }
            .status-已中标 { background-color: #28a745; color: white; }
            .status-未获取 { background-color: #6c757d; color: white; }
            .status-已获取 { background-color: #28a745; color: white; }
            .status-已下载 { background-color: #17a2b8; color: white; }
            .priority-低 {
                display: inline-block;
                width: 38px;
                text-align: center;
                padding: 3px 0;
                min-width: unset;
                box-sizing: border-box;
                background-color: #6c757d;
                color: white;
            }
            .priority-中 {
                display: inline-block;
                width: 38px;
                text-align: center;
                padding: 3px 0;
                min-width: unset;
                box-sizing: border-box;
                background-color: #ffc107;
                color: black;
            }
            .priority-高 {
                display: inline-block;
                width: 38px;
                text-align: center;
                padding: 3px 0;
                min-width: unset;
                box-sizing: border-box;
                background-color: #dc3545;
                color: white;
            }
            .footer {
                margin-top: 30px;
                padding-top: 10px;
                border-top: 1px solid #ddd;
                font-size: 10px;
                color: #666;
                text-align: center;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>''' + pdf_title + '''</h1>
            <p>导出时间: ''' + datetime.now().strftime('%Y年%m月%d日 %H:%M:%S') + '''</p>
            <p>总记录数: ''' + str(len(businesses)) + ''' 条 | 导出人: ''' + exporter + '''</p>
        </div>
        
        <div class="pdf-table-wrapper">
        <table>
            <thead>
                <tr>
                    <th>业务名称</th>
                    <th>服务人数</th>
                    <th class="amount">招标金额</th>
                    <th>报名时间</th>
                    <th>投标时间</th>
                    <th>标书状态</th>
                    <th>投标状态</th>
                    <th>优先级</th>
                    <th>录入时间</th>
                </tr>
            </thead>
            <tbody>
    '''

    for business in businesses:
            # 格式化金额 - 保留两位小数
            amount = f"¥{business.bid_amount:,.2f}" if business.bid_amount and business.bid_amount > 0 else "-"

            # 格式化时间
            registration_time = business.registration_time.strftime('%m-%d') if business.registration_time else '-'
            bid_time = business.bid_time.strftime('%m-%d') if business.bid_time else '-'
            created_at = business.created_at.strftime('%m-%d') if business.created_at else '-'

            # 截断长文本 - 与页面保持一致
            business_name = business.name
            if len(business_name) > 20:
                business_name = business_name[:20] + '<br>' + business_name[20:]

            # 服务人数格式 - 与页面保持一致
            service_people = f"{business.service_people}人" if business.service_people else "-"

            html += f'''
                    <tr>
                        <td><strong>{business_name}</strong></td>
                        <td class="right">{service_people}</td>
                        <td class="amount">{amount}</td>
                        <td class="center">{registration_time}</td>
                        <td class="center">{bid_time}</td>
                        <td class="center"><span class="status-badge status-{business.document_status}">{business.document_status}</span></td>
                        <td class="center"><span class="status-badge status-{business.bid_status}">{business.bid_status}</span></td>
                        <td class="center"><span class="status-badge priority-{business.priority}">{business.priority}</span></td>
                        <td class="center">{created_at}</td>
                    </tr>
            '''
    
    # 添加统计信息
    total_amount = sum(b.bid_amount or 0 for b in businesses)
    html += f'''
            </tbody>
        </table>
        </div>
        
        <div class="footer">
            <p>总金额: ¥{total_amount:,.2f} | 生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
        </div>
    </body>
    </html>
    '''
    
    return html

def generate_pdf_with_nodejs(html_content):
    """使用Node.js + Puppeteer生成PDF"""
    try:
        # 准备请求数据
        data = {
            'htmlContent': html_content,
            'filename': f'business-list-{datetime.now().strftime("%Y%m%d_%H%M%S")}.pdf'
        }
        
        # 发送请求到Node.js服务
        response = requests.post(PDF_SERVICE_URL, json=data, timeout=60)
        
        if response.status_code == 200:
            print("PDF generated successfully with Node.js service")
            return response.content
        else:
            print(f"Node.js service error: {response.status_code} - {response.text}")
            return None
            
    except requests.exceptions.RequestException as e:
        print(f"Failed to connect to Node.js PDF service: {e}")
        return None
    except Exception as e:
        print(f"PDF generation error: {e}")
        return None



@app.route('/api/update_status', methods=['POST'])
@login_required
def update_status():
    data = request.get_json()
    business_id = data.get('business_id')
    field_name = data.get('field_name')
    new_value = data.get('new_value')
    notes = data.get('notes', '')
    
    business = Business.query.get_or_404(business_id)
    old_value = getattr(business, field_name, '')
    setattr(business, field_name, new_value)
    business.updated_at = get_beijing_time()
    business.updated_by = current_user.username if current_user.is_authenticated else '系统'
    
    # 记录状态变化
    history = StatusHistory(
        business_id=business.id,
        field_name=field_name,
        old_value=str(old_value),
        new_value=str(new_value),
        changed_by=current_user.username if current_user.is_authenticated else '系统',
        notes=notes or f'{field_name}从 {old_value} 更改为 {new_value}'
    )
    db.session.add(history)
    db.session.commit()
    
    # 返回更新后的统计数据
    total_businesses = Business.query.count()
    total_won_amount = db.session.query(db.func.sum(Business.bid_amount)).filter(
        Business.bid_status == '已中标'
    ).scalar() or 0
    bid_status_counts = db.session.query(
        Business.bid_status, db.func.count(Business.id)
    ).group_by(Business.bid_status).all()
    # 保证'已中标'一定有值
    bid_status_dict = {status: count for status, count in bid_status_counts}
    if '已中标' not in bid_status_dict:
        bid_status_counts.append(('已中标', 0))
    
    # 计算已投标数量（包含已投标、未中标和已中标）
    bid_count = db.session.query(db.func.count(Business.id)).filter(
        Business.bid_status.in_(['已投标', '未中标', '已中标'])
    ).scalar() or 0
    
    # 找到已中标的数量
    won_count = 0
    for status, count in bid_status_counts:
        if status == '已中标':
            won_count = count
            break
    
    return jsonify({
        'success': True, 
        'message': '状态更新成功',
        'stats': {
            'total_businesses': total_businesses,
            'won_count': won_count,
            'total_won_amount': total_won_amount,
            'bid_count': bid_count
        }
    })

@app.route('/dashboard')
@login_required
def dashboard():
    # 仅管理员可访问
    if not (hasattr(current_user, 'role') and current_user.role == 'admin'):
        flash('无权限访问该页面', 'error')
        return redirect(url_for('index'))
    # 基础统计数据
    total_businesses = Business.query.count()
    total_amount = db.session.query(db.func.sum(Business.bid_amount)).scalar() or 0
    
    # 投标状态统计
    bid_status_stats = db.session.query(
        Business.bid_status, db.func.count(Business.id)
    ).group_by(Business.bid_status).all()
    
    # 标书状态统计
    document_status_stats = db.session.query(
        Business.document_status, db.func.count(Business.id)
    ).group_by(Business.document_status).all()
    
    # 优先级统计
    priority_stats = db.session.query(
        Business.priority, db.func.count(Business.id)
    ).group_by(Business.priority).all()
    
    # 收款情况统计
    payment_status_stats = db.session.query(
        Business.payment_status, db.func.count(Business.id)
    ).filter(Business.payment_status.isnot(None)).group_by(Business.payment_status).all()
    
    # 客户单位统计（前10名）
    customer_stats = db.session.query(
        Business.customer, db.func.count(Business.id)
    ).group_by(Business.customer).order_by(db.func.count(Business.id).desc()).limit(10).all()
    
    # 金额统计
    won_amount = db.session.query(db.func.sum(Business.bid_amount)).filter(
        Business.bid_status == '已中标'
    ).scalar() or 0
    
    bid_amount = db.session.query(db.func.sum(Business.bid_amount)).filter(
        Business.bid_status.in_(['已投标', '未中标', '已中标'])
    ).scalar() or 0
    
    # 服务人数统计
    total_service_people = db.session.query(db.func.sum(Business.service_people)).scalar() or 0
    avg_service_people = db.session.query(db.func.avg(Business.service_people)).scalar() or 0
    
    # 时间统计
    now = get_beijing_time()
    this_month_businesses = db.session.query(db.func.count(Business.id)).filter(
        db.func.strftime('%Y-%m', Business.created_at) == now.strftime('%Y-%m')
    ).scalar() or 0
    
    # 即将到期的业务（7天内）
    upcoming_deadlines = Business.query.filter(
        Business.bid_time.isnot(None),
        Business.bid_time >= now,
        Business.bid_time <= now + timedelta(days=7)
    ).order_by(Business.bid_time).limit(5).all()
    
    # 最近业务
    recent_businesses = Business.query.order_by(Business.updated_at.desc()).limit(5).all()
    
    # 月度统计（最近6个月）
    monthly_stats = db.session.query(
        db.func.strftime('%Y-%m', Business.created_at),
        db.func.count(Business.id)
    ).filter(
        Business.created_at >= now - timedelta(days=180)
    ).group_by(db.func.strftime('%Y-%m', Business.created_at)).order_by(
        db.func.strftime('%Y-%m', Business.created_at)
    ).all()
    
    # 状态变更统计（最近30天）
    recent_changes = db.session.query(
        StatusHistory.field_name,
        db.func.count(StatusHistory.id)
    ).filter(
        StatusHistory.changed_at >= now - timedelta(days=30)
    ).group_by(StatusHistory.field_name).all()
    
    # 更新人统计
    updater_stats = db.session.query(
        Business.updated_by,
        db.func.count(Business.id)
    ).filter(Business.updated_by.isnot(None)).group_by(Business.updated_by).order_by(
        db.func.count(Business.id).desc()
    ).limit(5).all()
    
    return render_template('dashboard.html',
                         total_businesses=total_businesses,
                         total_amount=total_amount,
                         won_amount=won_amount,
                         bid_amount=bid_amount,
                         total_service_people=total_service_people,
                         avg_service_people=avg_service_people,
                         this_month_businesses=this_month_businesses,
                         bid_status_stats=bid_status_stats,
                         document_status_stats=document_status_stats,
                         priority_stats=priority_stats,
                         payment_status_stats=payment_status_stats,
                         customer_stats=customer_stats,
                         recent_businesses=recent_businesses,
                         upcoming_deadlines=upcoming_deadlines,
                         monthly_stats=monthly_stats,
                         recent_changes=recent_changes,
                         updater_stats=updater_stats)

# 新UI风格登录页面
@app.route('/ui/login', methods=['GET', 'POST'])
def ui_login():
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        
        # 处理头像上传
        avatar_file = request.files.get('avatar')
        if avatar_file and avatar_file.filename:
            # 保存头像文件到static/uploads/avatars目录
            import os
            from werkzeug.utils import secure_filename
            
            # 确保上传目录存在
            upload_dir = os.path.join(app.static_folder, 'uploads', 'avatars')
            os.makedirs(upload_dir, exist_ok=True)
            
            # 生成安全的文件名
            filename = secure_filename(f"{username}_{int(time.time())}.jpg")
            avatar_path = os.path.join(upload_dir, filename)
            
            # 保存文件
            avatar_file.save(avatar_path)
            
            # 将头像路径存储到session中（临时方案）
            session['user_avatar'] = f'/static/uploads/avatars/{filename}'
        
        user = User.query.filter_by(username=username).first()
        if not user or not user.check_password(password):
            flash('用户名或密码错误', 'error')
            return render_template('ui_login.html')
        if not user.is_active:
            flash('账号已被禁用，请联系管理员', 'error')
            return render_template('ui_login.html')
        
        login_user(user)
        
        # 获取next参数，登录成功后跳转回原页面
        next_page = request.args.get('next')
        if not next_page or url_parse(next_page).netloc != '':
            next_page = url_for('ui_console')  # 默认跳转到新UI
        return redirect(next_page)
    
    return render_template('ui_login.html')

# 获取用户头像的API
@app.route('/api/user/avatar')
@login_required
def get_user_avatar():
    avatar_path = session.get('user_avatar', '/static/uploads/avatars/default.jpg')
    return jsonify({'avatar_url': avatar_path})

if __name__ == '__main__':
    # 初始化数据库（只创建表与管理员）
    init_database()
    app.run(debug=True, host='0.0.0.0', port=5000) 
