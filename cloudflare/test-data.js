// Cohorts fluctuate while growing overall across 12 Beijing calendar weeks. Results land in the next week,
// so the current week's completed bids never require future registration or bid dates.
export const weeklyTestCounts=[2,6,3,10,5,16,8,24,12,32,34,48];
const bidShares=[.5,.75,.67,.8,.6,.8,.63,.83,.58,.69,.88,0];
export function generateTestBusinesses(now=new Date()) {
 const day=86400000,week=7*day,clock=now.getTime()+8*3600000;
 const today=new Date(clock);today.setUTCHours(0,0,0,0);
 const monday=+today-((today.getUTCDay()+6)%7)*day,first=monday-11*week;
 const date=value=>new Date(value).toISOString().slice(0,10);
 const stamp=value=>new Date(Math.min(value,clock)).toISOString().slice(0,19);
 const customers=['重庆大学','西南大学','重庆医科大学','重庆邮电大学','重庆师范大学','重庆交通大学','重庆理工大学','重庆工商大学'];
 const rows=[];
 for(const [index,count] of weeklyTestCounts.entries()) {
  const current=index===11,closedCount=Math.floor(count*bidShares[index]),wonCount=Math.floor(closedCount/2);
  for(let slot=0;slot<count;slot++) {
   const created=first+index*week+(slot%2)*day+9*3600000;
   const signup=current?+today+(1+slot%3)*day:created+day;
   const bid=signup+(2+slot%3)*day;
   // Earlier cohorts include overdue unsubmitted bids; current-week deadlines are still upcoming.
   const bidStatus=slot<wonCount?'已中标':slot<closedCount?(slot%2?'已投标':'未中标'):current?['未报名','未报名','已报名'][slot%3]:'未投标';
   const people=280+index*60+slot*13,unitPrice=360+index*15+(slot%4)*30;
   const customer=customers[rows.length%customers.length];
   rows.push({
    name:`测试·${customer}体检投标项目-${String(rows.length+1).padStart(3,'0')}`,customer,
    bid_contact_name:'测试投标联系人',bid_contact_phone:'',customer_contact_name:'测试客户联系人',customer_contact_phone:'',
    service_content:'测试数据：职工健康体检、常规检查及健康报告',bid_amount:people*unitPrice,service_people:people,
    document_url:'',previous_suppliers:'测试体检服务商',registration_time:date(signup),bid_time:date(bid),
    document_status:current&&slot%3===0?'未获取':'已获取',bid_status:bidStatus,priority:['低','中','高'][slot%3],
    payment_status:bidStatus==='已中标'?'未收款':'',
    notes:'由admin页面导入的近12周波动上升测试业务，修改后仍可一键清除。',
    created_at:stamp(created),updated_at:stamp(current?clock:first+(index+1)*week+9*3600000)
   });
  }
 }
 return rows;
}
