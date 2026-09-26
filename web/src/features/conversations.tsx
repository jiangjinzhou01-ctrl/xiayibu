import { useEffect, useRef, useState } from 'preact/hooks';
import { AppState, id, now } from '../domain';
import { Icon } from '../ui';

type Props = {
  state: AppState;
  change: (fn: (s: AppState) => void) => void;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
};

export function Conversations({ state: s, change, onClose, onSelect, onNew }: Props) {
  const [section, setSection] = useState<'chats' | 'memory'>('chats');
  const [query, setQuery] = useState('');
  const [memoryDraft, setMemoryDraft] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editingText, setEditingText] = useState('');
  const drawer = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    drawer.current?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); return; }
      if (event.key !== 'Tab') return;
      const items = [...(drawer.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled])') || [])];
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown',key); previous?.focus({ preventScroll: true }); };
  }, []);
  const term = query.trim().toLocaleLowerCase();
  const conversations = [...s.conversations].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).map(c => {
    const messages = s.chats.filter(m => m.conversationId === c.id);
    const match = term ? messages.find(m => m.text.toLocaleLowerCase().includes(term)) : undefined;
    return { conversation: c, snippet: match?.text || messages.at(-1)?.text || '', matches: !term || c.title.toLocaleLowerCase().includes(term) || !!match };
  }).filter(x => x.matches);
  const addMemory = () => {
    const text = memoryDraft.trim().slice(0,2000);
    if (!text) return;
    change(st => { st.memories.push({ id: id(), text, createdAt: now(), includeOnline: false }); });
    setMemoryDraft('');
  };
  return <div class="conversation-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <aside class="conversation-drawer" role="dialog" aria-modal="true" aria-label="对话与全局记忆" tabIndex={-1} ref={drawer}>
      <div class="conversation-drawer-head"><div><span>见程 / 伙伴</span><strong>你的对话</strong></div><button type="button" class="icon-button" aria-label="关闭对话列表" onClick={onClose}><Icon name="close" size={19}/></button></div>
      <div class="conversation-tabs" role="tablist" aria-label="对话资料"><button type="button" role="tab" aria-selected={section === 'chats'} class={section === 'chats' ? 'active' : ''} onClick={() => setSection('chats')}>对话记录</button><button type="button" role="tab" aria-selected={section === 'memory'} class={section === 'memory' ? 'active' : ''} onClick={() => setSection('memory')}>全局记忆 <span>{s.memories.length}</span></button></div>
      {section === 'chats' ? <>
        <div class="conversation-actions"><button type="button" class="new-conversation" onClick={onNew}><Icon name="plus" size={17}/> 新对话</button><label class="conversation-search"><span class="sr-only">搜索历史对话及内容</span><input ref={search} type="search" value={query} onInput={e => setQuery(e.currentTarget.value)} placeholder="搜索对话和消息内容"/></label></div>
        <div class="conversation-list" role="list" aria-label="历史对话">{conversations.length ? conversations.map(({ conversation:c, snippet }) => <button type="button" role="listitem" key={c.id} class={'conversation-item ' + (s.activeConversationId === c.id ? 'selected' : '')} onClick={() => onSelect(c.id)}><strong>{c.title}</strong><span>{snippet.slice(0,90)}</span><small>{new Date(c.updatedAt).toLocaleDateString('zh-CN', { month:'short', day:'numeric' })}</small></button>) : <div class="conversation-empty">{term ? '没有找到匹配的对话或消息。' : '还没有对话。发出第一条消息后，它会出现在这里。'}</div>}</div>
      </> : <div class="memory-drawer-body"><p>这些记忆在所有对话中共用。默认只保存在此设备；你可以逐条允许发送给在线模型。</p><label class="field">新增全局记忆<textarea rows={3} value={memoryDraft} onInput={e => setMemoryDraft(e.currentTarget.value.slice(0,2000))} placeholder="例如：我希望回答简短、直接"/></label><button type="button" class="button primary" onClick={addMemory} disabled={!memoryDraft.trim()}>保存记忆</button><div class="memory-drawer-list">{s.memories.map(m => <div class="memory-drawer-item" key={m.id}>{editingId === m.id ? <><textarea aria-label="编辑记忆" value={editingText} rows={3} onInput={e => setEditingText(e.currentTarget.value.slice(0,2000))}/><div class="memory-actions"><button type="button" onClick={() => { if (editingText.trim()) change(st => { st.memories.find(x => x.id === m.id)!.text = editingText.trim(); }); setEditingId(''); }}>保存修改</button><button type="button" onClick={() => setEditingId('')}>取消</button></div></> : <><p>{m.text}</p><label class="checkline"><input type="checkbox" checked={m.includeOnline} onChange={e => change(st => { st.memories.find(x => x.id === m.id)!.includeOnline = e.currentTarget.checked; })}/>允许在开启档案授权时发送给在线模型</label><div class="memory-actions"><button type="button" onClick={() => { setEditingId(m.id); setEditingText(m.text); }}>编辑</button><button type="button" onClick={() => { if (confirm('从此设备删除这条全局记忆？')) change(st => { st.memories = st.memories.filter(x => x.id !== m.id); }); }}>删除</button></div></>}</div>)}{!s.memories.length && <div class="conversation-empty">还没有全局记忆。只保存你确认过的事实和偏好。</div>}</div></div>}
      <div class="conversation-drawer-foot">记录只在此设备；换设备前请到「我的」导出备份。</div>
    </aside>
  </div>;
}
