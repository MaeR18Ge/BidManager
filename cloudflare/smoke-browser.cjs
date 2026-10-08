// Manual browser verification against smoke-server.mjs or local Wrangler.
const puppeteer=require('puppeteer');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const username=process.env.BID_TEST_USERNAME,password=process.env.BID_TEST_PASSWORD;
if(!username||!password)throw new Error('Set BID_TEST_USERNAME and BID_TEST_PASSWORD for the isolated test account.');
(async()=>{
 const output=path.resolve(__dirname,'test-artifacts');await fs.mkdir(output,{recursive:true});
 const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
 for(const filename of await fs.readdir(output))if(filename.endsWith('.pdf'))await fs.unlink(path.join(output,filename));
 const browser=await puppeteer.launch({headless:'new',executablePath:process.env.TEST_CHROME||puppeteer.executablePath()});
 try {
  const page=await browser.newPage();await page.setViewport({width:1440,height:1000});
  const errors=[],remote=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',req=>{if(!req.url().startsWith(base)&&!req.url().startsWith('data:'))remote.push(req.url())});
  await page.goto(base+'/ui/login');await page.type('[name=username]',username);await page.type('[name=password]',password);await Promise.all([page.waitForNavigation(),page.click('button')]);
  await page.waitForFunction(()=>document.querySelectorAll('#bidTableBody tr').length===10);
  await page.select('#pageSize','50');await page.waitForFunction(()=>document.querySelectorAll('#bidTableBody tr').length===50);
  await page.click('#bidTableBody tr');assert.equal(await page.$$eval('.row-selected',rows=>rows.length),1);
  const client=await page.target().createCDPSession();await client.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:output});
  await page.click('#btnExport');await page.waitForFunction(()=>!document.getElementById('btnExport').disabled,{timeout:120000});
  await new Promise(resolve=>setTimeout(resolve,1000));
  const filename=(await fs.readdir(output)).find(name=>name.endsWith('.pdf'));assert.ok(filename,await page.evaluate(()=>document.body.innerText.slice(-1000)));const one=await fs.readFile(path.join(output,filename));assert.ok(one.subarray(0,5).toString()==='%PDF-');assert.equal((one.toString('latin1').match(/\/Type \/Page\b/g)||[]).length,1);await fs.unlink(path.join(output,filename));
  await page.click('#btnExport');await page.waitForFunction(()=>document.getElementById('exportAllDialog').open);await page.click('#exportAllExecute');await page.waitForFunction(()=>!document.getElementById('btnExport').disabled,{timeout:120000});
  await new Promise(resolve=>setTimeout(resolve,1000));
  const allFile=(await fs.readdir(output)).find(name=>name.endsWith('.pdf'));assert.ok(allFile,await page.evaluate(()=>document.body.innerText.slice(-1000)));const all=await fs.readFile(path.join(output,allFile));const pages=(all.toString('latin1').match(/\/Type \/Page\b/g)||[]).length;assert.ok(pages>1);
  await page.screenshot({path:path.join(output,'desktop.png'),fullPage:false});
  await page.setViewport({width:390,height:844});await page.screenshot({path:path.join(output,'mobile.png'),fullPage:false});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
  const rowCount=await page.evaluate(async()=> (await (await fetch('/api/listing')).json()).total);
  console.log(JSON.stringify({rows:rowCount,selectedPdfPages:1,allPdfPages:pages,pdfBytes:all.length,pageErrors:errors,externalRequests:remote}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
