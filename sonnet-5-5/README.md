# sonnet-5-5 — claude.dev 文章页 1:1 复刻

复刻对象：<https://claude.dev/blog/building-with-claude-sonnet-5-5/>

打开方式：**双击 `index.html` 即可**，不需要起服务器（`file://` 下已验证字体、图
片、Lottie logo、脚本全部正常）。

---

## 一、这是什么

一个**静态单页**：claude.dev 那篇文章的像素级复刻，外观和交互都按原站复刻。

和「照着截图手抄一份 CSS」不同，这里的样式、字体、图片、动画都是**原站的真实文
件**，只把路径改成了本地相对路径。所以：

| 项目 | 来源 |
|---|---|
| `index.html` | 原站服务端渲染后的 DOM（去掉 Next.js 运行时） |
| `assets/css/site.css` | 原站那 4 个样式表 + 水合时内联的样式，**逐字节保留** |
| `assets/fonts/*.woff2` | 原站的 Anthropic Sans / Mono 可变字体 |
| `assets/img/`、`assets/media/` | 原站的 logo、favicon、海报图、演示视频 |
| `assets/data/clawd-anim.js` | 原站 logo 的 Lottie 动画数据 |
| `assets/vendor/lottie_canvas.min.js` | 原站用的 Lottie canvas 播放器 |
| `assets/vendor/scene-chunk.js` | 原站页脚场景（星空点阵 + 宇航员 Clawd）的**原始代码** |
| `assets/vendor/perch-chunk.js` | 原站「Related posts」小机器人的**原始代码** |
| `assets/vendor/scene-loader.js` | 给上面两段原始代码补上模块机制的小加载器 |
| `assets/vendor/sprite-loader.js` | 让动画按本地数据加载，不依赖服务器 |
| `assets/data/sprites.js` | 10 个 Clawd 动作动画的数据（1.4 MB） |
| `assets/data/posts.js` | 文章列表，取自原站页面自带的 JSON 数据 |
| `clone.js` | **唯一手写的文件**：复刻原站的 JavaScript 行为 |

## 一之二、四块容易漏掉的东西

这四块原站都是**运行时才生成**的，截图和「复制 CSS」都拿不到：

**侧栏目录的层级展开。** 原站 `<aside>` 里自带 7 条一级目录，但页面跑起来后有
19 条 —— 多了 12 条 `h3` 二级目录，分成 3 个可折叠组，读到哪一节就展开哪一组。同
时侧栏顶部会出现文章标题（滚动过 hero 后淡入，文字始终不变）。复刻做法：整棵树从
运行时页面取出来后拼进 HTML，展开逻辑按实测的 7 个滚动状态还原。

**页脚场景。** 底部那片点阵星空 + 戴太空头盔的橙色 Clawd，是一段独立的懒加载代
码：噪声点阵背景（含月亮和云）、宇航员精灵、按滚动进度启动。

**「Related posts」上那只小机器人。** 它从右侧走进来、停在标题栏上，走的过程中还
会播一个动作动画，离开视口就被移除。它住在 `.more-sec` 里（不在页脚）。

**这两只机器人播的动画。** 它们不把动画写死在页面里，而是按 URL 去取 10 个
Clawd 动作的 Lottie 数据 —— 其中有些今天已经取不到了。

后三块的复刻做法都一样：**把原站那段代码整段搬过来，用一个几十行的加载器补上它
需要的模块机制**，让原始算法原样运行 —— 而不是照着重写一份近似物。动画则预先嵌
进页面，加载器把「按 URL 取动画」换成「按 URL 查本地数据」，其余调用方式完全不变。

---

## 二、复刻了哪些交互

`clone.js` 里每一项都是从原站**实测出来的**，不是猜的：

| 行为 | 实测依据 |
|---|---|
| 顶部进度条：固定 1px，宽度 = 滚动百分比 | 采样 7 个滚动位置 |
| 左侧 `▓░` 进度条：28 格 + `NN%` | 逐格比对；`▓` 数量由百分比推出 |
| 目录树：读到哪一节展开哪一组二级目录，同时只开一组 | 7 个滚动状态逐一比对，全部一致 |
| 目录树层级：3 组、12 条二级目录、共 19 条 | 与运行时页面逐条对齐 |
| 侧栏标题：滚过 hero 后淡入，文字不变 | 二分定位到 scrollY=254（1440×900） |
| 点击一级目录：展开该组并保持展开 | 实测滚动过程中不会被收起 |
| ↑/↓ 键：±340px | 实测一次 ArrowDown 位移 340px |
| ⌘K / Ctrl-K 打开 finder 面板，Esc 关闭 | 实测 class 与 display |
| 面板搜索：按标题过滤，↑↓ 选择，↵ 打开 | 实测输入 "opus" 命中 2 条 |
| 分类标签：每个分类显示该分类全部文章 | 实测 5 个标签的行数 |
| LOAD MORE：先 5 行，点击后展开全部 11 行 | 实测两次点击的递进 |
| 视频：点击 PLAY 切换到动画，Pause/Play 切换 | 实测 `data-anim-chosen` 与按钮文案 |
| 代码块 Copy：写入剪贴板后用 `#toast` 反馈 | 实测 toast 文案与 class |
| 导航折叠：≤1000px 收起成汉堡菜单 | 16 个宽度实测出阈值 |
| 移动端分类标签溢出成 `···` 菜单 | 实测 390px 下 4 个可见 + 1 个隐藏 |
| logo：Lottie 动画画在 canvas 上，第 0 帧静止 | 实测 1667 个不透明像素 |
| 页脚场景：星空点阵 + 宇航员，进入 25% 后启动并淡入 | 实测像素数、位置、启停时机 |
| Related posts 小机器人：位置、尺寸、6 个精灵、走动 | 与原站逐值比对，全部一致 |

有两处**行为差异**是有意保留的，因为原站本身如此：
- 面板里的 12 篇文章按数据顺序显示（原站也是这样，和下面的信息流顺序不同）。
- 相关文章列表按「日期倒序，前 5 条用页面自己的顺序打破同日并列」——这是实测出
  来的规则：`spending-your-effort` 在信息流里排在 `what-a-task-costs` 前面，但
  在数据数组里是反的。

---

## 三、怎么重新生成

复刻产物可以完全从原站重新生成，步骤在 `../scripts/`：

```bash
# 1. 抓原站（冻结 DOM + 截图 + 计算样式）——生成 .verify/claudedev/orig 下的输入
node .verify/claudedev/capture.mjs "https://claude.dev/blog/building-with-claude-sonnet-5-5/" \
     .verify/claudedev/orig 1440 ref1440

# 2. 采集原站行为（只跑一次，结果存进 rep/behavior*.json 供人工核对）
node .verify/claudedev/behavior.mjs
node .verify/claudedev/behavior2.mjs

# 3. 生成产物
node .verify/claudedev/extract-roster.mjs     # 文章列表 -> rep/roster.json
node scripts/clone-claudedev-data.mjs         # -> assets/data/posts.js
node scripts/clone-claudedev-article.mjs      # -> index.html + assets/
```

---

## 四、怎么验收

两套独立验证，都会打印结果：

```bash
node scripts/clone-claudedev-verify.mjs      # 外观：逐元素样式 + 逐像素比对
node scripts/clone-claudedev-behaviour.mjs   # 交互：21 项行为断言
```

外观比对的做法：用同一个无头 Chrome，把原站和复刻版都冻结到同一状态（停掉动画、
清掉滚动/水合留下的临时状态、视频都停在第一帧），然后逐元素比**计算样式和几何位
置**，再整页逐像素比。

最近一次结果：

```
宽度 1440：元素 625 / 625 全部对齐，样式差异 0 组，几何差异 0 个
           像素差异 16196px / 1896 万 px = 0.085%
宽度  390：元素 596 / 596 全部对齐，样式差异 0 组，几何差异 0 个
           像素差异  9517px /  656 万 px = 0.145%
交互：33 / 33 通过
```

剩下的像素差异**全部集中在会动的部分**：页脚场景（约 y 12630–13000）里星空点阵在
持续漂移、宇航员在做动作，所以两张截图拍到的不是同一瞬间。这是「会动的部分本来就
对不齐」，不是布局或样式问题 —— 样式差异 0 组、几何差异 0 个已经证明了这一点。

> 注：比对脚本不再用 `captureBeyondViewport` 配合「把视口设成整页高度」的写法。
> 那种写法会让 Chrome 把整页**缩放**输出（实测缩放到 1.71 倍），于是两边只要
> 页高差一点就会出现几万个像素的假差异。现在截图时不动视口。

---

## 五、文件清单

```
sonnet-5-5/
├── index.html                        页面（44 KB）
├── clone.js                          交互复刻（唯一手写文件）
└── assets/
    ├── css/site.css                  原站样式（96 KB，逐字节）
    ├── fonts/                        4 个 woff2 可变字体
    ├── img/                          logo、favicon、Anthropic logo、视频海报
    ├── media/demo.mp4                演示视频（4.2 MB）
    ├── data/posts.js                 文章列表
    ├── data/clawd-anim.js            logo 的 Lottie 动画数据
    ├── data/sprites.js               10 个 Clawd 动作动画（1.4 MB）
    └── vendor/
        ├── lottie_canvas.min.js      Lottie 播放器（原站同款）
        ├── scene-chunk.js            页脚场景的原站代码（186 KB）
        ├── perch-chunk.js            小机器人的原站代码（37 KB）
        ├── scene-loader.js           模块加载器（5 KB）
        └── sprite-loader.js          动画本地化（3 KB）
```

体积主要在两处：`assets/media/demo.mp4`（4.2 MB）和 `assets/data/sprites.js`
（1.4 MB）。只想要静态页面的话，删掉视频的 `src` 和 `sprites.js` 即可 —— 少了动画
数据，两只机器人会退化成静态姿势（加载器有兜底），其余部分不受影响。
