import { BookOpen, Search, FileText, Brain, BookCheck, BarChart3, Settings as SettingsIcon, HelpCircle } from 'lucide-react';

export default function Manual() {
  return (
    <div className="animate-fade-in space-y-8 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gradient flex items-center gap-2">
          <HelpCircle className="h-6 w-6" />
          使用手册
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          了解知识库的所有功能和操作方式
        </p>
      </div>

      {/* Ctrl+K 命令面板 */}
      <Section icon={Search} title="命令面板 (Ctrl+K)" color="text-brand-500">
        <p>按 <kbd className="kbd">Ctrl</kbd> + <kbd className="kbd">K</kbd>（Mac 用 <kbd className="kbd">⌘</kbd> + <kbd className="kbd">K</kbd>）随时打开全局搜索面板。</p>
        <ul>
          <li><b>搜索文档</b> — 输入关键词即可搜索所有文档的标题、内容、标签</li>
          <li><b>快捷操作</b> — 直接跳转到 AI 助手、复习、统计等页面</li>
          <li><b>新建文档</b> — 在面板中直接选择「新建文档」</li>
          <li><b>键盘操作</b> — <kbd className="kbd">↑↓</kbd> 导航，<kbd className="kbd">↵</kbd> 选择，<kbd className="kbd">ESC</kbd> 关闭</li>
        </ul>
      </Section>

      {/* 文档管理 */}
      <Section icon={FileText} title="文档管理" color="text-blue-500">
        <ul>
          <li><b>新建文档</b> — 在文档列表页点击「✏️ 新文档」按钮</li>
          <li><b>编辑文档</b> — 使用 Markdown 格式编写，支持标题、列表、代码块、表格等</li>
          <li><b>自动保存</b> — 新文档输入 5 秒后自动保存，已有文档手动点「保存」</li>
          <li><b>预览模式</b> — 点击「编辑/预览」切换 Markdown 渲染视图</li>
          <li><b>元数据</b> — 可设置标题、学科、标签、难度、学习时长</li>
          <li><b>搜索筛选</b> — 列表页顶部搜索框支持全文搜索，点击学科标签可快速筛选</li>
        </ul>
      </Section>

      {/* AI 功能 */}
      <Section icon={Brain} title="AI 功能" color="text-purple-500">
        <ul>
          <li><b>AI 总结</b> — 在编辑器中点击「📝 AI 总结」，自动提炼核心要点</li>
          <li><b>生成卡片</b> — 点击「🃏 卡片」，AI 自动从文档生成知识卡片（保存到复习库）</li>
          <li><b>代码分析</b> — 点击「🔍 代码」，AI 审查代码质量和安全</li>
          <li><b>代码解释</b> — 点击「📖 解释」，AI 逐行解释代码逻辑</li>
          <li><b>AI 对话</b> — 在「AI 助手」页面与 AI 自由对话，支持添加笔记上下文</li>
          <li><b>多模型路由</b> — 支持胜算云、硅基、智谱、DeepSeek 等多个 AI 入口，自动故障转移</li>
        </ul>
      </Section>

      {/* 复习系统 */}
      <Section icon={BookCheck} title="复习系统" color="text-green-500">
        <ul>
          <li><b>间隔重复</b> — 基于 FSRS 算法，自动安排每张卡片的最佳复习时间</li>
          <li><b>卡片翻转</b> — 点击卡片正面翻转查看答案</li>
          <li><b>评分</b> — 翻转后评分：忘了（重来）/ 困难 / 良好 / 轻松</li>
          <li><b>卡片库</b> — 在「卡片库」页面管理所有知识卡片，支持增删改和重置进度</li>
        </ul>
      </Section>

      {/* 知识图谱 */}
      <Section icon={Brain} title="知识图谱" color="text-orange-500">
        <ul>
          <li><b>可视化</b> — 以力导向图方式展示概念之间的关联关系</li>
          <li><b>前置依赖</b> — 虚线表示前置依赖（必须先学的概念）</li>
          <li><b>关联关系</b> — 实线表示普通关联</li>
        </ul>
      </Section>

      {/* 统计 */}
      <Section icon={BarChart3} title="统计面板" color="text-cyan-500">
        <ul>
          <li><b>数据概览</b> — 查看文档数、卡片数、知识点数</li>
          <li><b>活动热力图</b> — 近 30 天的文档创建活动（GitHub 风格）</li>
          <li><b>学科分布</b> — 各学科的文档数量占比</li>
        </ul>
      </Section>

      {/* 设置 */}
      <Section icon={SettingsIcon} title="AI 服务配置" color="text-gray-500">
        <ul>
          <li><b>胜算云</b> — 推荐主力入口，填写 API Key 后点「刷新模型」获取可用模型列表</li>
          <li><b>多入口支持</b> — 同时支持胜算云、中转站、硅基流动、智谱、DeepSeek</li>
          <li><b>模型选择</b> — 刷新后勾选你想用的模型，在「模型偏好」中从已勾选模型里选择</li>
          <li><b>连接测试</b> — 点击「全部测试」验证各 API 是否可用</li>
          <li><b>数据安全</b> — 所有 API Key 加密存储在浏览器 IndexedDB，不经过服务器</li>
          <li><b>导入导出</b> — 支持一键导出和导入所有数据（JSON 格式）</li>
        </ul>
      </Section>

      {/* 主题 */}
      <Section icon={BookOpen} title="主题切换" color="text-amber-500">
        <p>点击侧栏底部的主题按钮，在<b>白天</b>、<b>夜晚</b>、<b>跟随系统</b>三种模式间切换。</p>
      </Section>

      <div className="text-center text-xs text-gray-400 pb-8 pt-4">
        知识库 v1.0 · 基于纯客户端架构，数据加密存储在本地浏览器
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, color, children }: { icon: typeof Search; title: string; color: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Icon className={`h-5 w-5 ${color}`} />
        {title}
      </h2>
      <div className="prose-custom-sm text-sm text-[var(--color-text-secondary)] space-y-2">
        {children}
      </div>
    </section>
  );
}