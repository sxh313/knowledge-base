import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  FileText, MessageSquare, Brain, BarChart3, Settings, BookOpen, Layers,
  ChevronLeft, Sun, Moon, Monitor, Search, HelpCircle, Smartphone, MoreHorizontal, X, Trash2,
  Cloud, Loader2, Tag, Inbox, Plus, Timer, ArrowUp, ArrowDown, RotateCcw, Target,
} from 'lucide-react';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useThemeStore, type ThemeMode } from '../stores/themeStore';
import { useViewModeStore, type ViewMode } from '../stores/viewModeStore';
import { useSyncStore } from '../stores/syncStore';
import { useSettingsStore } from '../stores/settingsStore';
import { usePomodoroStore } from '../stores/pomodoroStore';
import { useJournalStore } from '../stores/journalStore';
import TemplatePicker from './TemplatePicker';
import { useFocusTrap } from '../lib/ui/useFocusTrap';

interface LayoutProps {
  onOpenPalette?: () => void;
}

const navItems = [
  { to: '/', icon: FileText, label: '文档', group: '创作' },
  { to: '/inbox', icon: Inbox, label: '收集箱', group: '创作' },
  { to: '/ai', icon: MessageSquare, label: '知屿 AI', group: '智能' },
  { to: '/zero2-review', icon: Brain, label: '面试训练营', group: '智能' },
  { to: '/learning', icon: Target, label: '学习目标', group: '成长' },
  { to: '/stats', icon: BarChart3, label: '统计', group: '成长' },
  { to: '/tags', icon: Tag, label: '标签', group: '管理' },
  { to: '/settings', icon: Settings, label: '设置', group: '管理' },
];

const mobileNavItems = [
  ...navItems,
  { to: '/trash', icon: Trash2, label: '回收站' },
  { to: '/manual', icon: HelpCircle, label: '使用手册' },
];
const DEFAULT_MOBILE_NAV_ORDER = mobileNavItems.map((item) => item.to);
const MOBILE_NAV_ORDER_KEY = 'knowledge-base-mobile-nav-order';
const DESKTOP_NAV_ORDER_KEY = 'knowledge-base-desktop-nav-order';

function loadNavOrder(key: string, fallback: string[]): string[] {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    const saved = raw ? JSON.parse(raw) as string[] : [];
    const valid = saved.filter((to) => fallback.includes(to));
    return [...valid, ...fallback.filter((to) => !valid.includes(to))];
  } catch { return fallback; }
}

function loadMobileNavOrder(): string[] {
  if (typeof window === 'undefined') return DEFAULT_MOBILE_NAV_ORDER;
  try {
    const raw = localStorage.getItem(MOBILE_NAV_ORDER_KEY);
    if (!raw) return DEFAULT_MOBILE_NAV_ORDER;
    const saved = JSON.parse(raw) as string[];
    const valid = saved.filter((to) => DEFAULT_MOBILE_NAV_ORDER.includes(to));
    return [...valid, ...DEFAULT_MOBILE_NAV_ORDER.filter((to) => !valid.includes(to))];
  } catch {
    return DEFAULT_MOBILE_NAV_ORDER;
  }
}

function saveMobileNavOrder(order: string[]) {
  try { localStorage.setItem(MOBILE_NAV_ORDER_KEY, JSON.stringify(order)); } catch { /* ignore */ }
}

const mobileNavByPath = new Map(mobileNavItems.map((item) => [item.to, item]));

const themeCycle: ThemeMode[] = ['light', 'dark', 'auto'];
const themeConfig: Record<ThemeMode, { icon: typeof Sun; label: string; hint: string }> = {
  light: { icon: Sun, label: '白天', hint: '日' },
  dark: { icon: Moon, label: '夜晚', hint: '夜' },
  auto: { icon: Monitor, label: '系统', hint: '系' },
};

const viewModeCycle: ViewMode[] = ['auto', 'desktop', 'mobile'];
const viewModeConfig: Record<ViewMode, { icon: typeof Monitor; label: string }> = {
  auto: { icon: Monitor, label: '自动' },
  desktop: { icon: Monitor, label: '桌面版' },
  mobile: { icon: Smartphone, label: '手机版' },
};

export default function Layout({ onOpenPalette }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showMoreSheet, setShowMoreSheet] = useState(false);
  const [showNewSheet, setShowNewSheet] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [isEditingMobileNav, setIsEditingMobileNav] = useState(false);
  const [mobileNavOrder, setMobileNavOrder] = useState<string[]>(loadMobileNavOrder);
  const [desktopNavOrder, setDesktopNavOrder] = useState<string[]>(() => loadNavOrder(DESKTOP_NAV_ORDER_KEY, navItems.map((item) => item.to)));
  const [draggingNav, setDraggingNav] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const newSheetRef = useRef<HTMLDivElement>(null);
  const moreSheetRef = useRef<HTMLDivElement>(null);
  useFocusTrap(showNewSheet, newSheetRef);
  useFocusTrap(showMoreSheet, moreSheetRef);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!showMoreSheet && !showNewSheet) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setShowMoreSheet(false); setShowNewSheet(false); } };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  }, [showMoreSheet, showNewSheet]);

  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem('sidebar-width'));
    return Number.isFinite(saved) && saved >= 216 && saved <= 360 ? saved : 240;
  });

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(216, Math.min(360, ev.clientX));
      setSidebarWidth(w);
    };
    const onUp = () => {
      setSidebarWidth((w) => {
        localStorage.setItem('sidebar-width', String(w));
        return w;
      });
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  const location = useLocation();
  const navigate = useNavigate();
  const isEditorPage = location.pathname.startsWith('/edit/');
  const isWorkspacePage = isEditorPage || location.pathname === '/ai' || location.pathname === '/agent';
  const previousPathRef = useRef('/');
  const isManualPage = location.pathname === '/manual';
  useEffect(() => {
    if (!isManualPage) previousPathRef.current = `${location.pathname}${location.search}`;
  }, [isManualPage, location.pathname, location.search]);
  const toggleHelp = () => {
    navigate(isManualPage ? previousPathRef.current : '/manual');
  };
  const { mode, setMode } = useThemeStore();
  const { mode: viewMode, isMobile, cycleMode } = useViewModeStore();
  const { status: syncStatus, lastSyncAt, doSync } = useSyncStore();
  const syncEnabled = !!useSettingsStore((s) => s.settings?.sync?.enabled);
  const pomoVisible = usePomodoroStore((s) => s.visible);
  const setPomoVisible = usePomodoroStore((s) => s.setVisible);
  const setCurrent = useJournalStore((s) => s.setCurrent);
  const createTodayNote = useJournalStore((s) => s.createTodayNote);

  const ThemeIcon = themeConfig[mode].icon;
  const nextTheme = themeCycle[(themeCycle.indexOf(mode) + 1) % themeCycle.length];
  const ViewModeIcon = viewModeConfig[viewMode].icon;
  const nextViewMode = viewModeCycle[(viewModeCycle.indexOf(viewMode) + 1) % viewModeCycle.length];
  const orderedMobileNavItems = mobileNavOrder.map((to) => mobileNavByPath.get(to)).filter(Boolean) as typeof mobileNavItems;
  const mobileTabItems = orderedMobileNavItems.slice(0, 4);
  const mobileMoreOrderedItems = orderedMobileNavItems.slice(4);
  const desktopNavByPath = new Map(navItems.map((item) => [item.to, item]));
  const orderedDesktopNavItems = desktopNavOrder.map((to) => desktopNavByPath.get(to)).filter(Boolean) as typeof navItems;

  const moveDesktopNav = (target: string) => {
    if (!draggingNav || draggingNav === target) return;
    const next = [...desktopNavOrder];
    const from = next.indexOf(draggingNav); const to = next.indexOf(target);
    if (from < 0 || to < 0) return;
    next.splice(from, 1); next.splice(to, 0, draggingNav);
    setDesktopNavOrder(next); localStorage.setItem(DESKTOP_NAV_ORDER_KEY, JSON.stringify(next));
  };

  const updateMobileNavOrder = (next: string[]) => {
    setMobileNavOrder(next);
    saveMobileNavOrder(next);
  };

  const moveMobileNavItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= mobileNavOrder.length) return;
    const next = [...mobileNavOrder];
    [next[index], next[target]] = [next[target], next[index]];
    updateMobileNavOrder(next);
  };

  const resetMobileNavOrder = () => {
    updateMobileNavOrder(DEFAULT_MOBILE_NAV_ORDER);
  };

  const openBlankDocument = () => {
    setShowNewSheet(false);
    setCurrent(null);
    navigate('/edit/new');
  };

  const openTodayNote = async () => {
    setShowNewSheet(false);
    const { entry } = await createTodayNote();
    navigate(`/edit/${entry.id}`);
  };

  if (isMobile) {
    return (
      <div className="flex min-h-[100dvh] flex-col overflow-hidden">
        {showTemplates && <TemplatePicker onClose={() => setShowTemplates(false)} />}

        <div className="glass flex h-11 shrink-0 items-center gap-1.5 border-b border-[var(--color-border)] px-2.5">
          <button
            onClick={onOpenPalette}
            className="flex flex-1 items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-2)] transition-colors"
            title="搜索"
            type="button"
          >
            <Search className="h-4 w-4" />
            <span>搜索</span>
          </button>
          <button
            onClick={cycleMode}
            className="btn-ghost p-1.5"
            title={`当前: ${viewModeConfig[viewMode].label} — 点击切换为${viewModeConfig[nextViewMode].label}`}
            aria-label={`当前: ${viewModeConfig[viewMode].label}，切换为${viewModeConfig[nextViewMode].label}`}
            type="button"
          >
            <ViewModeIcon className="h-4 w-4" />
          </button>
          <button
            onClick={toggleHelp}
            className={`btn-ghost p-1.5 ${isManualPage ? 'text-[var(--color-primary)]' : ''}`}
            title={isManualPage ? '退出帮助，返回上一页' : '打开使用手册'}
            aria-label={isManualPage ? '退出帮助，返回上一页' : '打开使用手册'}
            type="button"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          <button
            onClick={() => setPomoVisible(!pomoVisible)}
            className={`btn-ghost p-1.5 ${pomoVisible ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-tertiary)]'}`}
            title={pomoVisible ? '隐藏番茄钟' : '显示番茄钟'}
            type="button"
          >
            <Timer className="h-4 w-4" />
          </button>
        </div>

        <main className={`app-main flex-1 min-h-0 ${isWorkspacePage ? 'overflow-hidden p-0' : 'overflow-y-auto px-2.5 py-3'}`}>
          <div key={location.pathname} className={`min-h-full animate-slide-up ${isWorkspacePage ? `workspace-mobile-content ${isEditorPage ? 'workspace-mobile-content-editor' : ''}` : ''}`}>
            <Outlet />
          </div>
        </main>

        {!isWorkspacePage && (
          <button
            onClick={() => setShowNewSheet(true)}
            className="fixed bottom-[4.35rem] right-3.5 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-primary)] text-white shadow-lg active:scale-90 transition-transform"
            title="新建文档"
            aria-label="新建文档"
            type="button"
          >
            <Plus className="h-5 w-5" />
          </button>
        )}

        {showNewSheet && (
          <div className="fixed inset-0 z-50 flex min-h-[100dvh] flex-col justify-end" onClick={() => setShowNewSheet(false)}>
            <div className="flex-1 bg-black/30 animate-fade-in" />
          <div
            ref={newSheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="新建文档"
            className="glass rounded-t-2xl border-t border-[var(--color-border)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--color-text)]">新建</span>
                <button className="btn-ghost h-8 w-8 p-0" onClick={() => setShowNewSheet(false)} aria-label="关闭新建菜单" type="button">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button className="btn-secondary flex h-14 flex-col items-center justify-center gap-1 text-xs" onClick={openBlankDocument} type="button">
                  <Plus className="h-4 w-4" />
                  空白
                </button>
                <button className="btn-secondary flex h-14 flex-col items-center justify-center gap-1 text-xs" onClick={openTodayNote} type="button">
                  <BookOpen className="h-4 w-4" />
                  今日
                </button>
                <button className="btn-secondary flex h-14 flex-col items-center justify-center gap-1 text-xs" onClick={() => { setShowNewSheet(false); setShowTemplates(true); }} type="button">
                  <Layers className="h-4 w-4" />
                  模板
                </button>
              </div>
            </div>
          </div>
        )}

        {!isEditorPage && <nav className="mobile-bottom-nav glass flex shrink-0 items-center border-t border-[var(--color-border)] pb-[env(safe-area-inset-bottom)]">
          {mobileTabItems.map((item) => {
            const isActive = item.to === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={`mobile-tab flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors ${
                  isActive ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-tertiary)]'
                }`}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </NavLink>
            );
          })}
          <button
            onClick={() => { setShowMoreSheet(true); setIsEditingMobileNav(false); }}
            className="mobile-tab flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium text-[var(--color-text-tertiary)]"
            type="button"
          >
            <MoreHorizontal className="h-5 w-5" />
            更多
          </button>
        </nav>}

        {showMoreSheet && (
          <div className="fixed inset-0 z-50 flex min-h-[100dvh] flex-col justify-end" onClick={() => setShowMoreSheet(false)}>
            <div className="flex-1 bg-black/30 animate-fade-in" />
          <div
            ref={moreSheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={isEditingMobileNav ? '调整移动端导航顺序' : '更多入口'}
            className="glass rounded-t-2xl border-t border-[var(--color-border)] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--color-text)]">{isEditingMobileNav ? '调整顺序' : '更多'}</span>
                <div className="flex items-center gap-1.5">
                  {!isEditingMobileNav && (
                    <button className="btn-ghost h-8 px-2 text-xs" onClick={() => setIsEditingMobileNav(true)} type="button">
                      排序
                    </button>
                  )}
                  {isEditingMobileNav && (
                    <>
                      <button className="btn-ghost h-8 w-8 p-0" onClick={resetMobileNavOrder} title="恢复默认" type="button">
                        <RotateCcw className="h-4 w-4" />
                      </button>
                      <button className="btn-primary h-8 px-3 text-xs" onClick={() => setIsEditingMobileNav(false)} type="button">
                        完成
                      </button>
                    </>
                  )}
                  <button className="btn-ghost h-8 w-8 p-0" onClick={() => setShowMoreSheet(false)} aria-label="关闭更多菜单" type="button">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {isEditingMobileNav ? (
                <div className="max-h-[58vh] space-y-1 overflow-y-auto pr-1">
                  {orderedMobileNavItems.map((item, index) => (
                    <div key={item.to} className="grid grid-cols-[1.25rem_1.25rem_minmax(0,1fr)_2.75rem_3.75rem] items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5">
                      <span className="text-center text-[10px] text-[var(--color-text-tertiary)]">{index + 1}</span>
                      <item.icon className="h-4 w-4 shrink-0 text-[var(--color-text-secondary)]" />
                      <span className="truncate text-sm text-[var(--color-text)]">{item.label}</span>
                      <span className="rounded-full bg-[var(--color-surface-2)] px-1.5 py-0.5 text-center text-[10px] text-[var(--color-text-tertiary)]">{index < 4 ? '底栏' : '更多'}</span>
                      <div className="grid grid-cols-2 gap-1">
                        <button className="btn-ghost h-7 w-7 p-0" onClick={() => moveMobileNavItem(index, -1)} disabled={index === 0} title="上移" type="button">
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button className="btn-ghost h-7 w-7 p-0" onClick={() => moveMobileNavItem(index, 1)} disabled={index === orderedMobileNavItems.length - 1} title="下移" type="button">
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-3">
                  {mobileMoreOrderedItems.map((item) => (
                    <button
                      key={item.to}
                      className="flex min-h-14 flex-col items-center justify-center gap-1.5 rounded-lg px-1 py-2 text-center text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
                      onClick={() => { navigate(item.to); setShowMoreSheet(false); }}
                      type="button"
                    >
                      <item.icon className="h-5 w-5" />
                      <span className="max-w-full truncate">{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside
        className={`glass relative flex flex-col border-r border-[var(--color-border)] ${
          collapsed ? 'w-16 transition-all duration-300' : ''
        }`}
        style={collapsed ? undefined : { width: sidebarWidth }}
      >
        {!collapsed && (
          <div
            onMouseDown={startResize}
            className="absolute right-0 top-0 bottom-0 z-10 w-1.5 cursor-col-resize hover:bg-[var(--color-primary)]/40 transition-colors"
            title="拖动调整侧栏宽度"
          />
        )}
        <div className="flex h-14 items-center justify-between border-b border-[var(--color-border)] px-4 relative">
          {!collapsed ? (
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-primary)] text-white shadow-sm">
                <BookOpen className="h-4 w-4" />
              </div>
              <span className="text-sm font-bold tracking-tight text-[var(--color-text)]">知屿</span>
            </div>
          ) : (
            <div className="mx-auto flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-primary)] text-white shadow-sm">
              <BookOpen className="h-4 w-4" />
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="btn-ghost p-1.5 absolute top-3 right-2"
            title={collapsed ? '展开侧栏' : '收起侧栏'}
            type="button"
          >
            <ChevronLeft className={`h-4 w-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <div className="p-2 border-b border-[var(--color-border)]">
          <button
            onClick={onOpenPalette}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-[var(--color-text-tertiary)] bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] transition-colors"
            title="搜索文档和快捷操作"
            type="button"
          >
            <Search className="h-3.5 w-3.5" />
            {collapsed ? <span className="text-xs">⌘K</span> : <span>搜索...</span>}
            {!collapsed && <kbd className="ml-auto text-[10px]">⌘K</kbd>}
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
          {(['创作', '智能', '成长', '管理'] as const).map((group) => <div key={group} className="mb-3">
          {!collapsed && <div className="px-3 pb-1 pt-2 text-[10px] font-semibold tracking-[.14em] text-[var(--color-text-tertiary)]">{group}</div>}
          {orderedDesktopNavItems.filter((item) => item.group === group).map((item) => {
            const isActive = item.to === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                draggable
                onDragStart={() => setDraggingNav(item.to)}
                onDragEnd={() => setDraggingNav(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { event.preventDefault(); moveDesktopNav(item.to); setDraggingNav(null); }}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]'
                }`}
                title={item.label}
                aria-label={item.label}
              >
                <item.icon className={`h-5 w-5 flex-shrink-0 ${isActive ? '' : 'transition-transform group-hover:scale-110'}`} />
                {!collapsed && <span>{item.label}</span>}
                {isActive && !collapsed && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" />}
              </NavLink>
            );
          })}
          </div>)}
        </nav>

        <div className="border-t border-[var(--color-border)] p-2">
          <button
            onClick={() => setMode(nextTheme)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
            title={`当前: ${themeConfig[mode].label} — 点击切换为${themeConfig[nextTheme].label}`}
            type="button"
          >
            <ThemeIcon className="h-5 w-5 flex-shrink-0 transition-transform hover:rotate-12" />
            {!collapsed && (
              <>
                <span>{themeConfig[mode].label}</span>
                <span className="ml-auto text-[10px] text-[var(--color-text-tertiary)]">→ {themeConfig[nextTheme].hint}</span>
              </>
            )}
          </button>
          {!collapsed && <div className="px-3 pt-1 pb-1 text-[10px] text-[var(--color-text-tertiary)]">知屿 v{__APP_VERSION__}</div>}
        </div>
      </aside>

      <main className="app-main flex-1 overflow-hidden flex flex-col">
        <div className="glass sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--color-border)] px-5 h-12 shrink-0">
          <div className="flex-1" />
          <span className="text-xs text-[var(--color-text-tertiary)] tabular-nums hidden sm:inline">
            {new Intl.DateTimeFormat('zh-CN', {
              timeZone: 'Asia/Shanghai',
              month: 'long',
              day: 'numeric',
              weekday: 'short',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            }).format(now)}
          </span>
          <button
            onClick={cycleMode}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-2)]"
            title={`当前: ${viewModeConfig[viewMode].label} — 点击切换为${viewModeConfig[nextViewMode].label}`}
            type="button"
          >
            <ViewModeIcon className="h-4 w-4" />
            <span className="hidden md:inline">{viewModeConfig[viewMode].label}</span>
          </button>
          {syncEnabled && (
            <button
              onClick={() => doSync()}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-2)]"
              title={lastSyncAt ? `上次同步：${new Date(lastSyncAt).toLocaleString('zh-CN')}（点击立即同步）` : '点击立即同步'}
              type="button"
            >
              {syncStatus === 'syncing'
                ? <Loader2 className="h-4 w-4 animate-spin text-[var(--color-primary)]" />
                : <Cloud className={`h-4 w-4 ${syncStatus === 'error' ? 'text-[var(--color-danger)]' : syncStatus === 'success' ? 'text-[var(--color-success)]' : ''}`} />}
              <span className={`hidden md:inline ${syncStatus === 'error' ? 'text-[var(--color-danger)]' : syncStatus === 'success' ? 'text-[var(--color-success)]' : ''}`}>
                {syncStatus === 'syncing' ? '同步中' : syncStatus === 'success' ? '同步成功' : syncStatus === 'error' ? '同步失败' : '同步'}
              </span>
            </button>
          )}
          <button
            onClick={() => setPomoVisible(!pomoVisible)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors hover:bg-[var(--color-surface-2)] ${pomoVisible ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-tertiary)]'}`}
            title={pomoVisible ? '隐藏番茄钟' : '显示番茄钟'}
            type="button"
          >
            <Timer className="h-4 w-4" />
          </button>
          <button
            onClick={toggleHelp}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-2)] ${
              isManualPage ? 'text-[var(--color-primary)]' : ''
            }`}
            title={isManualPage ? '退出帮助，返回上一页' : '打开使用手册'}
            aria-label={isManualPage ? '退出帮助，返回上一页' : '打开使用手册'}
            type="button"
          >
            <HelpCircle className="h-4 w-4" />
            <span className="hidden md:inline">帮助</span>
          </button>
        </div>

        <div key={location.pathname} className={`app-content animate-slide-up flex-1 min-h-0 overflow-y-auto ${isWorkspacePage ? 'app-content-workspace p-0' : 'px-5 py-5 xl:px-7'}`}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
