# A 路任务书（自包含版）· Qwen3.8-Max

> 用法：新建会话 → 会话 Agent 选 `about-page-designer-qwen`（模型绑定在 Agent 上，不选就还是默认模型）→ 把下面「===」之间的内容整段粘进去。

===

为仓库 `D:/LHYsAuto/HYWeb` 产出「关于 / 简历页」的完整设计方案与可运行原型。你是独立视觉方案设计师，本路记作 A 路，与另一路并行、互相独立。

## 开工前必读

1. `DESIGN.md`（全站设计规范：zinc 双主题令牌、零 webfont、禁止阴影、左缘对齐、组件规范、交互规范）
2. `index.html`、`projects.html`、`favorites.html`、`intro.html`
3. `assets/css/clone.css`、`assets/js/clone.js`

先读文件再动手，不要凭空假设项目结构。

## 需求（逐条满足）

- 新增一个简历页（about），必须包含时间轴
- 必须有交互动画效果
- 风格与原项目统一，不能像另一个站
- 视觉观感可以出挑一点，不必完全受 DESIGN.md 限制，但整体不能割裂
- 本轮只出预览，不合并进原项目

## 保持统一感的硬约束

- 颜色只用 `clone.css` 里已有的令牌（HSL 三元组 + `hsl(var(--xxx))`），不新增色相、不写死新颜色
- 字体只用现成的衬线 / 无衬线 / 等宽三栈，禁止引入 webfont、CDN、框架运行时
- 页头、主题切换按钮、移动端菜单、页签、pill、描边按钮等现成组件直接复用，不要另起炉灶
- 双主题（默认 dark）都必须成立；`<640px` 与 768 / 1024 / 1200 断点都要成立
- 动效必须支持 `prefers-reduced-motion` 降级

## 交付物

1. **方案文档** `D:/LHYsAuto/HYWeb/.verify/ideation/plan-A-qwen.md`（目录不存在就创建），结构固定为：
   - 一句话概念（这页凭什么值得存在）
   - 信息架构与版式：区块顺序、栅格、字号尺度，并说明与首页 / 详情页哪条既有节奏同源
   - 动效清单：逐条写「触发条件 → 变化属性 → 时长与缓动 → 它想传达什么」，标明哪些是进场、哪些是滚动驱动、哪些是悬停
   - 时间轴结构：脊线、节点、年份、内容列如何组织，移动端如何降级
   - 破格项清单：明确列出违反 DESIGN.md 哪一条、为什么值得、去掉它会有什么损失
   - 合并成本：需要动哪些文件、版本号怎么 bump、DESIGN.md 要补哪几节
   - 风险与未验证项
2. **单文件 HTML 原型** `D:/LHYsAuto/HYWeb/about-preview-A-qwen.html`
   —— 双击即可在浏览器打开；内联 CSS/JS；只允许引用 `assets/css/clone.css` 与 `assets/img/avatar.svg`（所以必须放在仓库根目录，否则相对路径取不到）；零外部网络资源。

## 自检（改完再交付）

- 用无头 Chrome（CDP）实际渲染并截图，至少覆盖：1280×900 暗色、1280×900 亮色、390×844 暗色，外加一张**滚动到时间轴中段**的截图（证明滚动驱动动效真的生效，不是只在顶部好看）。
- Chrome 路径 `C:\Program Files\Google\Chrome\Application\chrome.exe`，node 已可用。可借用 `.verify/about-preview-shot.mjs` 的 CDP 启动骨架，但不要改动 `.verify` 下已有脚本，自己新建一个。
- 截图产物写到 `D:/LHYsAuto/HYWeb/.verify/ideation/shots-a/`。
- 检查项：横向溢出、双主题下文字对比、`<640px` 可读性、时间轴与动效在滚动中是否真的变化、控制台报错。

## 硬性边界

- 不得修改任何现有文件（各 html、`assets/css/clone.css`、`assets/js/clone.js`、`DESIGN.md`、`BLOG-WORKFLOW.md`、`scripts/` 一律只读）。
- 不要 `git add` / `commit` / `push`。
- 不要读仓库里已有的 `about-preview.html`，那是另一条路线的产物，会干扰独立判断。
- 简历正文用结构完整的示例占位数据（3–4 段经历 + 教育 + 技能 + 联系方式），每处注释标 `⚠️占位`。

## 汇报格式（中文，600 字内）

一句话概念 / 三个最有辨识度的设计决策及理由 / 破格项清单（对应 DESIGN.md 哪一条）/ 自检结论（哪些实测通过、哪些没验证到）/ 两个产物路径。

===
