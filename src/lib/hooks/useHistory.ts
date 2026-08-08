import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * 通用文本撤销/重做 Hook
 * 通过防抖快照实现：用户连续输入时只产生一个撤销点
 */
export function useHistory(value: string, onChange: (v: string) => void) {
  const pastRef = useRef<string[]>([]);
  const futureRef = useRef<string[]>([]);
  const lastSnapshot = useRef(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isApplying = useRef(false);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateFlags = useCallback(() => {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  }, []);

  // 监听 value 变化，防抖创建快照
  useEffect(() => {
    // 如果是 undo/redo 触发的变更，不创建快照
    if (isApplying.current) {
      isApplying.current = false;
      lastSnapshot.current = value;
      return;
    }

    if (value === lastSnapshot.current) return;

    // 防抖：600ms 内的连续编辑只产生一个快照
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      pastRef.current.push(lastSnapshot.current);
      if (pastRef.current.length > 50) pastRef.current.shift();
      futureRef.current = []; // 新编辑清空重做栈
      lastSnapshot.current = value;
      updateFlags();
    }, 600);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, updateFlags]);

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return;
    const prev = pastRef.current.pop()!;
    futureRef.current.push(lastSnapshot.current);
    lastSnapshot.current = prev;
    isApplying.current = true;
    onChange(prev);
    updateFlags();
  }, [onChange, updateFlags]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current.pop()!;
    pastRef.current.push(lastSnapshot.current);
    lastSnapshot.current = next;
    isApplying.current = true;
    onChange(next);
    updateFlags();
  }, [onChange, updateFlags]);

  return { undo, redo, canUndo, canRedo };
}
