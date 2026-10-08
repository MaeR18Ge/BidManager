// Browser regression against the isolated smoke server, never production accounts or data.
const puppeteer = require('puppeteer');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788';
const username = process.env.BID_TEST_USERNAME, password = process.env.BID_TEST_PASSWORD;
if (!username || !password) throw new Error('Set BID_TEST_USERNAME and BID_TEST_PASSWORD for the isolated test account.');

(async () => {
    const browser = await puppeteer.launch({headless:'new', executablePath:process.env.TEST_CHROME || puppeteer.executablePath()});
    let page, stage='login';
    try {
        page = await browser.newPage();
        const errors = [], exports = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => { if (new URL(request.url()).pathname === '/api/export_data') exports.push(new URL(request.url())); });
        await page.setViewport({width:1440, height:1000});
        await page.goto(base + '/ui/login');
        await page.type('[name=username]', username); await page.type('[name=password]', password);
        await Promise.all([page.waitForNavigation(), page.click('button')]);
        await page.waitForSelector('#bidTableBody tr[data-row-index]');
        await page.waitForFunction(() => typeof window.BidManagerPDF === 'function' && !document.getElementById('btnExport').disabled);
        await page.evaluate(() => {
            document.addEventListener('click', event => { window.lastClick = {tag:event.target.tagName,id:event.target.id}; }, true);
            window.originalPDF = window.BidManagerPDF;
            window.exportCaptures = [];
            window.BidManagerPDF = async (items, options) => { window.exportCaptures.push({items, options}); };
        });

        const reports = [];
        async function expectedListing(filters) {
            return page.evaluate(async filters => {
                const items = [], params = new URLSearchParams(filters);
                for (let current=1;;current++) {
                    params.set('page', String(current)); params.set('per_page', '50');
                    const response = await fetch('/api/listing?' + params);
                    if (!response.ok) throw new Error('Listing failed');
                    const result = await response.json(); items.push(...result.items);
                    if (items.length >= result.total) return items;
                }
            }, filters);
        }
        async function listingAction(action) {
            const response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/listing', {timeout:10000});
            await action();
            const result = await (await response).json();
            await page.waitForFunction(ids => {
                const rendered = [...document.querySelectorAll('#bidTableBody tr[data-row-index] [data-type="book"]')].map(button => Number(button.dataset.id));
                return JSON.stringify(rendered) === JSON.stringify(ids);
            }, {}, result.items.map(item => item.id));
        }
        async function checkExport(name, filters) {
            stage = name;
            const expected = await expectedListing(filters);
            await page.evaluate(() => { window.exportCaptures = []; });
            await page.click('#btnExport'); await page.waitForSelector('#exportAllDialog[open]');
            assert.match(await page.$eval('#exportAllDescription', el => el.textContent), /筛选条件.*所有分页/);
            await page.click('#exportAllExecute');
            await page.waitForFunction(() => !document.getElementById('btnExport').disabled);
            const captures = await page.evaluate(() => window.exportCaptures);
            assert.equal(captures.length, 1);
            assert.deepEqual(captures[0].items.map(item => item.id), expected.map(item => item.id), name);
            const params = exports.at(-1).searchParams;
            for (const key of ['search','bid_status','sort']) assert.equal(params.get(key) || '', filters[key] || (key === 'sort' ? 'created_at' : ''), name + ':' + key);
            assert.equal(params.has('page'), false); assert.equal(params.has('per_page'), false);
            reports.push({name, rows:expected.length});
            console.log('PASS: '+name+' ('+expected.length+' rows)');
            return expected;
        }

        const all = await checkExport('default list spans every page', {});
        assert.equal(all.length, 200);
        stage = 'change page size';
        await listingAction(() => page.select('#pageSize', '20'));
        await checkExport('page size does not restrict export', {});
        for (const [card, status, sort] of [['cardBidAll','已投标','created_at'],['cardWon','已中标','created_at'],['cardAmount','已中标','amount_desc'],['cardTotal','','created_at']]) {
            stage = 'click '+card;
            await listingAction(() => page.click('#' + card));
            await checkExport(card, {bid_status:status, sort});
        }

        // A card filter is held in memory, so searching after a card must reset it.
        stage = 'search after card';
        await listingAction(() => page.click('#cardWon'));
        const search = all.find(item => item.bid_status === '未报名').name;
        await page.click('#searchInput', {clickCount:3}); await page.type('#searchInput', search);
        await listingAction(() => page.keyboard.press('Enter'));
        const found = await checkExport('search after a card', {search});
        assert.equal(found.length, 1); assert.equal(found[0].bid_status, '未报名');

        stage = 'search icon after card';
        await listingAction(() => page.click('#cardWon'));
        await page.click('#searchInput', {clickCount:3}); await page.type('#searchInput', search);
        await page.$eval('#searchBoxArea', area => Promise.all(area.getAnimations().map(animation => animation.finished)));
        assert.equal(await page.$eval('#searchIcon', icon => {
            const rect=icon.getBoundingClientRect(),hit=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);
            return hit?.closest('svg')?.id;
        }), 'searchIcon', 'A transient tip blocks the search icon');
        await listingAction(() => page.click('#searchIcon'));
        await checkExport('search icon after a card', {search});
        const beforeCancel = exports.length;
        await page.click('#btnExport'); await page.waitForSelector('#exportAllDialog[open]'); await page.click('#exportAllCancel');
        assert.equal(exports.length, beforeCancel);

        stage = 'selected export';
        await listingAction(() => page.click('#cardTotal'));
        const selectedId = await page.$eval('#bidTableBody tr[data-row-index] [data-type="book"]', button => Number(button.dataset.id));
        await page.click('#bidTableBody tr[data-row-index]');
        await page.evaluate(() => { window.exportCaptures = []; }); await page.click('#btnExport');
        await page.waitForFunction(() => !document.getElementById('btnExport').disabled);
        assert.deepEqual(await page.evaluate(() => window.exportCaptures[0].items.map(item => item.id)), [selectedId]);
        assert.equal(exports.at(-1).searchParams.get('ids'), String(selectedId));
        assert.equal(await page.$eval('#exportAllDialog', dialog => dialog.open), false);

        stage = 'empty results';
        await page.click('#searchInput', {clickCount:3}); await page.type('#searchInput', 'no-match-for-export-regression');
        await listingAction(() => page.keyboard.press('Enter'));
        await page.evaluate(() => { window.BidManagerPDF = window.originalPDF; });
        await page.click('#btnExport'); await page.waitForSelector('#exportAllDialog[open]'); await page.click('#exportAllExecute');
        await page.waitForFunction(() => !document.getElementById('btnExport').disabled && document.body.innerText.includes('没有可导出的业务'));
        assert.equal(exports.at(-1).searchParams.get('search'), 'no-match-for-export-regression');

        // Exercise the actual native-text PDF renderer with a filtered result.
        stage = 'actual filtered PDF';
        await listingAction(() => page.click('#cardWon'));
        const won = await expectedListing({bid_status:'已中标',sort:'created_at'});
        const output = path.join(__dirname, 'test-artifacts', 'filtered-export');
        await fs.mkdir(output, {recursive:true});
        const directory = await fs.mkdtemp(path.join(output, 'download-'));
        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {behavior:'allow', downloadPath:directory});
        await page.evaluate(() => { window.BidManagerPDF = async (items, options) => { window.lastPDFItems = items; await window.originalPDF(items, options); }; });
        await page.click('#btnExport'); await page.waitForSelector('#exportAllDialog[open]'); await page.click('#exportAllExecute');
        await page.waitForFunction(() => !document.getElementById('btnExport').disabled, {timeout:120000});
        let filename;
        for (let attempt=0;attempt<30;attempt++) {
            filename = (await fs.readdir(directory)).find(name => name.endsWith('.pdf'));
            if (filename) break;
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        assert.ok(filename, await page.evaluate(() => document.body.innerText.slice(-1000)));
        const pdf = await fs.readFile(path.join(directory, filename));
        assert.equal(pdf.subarray(0,5).toString(), '%PDF-'); assert.match(pdf.toString('latin1'), /\/ToUnicode/);
        const actual = await page.evaluate(() => window.lastPDFItems);
        assert.deepEqual(actual.map(item => item.id), won.map(item => item.id));
        await fs.copyFile(path.join(directory, filename), path.join(output, 'filtered-won.pdf'));
        await fs.writeFile(path.join(output, 'expected-names.json'), JSON.stringify(won.map(item => item.name)));
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({checks:reports, selectedRows:1, canceledWithoutRequest:true, emptyResultsReported:true, filteredPDFRows:won.length, filteredPDFBytes:pdf.length, pageErrors:errors}));
    } catch(error) {
        console.error('Browser check failed at:', stage, page?.url());
        if(page) console.error(await page.evaluate(() => ({lastClick:window.lastClick,search:document.getElementById('searchInput')?.value,title:document.getElementById('bizListSuffix')?.textContent,body:document.body.innerText.slice(-400)})));
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
