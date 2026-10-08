const puppeteer = require('puppeteer');
const assert = require('node:assert/strict');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const username=process.env.BID_TEST_USERNAME,password=process.env.BID_TEST_PASSWORD;
if(!username||!password)throw new Error('Set BID_TEST_USERNAME and BID_TEST_PASSWORD for the isolated test account.');

(async () => {
    const browser = await puppeteer.launch({headless:'new', executablePath:process.env.TEST_CHROME || puppeteer.executablePath()});
    try {
        const page = await browser.newPage();
        const errors=[];
        page.on('pageerror', error=>errors.push(error.message));
        await page.setViewport({width:1440,height:900});
        await page.goto(base+'/ui/login');
        await page.type('[name=username]',username);
        await page.type('[name=password]',password);
        await Promise.all([page.waitForNavigation(),page.click('button')]);
        await page.waitForSelector('#bidTableBody tr button.chip');
        await page.select('#pageSize','20');
        await page.waitForFunction(()=>document.querySelectorAll('#bidTableBody tr').length===20);

        const coords = async (selector,type) => page.$eval(selector,(button,type)=>{
            const panel=button.parentElement.querySelector(`[data-dropdown="${type}"]`);
            const b=button.getBoundingClientRect(),p=panel.getBoundingClientRect();
            return {buttonTop:b.top,buttonBottom:b.bottom,buttonLeft:b.left,top:p.top,bottom:p.bottom,left:p.left,height:p.height,hidden:panel.classList.contains('hidden')};
        },type);
        const attached = rect => {
            assert.equal(rect.hidden,false);
            const gap=Math.min(Math.abs(rect.top-rect.buttonBottom-6),Math.abs(rect.buttonTop-rect.bottom-6));
            assert.ok(gap<2,`Menu not attached to button: ${JSON.stringify(rect)}`);
            assert.ok(Math.abs(rect.left-rect.buttonLeft)<2);
        };

        for(const type of ['book','bid']) {
            const selector=`#bidTableBody tr:first-child button[data-type="${type}"]`;
            await page.evaluate(()=>window.scrollTo(0,0));
            await page.click(selector);
            await pause(200);
            const before=await coords(selector,type);attached(before);
            await page.evaluate(()=>window.scrollBy(0,120));await pause(100);
            const after=await coords(selector,type);attached(after);
            assert.ok(Math.abs(after.buttonTop-before.buttonTop+120)<2);
            assert.ok(Math.abs(after.top-before.top+120)<2);
            await page.setViewport({width:1200,height:700});await pause(100);attached(await coords(selector,type));
            await page.keyboard.press('Escape');assert.equal((await coords(selector,type)).hidden,true);
            await page.setViewport({width:1440,height:900});
        }

        const edge='#bidTableBody tr:nth-child(8) button[data-type="bid"]';
        await page.$eval(edge,button=>button.scrollIntoView({block:'end'}));
        await page.click(edge);await pause(200);
        const upward=await coords(edge,'bid');attached(upward);
        assert.ok(upward.bottom<upward.buttonTop,'Menu should open above a button at the viewport bottom');
        await page.evaluate(()=>window.scrollBy(0,300));await pause(100);attached(await coords(edge,'bid'));
        await page.keyboard.press('Escape');

        const first='#bidTableBody tr:first-child button[data-type="book"]';
        await page.evaluate(()=>window.scrollTo(0,0));await page.click(first);await pause(200);
        await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await pause(100);
        assert.equal((await coords(first,'book')).hidden,true);
        assert.deepEqual(errors,[]);
        console.log('PASS: both menus follow scroll/resize, flip above screen edge, close on Escape and when button leaves viewport; no page errors.');
    } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
