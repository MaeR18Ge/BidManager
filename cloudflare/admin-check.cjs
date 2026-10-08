// Run against a fresh, isolated Wrangler database on port 8788. Never uses the main local database.
const puppeteer=require('puppeteer');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base='http://127.0.0.1:8788',password='Ab3!xy';
(async()=>{
 const browser=await puppeteer.launch({headless:'new',protocolTimeout:30000,executablePath:process.env.TEST_CHROME||puppeteer.executablePath()});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewport({width:1440,height:1000});await page.goto(base+'/admin');
  assert.ok(await page.$('#setupForm'),'Use a fresh isolated database before running this check');
  await page.$eval('#setupPassword',el=>{el.value='abcde';});
  assert.equal(await page.$eval('#setupPassword',el=>el.minLength),6);
  // Check both native constraints and the browser's credential validation without writing an account.
  const rejected=await page.evaluate(async()=>{try{await credential('abcde','abcde');return false;}catch(error){return error.message.includes('6至200');}});assert.equal(rejected,true);
  for(const [id,value] of [['setupUsername','admin'],['setupPassword',password],['setupConfirm',password]]){await page.$eval('#'+id,el=>el.value='');await page.type('#'+id,value);}
  await page.click('summary');for(const [id,value] of [['ordinaryUsername','member'],['ordinaryPassword',password],['ordinaryConfirm',password]])await page.type('#'+id,value);
  await Promise.all([page.waitForNavigation(),page.click('#setupForm button[type=submit]')]);
  await page.waitForFunction(()=>document.querySelectorAll('#adminUsers tr').length===2);
  assert.equal(await page.$eval('#accountCancel',el=>getComputedStyle(el).display),'none');
  // Settings initialization does not log the business page in. Authenticate that page independently.
  const businessAdminPage=await browser.newPage();await businessAdminPage.goto(base+'/ui/login');
  const previewName=async value=>{await businessAdminPage.$eval('[name=username]',(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},value);};
  await previewName('  maer');assert.equal(await businessAdminPage.$eval('#avatarPreview',el=>el.textContent),'M');
  await previewName('小马测试');assert.equal(await businessAdminPage.$eval('#avatarPreview',el=>el.textContent),'小');
  await previewName('');assert.ok(await businessAdminPage.$('#avatarPreview svg'));
  const avatarDir=path.join(__dirname,'test-artifacts');fs.mkdirSync(avatarDir,{recursive:true});
  const avatarFile=path.join(avatarDir,'avatar-fixture.png');fs.writeFileSync(avatarFile,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64'));
  await (await businessAdminPage.$('#avatarInput')).uploadFile(avatarFile);await businessAdminPage.waitForSelector('#avatarPreview img');
  await previewName('admin');assert.ok(await businessAdminPage.$('#avatarPreview img'),'Uploaded image takes precedence over initials');
  await businessAdminPage.$eval('#avatarInput',el=>{el.value='';el.dispatchEvent(new Event('change',{bubbles:true}));});
  await businessAdminPage.waitForFunction(()=>document.querySelector('#avatarPreview')?.textContent==='A');await previewName('');
  await businessAdminPage.type('[name=username]','admin');await businessAdminPage.type('[name=password]',password);
  await Promise.all([businessAdminPage.waitForNavigation(),businessAdminPage.click('.login-button')]);
  await businessAdminPage.waitForFunction(()=>document.querySelector('#btnExport')?.disabled===false);
  assert.match(decodeURIComponent(await businessAdminPage.$eval('#userAvatar',el=>el.src)),/>A<\/text>/);await businessAdminPage.close();
  const api=async(url,body)=>page.evaluate(async(url,body)=>{const response=await fetch(url,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};},url,body);
  const buttonAppearance=async p=>p.evaluate(()=>['btnDelete','btnExport'].map(id=>{const el=document.getElementById(id),style=getComputedStyle(el);return {className:el.className,opacity:style.opacity,background:style.backgroundColor,border:style.borderColor,color:style.color,width:style.width,height:style.height};}));
  for(const [id,value] of [['accountUsername','temporary'],['accountPassword',password],['accountConfirm',password]])await page.type('#'+id,value);
  await page.click('#accountSave');await page.waitForFunction(()=>document.querySelectorAll('#adminUsers tr').length===3);
  let accounts=(await api('/admin/users')).body.users;const temporary=accounts.find(user=>user.username==='temporary');
  await page.click(`#adminUsers tr[data-id="${temporary.id}"] button`);await page.select('#accountState','0');await page.click('#accountSave');
  await page.waitForFunction(id=>document.querySelector(`#adminUsers tr[data-id="${id}"]`).textContent.includes('停用'),{},temporary.id);
  await page.click(`#adminUsers tr[data-id="${temporary.id}"] button`);await page.select('#accountState','1');
  await page.type('#accountPassword','R4!xyz');await page.type('#accountConfirm','R4!xyz');await page.click('#accountSave');
  await page.waitForFunction(id=>document.querySelector(`#adminUsers tr[data-id="${id}"]`).textContent.includes('启用'),{},temporary.id);
  const resetContext=await browser.createIncognitoBrowserContext(),resetPage=await resetContext.newPage();await resetPage.goto(base+'/ui/login');await resetPage.type('[name=username]','temporary');await resetPage.type('[name=password]','R4!xyz');
  await Promise.all([resetPage.waitForNavigation(),resetPage.click('.login-button')]);await resetPage.waitForSelector('#btnExport');await resetContext.close();
  const memberBrowser=await browser.createIncognitoBrowserContext(),memberPage=await memberBrowser.newPage();memberPage.on('pageerror',error=>errors.push(error.message));
  await memberPage.goto(base+'/ui/login');await memberPage.type('[name=username]','member');await memberPage.type('[name=password]',password);
  const profileResponse=memberPage.waitForResponse(response=>response.url()===base+'/api/user/avatar');
  await Promise.all([memberPage.waitForNavigation(),memberPage.click('.login-button')]);
  assert.equal((await (await profileResponse).json()).role,'user');
  await memberPage.waitForFunction(()=>['btnDelete','btnExport'].every(id=>document.getElementById(id)?.disabled===false));
  await memberPage.mouse.move(0,0);const ordinaryButtonAppearance=await buttonAppearance(memberPage);
  const permissions=await memberPage.evaluate(()=>({disabled:['btnDelete','btnExport'].map(id=>document.getElementById(id).disabled),adminLinks:[...document.querySelectorAll('a')].filter(a=>a.getAttribute('href')?.startsWith('/admin')).length}));
  assert.deepEqual(permissions.disabled,[false,false]);assert.equal(permissions.adminLinks,0);
  let forbiddenRequests=0;memberPage.on('request',request=>{if(request.url().includes('/api/export_data')||/\/business\/\d+\/delete/.test(request.url()))forbiddenRequests++;});
  for(const id of ['btnDelete','btnExport']){
   await memberPage.click('#'+id);await memberPage.waitForFunction(()=>[...document.body.children].some(el=>el.textContent==='当前用户不具有此权限'));
   assert.equal(await memberPage.$eval('#exportAllDialog',el=>el.open),false);
   await memberPage.evaluate(()=>{for(const el of [...document.body.children])if(el.textContent==='当前用户不具有此权限')el.remove();});
  }
  assert.equal(forbiddenRequests,0);
  assert.equal(await memberPage.evaluate(async()=> (await fetch('/api/export_data')).status),403);
  await memberPage.goto(base+'/ui/business/new');await memberPage.type('[name=name]','测试·手工录入正式业务');await memberPage.type('[name=customer]','正式客户单位');
  await Promise.all([memberPage.waitForNavigation(),memberPage.click('.form-save')]);
  const manualId=Number(memberPage.url().match(/business\/(\d+)/)[1]);
  const manualBefore=(await api('/api/export_data?ids='+manualId)).body.items[0];assert.equal(manualBefore.test_batch_id,null);
  await page.click('#adminImport');await page.waitForFunction(()=>document.querySelector('#adminTest').textContent==='200');
  const stats=(await api('/api/stats')).body;
  for(const values of Object.values(stats.series)){assert.ok(values.filter((value,i)=>i&&value<values[i-1]).length>=3,'Test chart should fluctuate');assert.ok(values.reduce((sum,value,i)=>sum+(i-5.5)*value,0)>0,'Overall trend should rise');assert.equal(values[11],Math.max(...values));}
  const chartPage=await browser.newPage();chartPage.on('pageerror',error=>errors.push(error.message));await chartPage.setViewport({width:1440,height:950});await chartPage.goto(base+'/static/figma/BDpage/order-management.html');
  await chartPage.waitForFunction(()=>document.querySelector('#btnExport')?.disabled===false);
  await chartPage.mouse.move(0,0);assert.deepEqual(ordinaryButtonAppearance,await buttonAppearance(chartPage));
  await chartPage.waitForFunction(series=>typeof Chart!=='undefined'&&[['total','totalOrdersChart'],['bidAll','orderItemsChart'],['won','returnsChart'],['amount','fulfilledChart']].every(([key,id])=>JSON.stringify(Chart.getChart(id)?.data.datasets[0].data)===JSON.stringify(series[key])),{},stats.series);
  await chartPage.evaluate(()=>{for(const id of ['totalOrdersChart','orderItemsChart','returnsChart','fulfilledChart']){const chart=Chart.getChart(id);chart.stop();chart.update('none');}});
  await new Promise(resolve=>setTimeout(resolve,1200));
  fs.mkdirSync(path.join(__dirname,'test-artifacts'),{recursive:true});await chartPage.screenshot({path:path.join(__dirname,'test-artifacts','stats-progressive.png')});await chartPage.close();
  const imported=(await api('/api/listing?per_page=50')).body.items.find(row=>row.test_batch_id);assert.ok(imported);
  await memberPage.goto(base+`/ui/business/${imported.id}/edit`);
  await memberPage.$eval('[name=name]',el=>el.value='已经修改过的自动测试业务');await memberPage.type('[name=change_notes]','验证修改后仍然可以清除');
  await Promise.all([memberPage.waitForNavigation(),memberPage.click('.form-save')]);
  const status=await memberPage.evaluate(async id=>{const response=await fetch(`/api/business/${id}/status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'book',value:'已获取'})});return response.status;},imported.id);assert.equal(status,200);
  const updated=(await api('/api/export_data?ids='+imported.id)).body.items[0];assert.equal(updated.test_batch_id,imported.test_batch_id);assert.equal(updated.name,'已经修改过的自动测试业务');
  await page.click('#adminClear');await page.waitForSelector('#adminClearDialog[open]');assert.match(await page.$eval('#adminClearMessage',el=>el.textContent),/包括修改过/);
  await page.click('#adminClearCancel');assert.equal((await api('/admin/users')).body.data.test,200);
  await page.click('#adminClear');await page.click('#adminClearExecute');await page.waitForFunction(()=>document.querySelector('#adminTest').textContent==='0');
  assert.equal((await api('/api/listing')).body.total,1);assert.deepEqual((await api('/api/export_data?ids='+manualId)).body.items[0],manualBefore);
  assert.equal((await api('/api/export_data?ids='+imported.id)).status,404);assert.equal(await page.$eval('#adminClear',el=>el.disabled),true);
  // Repeated imports use independent origin batches; a single clear removes both.
  await page.click('#adminImport');await page.waitForFunction(()=>document.querySelector('#adminTest').textContent==='200');
  await page.click('#adminImport');await page.waitForFunction(()=>document.querySelector('#adminTest').textContent==='400');
  const artifactDir=path.join(__dirname,'test-artifacts');fs.mkdirSync(artifactDir,{recursive:true});
  await page.screenshot({path:path.join(artifactDir,'admin-desktop.png'),fullPage:true});
  for(const width of [390,320]){await page.setViewport({width,height:900});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false,`Admin overflow at ${width}`);}
  await page.screenshot({path:path.join(artifactDir,'admin-mobile.png'),fullPage:true});
  await page.click('#adminClear');await page.click('#adminClearExecute');await page.waitForFunction(()=>document.querySelector('#adminTest').textContent==='0');
  await Promise.all([page.waitForNavigation(),page.click('#adminLogout')]);await page.waitForSelector('#adminLoginForm');
  for(const width of [390,320]){await page.setViewport({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await page.type('#adminUsername','admin');await page.type('#adminPassword',password);await Promise.all([page.waitForNavigation(),page.click('#adminLoginForm button')]);await page.waitForSelector('#adminUsers tr');
  assert.equal((await api('/admin/users')).body.data.total,1);
  console.log('Admin setup, accounts, permissions and test-data checks passed; checking shared-browser sessions.');
  // Reproduce the reported problem with two tabs in the SAME browser context, not incognito contexts.
  const sharedMain=await browser.newPage();sharedMain.on('pageerror',error=>errors.push(error.message));
  await sharedMain.setViewport({width:1440,height:950});await sharedMain.goto(base+'/ui/login');
  await sharedMain.type('[name=username]','member');await sharedMain.type('[name=password]',password);
  await Promise.all([sharedMain.waitForNavigation(),sharedMain.click('.login-button')]);
  await sharedMain.waitForFunction(()=>document.querySelector('#btnExport')?.disabled===false);
  assert.equal((await api('/api/user/avatar')).body.username,'member');assert.equal((await api('/admin/users')).status,200);
  await page.bringToFront();await page.setViewport({width:1440,height:1000});
  for(const [id,value] of [['accountUsername','管理员X'],['accountPassword',password],['accountConfirm',password]])await page.type('#'+id,value);
  await page.select('#accountRole','admin');await page.click('#accountSave');
  await page.waitForFunction(()=>document.querySelectorAll('#adminUsers tr').length===4);
  const sharedProfile=(await api('/api/user/avatar')).body;assert.equal(sharedProfile.username,'member');assert.equal(sharedProfile.role,'user');
  assert.equal((await api('/api/export_data')).status,403);
  assert.equal((await api('/business/'+manualId+'/delete',{})).status,403);
  let sharedForbidden=0;sharedMain.on('request',request=>{if(request.url().includes('/api/export_data')||/\/business\/\d+\/delete/.test(request.url()))sharedForbidden++;});
  await sharedMain.bringToFront();
  for(const id of ['btnDelete','btnExport']){
   await sharedMain.click('#'+id);await sharedMain.waitForFunction(()=>[...document.body.children].some(el=>el.textContent==='当前用户不具有此权限'));
   assert.equal(await sharedMain.$eval('#exportAllDialog',el=>el.open),false);
   await sharedMain.evaluate(()=>{for(const el of [...document.body.children])if(el.textContent==='当前用户不具有此权限')el.remove();});
  }
  assert.equal(sharedForbidden,0);
  await page.bringToFront();
  await Promise.all([page.waitForNavigation(),page.click('#adminLogout')]);await page.waitForSelector('#adminLoginForm');
  assert.equal((await api('/api/user/avatar')).body.username,'member');assert.equal((await api('/admin/users')).status,401);
  await page.type('#adminUsername','管理员X');await page.type('#adminPassword',password);
  await Promise.all([page.waitForNavigation(),page.click('#adminLoginForm button')]);await page.waitForSelector('#adminUsers tr');
  assert.equal((await api('/api/user/avatar')).body.role,'user');
  await sharedMain.bringToFront();
  await sharedMain.reload();await sharedMain.waitForFunction(()=>document.querySelector('#btnExport')?.disabled===false);
  await sharedMain.goto(base+'/ui/logout');await sharedMain.waitForSelector('[name=username]');
  assert.equal((await api('/api/user/avatar')).status,401);assert.equal((await api('/admin/users')).status,200);
  await page.reload();await page.waitForSelector('#adminUsers tr');assert.equal((await api('/admin/users')).body.data.total,1);
  assert.deepEqual(errors,[]);
  await sharedMain.type('[name=username]','管理员X');assert.equal(await sharedMain.$eval('#avatarPreview',el=>el.textContent),'管');
  await sharedMain.type('[name=password]',password);await Promise.all([sharedMain.waitForNavigation(),sharedMain.click('.login-button')]);
  await sharedMain.waitForFunction(()=>document.querySelector('#btnExport')?.disabled===false);
  assert.match(decodeURIComponent(await sharedMain.$eval('#userAvatar',el=>el.src)),/>管<\/text>/);
  for(const width of [390,320]){await sharedMain.goto(base+'/ui/login');await sharedMain.setViewport({width,height:900});await sharedMain.type('[name=username]','小马');assert.equal(await sharedMain.$eval('#avatarPreview',el=>el.textContent),'小');assert.equal(await sharedMain.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  console.log('Admin browser check passed: setup, accounts, ordinary permissions, import/edit/clear, repeat batches, desktop/mobile, independent main/admin logins and logouts, English/Chinese initial avatars and custom-image precedence. Main database untouched.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
