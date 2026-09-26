import { useEffect, useRef, useState } from 'preact/hooks';
import { answer } from '../ai';
import { AppState, id, nextAction, now, stageFor } from '../domain';
import { Card, Icon, Modal } from '../ui';

type Props = { state: AppState; change: (fn: (s: AppState) => void) => void; detail: string; notify: (message: string) => void };
const safeUrl = (input: string) => { try { const u = new URL(input); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };
export function Companion({ state: s, change, detail, notify }: Props) {
  const [draft, setDraft] = useState('');
  const [includeProfile, setIncludeProfile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [memoryText, setMemoryText] = useState<string | null>(null);
  const [activeContext, setActiveContext] = useState<string | null>(null);
  const [showContext, setShowContext] = useState(false);
  const stream = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);
  const nearBottom = useRef(true);
  const currentId = detail && detail !== 'new' ? detail : activeContext;
  const o = s.opportunities.find(item => item.id === currentId);
  const next = nextAction(s);
  useEffect(() => { if (detail && s.opportunities.some(o => o.id === detail)) setActiveContext(detail); }, [detail]);
  useEffect(() => { if (nearBottom.current && stream.current) stream.current.scrollTop = stream.current.scrollHeight; }, [s.chats.length]);
  const send = async (e?: Event, sample?: string) => {
    e?.preventDefault();
    const text = (sample || draft).trim().slice(0, 3000);
    if (!text || busy) return;
    const source = s, controller = new AbortController();
    abort.current = controller; setBusy(true); setDraft('');
    nearBottom.current = true;
    change(st => { st.chats.push({ id: id(), role: 'user', text, at: now(), opportunityId: o?.id }); });
    try {
      const res = await answer(text, source, o, includeProfile, controller.signal);
      change(st => { st.chats.push({ id: id(), role: 'assistant', text: res.text, at: now(), opportunityId: o?.id, reasoning: res.reasoning, sources: res.sources }); });
    } catch (error) {
      if (controller.signal.aborted) notify('已停止生成，问题仍保留在本机');
      else change(st => { st.chats.push({ id: id(), role: 'assistant', text: `暂时没能回答：${error instanceof Error ? error.message : '接口失败'}。你可以检查设置或切回本地引导。`, at: now(), error: true }); });
    } finally { setBusy(false); abort.current = null; }
  };
  const saveAction = () => {
    if (next.task) return;
    change(st => st.actions.push({ id: id(), title: next.title, done: false, createdAt: now(), dueAt: '', source: 'guide', opportunityId: o?.id }));
    notify('已加入“今天”的行动');
  };
  return <div class="companion-screen">
    <div class="companion-overview">
      <div class="companion-heading"><div><span class="eyebrow">你的求职伙伴</span><h1>一起看清下一步</h1><p>{stageFor(s)} · {s.provider.mode === 'guide' ? '免费本地引导' : s.provider.mode === 'compatible' ? '你的兼容 API' : s.provider.mode === 'worker' ? '独立联网接口' : '浏览器模型实验'}</p></div><button class="icon-button ask-top" aria-label="在顶部开始提问" title="提问" onClick={() => composer.current?.focus({ preventScroll: true })}><Icon name="edit"/></button></div>
      <div class="companion-context">
        <div><small>我了解的状态</small><strong>{s.profile.target || '方向尚未确定'} · {s.opportunities.length} 份已保存机会</strong></div>
        <button class="quiet-link" onClick={() => setShowContext(!showContext)} aria-expanded={showContext}>查看上下文 <Icon name="chevron" size={15}/></button>
      </div>
      {showContext && <div class="context-expansion"><p>伙伴只基于你保存的资料说话。聊天记录不等于长期记忆；“我的”可以逐条管理记忆和事实。</p><a href="#profile">编辑档案与记忆</a></div>}
      <div class="companion-next"><span class="eyebrow">建议的一步 · {next.reason}</span><strong>{next.title}</strong><div><a href={next.href} class="quiet-link">{next.label} <Icon name="chevron" size={14}/></a>{!next.task && <button class="quiet-link" onClick={saveAction}>加入任务</button>}</div></div>
      <div class="prompt-chips" aria-label="快捷提问">{['帮我梳理下一步', '这份岗位值得投吗', '帮我改一段真实经历', '准备面试问题'].map(t => <button onClick={() => send(undefined,t)} disabled={busy}>{t}</button>)}</div>
    </div>
    <div class="chat-stream" ref={stream} role="log" aria-label="伙伴对话" aria-live="polite" onScroll={e => { const el = e.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
      {s.chats.length ? s.chats.map(m => <div class={'message ' + m.role} key={m.id}><div class="message-head">{m.role === 'assistant' ? '见程' : '我'} <time>{new Date(m.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time></div><div class={'message-body ' + (m.error ? 'message-error' : '')}>{m.text}</div>
        {m.role === 'user' && <button class="inline-action" onClick={() => setMemoryText(m.text)}>记住这条</button>}
        {!!m.reasoning && <details class="reasoning"><summary>接口返回的思考内容</summary><p>{m.reasoning}</p></details>}
        {!!m.sources?.length && <div class="sources"><small>接口返回的来源（请在原站核对）</small>{m.sources.map(x => safeUrl(x.url) && <a href={safeUrl(x.url)} target="_blank" rel="noopener noreferrer">{x.title || new URL(x.url).hostname} <Icon name="external" size={13}/></a>)}</div>}
      </div>) : <div class="chat-first"><span class="first-mark"><Icon name="companion" size={26}/></span><h2>我们从你眼前的问题开始。</h2><p>可以直接提问，也可以选择一个已保存岗位。默认使用本地规则，不会冒充大模型。</p></div>}
      {busy && <div class="working" role="status"><span/>正在处理你的问题… <button onClick={() => abort.current?.abort()}>停止</button></div>}
    </div>
    <form class="chat-composer" onSubmit={send}>
      <div class="context-toggles">
        {s.opportunities.length > 0 && <label class="context-select">当前机会<select aria-label="当前机会" value={o?.id || ''} onChange={e => { setActiveContext(e.currentTarget.value || null); location.hash = 'companion/' + e.currentTarget.value; }}>
          <option value="">不附岗位</option>{s.opportunities.map(j => <option value={j.id}>{j.role || j.company || '未命名岗位'}</option>)}
        </select></label>}
        <label class="context-check"><input type="checkbox" checked={includeProfile} onChange={e => setIncludeProfile(e.currentTarget.checked)}/>附上档案与已允许的记忆</label>
      </div>
      <div class="composer-row"><textarea ref={composer} aria-label="向伙伴提问" rows={1} value={draft} onInput={e => setDraft(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!busy) send(); } }} placeholder="说说你现在最想解决的事…" /><button type="submit" class="send-button" disabled={!draft.trim() || busy} aria-label="发送"><Icon name="send" size={19}/></button></div>
      <small>{s.provider.mode === 'guide' ? '本地引导只给规则与核对清单，不会联网。' : s.provider.mode === 'worker' && s.provider.webSearch ? '联网搜索已由你开启，请核对来源。' : '对话将发送到你设置的接口；未开启实时搜索。'}</small>
    </form>
    {memoryText !== null && <Modal title="确认保存为长期记忆" onClose={() => setMemoryText(null)}><p class="hint">只有你确认的内容才会成为长期记忆，之后可以在“我的”删除或关闭在线发送。</p><label class="field">要记住的文字<textarea rows={5} value={memoryText} onInput={e => setMemoryText(e.currentTarget.value.slice(0, 2000))}/></label><button class="button primary" onClick={() => { if (memoryText.trim()) change(st => st.memories.push({ id: id(), text: memoryText.trim(), includeOnline: false, createdAt: now() })); setMemoryText(null); notify('记忆已保存，默认不随在线请求发送'); }}>确认记住</button></Modal>}
  </div>;
}
