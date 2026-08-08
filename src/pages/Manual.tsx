import {
  BookOpen, Search, FileText, Brain, BookCheck, BarChart3,
  Settings as SettingsIcon, HelpCircle, Cloud, KeyRound, Database, Keyboard,
} from 'lucide-react';

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

      {/* 快速开始 */}
      <Section icon={BookOpen} title="快速开始（4 步上手）" color="text-brand-500">
        <ol className="list-decimal pl-5 space-y-1">
          <li><b>配置 AI</b> — 「设置 → 🤖 AI 服务配置」填入任一服务商的 API Key（推荐胜算云），点「刷新模型」勾选要用的模型</li>
          <li><b>写第一篇笔记</b> — 文档列表点「新建文档」，支持富文本/Markdown 双模式，可粘贴截图</li>
          <li><b>让 AI 帮忙</b> — 编辑页点「总结」提炼要点，或「卡片」自动生成复习卡</li>
          <li><b>复习巩固</b> — 去「复习」页翻面评分，算法自动安排下次复习</li>
        </ol>
      </Section>

      {/* Ctrl+K 命令面板 */}
      <Section icon={Search} title="命令面板（Ctrl+K）" color="text-brand-500">
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
        <ul className="list-disc pl-5 space-y-1">
          <li><b>新建/编辑</b> — 「新建文档」；编辑器支持<b>富文本</b>（所见即所得）与 <b>Markdown</b> 双模式切换</li>
          <li><b>撤销/重做</b> — 富文本工具栏 ↩️ / ↪️，或 <kbd className="kbd">Ctrl+Z</kbd> / <kbd className="kbd">Ctrl+Y</kbd></li>
          <li><b>插入图片</b> — <b>Ctrl+V 粘贴截图</b>或<b>拖拽图片文件</b>进编辑器，自动压缩内嵌（无需图床）</li>
          <li><b>斜杠命令</b> — 富文本模式输入 <kbd className="kbd">/</kbd> 快速插入标题、列表、代码块、引用、图片等</li>
          <li><b>自动保存</b> — 编辑停顿约 3 秒自动存本地；标题下方显示字数与时间</li>
          <li><b>元数据</b> — 支持分类、标签、难度（1-5 星）、学习时长</li>
          <li><b>置顶/回收站</b> — 文档可置顶侧栏；删除进回收站，可恢复或彻底删除</li>
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
      <Section icon={BookCheck} title="复习系统（FSRS 算法）" color="text-green-500">
        <ul className="list-disc pl-5 space-y-1">
          <li><b>间隔重复</b> — 基于遗忘曲线，自动安排每张卡的最佳复习时间</li>
          <li><b>翻面评分</b> — 点卡片翻面看答案，4 级评分：<b>忘了 / 困难 / 良好 / 轻松</b></li>
          <li><b>间隔规则</b> — 良好/轻松 → 下次间隔变长（少打扰）；忘了/困难 → 很快再复习</li>
          <li><b>卡片库</b> — 管理所有卡片：搜索、按状态/标签筛选、编辑、删除、重置进度</li>
          <li><b>状态流转</b> — 🆕新 → 🔶学习中 → ✅复习中（忘了变 🔁重学）</li>
        </ul>
      </Section>

      {/* 云同步 */}
      <Section icon={Cloud} title="云同步（GitHub）" color="text-sky-500">
        <ul className="list-disc pl-5 space-y-1">
          <li><b>跨设备同步</b> — 数据推送到你的 GitHub 私有仓库，免费、带版本历史</li>
          <li><b>配置</b> — 「设置 → ☁️ 云同步」填用户名/仓库名/分支/Token；点「前往生成 →」一键跳转 GitHub（repo 权限已预填）</li>
          <li><b>保存即上传</b> — 启用后保存文档自动推送；编辑停顿 10 秒也会自动同步</li>
          <li><b>合并策略</b> — 多设备按记录取较新版本，软删除自动传播，不丢数据</li>
          <li><b>上限</b> — 单文件 95MB（GitHub 限 100MB，预留余量）；超出会阻止上传并提示</li>
        </ul>
      </Section>

      {/* 密钥迁移 */}
      <Section icon={KeyRound} title="密钥迁移（跨设备搬 Key）" color="text-rose-500">
        <ul className="list-disc pl-5 space-y-1">
          <li><b>用途</b> — 把 API Key 用主密码加密成密文，安全搬到另一台设备</li>
          <li><b>导出</b> — 「设置 → 🔐 密钥迁移」填主密码（≥6 位）→ 生成 <code className="font-mono">KBVAULT1:...</code> 密文</li>
          <li><b>导入</b> — 另一台设备粘贴密文 + 同一主密码 → 解密恢复 Key</li>
          <li><b>安全性</b> — PBKDF2(31 万)+AES-256，密文即使公开、无主密码也不可破解</li>
          <li><b>注意</b> — 主密码不存任何地方，忘了只能重新填 Key</li>
        </ul>
      </Section>

      {/* 数据管理 */}
      <Section icon={Database} title="数据管理" color="text-emerald-500">
        <ul className="list-disc pl-5 space-y-1">
          <li><b>导出</b> — 「设置 → 💾 数据管理 → 📤 导出数据」，下载全量 JSON</li>
          <li><b>导入</b> — 📥 导入数据，选 JSON 文件恢复（适合不想用 Token 的跨设备迁移）</li>
          <li><b>本地优先</b> — 所有数据默认存浏览器 IndexedDB；API Key 加密存本地，不上传</li>
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
          <li><b>分类分布</b> — 各分类的文档数量占比</li>
        </ul>
      </Section>

      {/* 设置 */}
      <Section icon={SettingsIcon} title="设置" color="text-gray-500">
        <ul className="list-disc pl-5 space-y-1">
          <li><b>AI 服务配置</b> — 各服务商填 Key + 刷新模型 + 勾选；模型搜索框实时筛选可用模型</li>
          <li><b>模型偏好</b> — 为高质量/代码/快速任务分别指定模型</li>
          <li><b>主题</b> — 白天 / 夜晚 / 跟随系统（侧栏底部一键切换）</li>
          <li><b>复习目标</b> — 设置每日复习卡片数</li>
        </ul>
      </Section>

      {/* 快捷键 */}
      <Section icon={Keyboard} title="快捷键速查" color="text-indigo-500">
        <ul className="list-disc pl-5 space-y-1">
          <li><kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">K</kbd> — 命令面板</li>
          <li><kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">S</kbd> — 保存文档</li>
          <li><kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">Z</kbd> / <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">Y</kbd> — 撤销 / 重做（富文本）</li>
          <li><kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">V</kbd> — 粘贴图片（截图）</li>
          <li><kbd className="kbd">/</kbd> — 富文本模式插入块命令</li>
          <li><kbd className="kbd">Esc</kbd> — 关闭面板/菜单</li>
        </ul>
      </Section>

      <div className="text-center text-xs text-gray-400 pb-8 pt-4">
        知识库 · Knowledge Base v1.0 · 本地优先，数据加密存于浏览器，可选 GitHub 云同步
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