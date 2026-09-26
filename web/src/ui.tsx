import { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

export type Page = 'today' | 'opportunities' | 'companion' | 'profile';
export function Icon({ name, size = 21 }: { name: 'today' | 'opportunities' | 'companion' | 'profile' | 'plus' | 'chevron' | 'close' | 'send' | 'check' | 'edit' | 'calendar' | 'bookmark' | 'settings' | 'external'; size?: number }) {
  const paths: Record<string, ComponentChildren> = {
    today: <><path d="M4 10.5 12 4l8 6.5V20H4z"/><path d="M9 20v-6h6v6"/></>,
    opportunities: <><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M8 5V3m8 2V3M3.5 10h17m-12 4h3m-3 3h5"/></>,
    companion: <><path d="M5 5.5h14v10.2a3 3 0 0 1-3 3H9l-4 2V5.5Z"/><path d="M9 10.5h6m-6 3h4"/></>,
    profile: <><circle cx="12" cy="8" r="3"/><path d="M5 20v-2a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v2Z"/></>,
    plus: <path d="M12 5v14M5 12h14"/>, chevron: <path d="m9 5 7 7-7 7"/>,
    close: <path d="M5 5 19 19M19 5 5 19"/>, send: <><path d="m4 12 16-8-4 16-4.5-6.5L4 12Z"/><path d="m11.5 13.5 8.5-9.5"/></>,
    check: <path d="m4 12 5 5L20 6"/>, edit: <><path d="M5 17 16.8 5.2a2 2 0 0 1 2.8 2.8L7.8 19.8 4 20z"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/></>,
    bookmark: <path d="M5 4h14v17l-7-4-7 4V4Z"/>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9l2.2 2.2m9.8 9.8 2.2 2.2m0-14.2-2.2 2.2m-9.8 9.8-2.2 2.2"/></>,
    external: <><path d="M13 4h7v7m0-7-9 9"/><path d="M18 15v5H4V6h5"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
export function Mark({ size = 36 }: { size?: number }) {
  return <svg class="brand-mark" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="13" fill="currentColor"/><path d="M14 31c10 0 9-14 19-14" fill="none" stroke="#f7f8f5" stroke-width="3.2" stroke-linecap="round"/><circle cx="14" cy="31" r="4" fill="#e9ac72"/><circle cx="33" cy="17" r="5" fill="#f7f8f5"/></svg>;
}
export function Header({ eyebrow, title, sub, action }: { eyebrow?: string; title: string; sub?: string; action?: ComponentChildren }) {
  return <div class="page-head"><div>{eyebrow && <span class="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{sub && <p>{sub}</p>}</div>{action && <div class="page-head-action">{action}</div>}</div>;
}
export function Card({ children, className = '', id }: { children: ComponentChildren; className?: string; id?: string }) { return <section id={id} class={'card ' + className}>{children}</section>; }
export function Empty({ title, body, action }: { title: string; body: string; action?: ComponentChildren }) {
  return <div class="empty"><div class="empty-dot" aria-hidden="true"/><strong>{title}</strong><p>{body}</p>{action}</div>;
}
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab') return;
      const items = [...(ref.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled])') || [])];
      if (!items.length) return;
      if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); items.at(-1)?.focus(); }
      if (!e.shiftKey && document.activeElement === items.at(-1)) { e.preventDefault(); items[0].focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus({ preventScroll: true }); };
  }, []);
  return <div class="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div class="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
      <div class="sheet-head"><strong>{title}</strong><button class="icon-button" aria-label="关闭" onClick={onClose}><Icon name="close"/></button></div>
      <div class="sheet-body">{children}</div>
    </div>
  </div>;
}
