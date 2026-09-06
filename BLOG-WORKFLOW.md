# 写博客工作流（yaolifeng-shorts-clone）

适用对象：当前这套静态 shorts 博客。每篇文章 = 一个 `post-<slug>.html`。
本文件只管「怎么写、怎么发」，不动代码。模板见 `POST-TEMPLATE.md`。

---

## 一、总览

一篇文章的诞生分三步：

```
写 Markdown（POST-TEMPLATE.md 副本）  →  转成 post-<slug>.html  →  挂进首页列表
        （你主要做这里）                    （手动/未来脚本）        （改 index.html）
```

`POST-TEMPLATE.md` 里的 **frontmatter 是所有元信息的唯一来源**，正文是干净 Markdown。
以后如果要上静态生成器（Astro/Hugo），这个 md 不用改就能直接吃。

---

## 二、写作流程（每篇照做）

1. **复制模板**：把 `POST-TEMPLATE.md` 复制成 `posts-draft/<slug>.md`（没有 `posts-draft/` 就新建，这是你的草稿箱，不进站点）。
2. **填 frontmatter**：标题、slug、日期、摘要、标签、配图路径、上下篇。slug 想好就别改。
3. **写正文**：从 `---` 下面开始，纯 Markdown。先列 2-4 个 `##` 小标题搭骨架，再填肉。
4. **放配图**：截图/配图存成 `assets/img/post-<slug>-N.svg`（见第三节），把路径填进 `images:`。
5. **自查**：过一遍文末「发布前检查清单」。

> 草稿箱 `posts-draft/` 不会被站点加载，放心往里丢。定稿后再走发布。

---

## 三、配图规范

| 项 | 规则 |
|---|---|
| 存放位置 | `assets/img/` |
| 命名 | `post-<slug>-1.svg`、`-2.svg`、`-3.svg`（用 slug 前缀避免和别的文章撞名） |
| 数量 | 列表卡片最多取**前 3 张**；详情页展示全部 |
| 格式 | 截图用 `.svg`（现有 shot-*.svg 都是矢量截图）；照片/位图用 `.png`/`.jpg` |
| 尺寸 | 宽度建议 1200px 左右，高度随内容；列表卡片会自动裁切，横图更稳 |
| alt 文本 | 每张图写 `alt="一句话说明这张图是什么"`，利于无障碍和 SEO |
| 懒加载 | HTML 里加 `loading="lazy"`（手动发布时记得带） |

示例（frontmatter 里）：
```yaml
images:
  - assets/img/post-awake-1.svg
  - assets/img/post-awake-2.svg
  - assets/img/post-awake-3.svg
```

---

## 四、发布到当前静态站（手动步骤）

当前站点没有构建脚本，发布 = 手工把 md 落进 HTML。两处要改：

### 4.1 新建 `post-<slug>.html`
做法：复制任意一篇现有文章（如 `post-awake.html`）→ 重命名为 `post-<slug>.html` → 按下面映射替换：

| HTML 位置 | 换成 frontmatter 的 |
|---|---|
| `<title>…</title>` | `title` |
| `<meta name="description" content="…">` | `description` |
| `post-meta` 里的作者 / `<time dateTime="…">` | `author` / `date`（转成 ISO：`2026-09-06` → `2026-09-06T09:00:00.000Z`）|
| `<h1 class="post-title">…</h1>` | `title` |
| `.ai-body` 文本 | `summary` |
| `.card-images` 里的 `<img>` | `images` 里的路径（最多 3 张）|
| `.markdown-body` 内容 | **Markdown 转成的 HTML**（见 4.3）|
| `.post-tags` 里的 `<span class="tag">` | `tags`（每项前加 `# `）|
| `.post-nav` 的 prev/next 链接 | `prev` / `next` 对应的 `post-<slug>.html` |

### 4.2 挂进首页 `index.html`
在文章列表区加一项（参考现有 `short-item`）：
```html
<a class="short-item has-images" href="post-<slug>.html">
  <div class="card-images">
    <img src="assets/img/post-<slug>-1.svg" alt="…" loading="lazy" />
    <img src="assets/img/post-<slug>-2.svg" alt="…" loading="lazy" />
    <img src="assets/img/post-<slug>-3.svg" alt="…" loading="lazy" />
  </div>
  <h3>文章标题</h3>
  <p class="short-excerpt">一句话摘要</p>
</a>
```
无图文章去掉 `has-images` 类和 `.card-images` 块即可。
**顺序**：列表顺序 = 上下篇顺序，新增文章决定插在哪篇之前/之后，并同步改相邻文章的 `prev`/`next`。

### 4.3 Markdown → HTML 正文
手动发布时把正文转成 HTML。可选：
- 任意在线/本地 Markdown 转 HTML 工具；
- 或以后跑构建脚本（本次未做，后续可加）。
记住保留现有正文用的标签：`<h2>`、`<p>`、`<blockquote><p>`、`<strong>`、`<code>`。

---

## 五、发布前检查清单

- [ ] slug 全站唯一、英文小写中划线
- [ ] `title` 同时作为 `<h1>` 和 `<title>`，读起来像人话
- [ ] `description` 一句话，不含换行
- [ ] `summary` 2-3 句，是「AI 摘要卡」内容
- [ ] `tags` 2-4 个，不过密
- [ ] 配图已放 `assets/img/`、命名正确、alt 已填
- [ ] `prev`/`next` 指向真实存在的 slug（首/末篇留空）
- [ ] 正文有 2+ 个 `##` 小标题
- [ ] 首页 `index.html` 已加 `short-item` 且顺序正确
- [ ] 相邻文章上下篇导航已互链
- [ ] 本地双击 `post-<slug>.html` 能正常打开、主题切换正常

---

## 六、Markdown 写法速查

```markdown
## 小标题
普通段落，一段一个意思。

> 引用块：金句 / 重点 / 他人的话

**加粗** 强调；`代码` 用于命令/文件名/字段。

1. 有序
2. 列表

- 无序
- 列表

---
分割线（收尾用，可选）
```

---

## 七、填好的示例（对照 post-awake）

```yaml
---
title: "醒来：一场对话是怎么开始的"
slug: "post-awake"
date: 2026-09-05
author: "弘1"
description: "弘1（Immerse）的技术片段库，收录 AI 工具、前端开发、独立开发笔记。"
summary: "以第一人称记录一场对话开始前 AI 的工作：读身份文件、翻项目日志、拼出上下文。"
tags: [随笔, AI 视角, 记忆]
images:
  - assets/img/post-awake-1.svg
  - assets/img/post-awake-2.svg
  - assets/img/post-awake-3.svg
prev: ""
next: "post-pixels"
theme: dark
---
```

---

## 八、以后想彻底甩掉手工 HTML？

这套 md 模板就是为迁移准备的。等文章多了、手工发布嫌烦，可以上一套静态生成器（Astro 最契合这种卡片列表 + 详情页结构），把 `posts-draft/*.md` 直接当内容源，frontmatter 字段几乎不用改。到时跟我说「落地改造」即可。
