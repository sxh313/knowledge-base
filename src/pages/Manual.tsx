import {
  BookOpen, Search, FileText, Brain, BookCheck, BarChart3,
  Settings as SettingsIcon, HelpCircle, Cloud, KeyRound, Database, Keyboard,
  PaintRoller, Timer, Tag, Link2, LayoutTemplate, Star, History, CalendarDays, ListOrdered, FileCode,
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

      {/* 编辑器进阶 */}
      <Section icon={PaintRoller} title="编辑器进阶（富文本）" color="text-pink-500">
        <ul className="list-disc pl-5 space-y-1">
          <li><b>查找替换</b> — <kbd className="kbd">Ctrl+H</kbd> 或 <kbd className="kbd">Ctrl+F</kbd> 打开查找栏，支持区分大小写、上一个/下一个、替换、全部替换</li>
          <li><b>提示框 Callout</b> — 工具栏 💡 或斜杠命令 <kbd className="kbd">/提示框</kbd>，4 种变体（💡提示 / ✅技巧 / ⚠️警告 / 🔴危险）；开头按 <kbd className="kbd">Backspace</kbd> 可取消</li>
          <li><b>格式刷</b> — 工具栏 🖌️：先选中带格式的文字点刷<b>复制格式</b>，再选目标文字点刷<b>套用格式</b>（粗体/斜体/删除线/代码）</li>
          <li><b>选中→AI</b> — 选中文字浮现飞书式菜单：<b>🌐翻译 / 📖解释 / ✨润色</b>，AI 结果自动回填到选区</li>
          <li><b>双向链接</b> — 工具栏 🔗 插入 <code className="font-mono">[[文档标题]]</code>，显示为可点击 chip，点击跳转；目标文档底部自动显示「🔗 反向引用」</li>
          <li><b>禁用拖拽</b> — 选中内容不能拖动移动（避免误操作），移动内容用剪切 <kbd className="kbd">Ctrl+X</kbd> + 粘贴</li>
        </ul>
      </Section>

      {/* 文档模板 */}
      <Section icon={LayoutTemplate} title="文档模板" color="text-violet-500">
        <ul className="list-disc pl-5 space-y-1">
          <li><b>从模板新建</b> — 文档列表点「模板」按钮，选择内置模板一键创建</li>
          <li><b>内置模板</b> — 📄空白 / 🗓️每日复盘 / 📚读书笔记 / 📝会议记录 / ❌错题整理 / 🧠概念学习</li>
          <li><b>每日笔记</b> — 点「今日笔记」一键创建/打开当天日记（标题为日期）</li>
        </ul>
      </Section>

      {/* 收藏与排序 */}
      <Section icon={Star} title="收藏夹与手动排序" color="text-amber-500">
        <ul className="list-disc pl-5 space-y-1">
          <li><b>置顶收藏</b> — 文档右上角 ⭐ 置顶；置顶文档显示在列表「📌 收藏夹」快捷卡片条，一键直达</li>
          <li><b>手动排序</b> — 文档列表直接<b>拖拽卡片</b>调整顺序，自动切到「↕ 手动排序」模式，顺序持久化</li>
          <li><b>导入 .md</b> — 把 <code className="font-mono">.md</code> 文件<b>拖进文档列表</b>，批量导入（自动识别标题）</li>
        </ul>
      </Section>

      {/* 番茄钟 */}
      <Section icon={Timer} title="番茄钟（专注计时）" color="text-red-500">
        <ul className="list-disc pl-5 space-y-1">
          <li><b>浮动组件</b> — 右下角番茄钟，点展开计时面板（默认 25 分钟专注 + 5 分钟休息，可在设置里改）</li>
          <li><b>自动累计</b> — 完成一个专注番茄，时长自动累加到<b>当前编辑文档</b>的学习时长</li>
          <li><b>提醒</b> — 完成/休息结束发桌面通知（需授权通知权限）</li>
        </ul>
      </Section>

      {/* 版本历史 */}
      <Section icon={History} title="版本历史（防误改）" color="text-teal-500">
        <ul className="list-disc pl-5 space-y-1">
          <li><b>自动记录</b> — 每次保存自动留一个快照（内容相同则跳过，每篇最多保留 30 个）</li>
          <li><b>查看</b> — 编辑页点「历史」按钮，左侧版本列表 + 右侧内容预览</li>
          <li><b>恢复</b> — 选某个版本点「恢复此版本」；覆盖前的内容会自动存一份，不会丢</li>
        </ul>
      </Section>

      {/* 导出分享 */}
      <Section icon={FileCode} title="导出与分享" color="text-lime-600">
        <ul className="list-disc pl-5 space-y-1">
          <li><b>导出 HTML</b> — 编辑页「导出 → 导出 HTML」，生成含内联样式的独立文件，可发给别人直接打开</li>
          <li><b>导出 PDF</b> — 「导出 → 导出 PDF」，调用浏览器打印对话框，另存为 PDF</li>
        </ul>
      </Section>

      {/* 标签管理 */}
      <Section icon={Tag} title="标签管理" color="text-fuchsia-500">
        <ul className="list-disc pl-5 space-y-1">
          <li><b>标签云</b> — 侧栏「标签」页，字号代表使用频次，点击进入对应文档</li>
          <li><b>频次列表</b> — 按使用次数排序，带频次条，点击跳转筛选</li>
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
          <li><b>右键菜单</b> — 卡片库中<b>右键卡片</b>：编辑 / 复制 / 置顶 / 删除（快速操作）</li>
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
          <li><kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">K</kbd> — 命令面板（搜索/跳转/新建）</li>
          <li><kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">S</kbd> — 保存文档</li>
          <li><kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">H</kbd> / <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">F</kbd> — 查找替换</li>
          <li><kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">Z</kbd> / <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">Y</kbd> — 撤销 / 重做（富文本）</li>
          <li><kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">X</kbd> → <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">V</kbd> — 剪切 + 粘贴移动内容（编辑器禁用拖拽）</li>
          <li><kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">V</kbd> — 粘贴图片（截图）</li>
          <li><kbd className="kbd">/</kbd> — 富文本模式插入块命令（标题/列表/代码块/提示框/表格…）</li>
          <li><kbd className="kbd">Backspace</kbd> — 提示框开头按可取消；行首按删除</li>
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