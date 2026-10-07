const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3001;

// 中间件
app.use(cors());
// 提高解析上限，避免大量业务数据时触发 PayloadTooLargeError
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// 根路径 - 显示服务状态
app.get('/', (req, res) => {
    res.json({
        status: 'OK',
        service: 'PDF Export Service',
        version: '1.0.0',
        endpoints: {
            'GET /': 'Service status (this page)',
            'GET /health': 'Health check',
            'POST /generate-pdf': 'Generate PDF from HTML content'
        },
        usage: {
            method: 'POST',
            url: '/generate-pdf',
            body: {
                htmlContent: 'HTML content to convert to PDF',
                filename: 'Optional filename for the PDF'
            }
        }
    });
});

// 健康检查接口
app.get('/health', (req, res) => {
    res.json({ status: 'OK', service: 'PDF Export Service' });
});

// PDF导出接口
app.post('/generate-pdf', async (req, res) => {
    try {
        const { htmlContent, filename = 'business-list.pdf' } = req.body;
        
        if (!htmlContent) {
            return res.status(400).json({ error: 'HTML content is required' });
        }

        console.log('Starting PDF generation...');
        
        // 启动浏览器，添加中文字体支持
        const browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--font-render-hinting=none',
                '--disable-font-subpixel-positioning',
                '--enable-font-antialiasing',
                '--force-color-profile=srgb'
            ]
        });

        const page = await browser.newPage();
        
        // 设置视口
        await page.setViewport({ width: 1200, height: 800 });
        
        // 设置字体
        await page.evaluateOnNewDocument(() => {
            // 添加中文字体支持
            const style = document.createElement('style');
            style.textContent = `
                @font-face {
                    font-family: 'Noto Sans SC';
                    src: url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap');
                }
                @font-face {
                    font-family: 'Microsoft YaHei';
                    src: local('Microsoft YaHei');
                }
                @font-face {
                    font-family: 'SimSun';
                    src: local('SimSun');
                }
                @font-face {
                    font-family: 'Noto Sans CJK SC';
                    src: local('Noto Sans CJK SC');
                }
                body {
                    font-family: 'Noto Sans SC', 'Noto Sans CJK SC', 'Microsoft YaHei', 'SimSun', Arial, sans-serif !important;
                }
                * {
                    font-family: 'Noto Sans SC', 'Noto Sans CJK SC', 'Microsoft YaHei', 'SimSun', Arial, sans-serif !important;
                }
            `;
            document.head.appendChild(style);
        });
        
        // 设置内容
        await page.setContent(htmlContent, {
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        // 等待页面渲染完成
        await page.waitForTimeout(3000);

        // 生成PDF，优化以避免出现尾页空白
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            preferCSSPageSize: true,
            displayHeaderFooter: false,
            landscape: false,
            scale: 0.98, // 略微缩放，避免分页边界四舍五入导致空白页
            margin: {
                top: '20mm',
                right: '15mm',
                bottom: '20mm',
                left: '15mm'
            }
        });

        await browser.close();

        console.log('PDF generated successfully');

        // 设置响应头
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', pdfBuffer.length);

        // 发送PDF
        res.send(pdfBuffer);

    } catch (error) {
        console.error('PDF generation error:', error);
        res.status(500).json({ error: 'PDF generation failed', details: error.message });
    }
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`PDF Export Server running on port ${PORT}`);
    console.log(`Service status: http://localhost:${PORT}/`);
    console.log(`Health check: http://localhost:${PORT}/health`);
}); 