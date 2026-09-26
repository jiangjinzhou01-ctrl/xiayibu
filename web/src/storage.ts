import { AppState, Chat, JobStatus, Opportunity, defaultState, id, now, today } from './domain';

const DB = 'jiancheng-v2';
const fallback = 'jiancheng-v2-fallback';
const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const parsed = (key: string) => { try { return JSON.parse(read(key) || 'null'); } catch { return null; } };
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function get(): Promise<AppState | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const req = db.transaction('state').objectStore('state').get('current');
    req.onsuccess = () => { db.close(); resolve(req.result || null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}
async function put(state: AppState): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('state', 'readwrite');
    tx.objectStore('state').put(state, 'current');
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
const str = (v: unknown, max = 5000) => typeof v === 'string' ? v.slice(0, max) : '';
const obj = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const status = (v: unknown): JobStatus => ({
  '想投递': '已收藏', '已投递': '已投递', '笔试中': '测评/笔试',
  '面试中': '面试中', '已收到反馈': '待回复', '已结束': '用户撤回',
} as Record<string, JobStatus>)[str(v)] || '已收藏';

function restoreConversations(state: AppState): AppState {
  const s = { ...defaultState(), ...state, provider: { ...defaultState().provider, ...state.provider } };
  s.conversations = Array.isArray(state.conversations) ? state.conversations : [];
  s.chats = Array.isArray(state.chats) ? state.chats : [];
  const orphaned = s.chats.filter(chat => !chat.conversationId || !s.conversations.some(c => c.id === chat.conversationId));
  if (orphaned.length) {
    const first = orphaned.find(chat => chat.role === 'user');
    const conversation = { id: id(), title: first?.text.trim().slice(0, 42) || '之前的对话', createdAt: orphaned[0].at || now(), updatedAt: orphaned.at(-1)?.at || now() };
    s.conversations.push(conversation);
    s.chats = s.chats.map(chat => orphaned.includes(chat) ? { ...chat, conversationId: conversation.id } : chat);
    if (!state.activeConversationId) s.activeConversationId = conversation.id;
  }
  if (s.activeConversationId && !s.conversations.some(c => c.id === s.activeConversationId)) s.activeConversationId = s.conversations[0]?.id || null;
  return s;
}

export function migrateLegacy(data: unknown, chatData?: unknown, memoryData?: unknown, providerData?: unknown, endpointData?: unknown): AppState {
  const s = defaultState(), old = obj(data), p = obj(old.profile), r = obj(old.resume);
  s.profile = { ...s.profile, status: str(p.status, 40), target: str(p.target, 80), city: str(p.city, 80), strengths: str(p.strengths), goal: str(p.goal), onboarded: Object.values(p).some(Boolean) || (Array.isArray(old.jobs) && old.jobs.length > 0) };
  const jobs = Array.isArray(old.jobs) ? old.jobs.slice(0, 500) : [];
  s.opportunities = jobs.map(raw => {
    const j = obj(raw), date = str(j.date, 40) || today(), mapped = status(j.status), oid = str(j.id, 80) || id();
    const o: Opportunity = { id: oid, company: str(j.company, 100), role: str(j.role, 100), source: str(j.source, 100), url: str(j.url, 1000), jd: '', capturedAt: date, verified: false, status: mapped, decision: '未决定', decisionNote: '', notes: str(j.notes, 2000), followUp: '', events: [] };
    if (mapped !== '已收藏') o.events.push({ id: id(), at: date, status: mapped, note: `旧版状态：“${str(j.status, 50)}”；请核对真实性与时间`, source: 'legacy' });
    if (j.status === '已结束' || j.status === '已收到反馈') { o.status = '待判断'; o.events[0].note += '，无法无损映射终态，已保留原文供你确认'; }
    return o;
  });
  s.actions = (Array.isArray(old.tasks) ? old.tasks.slice(0, 300) : []).map(raw => {
    const a = obj(raw);
    return { id: str(a.id, 80) || id(), title: str(a.title, 160), done: !!a.done, createdAt: now(), dueAt: '', source: 'legacy' as const };
  });
  if (Object.values(r).some(Boolean)) s.resumes.push({
    id: id(), title: '旧版简历', createdAt: now(),
    name: str(r.name, 100), phone: str(r.phone, 100), email: str(r.email, 100), city: str(r.city, 100),
    summary: str(r.summary), experience: str(r.experience), projects: str(r.projects),
    education: str(r.education), skills: str(r.skills),
  });
  const analysis = obj(old.analysisInput);
  if (str(analysis.jd).trim()) s.opportunities.push({ id: id(), company: '', role: '待补充岗位信息', source: '旧版岗位对照', url: '', jd: str(analysis.jd, 8000), capturedAt: today(), verified: false, status: '待判断', decision: '未决定', decisionNote: '', notes: str(analysis.evidence, 5000), followUp: '', events: [] });
  s.chats = (Array.isArray(chatData) ? chatData.slice(-40) : []).filter(x => ['user', 'assistant'].includes(str(obj(x).role))).map(raw => {
    const c = obj(raw);
    return { id: id(), role: c.role as Chat['role'], text: str(c.text, 9000), at: now(), reasoning: str(c.reasoning, 5000), sources: Array.isArray(c.sources) ? c.sources.slice(0, 6).map(x => ({ title: str(obj(x).title, 100), url: str(obj(x).url, 1000) })) : [] };
  });
  if (str(memoryData).trim()) s.memories.push({ id: id(), text: str(memoryData, 2000), createdAt: now(), includeOnline: true });
  const pr = obj(providerData), connections = obj(pr.connections), format = pr.protocol === 'anthropic' ? 'anthropic' : 'openai', connection = obj(connections[format]);
  s.provider = { ...s.provider, mode: ['compatible', 'worker', 'device'].includes(str(pr.mode)) ? pr.mode as AppState['provider']['mode'] : 'guide', format, base: str(connection.inputBase || connection.base || pr.base, 1000), resolvedBase: str(connection.base, 1000), model: str(connection.model || pr.model, 150), effort: ['low', 'medium', 'high'].includes(str(connection.effort)) ? connection.effort as AppState['provider']['effort'] : 'auto', outputMode: connection.outputMode === 'manual' ? 'manual' : 'auto', maxTokens: Number(connection.maxTokens) || 2048, workerEndpoint: str(endpointData, 1000) };
  s.legacySnapshot = { data: old, chats: chatData, memory: memoryData, provider: providerData, endpoint: endpointData };
  return restoreConversations(s);
}
export async function loadState(): Promise<AppState> {
  const fallbackSaved = parsed(fallback);
  if (fallbackSaved?.version === 2) return restoreConversations(fallbackSaved);
  try { const saved = await get(); if (saved?.version === 2) return restoreConversations(saved); } catch {}
  const old = parsed('xiayibu-v1');
  const s = old ? migrateLegacy(old, parsed('xiayibu-companion-v1'), read('xiayibu-companion-memory-v1'), parsed('xiayibu-provider-v1'), read('xiayibu-agent-endpoint-v1')) : defaultState();
  // The old localStorage keys remain untouched for rollback. The raw snapshot is
  // included in the new backup, so migration can be audited and retried.
  await saveState(s);
  return s;
}
let queue = Promise.resolve();
export function saveState(state: AppState): Promise<void> {
  const snapshot = structuredClone(state);
  queue = queue.catch(() => {}).then(async () => {
    try { await put(snapshot); try { localStorage.removeItem(fallback); } catch {} }
    catch { localStorage.setItem(fallback, JSON.stringify(snapshot)); }
  });
  return queue;
}
export function parseBackup(text: string): AppState {
  const data = JSON.parse(text);
  if (data?.version === 2 && Array.isArray(data.opportunities) && Array.isArray(data.actions) && Array.isArray(data.chats)) return restoreConversations(data);
  if (data?.data && typeof data.data === 'object') return migrateLegacy(data.data, null, data.companionMemory);
  if (data?.profile && Array.isArray(data.jobs)) return migrateLegacy(data);
  throw Error('无法识别此备份；请选择见程或旧版职向的 JSON 文件');
}
export function backup(s: AppState): string {
  const clean = structuredClone(s);
  // Device credentials are stored under a separate key, never in backups.
  return JSON.stringify({ ...clean, exportedAt: now() }, null, 2);
}
