# Hikarinagi.org UI 设计技术分析报告

> 分析日期：2026-05-08  
> 目标网站：https://www.hikarinagi.org/  
> 项目参考文件：`src/styles/hikari-styles.css`

---

## 一、条目封面悬停交互效果

### 1.1 交互效果概述

当用户将光标悬停到条目封面上时，封面图轻微放大，同时叠加层从透明变为可见，标题文字从下方滑入并透明化显示。

### 1.2 技术实现方案

#### CSS 代码实现

```css
/* 封面容器 */
.hikari-card-cover-wrap {
  position: relative;
  overflow: hidden;
  aspect-ratio: 3/4;          /* 3:4纵向封面比例 */
}

/* 封面图片 - 悬停时放大 */
.hikari-card-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
.hikari-card:hover .hikari-card-cover {
  transform: scale(1.05);      /* 放大5% */
}

/* 叠加层 - 从透明到半透明 */
.hikari-card-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0) 0%,       /* 顶部透明 */
    rgba(0, 0, 0, 0.1) 30%,    /* 中部微暗 */
    rgba(0, 0, 0, 0.6) 100%    /* 底部深暗 */
  );
  opacity: 0;                   /* 默认完全透明 */
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 16px;
}
.hikari-card:hover .hikari-card-overlay {
  opacity: 1;                   /* 悬停时完全显示 */
}

/* 标题文字 - 从下方滑入 */
.hikari-card-title {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  line-height: 1.4;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
  transform: translateY(10px);  /* 默认下移10px */
  opacity: 0;                   /* 默认透明 */
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) 0.1s;  /* 0.1s延迟 */
}
.hikari-card:hover .hikari-card-title {
  transform: translateY(0);     /* 回到原位 */
  opacity: 1;                   /* 完全显示 */
}

/* 元数据 - 同样滑入但延迟更久 */
.hikari-card-meta {
  transform: translateY(10px);
  opacity: 0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) 0.15s;  /* 0.15s延迟 */
}
.hikari-card:hover .hikari-card-meta {
  transform: translateY(0);
  opacity: 1;
}
```

### 1.3 精确参数表

| 参数 | 值 | 说明 |
|------|------|------|
| 封面放大比例 | `scale(1.05)` | 5%放大 |
| 封面放大过渡时长 | `0.4s` | 400毫秒 |
| 封面放大缓动函数 | `cubic-bezier(0.4, 0, 0.2, 1)` | Material Design标准缓动 |
| 叠加层初始透明度 | `0` | 完全透明 |
| 叠加层悬停透明度 | `1` | 完全显示 |
| 叠加层过渡时长 | `0.3s` | 300毫秒 |
| 渐变遮罩色值 | `rgba(0,0,0,0) → rgba(0,0,0,0.1) → rgba(0,0,0,0.6)` | 三段式渐变 |
| 标题初始位移 | `translateY(10px)` | 向下10px |
| 标题悬停位移 | `translateY(0)` | 原位 |
| 标题过渡时长 | `0.3s` | 300毫秒 |
| 标题过渡延迟 | `0.1s` | 100毫秒延迟 |
| 元数据过渡延迟 | `0.15s` | 150毫秒延迟 |
| 文字阴影 | `0 2px 4px rgba(0,0,0,0.5)` | 黑色50%透明度2px偏移4px模糊 |
| 整体卡片悬停位移 | `translateY(-4px)` | 上移4px |
| 整体卡片悬停阴影 | `0 8px 24px rgba(0,0,0,0.12)` | 12%透明度阴影 |
| 触发方式 | CSS `:hover` 伪类 | 纯CSS，无需JS |

### 1.4 浏览器兼容性

- `transform`: 所有现代浏览器支持，IE9+（需`-ms-`前缀）
- `cubic-bezier`: 所有现代浏览器支持，IE9+
- `transition`: 所有现代浏览器支持，IE10+
- `aspect-ratio`: Chrome 88+, Firefox 89+, Safari 15+（旧版需用padding-top hack）
- 移动端适配：触摸设备不支持hover，建议使用 `@media (hover: hover)` 限定

---

## 二、详情页背景图处理

### 2.1 视觉效果概述

详情页使用游戏/作品大图作为全屏背景，通过虚化(Blur)和暗处理(Darken)使背景不干扰前景内容，同时保留氛围感。

### 2.2 技术实现方案

#### CSS 代码实现

```css
/* 背景层 - 全屏虚化暗化 */
.detail-page-bg-hikari {
  position: fixed;               /* 固定定位覆盖全屏 */
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-size: cover;       /* 铺满容器 */
  background-position: center;  /* 居中 */
  background-repeat: no-repeat;
  z-index: -2;                  /* 位于所有内容之下 */
  filter: blur(20px) brightness(0.4);   /* 20px虚化 + 60%暗处理 */
  transform: scale(1.1);       /* 放大10%防止虚化白边 */
}

/* 背景上的渐变遮罩层 */
.detail-page-bg-hikari::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0.7) 0%,     /* 顶部70%黑 */
    rgba(0, 0, 0, 0.5) 50%,    /* 中部50%黑 */
    rgba(0, 0, 0, 0.8) 100%    /* 底部80%黑 */
  );
  z-index: 1;                    /* 位于背景图之上 */
}

/* 前景内容容器 */
.detail-container-hikari {
  position: relative;
  z-index: 1;                    /* 位于遮罩之上 */
  background: rgba(0, 0, 0, 0.6);  /* 60%透明黑色背景 */
  backdrop-filter: blur(10px);  /* 毛玻璃效果 */
  border-radius: var(--radius-lg);
  border: 1px solid rgba(255, 255, 255, 0.1);  /* 微弱白色边框 */
}
```

### 2.3 精确参数表

| 参数 | 值 | 说明 |
|------|------|------|
| 虚化值 | `blur(20px)` | 20像素高斯模糊 |
| 暗处理方式 | `brightness(0.4)` | 亮度降至40% |
| 背景放大比例 | `scale(1.1)` | 10%放大，防止白边 |
| 渐变遮罩顶部色值 | `rgba(0,0,0,0.7)` | 黑色70%透明度 |
| 渐变遮罩中部色值 | `rgba(0,0,0,0.5)` | 黑色50%透明度 |
| 渐变遮罩底部色值 | `rgba(0,0,0,0.8)` | 黑色80%透明度 |
| 内容容器背景 | `rgba(0,0,0,0.6)` | 黑色60%透明度 |
| 内容容器毛玻璃 | `blur(10px)` | 10像素模糊 |
| 内容容器边框 | `rgba(255,255,255,0.1)` | 白色10%透明度 |
| 背景定位方式 | `fixed` | 固定定位，不随页面滚动 |
| 背景尺寸 | `cover` | 铺满全屏 |
| Z-index层级 | 背景: -2, 遮罩: 1, 内容: 1 | 三层结构 |

### 2.4 响应式适配策略

- **背景图尺寸**：使用 `background-size: cover` + `background-position: center` 自动适配
- **移动端优化**：可考虑降低虚化值(`blur(12px)`)以提升性能
- **性能优化**：`filter: blur()` 在移动端可能导致性能问题，建议使用 `will-change: filter` 或在低端设备上降低虚化值
- **图片格式**：建议使用WebP格式，带宽节省30%+
- **缩放处理**：`transform: scale(1.1)` 确保虚化边缘不会露出白边

### 2.5 浏览器兼容性

- `filter: blur()`: 所有现代浏览器，IE不支持
- `backdrop-filter`: Safari 9+（需`-webkit-`前缀），Chrome 76+，Firefox 103+
- `::after` 伪元素: 所有浏览器支持

---

## 三、资讯区布局设计

### 3.1 设计理念

资讯区采用**帖子卡片式设计**替代常规条目列表，每个资讯项以"封面图+标题+摘要+元信息"的卡片形式呈现，而非简单的文字列表。

### 3.2 HTML 结构实现

```html
<!-- 资讯卡片 -->
<article class="hikari-news-post">
  <img class="hikari-news-cover" src="cover.jpg" alt="..." />
  <div class="hikari-news-content">
    <span class="hikari-news-category">动画</span>
    <h3 class="hikari-news-title">2026年4月新番导视</h3>
    <p class="hikari-news-excerpt">本季新番精彩纷呈...</p>
    <div class="hikari-news-meta">
      <span class="hikari-news-date">
        <Calendar size={12} /> 2026-04-01
      </span>
      <span class="hikari-news-source">Bangumi</span>
    </div>
  </div>
</article>
```

### 3.3 CSS 样式规则

```css
.hikari-news-post {
  position: relative;
  background: var(--bg-card);
  border-radius: var(--radius-lg);    /* 大圆角 */
  overflow: hidden;
  border: 1px solid var(--border-secondary);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.hikari-news-post:hover {
  border-color: var(--primary);
  transform: translateY(-2px);       /* 轻微上浮 */
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
}

/* 封面 - 16:9比例，悬停轻微放大 */
.hikari-news-cover {
  width: 100%;
  aspect-ratio: 16/9;
  object-fit: cover;
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
.hikari-news-post:hover .hikari-news-cover {
  transform: scale(1.02);             /* 2%放大 */
}

/* 内容区 */
.hikari-news-content {
  padding: 16px 20px;
}

/* 分类标签 - 胶囊形 */
.hikari-news-category {
  display: inline-block;
  padding: 4px 10px;
  background: var(--primary-bg);
  color: var(--primary);
  border-radius: var(--radius-full);  /* 完全圆角 */
  font-size: 11px;
  font-weight: 700;
  margin-bottom: 10px;
}

/* 标题 */
.hikari-news-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.5;
  margin-bottom: 8px;
  transition: color 0.2s ease;
}
.hikari-news-title:hover {
  color: var(--primary);
}

/* 摘要 - 3行截断 */
.hikari-news-excerpt {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 12px;
}

/* 元信息 */
.hikari-news-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-quaternary);
}
.hikari-news-source {
  padding: 4px 8px;
  background: var(--bg-input);
  border-radius: var(--radius-xs);
}
```

### 3.4 精确参数表

| 参数 | 值 | 说明 |
|------|------|------|
| 卡片圆角 | `var(--radius-lg)` | 约12px大圆角 |
| 封面宽高比 | `16/9` | 标准视频比例 |
| 封面悬停放大 | `scale(1.02)` | 2%轻微放大 |
| 封面放大过渡 | `0.4s cubic-bezier(0.4, 0, 0.2, 1)` | 400ms |
| 卡片悬停上浮 | `translateY(-2px)` | 上移2px |
| 卡片悬停阴影 | `0 4px 16px rgba(0,0,0,0.08)` | 8%透明度 |
| 分类标签圆角 | `var(--radius-full)` | 完全圆角胶囊形 |
| 标题字号 | `16px` | 中等标题 |
| 摘要截断行数 | `3行` | `-webkit-line-clamp: 3` |
| 摘要字号 | `13px` | 正文尺寸 |
| 内容区间距 | `16px 20px` | 上下16px，左右20px |

### 3.5 设计优势分析

1. **视觉层次丰富**：封面图+分类标签+标题+摘要+元信息五层结构，比纯文字列表信息密度更高
2. **交互反馈明确**：悬停时卡片上浮、封面微放大、标题变色，三重反馈让用户感知可点击
3. **信息优先级清晰**：封面图→分类标签→标题→摘要→元信息，符合F型阅读模式
4. **移动端友好**：16:9比例封面在小屏幕上不占过多空间，3行摘要避免过长
5. **与条目区分**：采用帖子形式而非条目列表，明确区分"资讯"（文章）与"条目"（作品数据）的概念

### 3.6 资讯与条目概念区分

| 维度 | 资讯 (News/Article) | 条目 (Entry/Subject) |
|------|------|------|
| 定义 | 二次元业界动态、新作发售、新番导视等**文章内容** | 动画、小说、游戏等**作品数据记录** |
| 数据特征 | 时间敏感、一次性阅读、文本为主 | 持久性数据、评分体系、封面为主 |
| 展示形式 | 帖子卡片（封面+标题+摘要） | 封面网格（3:4比例封面+名称+评分） |
| 更新频率 | 高频（日更/周更） | 低频（作品信息相对固定） |
| 用户行为 | 阅读→了解 | 标记→评分→收藏 |

---

## 四、项目中的应用参考

本项目 `src/styles/hikari-styles.css` 已实现上述设计规范，关键组件：

- **条目卡片**：`.hikari-card` 系列类 — 封面3:4比例、悬停放大1.05、叠加层渐变遮罩
- **详情页背景**：`.detail-page-bg-hikari` — 20px虚化 + 0.4亮度 + 1.1缩放 + 三段渐变遮罩
- **资讯卡片**：`.hikari-news-post` 系列 — 16:9封面、胶囊标签、3行摘要截断

### 使用方法

在组件中引用对应的CSS类即可：

```jsx
// 条目卡片
<div className="hikari-card">
  <div className="hikari-card-cover-wrap">
    <img className="hikari-card-cover" src={cover} />
    <div className="hikari-card-overlay">
      <span className="hikari-card-title">{title}</span>
      <div className="hikari-card-meta">
        <span className="hikari-card-score">...</span>
        <span className="hikari-card-type">...</span>
      </div>
    </div>
  </div>
  <div className="hikari-card-info">...</div>
</div>

// 详情页背景
<div className="detail-page-bg-hikari" style={{ backgroundImage: `url(${bgImage})` }} />
<div className="detail-container-hikari">...</div>

// 资讯卡片
<article className="hikari-news-post">
  <img className="hikari-news-cover" src={cover} />
  <div className="hikari-news-content">
    <span className="hikari-news-category">{category}</span>
    <h3 className="hikari-news-title">{title}</h3>
    <p className="hikari-news-excerpt">{excerpt}</p>
    <div className="hikari-news-meta">...</div>
  </div>
</article>
```

---

*报告完成 — 所有技术参数均来自项目现有CSS实现及 hikarinagi.org 设计模式分析*
