// Generates an idempotent, additive fixture for the local D1 database only.
import { writeFile } from 'node:fs/promises';
const counts=[4,9,2,7,1,8,3,6,2,4,2,2];
const first=Date.parse('2026-07-20T10:00:00Z');
const cutoff=Date.parse('2026-10-08T00:00:00Z');
const day=86400000;
const stamp=value=>new Date(value).toISOString().slice(0,19);
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const statements=[];let index=0;
const testBatch='chart-demo-20261008';
for(let week=0;week<counts.length;week++) {
 for(let row=0;row<counts[week];row++) {
  index++;
  const name=`曲线演示20261008-${String(index).padStart(3,'0')}`;
  const created=first+week*7*day+(row%4)*day;
  const registration=created+day,bid=created+2*day,completed=created+3*day;
  let status=['未报名','已投标','未中标','已中标','已中标'][index%5];
  if(completed>cutoff)status=registration>cutoff?'未报名':bid>cutoff?'已报名':'未投标';
  const updated=status==='未报名'?created:Math.min(completed,cutoff-3600000);
  const amount=150000+week*42000+(index%7)*67500;
  const values=[name,`演示单位${String(index).padStart(2,'0')}`,amount,120+(index*47)%1800,stamp(registration),stamp(bid),status==='未报名'?'未获取':'已获取',status,['低','中','高'][index%3],stamp(created),stamp(updated),'演示数据',`仅用于统计曲线测试；第${week+1}周演示项目；可按业务名称“曲线演示”筛选。`,testBatch];
  const sqlValues=values.map(value=>typeof value==='number'?String(value):quote(value)).join(',');
  statements.push(`INSERT INTO business(name,customer,bid_amount,service_people,registration_time,bid_time,document_status,bid_status,priority,created_at,updated_at,updated_by,notes,test_batch_id) SELECT ${sqlValues} WHERE NOT EXISTS (SELECT 1 FROM business WHERE name=${quote(name)});`);
 }
}
if(index!==50)throw new Error('Fixture count must be 50');
await writeFile(new URL('seed-chart.private.sql',import.meta.url),statements.join('\n')+'\n');
console.log('Generated 50 additive, idempotent chart-demo INSERT statements. No database has been modified yet.');
