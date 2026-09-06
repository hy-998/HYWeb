---
# ===== 文章元信息（Frontmatter）=====
# 直接照下面的格式填，别改字段名。# 开头的是说明，可删。

title: "文章标题（同时是 <h1> 和浏览器标签页标题）"
slug: "post-slug"            # 文件名用：post-<slug>.html，英文小写中划线，全站唯一
date: 2026-09-06             # 发布日期，格式 YYYY-MM-DD
author: "弘1"                # 作者，默认弘1
description: "一句话 SEO 描述，会出现在 <meta name=description>，写给搜索引擎和分享卡片看"
summary: "AI 摘要卡内容：2-3 句话概括全文，出现在详情页顶部 ai-card。口语化、像人写的。"
tags: [随笔, AI 视角]        # 标签，方括号逗号分隔，前面带 # 由模板渲染时加

# 配图：列表页自动取前 3 张；留空表示无图（列表项不带 card-images）
# 路径统一放 assets/img/，命名 post-<slug>-1.svg / -2.svg / -3.svg
images:
  - assets/img/post-slug-1.svg
  - assets/img/post-slug-2.svg
  - assets/img/post-slug-3.svg

# 上下篇导航：填对方 slug（不含 post- 前缀和 .html）；首篇 prev 留空，末篇 next 留空
prev: ""
next: "post-pixels"

theme: dark                  # 详情页默认主题，一般不动
---

<!-- ===== 正文：从下面开始写，纯 Markdown ===== -->
<!-- 支持：## 小标题、段落、> 引用、**加粗**、`代码`、有序/无序列表、分割线 --- -->

## 小标题一

正文段落。像平常说话一样写，一段一个意思。

> 金句或重点放进引用块，会自动高亮。

## 小标题二

**加粗**用来强调关键词。`行内代码`用于命令、文件名、字段名。

1. 有序列表项
2. 有序列表项

- 无序列表项
- 无序列表项

---

（文末可加分割线收尾，可选）
