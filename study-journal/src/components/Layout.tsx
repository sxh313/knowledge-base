import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  FileText, MessageSquare, Brain, BarChart3, Settings, BookOpen, Layers,
  ChevronLeft, Sun, Moon, Monitor,
} from 'lucide-react';
import { useState } from 'react';
import { useThemeStore, type ThemeMode } from '../stores/themeStore';

const navItems = [
  { to: '/', icon: FileText, label: '日记' },
  { to: '/ai', icon: MessageSquare, label: 'AI 助手' },
  { to: '/review', icon: BookOpen, label: '复习' },
  { to: '/cards', icon: Layers, label: '卡片库' },
  { to: '/knowledge', icon: Brain, label: '知识图谱' },
  { to: '/stats', icon: BarChart3, label: '统计' },
  { to: '/settings', icon: Settings, label: '设置' },
];

const themeCycle: ThemeMode[] = ['light', 'dark', 'auto'];
const themeConfig: Record<ThemeMode, { icon: typeof Sun; label: string; hint: string }> = {
  light: { icon: Sun, label: '白天', hint: '日' },
  dark: { icon: Moon, label: '夜晚', hint: '夜' },
  auto: { icon: Monitor, label: '跟随系统', hint: '随' },
};

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { mode, setMode } = useThemeStore();

  const ThemeIcon = themeConfig[mode].icon;
  const nextTheme = themeCycle[(themeCycle.indexOf(mode) + 1) % themeCycle.length];

  return (
    <div className="flex h-screen overflow-hidden">
      {/* 侧栏 */}
      <aside
        className={`glass flex flex-col border-r border-[var(--color-border)] transition-all duration-300 ${
          collapsed ? 'w-16' : 'w-56'
        }`}
      >
        {/* Logo 区 */}
        <div className="flex h-14 items-center justify-between border-b border-[var(--color-border)] px-4">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
                <BookOpen className="h-4 w-4" />
              </div>
              <span className="text-sm font-bold tracking-tight text-gradient">
                知识库
              </span>
            </div>
          )}
          {collapsed && (
            <div className="mx-auto flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
              <BookOpen className="h-4 w-4" />
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="btn-ghost p-1.5 absolute top-3 right-2"
            title={collapsed ? '展开侧栏' : '收起侧栏'}
            type="button"
          >
            <ChevronLeft
              className={`h-4 w-4 transition-transform ${collapsed ? 'rotate-180' : ''}`}
            />
          </button>
        </div>

        {/* 导航 */}
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
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)] shadow-sm'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]'
                }`}
                title={item.label}
              >
                <item.icon className={`h-5 w-5 flex-shrink-0 transition-transform group-hover:scale-110 ${isActive ? 'scale-110' : ''}`} />
                {!collapsed && <span>{item.label}</span>}
                {isActive && !collapsed && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" />
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* 底部：主题切换 + 版本 */}
        <div className="border-t border-[var(--color-border)] p-2">
          <button
            onClick={() => setMode(nextTheme)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
            title={`当前: ${themeConfig[mode].label} — 点击切换为${themeConfig[nextTheme].label}`}
            type="button"
          >
            <ThemeIcon className="h-5 w-5 flex-shrink-0 transition-transform hover:rotate-12" />
            {!collapsed && (
              <>
                <span>{themeConfig[mode].label}</span>
                <span className="ml-auto text-[10px] text-[var(--color-text-tertiary)]">
                  → {themeConfig[nextTheme].hint}
                </span>
              </>
            )}
          </button>
          {!collapsed && (
            <div className="px-3 pt-1 pb-1 text-[10px] text-[var(--color-text-tertiary)]">
              学习日记 v1.0
            </div>
          )}
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
