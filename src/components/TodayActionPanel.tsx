import { useEffect, useState } from 'react';
import { ArrowRight, Brain, Inbox, MessageSquare, Bot, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getCardsDueToday } from '../lib/db/cards';
import { listDueTopicMastery } from '../lib/zero2review/repository';
import type { JournalEntry } from '../lib/db/schema';

interface Props { entries: JournalEntry[] }

/** 首页的“下一步”面板：把分散在各功能页的待办收拢成一个可执行入口。 */
export default function TodayActionPanel({ entries }: Props) {
  const [dueCards, setDueCards] = useState(0);
  const [dueTopics, setDueTopics] = useState(0);
  useEffect(() => {
    let active = true;
    void Promise.all([getCardsDueToday(), listDueTopicMastery()]).then(([cards, topics]) => {
      if (!active) return;
      setDueCards(cards.length);
      setDueTopics(topics.length);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const inboxCount = entries.filter((entry) => !entry.deletedAt && entry.status === 'inbox').length;
  const latest = entries.filter((entry) => !entry.deletedAt && entry.status !== 'inbox').sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const reviewCount = dueCards + dueTopics;
  const cards = [
    { to: '/inbox', icon: Inbox, label: '清空收集箱', detail: inboxCount ? `${inboxCount} 条素材待整理` : '收集箱今天是空的', tone: inboxCount ? 'warm' : 'quiet', action: inboxCount ? '去整理' : '添加素材' },
    { to: '/zero2-review', icon: Brain, label: '完成今日复习', detail: reviewCount ? `${reviewCount} 个主题或卡片到期` : '暂无到期内容，继续保持', tone: reviewCount ? 'violet' : 'quiet', action: reviewCount ? '开始复习' : '查看教练' },
    { to: latest ? `/edit/${latest.id}` : '/edit/new', icon: RotateCcw, label: latest ? '继续上次学习' : '写下第一条笔记', detail: latest ? latest.title || '无标题文档' : '把今天学到的东西留下来', tone: 'blue', action: latest ? '继续编辑' : '开始记录' },
  ] as const;

  return <section className="today-panel" aria-labelledby="today-panel-title">
    <div className="today-panel-header"><div><p className="today-status">今日航线</p><h2 id="today-panel-title">今天，先完成一件小事</h2><p>把记录、整理和复习变成一条清晰的航线。</p></div><Link to="/learning" className="today-goal-link">查看学习目标 <ArrowRight className="h-3.5 w-3.5" /></Link></div>
    <div className="today-action-grid">{cards.map(({ to, icon: Icon, label, detail, tone, action }) => <Link key={label} to={to} className={`today-action-card today-action-${tone}`}>
      <span className="today-action-icon"><Icon className="h-4 w-4" /></span><span className="today-action-copy"><strong>{label}</strong><span>{detail}</span></span><span className="today-action-cta">{action}<ArrowRight className="h-3.5 w-3.5" /></span>
    </Link>)}</div>
    <div className="today-smart-links"><span>需要帮助？</span><Link to="/ai"><MessageSquare className="h-3.5 w-3.5" />问 AI：从我的笔记里找答案</Link><Link to="/agent"><Bot className="h-3.5 w-3.5" />让 Agent 批量整理或制定计划</Link></div>
  </section>;
}
