import { useEffect, useRef, useState } from 'preact/hooks';
import { answer, getWorkerToken, hasApiKey, validBase } from '../ai';
import { AppState, id, nextAction, now, stageFor } from '../domain';
import { Card, Icon, Modal } from '../ui';
import { Conversations } from './conversations';

type Props = { state: AppState; change: (fn: (s: AppState) => void) => void; detail: string; notify: (message: string) => void };
const safeUrl = (input: string) => { try { const u = new URL(input); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; } };
export function Companion({ state: s, change, detail, notify }: Props) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [memoryText, setMemoryText] = useState<string | null>(null);
  const [activeContext, setActiveContext] = useState<string | null>(null);
  const [showContext, setShowContext] = useState(false);
  const [composerActive, setComposerActive] = useState(false);
  const [modelMenu, setModelMenu] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const stream = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const composerForm = useRef<HTMLFormElement>(null);
  const abort = useRef<AbortController | null>(null);
  const nearBottom = useRef(true);
  const currentId = detail && detail !== 'new' ? detail : activeContext;
  const o = s.opportunities.find(item => item.id === currentId);
  const next = nextAction(s);
  const includeProfile = !!s.provider.includeProfileOnline;
  const visibleChats = s.chats.filter(m => m.conversationId === s.activeConversationId);
  const readyApi = s.provider.mode === 'compatible' && !!s.provider.base && !!s.provider.model && hasApiKey(s.provider);
  const readyWorker = s.provider.mode === 'worker' && !!s.provider.workerEndpoint && !!getWorkerToken(s.provider.workerEndpoint);
  const supplier = (() => { try { return safeUrl(new URL(validBase(s.provider.base)).origin); } catch { return ''; } })();
  const modelLink = safeUrl(s.provider.modelUrl || '') || supplier;
  const modeLabel = s.provider.mode === 'guide' ? '免费本地引导' : s.provider.mode === 'compatible' ? readyApi ? s.provider.model : '兼容 API 待配置' : s.provider.mode === 'worker' ? readyWorker ? '独立联网接口' : '联网接口待配置' : '浏览器模型实验';
  const models = [...new Set([s.provider.model, ...(s.provider.availableModels || [])].filter(Boolean))];
  const shownModels = models.filter(m => m.toLowerCase().includes(modelSearch.trim().toLowerCase())).slice(0, 30);
  useEffect(() => { if (detail && s.opportunities.some(o => o.id === detail)) setActiveContext(detail); }, [detail]);
  useEffect(() => { if (nearBottom.current && stream.current) stream.current.scrollTop = stream.current.scrollHeight; }, [visibleChats.length, s.activeConversationId]);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!composerForm.current?.contains(event.target as Node)) { setComposerActive(false); setModelMenu(false); } };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setModelMenu(false); };
    document.addEventListener('pointerdown',outside); document.addEventListener('keydown',escape);
    return () => { document.removeEventListener('pointerdown',outside); document.removeEventListener('keydown',escape); };
  }, []);
  const chooseModel = (mode: AppState['provider']['mode'], model?: string) => {
    change(st => { st.provider.mode = mode; if (model && model !== st.provider.model) { st.provider.model = model; st.provider.modelUrl = ''; } });
    setModelMenu(false); setModelSearch(''); composer.current?.focus({ preventScroll: true });
  };
  const send = async (e?: Event, sample?: string) => {
    e?.preventDefault();
    const text = (sample || draft).trim().slice(0, 3000);
    if (!text || busy) return;
    const source = s, controller = new AbortController(), conversationId = s.activeConversationId || id();
    abort.current = controller; setBusy(true); setDraft('');
    nearBottom.current = true;
    change(st => {
      const at = now();
      if (!st.conversations.some(c => c.id === conversationId)) st.conversations.unshift({ id: conversationId, title: text.slice(0,42), createdAt: at, updatedAt: at, opportunityId: o?.id });
      else st.conversations.find(c => c.id === conversationId)!.updatedAt = at;
      st.activeConversationId = conversationId;
      st.chats.push({ id: id(), conversationId, role: 'user', text, at, opportunityId: o?.id });
    });
    try {
      const res = await answer(text, source, o, includeProfile, controller.signal, conversationId);
      change(st => { const at = now(); st.chats.push({ id: id(), conversationId, role: 'assistant', text: res.text, at, opportunityId: o?.id, reasoning: res.reasoning, sources: res.sources }); st.conversations.find(c => c.id === conversationId)!.updatedAt = at; });
    } catch (error) {
      if (controller.signal.aborted) notify('已停止生成，问题仍保留在本机');
      else change(st => { st.chats.push({ id: id(), conversationId, role: 'assistant', text: `暂时没能回答：${error instanceof Error ? error.message : '接口失败'}。你可以检查设置或切回本地引导。`, at: now(), error: true }); });
    } finally { setBusy(false); abort.current = null; }
  };
  const saveAction = () => {
    if (next.task) return;
    change(st => st.actions.push({ id: id(), title: next.title, done: false, createdAt: now(), dueAt: '', source: 'guide', opportunityId: o?.id }));
    notify('已加入“今天”的行动');
  };
  return <div class="companion-screen">
    <div class="companion-overview">
      <div class="companion-heading"><button type="button" class="icon-button history-toggle" aria-label="打开对话列表与全局记忆" title="对话与记忆" onClick={() => setDrawerOpen(true)}><Icon name="history" size={20}/></button><div class="companion-heading-copy"><span class="eyebrow">你的求职伙伴</span><h1>一起看清下一步</h1><p>{stageFor(s)} · {readyApi && modelLink ? <a class="model-inline-link" href={modelLink} target="_blank" rel="noopener noreferrer" title="打开供应商的模型介绍或网站">当前模型：{modeLabel} <Icon name="external" size={12}/></a> : s.provider.mode === 'compatible' && !readyApi ? <a class="model-inline-link" href="#profile" title="前往模型设置">{modeLabel} <Icon name="chevron" size={12}/></a> : modeLabel}</p></div><button class="icon-button ask-top" aria-label="在顶部开始提问" title="提问" onClick={() => composer.current?.focus({ preventScroll: true })}><Icon name="edit"/></button></div>
      <div class="companion-context">
        <div><small>我了解的状态</small><strong>{s.profile.target || '方向尚未确定'} · {s.opportunities.length} 份已保存机会</strong></div>
        <button class="quiet-link" onClick={() => setShowContext(!showContext)} aria-expanded={showContext}>查看上下文 <Icon name="chevron" size={15}/></button>
      </div>
      {showContext && <div class="context-expansion"><p>对话彼此独立，全局记忆会在各段对话间共用。在线发送档案与记忆由输入区的勾选控制。</p><button class="quiet-link" onClick={() => setDrawerOpen(true)}>管理对话与记忆</button></div>}
      <div class="companion-next"><span class="eyebrow">建议的一步 · {next.reason}</span><strong>{next.title}</strong><div><a href={next.href} class="quiet-link">{next.label} <Icon name="chevron" size={14}/></a>{!next.task && <button class="quiet-link" onClick={saveAction}>加入任务</button>}</div></div>
      <div class="prompt-chips" aria-label="快捷提问">{['帮我梳理下一步', '这份岗位值得投吗', '帮我改一段真实经历', '准备面试问题'].map(t => <button onClick={() => send(undefined,t)} disabled={busy}>{t}</button>)}</div>
    </div>
    <div class="chat-stream" ref={stream} role="log" aria-label="伙伴对话" aria-live="polite" onScroll={e => { const el = e.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
      {visibleChats.length ? visibleChats.map(m => <div class={'message ' + m.role} key={m.id}><div class="message-head">{m.role === 'assistant' ? '见程' : '我'} <time>{new Date(m.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time></div><div class={'message-body ' + (m.error ? 'message-error' : '')}>{m.text}</div>
        {m.role === 'user' && <button class="inline-action" onClick={() => setMemoryText(m.text)}>记住这条</button>}
        {!!m.reasoning && <details class="reasoning"><summary>接口返回的思考内容</summary><p>{m.reasoning}</p></details>}
        {!!m.sources?.length && <div class="sources"><small>接口返回的来源（请在原站核对）</small>{m.sources.map(x => safeUrl(x.url) && <a href={safeUrl(x.url)} target="_blank" rel="noopener noreferrer">{x.title || new URL(x.url).hostname} <Icon name="external" size={13}/></a>)}</div>}
      </div>) : <div class="chat-first"><span class="first-mark"><Icon name="companion" size={26}/></span><h2>我们从你眼前的问题开始。</h2><p>可以直接提问，也可以选择一个已保存岗位。{s.provider.mode === 'guide' ? '当前使用免费的本地引导，不会冒充大模型。' : readyApi ? `当前由 ${s.provider.model} 回答；未开启实时搜索。` : '发送前请确认模型设置已完成。'}</p></div>}
      {busy && <div class="working" role="status"><span/>正在处理你的问题… <button onClick={() => abort.current?.abort()}>停止</button></div>}
    </div>
    <form class="chat-composer" ref={composerForm} onSubmit={send}>
      <div class="context-toggles">
        {s.opportunities.length > 0 && <label class="context-select">当前机会<select aria-label="当前机会" value={o?.id || ''} onChange={e => { setActiveContext(e.currentTarget.value || null); location.hash = 'companion/' + e.currentTarget.value; }}>
          <option value="">不附岗位</option>{s.opportunities.map(j => <option value={j.id}>{j.role || j.company || '未命名岗位'}</option>)}
        </select></label>}
        <label class="context-check"><input type="checkbox" checked={includeProfile} onChange={e => { const checked = e.currentTarget.checked; change(st => { st.provider.includeProfileOnline = checked; }); }}/>在线提问附上档案与已允许的全局记忆</label>
      </div>
      {composerActive && <div class="composer-model-tools"><div class="model-picker"><button type="button" class="model-picker-trigger" aria-label="选择模型" aria-haspopup="true" aria-expanded={modelMenu} onClick={() => setModelMenu(!modelMenu)}><span class="model-live-dot"/>{modeLabel}<Icon name="chevron" size={14}/></button>
        {modelMenu && <div class="model-menu" role="group" aria-label="可用模型"><div class="model-menu-title">选择本次对话的模型</div><button type="button" class={s.provider.mode === 'guide' ? 'selected' : ''} onClick={() => chooseModel('guide')}>本地引导 <small>免费 · 不联网</small></button>
          {!!models.length && <><div class="model-menu-section">你的兼容 API</div>{models.length > 8 && <input class="model-search" type="search" aria-label="搜索模型" placeholder="搜索已获取的模型" value={modelSearch} onInput={e => setModelSearch(e.currentTarget.value)}/>}<div class="model-menu-list">{shownModels.map(m => <button type="button" key={m} class={s.provider.mode === 'compatible' && s.provider.model === m ? 'selected' : ''} onClick={() => chooseModel('compatible',m)} disabled={!hasApiKey(s.provider)} title={!hasApiKey(s.provider) ? '请先在模型设置填写此网关的密钥' : m}>{m}</button>)}{!shownModels.length && <p>没有匹配的模型</p>}</div></>}
          {s.provider.workerEndpoint && <button type="button" class={s.provider.mode === 'worker' ? 'selected' : ''} onClick={() => chooseModel('worker')} disabled={!getWorkerToken(s.provider.workerEndpoint)}>独立联网接口 <small>{s.provider.webSearch ? '搜索已开启' : '搜索未开启'}</small></button>}
          <a href="#profile" onClick={() => { setModelMenu(false); setComposerActive(false); }}>管理模型与密钥 <Icon name="chevron" size={14}/></a>
        </div>}
      </div><span class="model-tools-hint">{readyApi ? '已在此设备保存连接' : s.provider.mode === 'guide' ? '无须密钥' : '可在“我的”管理连接'}</span></div>}
      <div class="composer-row"><textarea ref={composer} aria-label="向伙伴提问" rows={1} value={draft} onFocus={() => setComposerActive(true)} onInput={e => setDraft(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!busy) send(); } }} placeholder="说说你现在最想解决的事…" /><button type="submit" class="send-button" disabled={!draft.trim() || busy} aria-label="发送"><Icon name="send" size={19}/></button></div>
      <small class="composer-disclosure">{readyApi ? <>当前使用：{modelLink ? <a href={modelLink} target="_blank" rel="noopener noreferrer" title="打开供应商的模型介绍或网站">{s.provider.model}</a> : s.provider.model} · 对话发送至你设置的网关；未开启实时搜索。</> : s.provider.mode === 'guide' ? '本地引导只给规则与核对清单，不会联网。' : s.provider.mode === 'worker' ? s.provider.webSearch ? '联网搜索已由你开启，请核对来源。' : '对话发送至独立接口；未开启实时搜索。' : <><a href="#profile">完成网关、密钥与模型配置</a>后即可提问。</>}</small>
    </form>
    {drawerOpen && <Conversations state={s} change={change} onClose={() => setDrawerOpen(false)} onSelect={conversationId => { const selected = s.conversations.find(c => c.id === conversationId); nearBottom.current = true; change(st => { st.activeConversationId = conversationId; }); setActiveContext(selected?.opportunityId || null); location.hash = 'companion'; setDrawerOpen(false); }} onNew={() => { nearBottom.current = true; change(st => { st.activeConversationId = null; }); setActiveContext(null); setDraft(''); location.hash = 'companion'; setDrawerOpen(false); requestAnimationFrame(() => composer.current?.focus({ preventScroll: true })); }}/>}
    {memoryText !== null && <Modal title="确认保存为长期记忆" onClose={() => setMemoryText(null)}><p class="hint">只有你确认的内容才会成为长期记忆，之后可以在“我的”删除或关闭在线发送。</p><label class="field">要记住的文字<textarea rows={5} value={memoryText} onInput={e => setMemoryText(e.currentTarget.value.slice(0, 2000))}/></label><button class="button primary" onClick={() => { if (memoryText.trim()) change(st => st.memories.push({ id: id(), text: memoryText.trim(), includeOnline: false, createdAt: now() })); setMemoryText(null); notify('记忆已保存，默认不随在线请求发送'); }}>确认记住</button></Modal>}
  </div>;
}
