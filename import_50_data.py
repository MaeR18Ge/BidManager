from app import app, db, Business, get_beijing_time
from datetime import datetime, timedelta
import random
# 不再导入BEIJING_TZ

def import_50_data():
    """导入50条测试业务数据"""
    with app.app_context():
        existing_count = Business.query.count()
        print(f"当前数据库中有 {existing_count} 条记录")
        need_to_add = 50
        print(f"需要添加 {need_to_add} 条测试数据")

        # 学校/单位名称
        base_customers = [
            "重庆大学", "西南大学", "重庆医科大学", "重庆市第一人民医院",
            "重庆理工大学", "重庆师范大学", "重庆邮电大学", "重庆交通大学",
            "重庆工商大学", "重庆科技学院", "重庆文理学院", "重庆三峡学院",
            "重庆第二师范学院", "重庆幼儿师范高等专科学校", "重庆医药高等专科学校",
            "重庆城市管理职业学院", "重庆工程职业技术学院", "重庆电子工程职业学院",
            "重庆工业职业技术学院", "重庆三峡医药高等专科学校", "重庆电力高等专科学校",
            "重庆水利电力职业技术学院", "重庆航天职业技术学院", "重庆机电职业技术学院",
            "重庆工贸职业技术学院", "重庆财经职业学院", "重庆商务职业学院",
            "重庆旅游职业学院", "重庆艺术职业学院", "重庆传媒职业学院",
            "重庆青年职业技术学院", "重庆城市职业学院", "重庆化工职业学院",
            "重庆轻工职业学院", "重庆建筑科技职业学院", "重庆交通职业学院",
            "重庆能源职业学院", "重庆安全技术职业学院", "重庆公共运输职业学院",
            "重庆文化艺术职业学院", "重庆体育职业学院", "重庆幼儿师范高等专科学校",
            "重庆医药高等专科学校", "重庆城市管理职业学院", "重庆工程职业技术学院",
            "重庆电子工程职业学院", "重庆工业职业技术学院", "重庆三峡医药高等专科学校",
            "重庆电力高等专科学校", "重庆水利电力职业技术学院", "重庆航天职业技术学院"
        ]

        business_names = [f"{c}体检项目" for c in base_customers]
        service_contents = ["体检服务"] * need_to_add

        print(f"已准备 {len(business_names)} 条业务名称")
        print(f"已准备 {len(base_customers)} 条客户信息")
        print(f"已准备 {len(service_contents)} 条服务内容")

        document_statuses = ['未获取', '已获取']
        bid_statuses = ['未报名', '已报名', '未投标', '已投标', '未中标', '已中标']
        priorities = ['低', '中', '高']
        payment_statuses = ['未收款', '部分收款', '已收款', '延期收款']

        # 时间区间
        reg_start = datetime(2025, 7, 25)
        reg_end = datetime(2025, 8, 20)
        create_start = datetime(2025, 7, 7)
        create_end = datetime(2025, 8, 7)

        added_count = 0
        for i in range(need_to_add):
            try:
                bid_amount = random.uniform(80000, 1100000)
                service_people = random.randint(100, 1500)

                # 报名时间和投标时间，确保报名时间早于投标时间
                reg_days = (reg_end - reg_start).days
                reg_offset = random.randint(0, reg_days - 1)
                registration_time = reg_start + timedelta(days=reg_offset)
                bid_offset = random.randint(reg_offset + 1, reg_days)
                bid_time = reg_start + timedelta(days=bid_offset)

                # created_at和updated_at在7月7日-8月7日
                create_days = (create_end - create_start).days
                created_at = create_start + timedelta(days=random.randint(0, create_days))
                updated_at = created_at + timedelta(days=random.randint(0, max(0, (create_end - created_at).days)))

                business = Business(
                    name=business_names[i],
                    customer=base_customers[i % len(base_customers)],
                    bid_contact_name=f"投标联系人{i+1}",
                    bid_contact_phone=f"138{random.randint(10000000, 99999999)}",
                    customer_contact_name=f"客户联系人{i+1}",
                    customer_contact_phone=f"139{random.randint(10000000, 99999999)}",
                    service_content=service_contents[i],
                    bid_amount=bid_amount,
                    service_people=service_people,
                    document_url=f"https://example.com/bid/{i+1}",
                    registration_time=registration_time,
                    bid_time=bid_time,
                    document_status=random.choice(document_statuses),
                    bid_status=random.choice(bid_statuses),
                    priority=random.choice(priorities),
                    payment_status=random.choice(payment_statuses),
                    notes=f"测试数据备注{i+1} - 这是一个模拟的体检业务项目",
                    created_at=created_at,
                    updated_at=updated_at
                )
                db.session.add(business)
                added_count += 1
                if added_count % 10 == 0:
                    print(f"已添加 {added_count} 条数据...")
            except Exception as e:
                print(f"添加第 {i+1} 条数据时出错: {e}")
                continue
        db.session.commit()
        print(f"✅ 成功添加了 {added_count} 条测试业务信息")
        print(f"📊 现在数据库中共有 {Business.query.count()} 条记录")
        print("🎉 数据导入完成！")

if __name__ == '__main__':
    import_50_data() 