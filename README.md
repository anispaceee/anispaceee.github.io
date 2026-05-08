# ✦ ACG Community - 二次元社区平台

一个功能完整、界面精美的二次元社区网站，融合 bgm.tv 的简洁专业风格与 bilibili 的活泼视觉元素。

## 🚀 技术栈

- **前端框架**: React 19 + Vite 8
- **路由**: React Router DOM v7
- **图标**: Lucide React
- **数据持久化**: localStorage (模拟后端)
- **API集成**: Bangumi 官方 API

## 📦 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

## 🏗️ 项目结构

```
src/
├── components/
│   ├── Layout/           # 头部导航 + 布局容器
│   ├── WorldChannel/     # 世界频道模块
│   ├── Forum/            # 交流区 + 帖子详情
│   ├── Info/             # 资讯区 + 资讯详情（含Bangumi API）
│   ├── Creation/         # 创作区 + 作品详情
│   ├── Profile/          # 用户个人中心
│   └── Common/           # 公共组件（认证模态框等）
├── context/              # 全局状态管理（AppContext）
├── services/             # 服务层
│   ├── api.js            # 认证、用户、Bangumi、评分、收藏、通知服务
│   └── storage.js        # localStorage 封装
├── data/                 # Mock 数据
├── pages/                # 页面组件（首页）
├── App.jsx               # 路由配置
└── main.jsx              # 入口文件
```

## 🎯 功能模块

### 1. 🌍 世界频道
- 公共内容发布，支持所有用户浏览和发言
- **三级接收设置**: 全部消息 / 仅官方 / 屏蔽频道
- **排序选项**: 最新 / 最热
- **互动功能**: 点赞 ❤️、评论 💬、转发 🔄、举报 🚩
- 实时评论展开/收起

### 2. 💬 交流区（论坛系统）
- **四个分区**: 游戏 🎮 / 动画 🎬 / 小说 📖 / 吹水 🌊
- 发帖功能（含分类、标题、内容、标签）
- **搜索功能**: 按帖子内容或用户名搜索
- **排序**: 最新 / 最热 / 回复最多
- 帖子详情页支持回复功能
- 参考 Bangumi "超展开"小组的交互逻辑

### 3. 📰 资讯区
- **Bangumi API 集成**: 实时搜索动画、小说、游戏
- **随机推荐**: 一键随机推荐作品
- **🏷️ 标签筛选**: 多标签组合过滤
- **⭐ 评分系统**: 1-10分评分，支持用户个人评分
- **💬 评论系统**: 对作品发表评论
- **🔖 收藏功能**: 收藏喜欢的作品
- **🔗 Bangumi跳转**: 直接跳转到Bangumi查看详情
- 详情页展示完整信息（评分、标签、简介、评论）

### 4. 🎨 创作区
- **三个分区**: 绘画 🖌️ / 小说 📖 / 游戏 🎮
- **作品发布**: 支持图片上传、文字描述、标签分类
- **约稿功能**:
  - 约稿类型、价格范围、剩余名额、预计工期
  - "申请约稿"按钮
  - 参考"米画师"平台的展示方式
- **筛选**: 全部作品 / 作品展示 / 约稿

### 5. 👤 用户系统
- **注册/登录**: 完整的认证流程，表单验证
- **第三方登录**: QQ、微信入口
- **个人中心**: 个人资料编辑、头像、签名、简介
- **关注系统**: 关注/取消关注
- **数据统计**: 帖子数、关注数、粉丝数

### 6. 🔔 通知系统
- 多类型通知：评论回复、@提醒、点赞通知、系统公告
- 未读通知红点提示

## 🎨 UI 设计

### 色彩系统
| 变量 | 值 | 用途 |
|------|------|------|
| `--primary` | `#fb7299` | 主色（B站粉） |
| `--secondary` | `#00a1d6` | 辅助色（B站蓝） |
| `--tag-anime` | `#fb7299` | 动画标签 |
| `--tag-novel` | `#9b59b6` | 小说标签 |
| `--tag-game` | `#00a1d6` | 游戏标签 |
| `--tag-chat` | `#2ecc71` | 吹水标签 |
| `--tag-art` | `#ff9f43` | 绘画标签 |

### 设计特点
- 渐变色按钮和徽章
- 毛玻璃效果头部导航
- 浮动光球首页动画
- 卡片悬浮阴影和缩放效果
- 统一的圆角和间距规范
- 响应式设计适配桌面端与移动端

## 🔧 服务层 API

### AuthService
- `register(data)` - 用户注册
- `login(identifier, password)` - 用户登录
- `logout()` - 退出登录
- `getCurrentUser()` - 获取当前用户
- `updateProfile(userId, updates)` - 更新资料

### BangumiService
- `searchSubjects(keyword, type)` - 搜索番剧
- `getSubject(id)` - 获取条目信息
- `getSubjectDetail(id)` - 获取条目详情
- `getCalendar()` - 获取番剧日历
- `buildBangumiUrl(id)` - 构建Bangumi链接

### RatingService
- `addRating(userId, subjectId, type, score, content)` - 添加评分
- `getRatings(subjectId)` - 获取评分列表
- `getAverageScore(subjectId)` - 获取平均分
- `getUserRating(userId, subjectId)` - 获取用户评分

### FavoriteService / LikeService / NotificationService
- 收藏、点赞、通知的完整CRUD操作

## 🔐 安全机制

- 密码哈希存储（模拟bcrypt）
- 表单输入验证（邮箱格式、密码强度、用户名唯一性）
- 登录状态持久化（token机制）
- 敏感操作需登录验证
- XSS防护（React自动转义）

## 📱 响应式断点

- **桌面端**: > 768px
- **移动端**: ≤ 768px
- **小屏**: ≤ 480px

## 📄 License

MIT
