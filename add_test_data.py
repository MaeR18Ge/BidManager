import random
from datetime import datetime, timedelta

from app import app, db, Business, get_beijing_time


def rand_date(start_days_ago: int = 90, end_days_ago: int = 0):
    now = get_beijing_time()
    delta = random.randint(end_days_ago, start_days_ago)
    return now - timedelta(days=delta)


def main(n: int = 100):
    with app.app_context():
        names = [
            '天友乳业2025职工体检', '重庆建筑科技职业学院体检项目', '重庆传媒职业学院体检项目', '重庆工程职业技术学院体检项目',
            '重庆体育职业学院体检项目', '西南大学体检项目', '重庆医药高等专科学校体检项目', '重庆工业职业技术学院体检项目',
            '重庆邮电大学体检项目', '重庆商务职业学院体检项目'
        ]
        doc_status = ['已获取', '未获取']
        bid_status = ['未报名', '已报名', '未投标', '已投标', '未中标', '已中标']
        priority_opts = ['低', '中', '高']

        for i in range(n):
            name = f"{random.choice(names)}-{i+1:03d}"
            b = Business(
                name=name,
                customer='示例客户',
                bid_amount=round(random.uniform(50_000, 5_000_000), 2),
                service_people=random.randint(50, 2000),
                registration_time=rand_date(60, 10),
                bid_time=rand_date(30, 0),
                document_status=random.choice(doc_status),
                bid_status=random.choice(bid_status),
                priority=random.choice(priority_opts),
                created_at=rand_date(120, 30),
            )
            db.session.add(b)
        db.session.commit()
        print(f"Inserted {n} businesses")


if __name__ == '__main__':
    import sys
    n = 100
    if len(sys.argv) > 1:
        try:
            n = int(sys.argv[1])
        except Exception:
            pass
    main(n)

