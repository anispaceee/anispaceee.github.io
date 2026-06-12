# ANISpace 装饰功能增强设计

## 概述

参考 vns 项目（https://github.com/AdingApkgg/vns），为 ANISpace 添加三项装饰/交互功能：
1. 鼠标点击烟花效果
2. Live2D 看板娘换用 weblive2d
3. 音乐窗口最小化时的左下角迷你播放条

---

## 功能一：鼠标点击烟花效果

### 实现方式
使用 `mouse-firework` npm 包（与 vns 相同），从 npmmirror CDN 动态加载 UMD 脚本。

### 技术方案
- 在 `index.html` 中通过 `<script>` 标签加载 `mouse-firework` UMD 包
- 创建 `FireworkEffect.jsx` 组件，在 App 层级挂载，负责初始化 firework 配置
- 粒子配色与 ANISpace 粉色主题一致：粉白蓝绿色系
- 通过 localStorage 开关控制（`anispace_firework`），默认开启

### 粒子配置（参考 vns，适配 ANISpace 粉色主题）
```js
firework({
  excludeElements: [],
  particles: [
    {
      shape: "circle",
      move: ["emit"],
      easing: "easeOutExpo",
      colors: [
        "rgba(232,134,162,.9)",  // 粉色主色
        "rgba(255,182,185,.9)",  // 浅粉
        "rgba(250,227,217,.9)",  // 暖白
        "rgba(187,222,214,.9)",  // 薄荷绿
      ],
      number: 30,
      duration: [1200, 1800],
      shapeOptions: { radius: [16, 32] },
    },
    {
      shape: "circle",
      move: ["diffuse"],
      easing: "easeOutExpo",
      colors: ["#FFF"],
      number: 1,
      duration: [1200, 1800],
      shapeOptions: { radius: 20, alpha: 0.5, lineWidth: 6 },
    },
  ],
});
```

### 修改文件
- `index.html`：添加 mouse-firework CDN script
- 新建 `src/components/Common/FireworkEffect.jsx`：初始化组件
- `src/App.jsx`：挂载 FireworkEffect

---

## 功能二：Live2D 看板娘换用 weblive2d

### 当前实现
- 使用 `stevenjoezhang/live2d-widget` 的 `live2d.min.js`
- 8 个模型，手动配置 CDN URL
- 支持最小化/隐藏/切换模型

### 改为 weblive2d
- 使用 `weblive2d` 的 `autoload.js`（从 npmmirror CDN 加载）
- weblive2d 自动管理模型加载和交互，更稳定
- 保留现有的最小化/隐藏/切换功能，通过 weblive2d API 实现

### 技术方案
- 在 `index.html` 中加载 weblive2d autoload.js
- 重写 `Live2DWidget.jsx`：
  - 移除手动 `loadlive2d` 调用和 `loadCoreScript` 逻辑
  - weblive2d 的 autoload.js 会自动创建看板娘 DOM
  - 组件负责：开关控制（localStorage `anispace_live2d`）、模型切换（weblive2d API）
  - 保留最小化按钮（隐藏 weblive2d DOM）和恢复按钮

### weblive2d 配置
```js
// weblive2d autoload.js 会读取 window.live2d_settings
window.live2d_settings = {
  modelAPI: 'https://live2d.fghrsh.net/api/',
  tipsMessage: '欢迎使用 ANISpace',
  modelId: 1,
  modelTexturesId: 53,
};
```

### 修改文件
- `index.html`：添加 weblive2d CDN script
- `src/components/Common/Live2DWidget.jsx`：重写为 weblive2d 集成
- `src/components/Common/Live2DWidget.css`：适配新 DOM 结构

---

## 功能三：左下角迷你播放条

### 当前问题
音乐窗口最小化后，只能通过 DockBar 的音乐面板控制，没有可见的播放状态指示。

### 设计方案
音乐窗口最小化（但未关闭）时，在屏幕左下角显示迷你播放条：
- 左侧：专辑封面（36x36，圆角）
- 中间：歌曲名 + 歌手名（单行截断）
- 右侧：上一首/播放暂停/下一首 按钮
- 点击迷你条可恢复音乐窗口
- 固定在左下角，z-index 高于 DockBar

### 技术方案
- 创建 `MiniPlayer.jsx` + `MiniPlayer.css`
- 从 `WindowManager` 读取 `windows.music` 状态
- 从 `AppContext` 或共享状态读取当前播放信息（currentSong, playing）
- 需要将 MusicPlayer 的播放状态提升到共享层（Context 或全局事件）

**关键改动：音乐播放状态共享**
当前 MusicPlayer 的播放状态（currentSong, playing, playlist 等）全部是组件内部 state。迷你播放器需要访问这些状态。

方案：创建 `MusicContext`，将播放状态提升到 Context 层：
- `MusicProvider` 包裹 App，管理 audio 元素和播放状态
- `MusicPlayer` 改为消费 Context
- `MiniPlayer` 消费同一 Context
- `DockBar` 的音乐面板也消费同一 Context

### 迷你播放条样式
```
┌─────────────────────────────────────────────┐
│ 🎵 封面 │ 歌曲名 - 歌手    │ ⏮ ▶ ⏭ │
└─────────────────────────────────────────────┘
```
- 位置：fixed, bottom: 80px, left: 20px（在 DockBar 上方）
- 背景：毛玻璃效果，圆角胶囊形
- 宽度：auto，最大 320px
- hover 时轻微上浮 + 阴影增强

### 预导入歌单
与 vns 相同，预导入网易云歌单 ID `8464409595`：
- 在 MusicProvider 初始化时检查 localStorage
- 如果没有已保存歌单，自动导入该歌单作为默认歌单
- 用户可删除或替换

### 修改文件
- 新建 `src/context/MusicContext.jsx`：音乐播放状态共享
- 新建 `src/components/Music/MiniPlayer.jsx` + `MiniPlayer.css`
- 修改 `src/components/Music/MusicPlayer.jsx`：改为消费 MusicContext
- 修改 `src/App.jsx`：添加 MusicProvider，挂载 MiniPlayer
- 修改 `src/components/Layout/DockBar.jsx`：从 MusicContext 读取状态

---

## 实施优先级

1. **P0 - 烟花效果**：最简单，独立性强，不影响现有功能
2. **P1 - 迷你播放条**：需要重构音乐状态管理，影响面较大
3. **P2 - Live2D 换用 weblive2d**：需要验证 weblive2d 兼容性，风险较高
