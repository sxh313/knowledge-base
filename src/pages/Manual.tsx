import {
  BookOpen, Search, FileText, Brain, BookCheck, BarChart3,
  Settings as SettingsIcon, HelpCircle, Cloud, KeyRound, Database, Keyboard,
  PaintRoller, Timer, Tag, LayoutTemplate, Star, History, FileCode, Inbox,
} from 'lucide-react';

export default function Manual() {
  return (
    <div className="content-frame-reading animate-fade-in space-y-7">
      <div className="page-hero !items-start !flex-col !gap-0">
        <div className="page-kicker">Learn the workflow</div>
        <h1 className="text-2xl font-bold text-gradient flex items-center gap-2">
          <HelpCircle className="h-6 w-6" />
          使用手册
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          了解知屿的所有功能和操作方式
        </p>
      </div>

      {/* 快速开始 */}
      <Section icon={BookOpen} title="快速开始（4 步上手）" color="text-brand-500">
        <ol className="list-decimal pl-5 space-y-1">
          <li><b>配置 API</b> — 「设置 → API 服务配置」填入自己的服务地址和 API Key；本地 OpenAI-compatible 服务可不填 Key</li>
          <li><b>写第一篇笔记</b> — 文档列表点「新建文档」，支持富文本/Markdown 双模式，可粘贴截图</li>
          <li><b>让 AI 帮忙</b> — 编辑页点「总结」提炼要点，或使用代码分析和解释功能</li>
          <li><b>复习巩固</b> — 去「复习」页翻面评分，算法自动安排下次复习</li>
        </ol>
      </Section>

      {/* Ctrl+K 命令面板 */}
      <Section icon={Search} title="命令面板（Ctrl+K / Ctrl+F）" color="text-brand-500">
        <p>按 <kbd className="kbd">Ctrl</kbd> + <kbd className="kbd">K</kbd>（Mac 用 <kbd className="kbd">⌘</kbd> + <kbd className="kbd">K</kbd>）随时打开全局搜索面板；在非编辑器页面按 <kbd className="kbd">Ctrl</kbd> + <kbd className="kbd">F</kbd> 同样可打开（编辑器内 <kbd className="kbd">Ctrl</kbd> + <kbd className="kbd">F</kbd> 为查找替换）。</p>
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
          <li><b>提示框</b> — 工具栏提示按钮或斜杠命令 <kbd className="kbd">/提示框</kbd> 只使用标准 Markdown 引用格式 <code className="font-mono">&gt;</code>，不会自动添加斜体、双引号或 <code className="font-mono">[!NOTE]</code>。技巧 / 警告 / 危险仍可用专用 Callout</li>
          <li><b>格式刷</b> — 工具栏 🖌️：先选中带格式的文字点刷<b>复制格式</b>，再选目标文字点刷<b>套用格式</b>（粗体/斜体/删除线/代码）</li>
          <li><b>选中→AI</b> — 选中文字浮现快捷菜单：<b>翻译 / 解释 / 润色</b>；结果在独立小窗中显示，可复制或关闭，<b>不会自动修改原文</b></li>
          <li><b>标题折叠</b> — 点击 H1-H5 标题左侧箭头，可隐藏该标题正文及其下级标题；遇到下一个同级或更高级标题停止，再点一次完整展开</li>
          <li><b>编辑器主题</b> — 固定工具栏、选区浮动菜单和 SVG 预览会跟随白天、夜晚或系统主题切换，不再固定为白底</li>
          <li><b>分类管理</b> — 左侧分类区点“+”新建分类；点分类右侧“⋮”可重命名或删除，删除后其中的文档自动移到“未分类”</li>
          <li><b>表格与 SVG</b> — 工具栏可插入 3×3 表格；选择 SVG 代码可预览并转换为 PNG 图片插入</li>
          <li><b>代码块</b> — 每个代码块都有备注输入区和复制按钮；备注会随 Markdown、备份和同步保存</li>
          <li><b>Tab 缩进</b> — 正文按 <kbd className="kbd">Tab</kbd> 插入可持久保存的缩进，代码块插入 4 个空格，<kbd className="kbd">Shift+Tab</kbd> 减少缩进</li>
          <li><b>双向链接</b> — 工具栏 🔗 插入 <code className="font-mono">[[文档标题]]</code>，显示为可点击 chip，点击跳转</li>
          <li><b>右侧文档面板</b> — 编辑器右侧「大纲 / 反链 / 提及」三页签（工具栏 ▭ 可隐藏）：<b>大纲</b>在富文本和 Markdown 模式都可点击跳转章节；<b>反链</b>列出引用本文的文档 + 失效链接（可一键创建目标）；<b>提及</b>列出提到本文标题但未建链的文档，一键转为 <code className="font-mono">[[双链]]</code></li>
          <li><b>附件图片</b> — 已保存文档中粘贴/拖入的图片会以附件存储，正文用 <code className="font-mono">attachment://</code> 引用（随云同步）；未保存的新文档仍用 base64 内联</li>
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

      {/* 快速收集箱 */}
      <Section icon={Inbox} title="快速收集箱（Inbox）" color="text-cyan-500">
        <ul className="list-disc pl-5 space-y-1">
          <li><b>入口</b> — 侧栏「收集箱」，或快捷键 <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">Shift</kbd>+<kbd className="kbd">N</kbd>（<kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">N</kbd> 仍是普通新建）</li>
          <li><b>快速捕捉 / 网页剪藏</b> — 标题、来源网址、正文；<b>标题处粘贴网址会自动识别</b>为来源</li>
          <li><b>稍后整理</b> — 行内改标题、选分类、加标签、建立双链；点「标记已整理」转为正式文档（状态 active）</li>
        </ul>
      </Section>

      {/* 高级搜索 */}
      <Section icon={Search} title="高级搜索" color="text-emerald-500">
        <ul className="list-disc pl-5 space-y-1">
          <li><b>入口</b> — 命令面板（<kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">K</kbd>）选「高级搜索」，或访问 <code className="font-mono">/search</code></li>
          <li><b>字段语法</b> — <code className="font-mono">tag:编程 subject:计算机 after:2026-01-01 before:2026-08-01 is:inbox has:attachment link: -link: "精确短语"</code></li>
          <li><b>结果</b> — 关键词高亮、正文命中片段、匹配原因（标题/正文/别名/标签）、分类与修改时间</li>
          <li><b>保存搜索</b> — 点「保存」命名后可一键复用（不缓存结果）</li>
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
      <Section icon={Brain} title="AI 问答与 Agent" color="text-purple-500">
        <ul>
          <li><b>AI 总结</b> — 在编辑器中点击「📝 AI 总结」，自动提炼核心要点</li>
          <li><b>代码分析</b> — 点击「🔍 代码」，AI 审查代码质量和安全</li>
          <li><b>代码解释</b> — 点击「📖 解释」，AI 逐行解释代码逻辑</li>
          <li><b>AI 对话（RAG）</b> — 在同一入口选择个人文档、zero2Agent、全部知识库或不使用知识库；回答附可定位的参考来源</li>
          <li><b>Agent 模式</b> — 切换到 Agent 后可让 AI 规划知识库操作；写入前会展示风险、影响和 diff，必须由你确认，并支持撤销</li>
          <li><b>本地模型</b> — 「设置 → API 服务配置 → 本地模型」可连接 Ollama、LM Studio、vLLM、LocalAI 等 OpenAI 兼容服务；API 地址填写本地 <code className="font-mono">/v1</code> 入口，API Key 可留空，并确保本地服务允许浏览器 CORS。</li>
          <li><b>模型中心</b> — 「设置 → 模型中心」可分别填写 dsv4 Chat 和 BGE Embedding 端点，再绑定回答、向量召回、重排、复习辅导和评分角色。Embedding 不配置也可以使用。</li>
          <li><b>混合检索</b> — 默认使用关键词检索；开启并配置 Embedding、生成向量索引后，才启用关键词 + 向量双路召回，随后可由 dsv4 对候选片段重排。</li>
          <li><b>多模型路由</b> — 支持胜算云、中转站、硅基流动、智谱、DeepSeek 和本地服务，已启用模型之间可故障转移</li>
        </ul>
      </Section>

      {/* 复习系统 */}
      <Section icon={BookCheck} title="复习系统（FSRS 算法）" color="text-green-500">
        <ul className="list-disc pl-5 space-y-1">
          <li><b>间隔重复</b> — 基于遗忘曲线，自动安排每张卡的最佳复习时间</li>
          <li><b>Agent 面试诊断</b> — 在独立复习教练中基于“Agent 面试通关”原文回答问题并完成诊断</li>
          <li><b>间隔规则</b> — 良好/轻松 → 下次间隔变长（少打扰）；忘了/困难 → 很快再复习</li>
          <li><b>状态流转</b> — 🆕新 → 🔶学习中 → ✅复习中（忘了变 🔁重学）</li>
        </ul>
      </Section>
      <Section icon={Brain} title="Agent 面试训练营" color="text-cyan-500">
        <ul>
          <li><b>独立入口</b> — 从侧栏进入「面试训练营」，与普通 AI 和通用 Agent 分开</li>
          <li><b>固定来源</b> — 默认只检索内置“Agent 面试通关”原文；每个知识回答显示可验证的章节和 Citation</li>
          <li><b>提问不等于掌握</b> — 只有完成带来源证据的诊断题，才会更新掌握度和 FSRS 调度</li>
          <li><b>隐私边界</b> — 无关问题不会进入复习数据；问答历史默认不同步，可在云同步设置中主动开启</li>
          <li><b>计划控制</b> — 计划面板支持重新规划、暂停和恢复；掌握度条目可以展开查看作答证据和评分依据</li>
        </ul>
      </Section>

      {/* 云同步 */}
      <Section icon={Cloud} title="云同步（GitHub）" color="text-sky-500">
        <ul className="list-disc pl-5 space-y-1">
          <li><b>跨设备同步</b> — 数据推送到你的 GitHub 私有仓库，免费、带版本历史</li>
          <li><b>配置</b> — 在设置页填写自己的用户名/组织、私有仓库、分支、数据路径和 Fine-grained Token；建议只授予目标仓库 Contents 读写权限</li>
          <li><b>保存即上传</b> — 启用后保存文档自动推送；编辑停顿 10 秒也会自动同步</li>
          <li><b>合并策略</b> — 多设备按记录取较新版本，软删除自动传播，不丢数据</li>
          <li><b>Agent 数据</b> — Agent 运行和审计记录可能包含敏感内容，默认不参与同步，可在设置中单独开启</li>
          <li><b>上限</b> — 单文件 95MB（GitHub 限 100MB，预留余量）；超出会阻止上传并提示</li>
        </ul>
      </Section>

      {/* 密钥迁移 */}
      <Section icon={KeyRound} title="密钥迁移（跨设备搬 Key）" color="text-rose-500">
        <ul className="list-disc pl-5 space-y-1">
          <li><b>用途</b> — 把 API Key 用主密码加密成密文，安全搬到另一台设备</li>
          <li><b>导出</b> — 「设置 → 🔐 密钥迁移」填主密码（≥6 位）→ 生成 <code className="font-mono">KBVAULT1:...</code> 密文</li>
          <li><b>导入</b> — 另一台设备粘贴密文 + 同一主密码 → 解密恢复 Key</li>
          <li><b>加密方式</b> — 使用 PBKDF2（31 万次）派生密钥和 AES-GCM 加密；仍应使用强主密码并妥善保管密文</li>
          <li><b>注意</b> — 主密码不存任何地方，忘了只能重新填 Key</li>
        </ul>
      </Section>

      {/* 数据管理 */}
      <Section icon={Database} title="数据管理" color="text-emerald-500">
        <ul className="list-disc pl-5 space-y-1">
          <li><b>导出</b> — 「设置 → 数据管理 → 导出数据」下载文档、附件、历史、AI/Agent 数据、偏好、学习目标和任务</li>
          <li><b>导入</b> — 选择 JSON 文件合并恢复，完成后自动重建文档索引</li>
          <li><b>凭据边界</b> — 普通备份不含 AI Key、GitHub Token 和设备级设置；凭据请使用独立的“密钥迁移”</li>
          <li><b>本地优先</b> — 业务数据和凭据默认存当前设备 IndexedDB；启用 AI、联网搜索或 GitHub 同步时，相关内容会发往你配置的服务</li>
        </ul>
      </Section>

      {/* 统计 */}
      <Section icon={BarChart3} title="统计面板" color="text-cyan-500">
        <ul>
          <li><b>数据概览</b> — 查看文档数量、活动热度和分类分布</li>
          <li><b>活动热力图</b> — 近 30 天的文档创建活动（GitHub 风格）</li>
          <li><b>分类分布</b> — 各分类的文档数量占比</li>
        </ul>
      </Section>

      {/* 设置 */}
      <Section icon={SettingsIcon} title="设置" color="text-gray-500">
        <ul className="list-disc pl-5 space-y-1">
          <li><b>API 服务配置</b> — 各服务商填 Key + 刷新模型 + 勾选；模型搜索框实时筛选可用模型</li>
          <li><b>模型偏好</b> — 为高质量/代码/快速任务分别指定模型</li>
          <li><b>主题</b> — 白天 / 夜晚 / 跟随系统（侧栏底部一键切换）</li>
          <li><b>复习目标</b> — 设置每日学习时间和 zero2Agent 复习计划</li>
          <li><b>学习目标</b> — 在侧栏进入学习目标，把目标拆为可调整的每日任务</li>
        </ul>
      </Section>

      {/* 快捷键 */}
      <Section icon={Keyboard} title="快捷键速查" color="text-indigo-500">
        <ul className="list-disc pl-5 space-y-1">
          <li><kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">K</kbd> — 命令面板（搜索/跳转/新建）</li>
          <li><kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">F</kbd> — 全局搜索（编辑器内为查找替换）</li>
          <li><kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">S</kbd> — 保存文档</li>
          <li><kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">Shift</kbd>+<kbd className="kbd">N</kbd> — 打开快速收集箱</li>
          <li><kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">H</kbd> — 查找替换（编辑器内）</li>
          <li><kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">Z</kbd> / <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">Y</kbd> — 撤销 / 重做（富文本）</li>
          <li><kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">X</kbd> → <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">V</kbd> — 剪切 + 粘贴移动内容（编辑器禁用拖拽）</li>
          <li><kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">V</kbd> — 粘贴图片（截图）</li>
          <li><kbd className="kbd">/</kbd> — 富文本模式插入块命令（标题/列表/代码块/提示框/表格…）</li>
          <li><kbd className="kbd">Backspace</kbd> — 提示框开头按可取消；行首按删除</li>
          <li><kbd className="kbd">Esc</kbd> — 关闭面板/菜单</li>
        </ul>
      </Section>

      <div className="text-center text-xs text-gray-400 pb-8 pt-4">
        知屿 · ZhiYu v{__APP_VERSION__} · 本地优先 · 凭据由用户配置 · 可选 GitHub 云同步
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
