# AGENTS.md · 弘1 博客（HYWeb）

给接手这个项目的人和 AI 看的入口文档。先读这一页，再按下面的指针去读细的。

**这是一套纯静态站点**：没有构建步骤、没有 `package.json`、没有第三方依赖、不加载任何 webfont、不引用任何外部资源。
所有页面都是手写 HTML + 共享 CSS/JS，双击 `index.html` 用 `file://` 打开就能跑。

---

## 1. 四个地址

| 用途 | 地址 |
| --- | --- |
| 线上站点（GitHub Pages） | <https://hy-998.github.io/HYWeb/> |
| 仓库 | <https://github.com/hy-998/HYWeb>（分支 `main`） |
| 参考原站（视觉 1:1 复刻对象） | <https://yaolifeng.com/shorts> |
| **简历页专属链接**（含钥匙，见第 2 节） | <https://hy-998.github.io/HYWeb/about.html?k=SsIU9mi1NBV4> |

部署方式：仓库设置里的 *Pages → Deploy from a branch → `main` / root*，**没有** `.github/workflows`。
`git push` 后约 1–2 分钟线上生效（实测；用 `curl` 拿到的 HTML 里 `?v=` 变成新号即为已更新）。

## 2. 简历页的门禁（先弄清这个再动 about.html）

`about.html` 是简历，**不在导航里、不被搜索引擎收录**，只能凭带钥匙的链接进入。

- 钥匙：`SsIU9mi1NBV4`，只写在 `assets/js/access.js` 顶部（`var KEY`）一处。
  `.verify/about-shot.mjs` 顶部同步了一份常量，换钥匙时**两处一起改**。
- 机制：`?k=<钥匙>` → 往 `sessionStorage` 写 `aboutAccess=1` → `history.replaceState` 把钥匙从地址栏抹掉
  → `<html class="about-ok">` 揭开整页 → `clone.js` 第 10 节才把「关于」页签注入导航。
  没有钥匙则 `location.replace('index.html')`；页面默认 `visibility: hidden`，禁用 JS 的人也读不到正文。
- 状态跟着标签页走：解锁后进站内任何一页都能看到「关于」，关掉标签即失效。
- **边界：这是发现性隔离，不是访问控制。** 仓库和 Pages 都是公开的，钥匙在前端源码里。
  真要隐私得换方案（密码保护 / 私有仓库 / 站外托管）。这一点在 DESIGN.md 6.7 也写着。
- 禁止依赖 `document.referrer` 做判断（DESIGN.md 6.2），门禁靠的是 state 而不是来源。

## 3. 页面清单与文件归属

| 页面 | 说明 |
| --- | --- |
| `intro.html` | 开篇欢迎页（打字机 + 楷体），首访会播一次 |
| `index.html` | 首页文章列表 |
| `post-awake/pixels/ghost/memory/pacing.html` | 5 篇文章详情页 |
| `projects.html` | 项目展示（卡片母版） |
| `favorites.html` | 收藏推荐（筛选条母版） |
| `about.html` | 简历页，受第 2 节约束 |

- **共享**：`assets/css/clone.css`（设计令牌 + 全站组件）、`assets/js/clone.js`（主题、导航、首访跳转、移动菜单）。
- **页面级**（只被自己那页引用，别塞进共享文件让其余页面白担体积）：
  `assets/css/about.css` + `assets/js/{access,about}.js`（about）、`assets/intro/*`（intro）。
- 简历里复用了两处别的页面的母版：`.work-card`/`.works-grid`（来自项目页）、`.filter-bar`/`.filter-tag`（来自收藏页）。

## 4. 设计规范：DESIGN.md 是硬约束

`DESIGN.md`（280 行）是本项目的**设计规范合同**，改动前先看对应小节，别照自己的习惯写。几条不可协商的：

- 色彩只用 shadcn/zinc 令牌（HSL 三元组，`hsl(var(--xxx))` 使用），**禁止在组件里写死颜色**、禁止新增色相。
- **零 webfont**：中英文全走系统字体栈（`ui-serif` / `ui-sans-serif` / `ui-monospace`）。
- 暗色为默认，主题由 `<head>` 里的内联预加载脚本读 `localStorage.theme` 决定，避免闪白。
- 间距走 Tailwind 的 4px 基数档位，禁止自造奇数档；同级块之间 2rem，层级分隔 4rem（DESIGN.md 第 4 节）。
- 主题切换按钮的位置全站一致，含窄屏的具体像素值（DESIGN.md 3.8），不要自行定义偏移。

相关文档：`BLOG-WORKFLOW.md`（怎么写一篇）、`POST-TEMPLATE.md`（frontmatter 模板）、`RESUME-MODULES.md`（简历素材速记，事实待填）。

## 5. 缓存版本号：全站只能有一个号

所有 `assets/**` 引用都带 `?v=N`，**全站共用同一个号**（当前 `?v=17`）。改了 JS/CSS 就把 10 个 HTML 里的号一起 +1，并同步 DESIGN.md 8.1。

这条已经有断言看住了：`.verify/about-shot.mjs` 的用例「版本·全站只有一个版本号」会扫所有页面，出现两个号就报
`站点同时挂着 v=16（1 处）+ v=17（41 处）`。踩过的坑：另一趟提交把 logo 图升到 17，这趟把 JS/CSS 从 15 升到 16，两边各升各的，不报错，但拿到旧缓存的人会少一张新图。

## 6. 首访开场链路（`clone.js` 第 0 节）

- 首次访问任意页 → 跳 `intro.html?next=<原本要看的页>`，ENTER 后回到原本那页，不会把外部深链接吞掉。
- `localStorage.introPlayed=1` 表示已播过；`?skipIntro=1` 是逃生口，任何情况下直接放行。
- 存储被禁用（隐私模式）时不再死循环，直接进主界面。
- **从简历专属链接落地视为已进入博客**：补写 `introPlayed`，之后翻页不会再被开篇打断；门禁没放行（无钥匙被弹回）不算数。
- 会话已解锁简历时，欢迎页的 ENTER 优先回 `about.html`。
- 点头像重播欢迎页不受这些标记影响。

## 7. 简历页的 PDF：不需要"重新生成"

点「下载简历 PDF」不下载任何文件，而是走浏览器打印管线（`window.print()`），版式由 `about.css` 第 9 节的 `@page` + `@media print` 负责。
**仓库里没有、也不应该有 PDF 文件**——所以改完 HTML 不需要任何跟版动作，导出的永远是当前这一版。

三个已经踩过并写进 DESIGN.md 3.9 的事实，改打印版式前必读：

1. A4 去掉 13mm 左右边距后正文只有 **695px**，比 `clone.css` 的 `min-width:768px` 桌面断点还窄 —— 宽屏栅格在纸上不生效，打印布局必须在 `@media print` 里另写一套。
   推论：往已有模块里加内容是安全的，**新增一个自带栅格的模块**要顺手给它补一条打印规则。
2. 进场动画靠 IntersectionObserver，没滚到的段落是 `opacity:0`，直接打就是一页白纸。所以 `beforeprint` 里要把 reveal 落终态、数字定稿、类别筛选恢复成「全部」，`afterprint` 再原样还回去。
3. 屏幕上的层级靠深色底 + 低不透明度撑，白纸上同一套只会糊成浅灰。打印版另定墨阶：`--muted-foreground` 压到 zinc-700 一档、正文与巨型年份直接吃 `--foreground`、小标签的 `opacity` 收回 1，层级改由字号字重承担；胶囊标签要点名压 `clone.css` 里 `.dark .work-tags span` 那行硬编码的 `#18181880`（权重比 `:root` 令牌高），纸上换成描边胶囊。

另外：讲滚动行为的批注挂 `.screen-only`（纸上没有滚动）；外链项目卡把地址印在卡片底部（`attr()` 取的是伪元素**宿主自己**的属性，所以规则必须挂在带 `href` 的 `.work-card` 上，挂在 `h3` 上只会印出空串）。

## 8. 验证：改完必须跑

需要本机 Chrome（脚本自己起 headless 实例）。

```bash
# 简历页：18 条视觉/对齐 + 2 条 A4 打印 + 6 条门禁与版本
node .verify/about-shot.mjs
BASE=https://hy-998.github.io/HYWeb/ node .verify/about-shot.mjs   # 同一套断言跑线上
ONLY=contact node .verify/about-shot.mjs                           # 只跑名字里含 contact 的视觉用例
                                                                  # （可选值见文件顶部 CASES：hero/timeline/works/skills/shotbox/contact/qr）

# 全站首访链路：44 条（需要另起一个静态服务器 + 一个 CDP Chrome，用法见文件头注释）
node .verify/intro-firstvisit-regression.mjs 9333 http://127.0.0.1:8899/
```

- 产物：`.verify/about-*.png`（截图基线，**已入库**）与 `.verify/about-report.json`（未跟踪）。
  跑一次脚本就会重画基线，提交前确认这些改动是有意的。
- 断言与部署子路径无关，本地 `file://`、本地 HTTP、线上 `/HYWeb/` 三种 base 都跑得通。
- 两个脚本都靠 CDP 驱动 headless Chrome，**Chrome 路径写死在文件顶部 `CHROME` 常量**（Windows 默认安装位），
  换机器/换系统要改这一行。`about-shot.mjs` 自己起实例；regression 那条要你自己先开
  `chrome --headless=new --remote-debugging-port=9333 --user-data-dir=<临时目录> about:blank`。
- 目前基线：本地 26/26、线上 26/26、首访回归本地与线上各 44/44。

## 9. 仓库里的其他目录

| 目录 | 是什么 |
| --- | --- |
| `posts/*.md` | 5 篇文章的 Markdown 源（frontmatter 是唯一元信息来源）。转成 `post-*.html` 目前是**手动**的，没有生成脚本 |
| `octopus/` | 独立设计小品「Glass Octopus」，一套骨架六种印刷方式。`file://` 直接打开，与博客无关 |
| `sonnet-5-5/` | 独立复刻作业：claude.dev 一篇文章的像素级复刻，含原站真实资源 |
| `scripts/` | 上面那个复刻用的抓取/比对/校验脚本（`clone-claudedev-*.mjs`），不参与站点运行 |
| `.verify/` | 验证脚本与截图基线；其中 `.verify/claudedev/` 是复刻过程的中间产物，**未跟踪** |

## 10. 还没填的真实信息

`about.html` 里搜 `⚠️占位` 有 8 处，是简历的待办：简介文案、数字口径、4 段经历内容、
经历缩略图、项目卡简介、能力矩阵自评，以及**邮箱 / 手机号 / 微信号是假的，二维码是生成的占位图**
（`assets/img/wechat-qr.svg`，拿到真图直接覆盖）。这些要本人给，别猜着填。

## 11. 已知的文档不一致

`DESIGN.md` 两处引用 `ref-yaolifeng-shorts/`（第 108 行的 `cards.json`、第 280 行的"生成脚本与数据"），
**这个目录在仓库里不存在**，也不在它的父目录。原站快照与卡片数据不随仓库分发，需要时重新从 <https://yaolifeng.com/shorts> 取。

## 12. 提交约定

- Commit message 用中文 conventional commits（`feat:` / `fix:` / `test:` / `chore:`），
  标题一句"改了什么"，正文写"为什么"和踩到的坑。参考 `git log`。
- **不要 `git add -A`**：`.verify/claudedev/`、`.mnemon/` 等未跟踪目录会被一起塞进来。按路径点名 add。
- 只推 `main`，不 force push。
