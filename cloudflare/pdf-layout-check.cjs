const puppeteer = require('puppeteer');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const artifacts = path.join(__dirname, 'test-artifacts', 'pdf-style');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const username=process.env.BID_TEST_USERNAME,password=process.env.BID_TEST_PASSWORD;
if(!username||!password)throw new Error('Set BID_TEST_USERNAME and BID_TEST_PASSWORD for the isolated test account.');

(async () => {
    await fs.mkdir(artifacts, {recursive:true});
    const browser = await puppeteer.launch({headless:'new', executablePath:process.env.TEST_CHROME || puppeteer.executablePath()});
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.setViewport({width:1440, height:900});
        await page.goto(base+'/ui/login');
        await page.type('[name=username]',username);
        await page.type('[name=password]',password);
        await Promise.all([page.waitForNavigation(), page.click('button')]);
        await page.waitForSelector('#bidTableBody tr');
        await page.waitForFunction(() => typeof window.BidManagerPDF === 'function');
        const client = await page.target().createCDPSession();

        // Inspect the exact HTML captured by the existing canvas renderer, without altering export data.
        await page.evaluate(() => {
            window.pdfLayouts = [];
            const original = HTMLCanvasElement.prototype.toDataURL;
            HTMLCanvasElement.prototype.toDataURL = function(type, ...args) {
                const host = document.querySelector('[data-bidmanager-pdf]');
                if (host && type === 'image/jpeg') {
                    const origin = host.getBoundingClientRect(), scale = this.width / origin.width;
                    const context = this.getContext('2d');
                    const badgeGaps = [...host.querySelectorAll('.pdf-badge')].map(badge => {
                        const rect = badge.getBoundingClientRect();
                        const x = Math.round((rect.left - origin.left) * scale) + 2;
                        const y = Math.max(0, Math.floor((rect.top - origin.top) * scale) - 20);
                        const width = Math.round(rect.width * scale) - 4, height = Math.ceil(rect.height * scale) + 40;
                        const pixels = context.getImageData(x, y, width, height).data;
                        const style = getComputedStyle(badge);
                        const background = style.backgroundColor.match(/\d+/g).slice(0, 3).map(Number);
                        const dark = style.color === 'rgb(0, 0, 0)';
                        let topEdge = height, bottomEdge = -1;
                        for (let offset = 0; offset < pixels.length; offset += 4) {
                            if (background.every((channel, index) => Math.abs(pixels[offset + index] - channel) < 3)) {
                                const line = Math.floor(offset / 4 / width);
                                topEdge = Math.min(topEdge, line); bottomEdge = Math.max(bottomEdge, line);
                            }
                        }
                        let bottom = -1;
                        for (let line = topEdge; line <= bottomEdge; line++) {
                            for (let column = 8; column < width - 8; column++) {
                                const offset = (line * width + column) * 4;
                                if (dark ? Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]) < 40 : Math.min(pixels[offset], pixels[offset + 1], pixels[offset + 2]) > 230) bottom = line;
                            }
                        }
                        return bottom < 0 ? -1 : (bottomEdge - bottom) / scale;
                    });
                    const textBounds = cell => {
                        const range = document.createRange(); range.selectNodeContents(cell);
                        const boxes = [...range.getClientRects()];
                        const style = getComputedStyle(cell);
                        return {lines:boxes.length, width:Math.max(0, ...boxes.map(box => box.width)), available:cell.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)};
                    };
                    window.pdfLayouts.push({
                        height:host.getBoundingClientRect().height,
                        width:host.getBoundingClientRect().width,
                        header:host.querySelector('.pdf-header')?.textContent || '',
                        footer:host.querySelector('.pdf-footer')?.textContent || '',
                        names:[...host.querySelectorAll('tbody .pdf-name')].map(cell => cell.textContent),
                        badgeGaps,
                        numbers:[...host.querySelectorAll('tbody .pdf-amount, tbody td:nth-child(4), tbody td:nth-child(5), tbody td:nth-child(9)')].map(textBounds),
                        unsafeElements:host.querySelectorAll('script,img').length
                    });
                }
                return original.call(this, type, ...args);
            };
        });

        async function startDownload(name) {
            const directory = await fs.mkdtemp(path.join(artifacts, name + '-'));
            await client.send('Page.setDownloadBehavior', {behavior:'allow', downloadPath:directory});
            await page.evaluate(() => { window.pdfLayouts = []; });
            return async () => {
                for (let attempt = 0; attempt < 200; attempt++) {
                    const file = (await fs.readdir(directory)).find(file => file.endsWith('.pdf'));
                    if (file) {
                        const output = path.join(artifacts, name + '.pdf');
                        await fs.copyFile(path.join(directory, file), output);
                        const layouts = await page.evaluate(() => window.pdfLayouts);
                        assert.ok(layouts.length > 0);
                        for (const layout of layouts) {
                            assert.equal(layout.width, 960);
                            assert.ok(layout.height <= 960 * 257 / 180, 'Content exceeds A4 margins');
                            assert.ok(layout.names.length > 0, 'Empty trailing PDF page');
                            assert.equal(layout.unsafeElements, 0);
                            assert.ok(layout.badgeGaps.every(gap => gap >= 1), `Status text is clipped at the bottom of its badge: ${JSON.stringify(layout.badgeGaps)}`);
                            for (const number of layout.numbers) {
                                assert.equal(number.lines, 1, 'Amount or date wraps');
                                assert.ok(number.width <= number.available + 1, 'Amount or date overflows its column');
                            }
                        }
                        assert.ok(layouts[0].header.includes('六院体检业务管理系统 - 业务列表'));
                        assert.ok(layouts.at(-1).footer.includes('总金额:'));
                        await fs.writeFile(path.join(artifacts, name + '.json'), JSON.stringify(layouts, null, 2));
                        console.log(`${name}: ${layouts.length} pages, ${layouts.flatMap(layout => layout.names).length} complete rows`);
                        return layouts;
                    }
                    await pause(300);
                }
                throw new Error('PDF download timed out');
            };
        }

        const selectedNames = await page.$$eval('#bidTableBody tr', rows => rows.slice(0, 2).map(row => row.querySelector('td').textContent.trim()));
        const selectedDownload = await startDownload('selected-style');
        await page.click('#bidTableBody tr:first-child');
        await page.keyboard.down('Control');
        await page.click('#bidTableBody tr:nth-child(2)');
        await page.keyboard.up('Control');
        await page.click('#btnExport');
        const selected = await selectedDownload();
        assert.deepEqual(selected.flatMap(layout => layout.names).sort(), selectedNames.sort());
        assert.ok(selected[0].header.includes('总记录数: 2 条'));

        const allData = await page.evaluate(async () => (await (await fetch('/api/export_data')).json()));
        const allDownload = await startDownload('all-style');
        await page.click('#btnExport');
        await page.waitForSelector('#exportAllDialog[open]');
        await page.click('#exportAllCancel');
        assert.equal(await page.$eval('#exportAllDialog', dialog => dialog.open), false);
        assert.deepEqual(await page.evaluate(() => window.pdfLayouts), []);
        await page.click('#btnExport');
        await page.waitForSelector('#exportAllDialog[open]');
        await page.click('#exportAllExecute');
        const all = await allDownload();
        assert.deepEqual(all.flatMap(layout => layout.names), allData.items.map(item => item.name));
        assert.ok(all[0].header.includes('导出人: ' + allData.exporter));

        const edgeRows = Array.from({length:58}, (_, index) => ({
            name:index === 0 ? '<img src=x onerror=alert(1)>超长业务名称'.repeat(6).slice(0, 200) : `测试项目-${index}`,
            service_people:index ? 99999 : 0, bid_amount:index ? 8888888.88 : 0,
            registration_time:index ? '2026-10-01' : null, bid_time:index ? '2026-11-01' : null, created_at:'2026-09-25T10:00:00',
            document_status:index % 2 ? '已获取' : '未获取', bid_status:['未报名','已报名','未投标','已投标','未中标','已中标'][index % 6], priority:['低','中','高'][index % 3]
        }));
        const edgeDownload = await startDownload('edge-cases-style');
        await page.evaluate(async rows => { await window.BidManagerPDF(rows, {exporter:'<img src=x onerror=alert(1)>'}); }, edgeRows);
        const edges = await edgeDownload();
        assert.deepEqual(edges.flatMap(layout => layout.names), edgeRows.map(row => row.name));
        assert.ok(edges.length > 1);
        assert.equal(await page.$('[data-bidmanager-pdf]'), null);
        assert.deepEqual(errors, []);
        console.log('PASS: selected/all export, cancel, complete pagination, long names, large amounts, empty fields and HTML escaping; no page errors.');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
