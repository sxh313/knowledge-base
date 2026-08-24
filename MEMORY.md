# 知屿 UI 设计记忆

> 本文件是项目 UI 设计的长期记忆。后续新增页面、组件或样式时，先遵守这里的规则，再考虑局部创新。项目名称是「知屿」，视觉主题是“知识岛屿 / 海图 / 沉积层 / 灯塔”，但主题只通过结构、颜色和路径语义表达，不堆叠海浪、船只等装饰。

## 1. 产品气质

- 产品定位：本地优先的个人知识管理、AI 问答和学习训练工作台。
- 视觉关键词：安静、可靠、可追溯、柔和、有学习陪伴感。
- UI 叙事：左侧是知识航线，主区域是当前探索的岛屿，来源/计划/掌握度是辅助证据层。
- “航线”是签名元素：可用于导航分组、学习路径、训练进度、AI 引用编号和回跳关系。
- 不使用主题化插画填充空白；空态优先提供一个明确的下一步。

## 2. 颜色令牌

颜色必须优先使用 `src/styles/tokens.css` 中的 CSS 变量，不在组件内随意写新的品牌色。

### 浅色模式

```css
--color-bg: #eef4f3;
--color-surface: #fbfdfc;
--color-surface-hover: #f1f7f5;
--color-surface-2: #e8f0ee;
--color-border: #d4e1de;
--color-border-strong: #b8cbc6;
--color-text: #172b2d;
--color-text-secondary: #557073;
--color-text-tertiary: #819596;
--color-primary: #197b88;
--color-primary-hover: #126572;
--color-primary-light: #dff1ef;
--color-accent: #d98d42;
--color-accent-hover: #b96f2b;
--color-accent-light: #fff0dc;
--color-success: #2d936c;
--color-danger: #c65a56;
--color-info: #3677a4;
```

### 深色模式

```css
--color-bg: #101c20;
--color-surface: #1b2b2e;
--color-surface-hover: #22363a;
--color-surface-2: #203337;
--color-border: #355055;
--color-border-strong: #4b696d;
--color-text: #e5f1ef;
--color-text-secondary: #a6c0bf;
--color-text-tertiary: #769092;
--color-primary: #68c4c4;
--color-primary-hover: #8bd9d2;
--color-primary-light: #1e4549;
--color-accent: #e7a45d;
--color-success: #71d19f;
--color-danger: #ef8d82;
```

颜色语义：潮汐青用于路径、链接和主要行动；灯塔暖光只用于当前任务、提醒和完成反馈；成功、错误、信息状态必须同时提供文字或图标，不能只靠颜色区分。

## 3. 字体与文字

- 正文使用系统中文字体，避免远程字体依赖。
- 标题使用较强字重和紧凑字距，不使用夸张营销字体。
- 模型名、时间、快捷键、统计数字和代码使用 `font-mono` 或等宽数字。
- AI 回答正文保持舒适行距，引用、来源和状态信息使用较小字号。
- 文案从用户任务出发：使用“刷新模型”“测试连接”“打开原文”等动作词，不描述内部实现。
- 错误文案必须说明：发生了什么、影响什么、下一步做什么。

## 4. 圆角、阴影与层级

```css
--radius-sm: 6px;
--radius-md: 9px;
--radius-lg: 14px;
--radius-xl: 20px;
--duration-fast: 120ms;
--duration-normal: 180ms;
--duration-emphasis: 360ms;
```

使用规则：

- 普通按钮和输入框使用 `--radius-md`。
- 组合面板、选择块和弹窗内的小卡片使用 `--radius-lg`。
- 页面卡片使用 `--radius-xl`。
- 普通内容优先使用边框和间距分层，阴影主要用于浮层、弹窗、composer 和重要悬浮区域。
- 页面区域内最多嵌套一层同类卡片，禁止“卡片套卡片”堆叠。
- hover 默认改变背景、边框或阴影；只有可进入、可拖拽对象才允许轻微位移。

## 5. 基础组件规范

项目已有基础样式位于 `src/styles/globals.css`，优先复用：

- `.card`：统一背景、边框、圆角、内边距和轻阴影。
- `.btn-primary`：页面唯一或最重要的主行动。
- `.btn-secondary`：次级操作、测试、刷新、导入等。
- `.btn-ghost`：低频操作、关闭、更多和轻量操作。
- `.input-field`：输入框、下拉框、数字框和文本域统一使用。
- `.tag`：状态、标签和来源类型使用胶囊标签。
- `.inline-citation`：AI 正文引用编号，必须可点击并与来源预览联动。

组件要求：

- 所有控件继承主题 token，不直接写固定背景色。
- 所有 icon-only 按钮必须有 `aria-label`。
- 所有输入控件必须有可理解的 label 或 placeholder。
- disabled、loading、error、focus-visible 状态必须可见。
- 可点击控件使用项目已有的按下反馈，不要为每个控件单独发明动效。

## 6. 页面结构与导航

桌面端导航按用户路径分组：

```text
创作
  文档
  收集箱

智能
  知屿 AI
  面试训练营

成长
  学习目标
  统计

管理
  标签
  设置
```

导航原则：

- 文档是沉淀入口，收集箱是输入入口，AI 是探索入口，训练营是验证入口。
- 当前页面使用浅色背景、主色文字和明确位置指示，不只依靠颜色。
- 移动端底部只保留文档、收集箱、AI、训练营等高频入口，低频入口进入更多页或抽屉。
- 顶栏的同步、帮助、视图模式和番茄钟不能压过页面主任务。

## 7. 核心页面设计

### 文档与编辑器

- 文档首页优先展示最近编辑和继续编辑。
- 空库只突出“写第一篇文档”和“导入 Markdown”两个动作。
- 新建文档后直接进入编辑器并聚焦标题。
- 编辑器高频工具可见，表格、图片、callout、导出、查找替换等低频能力放入分组或“更多”。
- 自动保存状态靠近标题显示，必须区分保存中、已保存和保存失败。

### AI 页面

- AI 首屏必须让用户知道下一步：问笔记、练题或整理成文档。
- 输入区附近只保留必要设置，高级设置折叠或收进回答设置。
- 状态文案按“检索 / 整理 / 生成”表达进度。
- 必须提供停止生成、重试、保存回答、查看来源等恢复路径。
- AI 引用是产品特色：正文编号和来源卡片双向联动，点击可查看原文或预览。
- 联网搜索属于知识库不足时的补充，不应覆盖或伪装成本地知识。

### 模型与 API 设置

- API 地址、API Key、Model ID 只在“API 服务配置”维护一次。
- 角色绑定只显示 API 服务中已启用并勾选的模型。
- 不在角色绑定页面重复填写 Base URL、Model ID 或 API Key。
- 角色选择块使用柔和内嵌面板、统一圆角下拉框和清晰的空选项。
- 未配置模型时显示“不绑定（使用旧配置/自动降级）”及明确下一步。

### 学习目标、训练营与统计

学习路径应形成闭环：

```text
学习目标 → 今日任务 → 训练 / 写笔记 → 掌握度变化 → 统计复盘 → 调整目标
```

- 训练营首屏突出今日题目、完成度、剩余时间和继续训练。
- 完成题目后明确展示诊断、薄弱点和下一题。
- 统计页的薄弱主题必须能回跳到训练或文档。
- 目标页必须提供进入今日训练的路径，不能只是静态数据面板。

## 8. 状态、动效与可访问性

- 动效只服务于进入、进行中、完成、失败四类反馈。
- 默认时长使用 120ms / 180ms / 360ms；页面切换使用轻微淡入和小位移。
- 点击反馈使用压下感，不让所有按钮 hover 上浮。
- `prefers-reduced-motion: reduce` 时取消非必要动画。
- 空态必须包含原因、价值和下一步，且最多一个主 CTA。
- 错误状态必须提供重试、检查设置或恢复入口。
- modal、sheet、popover 支持 Esc 关闭、焦点进入、焦点回收和背景滚动锁定。
- 键盘可以完成搜索、打开文档、编辑、保存和关闭浮层。
- 状态不能只靠颜色表达，必须有文字、图标、形状或位置变化。

## 9. 移动端规则

- 以 390×844 为基础验收尺寸。
- 核心触控目标至少 44px。
- AI 历史、文档树和高级设置使用抽屉或 bottom sheet。
- composer 必须避让键盘、底部导航和 safe-area。
- 页面不能出现横向滚动；长标题、长回答、长列表必须自然换行或滚动。
- 抽屉和弹窗必须有明显关闭方式，并支持系统返回或 Esc 等价操作。

## 10. 禁止事项

- 不在核心导航或操作按钮中使用 emoji 代替统一图标。
- 不为每个区域添加独立颜色、圆角和阴影。
- 不让多个主按钮拥有相同视觉权重。
- 不把 API 配置、模型配置和角色绑定重复成多套表单。
- 不用颜色作为唯一状态表达。
- 不用长段落填充空态。
- 不让高级能力默认抢占主路径。
- 不在页面中嵌套大量卡片造成“卡片墙”。
- 不删除 focus-visible，不用无标签的图标按钮。
- 不为装饰性目的加入持续跳动、漂浮或大范围动画。

## 11. 修改前检查清单

每次新增或修改 UI 前确认：

1. 这个控件是否已经有可复用的基础组件或 token？
2. 它是不是重复配置了别处已经存在的信息？
3. 页面是否仍然只有一个清晰的主任务？
4. 浅色、深色、窄屏和键盘 focus 是否都可用？
5. loading、空态、错误和成功状态是否都有明确反馈？
6. 是否需要增加说明，还是应该减少控件和文案？
7. 是否引入了新的圆角、颜色、阴影或动效？如果有，能否复用现有规范？

## 12. 主要实现位置

- 设计令牌：`src/styles/tokens.css`
- 全局组件样式：`src/styles/globals.css`
- 共享 UI 组件：`src/components/ui/index.tsx`
- 应用外壳和导航：`src/components/Layout.tsx`
- AI 页面：`src/pages/AIChat.tsx`
- 设置页：`src/pages/SettingsPage.tsx`
- 角色绑定：`src/components/settings/AIModelCenter.tsx`
- Markdown、引用与来源预览：`src/components/MarkdownContent.tsx`、`src/components/CitationList.tsx`、`src/components/SourcePreviewModal.tsx`
- 设计实施记录：`docs/frontend-design-implementation.md`

## 13. UI 验收命令

```bash
npm run build
npm test -- --run
git diff --check
```

最终验收至少覆盖：浅色桌面、深色桌面、390×844 移动端、API 未配置、联网搜索失败、AI 生成中、AI 生成失败、来源可点击、键盘操作和 reduced-motion。
