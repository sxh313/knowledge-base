import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick?: () => void | Promise<void>;
  danger?: boolean;
  divider?: boolean;     // 在此项后渲染分隔线
  disabled?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

/** 通用右键菜单：定位到点击坐标，点击外部/选项后自动关闭 */
export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    // 延迟一帧绑定，避免触发菜单的同一个事件立刻关闭
    const id = requestAnimationFrame(() => {
      document.addEventListener('mousedown', onDown);
      document.addEventListener('contextmenu', onDown);
    });
    window.addEventListener('keydown', onEsc);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('contextmenu', onDown);
      window.removeEventListener('keydown', onEsc);
    };
  }, [onClose]);

  // 边界处理：避免超出视口
  const maxX = typeof window !== 'undefined' ? window.innerWidth - 200 : x;
  const maxY = typeof window !== 'undefined' ? window.innerHeight - items.length * 36 - 12 : y;
  const left = Math.min(x, maxX);
  const top = Math.min(y, maxY);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[9999] min-w-[160px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-xl animate-fade-in"
      style={{ left, top }}
    >
      {items.map((item) => (
        <div key={item.key}>
          <button
            disabled={item.disabled}
            onClick={async () => {
              if (item.disabled) return;
              try {
                await item.onClick?.();
              } finally {
                onClose();
              }
            }}
            className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors ${
              item.disabled
                ? 'cursor-not-allowed text-[var(--color-text-tertiary)]'
                : item.danger
                  ? 'text-[var(--color-danger)] hover:bg-[var(--color-danger-light)]'
                  : 'text-[var(--color-text)] hover:bg-[var(--color-surface-2)]'
            }`}
          >
            {item.icon && <span className="flex h-4 w-4 items-center justify-center">{item.icon}</span>}
            <span>{item.label}</span>
          </button>
          {item.divider && <div className="my-1 h-px bg-[var(--color-border)]" />}
        </div>
      ))}
    </div>,
    document.body,
  );
}
