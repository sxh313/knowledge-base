import { useNavigate } from 'react-router-dom';
import { Plus, MessageSquare, BookOpen } from 'lucide-react';
import { useJournalStore } from '../stores/journalStore';

interface NavActionsProps {
  collapsed?: boolean;
}

export default function NavActions({ collapsed }: NavActionsProps) {
  const navigate = useNavigate();
  const { setCurrent } = useJournalStore();

  const actions = [
    {
      icon: Plus,
      label: '新建日记',
      onClick: () => { setCurrent(null); navigate('/edit/new'); },
    },
    {
      icon: MessageSquare,
      label: 'AI 助手',
      onClick: () => navigate('/ai'),
    },
    {
      icon: BookOpen,
      label: '复习',
      onClick: () => navigate('/review'),
    },
  ];

  return (
    <div className="space-y-1 px-2 py-3 border-b border-[var(--color-border)]">
      {actions.map(({ icon: Icon, label, onClick }) => (
        <button
          key={label}
          onClick={onClick}
          className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
            hover:bg-gray-100 dark:hover:bg-gray-800 text-[var(--color-text-secondary)] hover:text-[var(--color-text)]`}
          title={label}
        >
          <Icon className="h-5 w-5 flex-shrink-0" />
          {!collapsed && <span>{label}</span>}
        </button>
      ))}
    </div>
  );
}