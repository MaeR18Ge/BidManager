# PDF 中文字体

`BidManagerSansSC-Regular.ttf` 来自 [Google Fonts / Noto Sans SC](https://github.com/google/fonts/tree/main/ofl/notosanssc)，按 SIL Open Font License 1.1 使用、修改和再分发；完整许可证及原版权声明见 `OFL.txt`。字体已改名，未使用保留名称 `Source`。

用途仅为浏览器 PDF 导出，首次导出按需加载并在当前页面缓存。普通页面不加载该字体。构建会复制 TTF 和许可证到 Cloudflare 静态资源，不依赖第三方字体服务或额外的应用运行库。

源文件 `NotoSansSC[wght].ttf` 的 SHA-256：`a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da`。

处理方式：使用 FontTools 4.66.1 将 `wght` 固定为 400，保留源字体覆盖的全部 BMP Unicode 字符，移除 hinting 和 OpenType 排版功能，并将名称表中的字体族改为 `BidManager Sans SC`。jsPDF 负责按实际导出文字嵌入字体子集；粗体使用原生文字描边。源字体包含 30,445 个保留字符，源文件及制作用的 Python 工具不参与应用运行。

产物 SHA-256：`52aab631449496b18937703dddda8ca2c86977997cbe9056323f8e618a95a395`，大小 10,204,708 字节。遇到字体未覆盖的字符（包括部分 emoji 和增补平面汉字），导出明确报错，避免静默丢失文字。
