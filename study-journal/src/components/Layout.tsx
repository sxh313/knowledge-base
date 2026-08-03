import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  FileText, MessageSquare, Brain, BarChart3, Settings, BookOpen, ChevronLeft,
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { to: '/', icon: FileText, label: '日记' },
  { to: '/ai', icon: MessageSquare, label: 'AI 助手' },
  { to: '/review', icon: BookOpen, label: '复习' },
  { to: '/knowledge', icon: Brain, label: '知识图谱' },
  { to: '/stats', icon: BarChart3, label: '统计' },
  { to: '/settings', icon: Settings, label: '设置' },
];

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg)]">
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] transition-all duration-300 ${
          collapsed ? 'w-16' : 'w-56'
        }`}
      >
        {/* Logo */}
        <div className="flex h-14 items-center justify-between border-b border-[var(--color-border)] px-4">
          {!collapsed && (
            <span className="text-sm font-bold tracking-tight text-brand-600 dark:text-brand-400">
              学习日记
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="btn-ghost p-1"
            title={collapsed ? '展开侧栏' : '收起侧栏'}
          >
            <ChevronLeft
              className={`h-4 w-4 transition-transform ${collapsed ? 'rotate-180' : ''}`}
            />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-2">
          {navItems.map((item) => {
            const isActive = item.to === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                    : 'text-[var(--color-text-secondary)] hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                title={item.label}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Footer */}
        {!collapsed && (
          <div className="border-t border-[var(--color-border)] p-3 text-[10px] text-[var(--color-text-secondary)]">
            学习日记 v1.0
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}