export type Stage = '探索方向' | '准备材料' | '积极投递' | '等待反馈' | '面试推进' | 'Offer 决策' | '已入职' | '暂停';
export type JobStatus = '已收藏' | '待判断' | '准备中' | '待投递' | '已投递' | '待回复' | '测评/笔试' | '面试中' | 'Offer' | '未通过' | '用户撤回';
export type Decision = '未决定' | '现在投' | '准备后投' | '暂缓';
export type Mode = 'guide' | 'compatible' | 'worker' | 'device';
export type Format = 'openai' | 'anthropic';

export interface Profile {
  status: string; target: string; city: string; strengths: string; goal: string;
  constraints: string; stage: Stage; stageConfirmed?: boolean; onboarded: boolean;
}
export interface Event { id: string; at: string; status: JobStatus; note: string; source: 'user' | 'legacy'; resumeId?: string; }
export interface Opportunity {
  id: string; company: string; role: string; source: string; url: string; jd: string;
  capturedAt: string; verified: boolean; status: JobStatus; decision: Decision;
  decisionNote: string; notes: string; followUp: string; events: Event[]; resumeId?: string;
  practice?: { question: string; answer: string; reflection: string }[];
}
export interface Action { id: string; title: string; done: boolean; createdAt: string; dueAt: string; opportunityId?: string; source: 'user' | 'guide' | 'legacy'; deferredUntil?: string; }
export interface Evidence { id: string; situation: string; action: string; outcome: string; source: string; createdAt: string; }
export interface Resume { id: string; title: string; createdAt: string; opportunityId?: string; name: string; phone: string; email: string; city: string; summary: string; experience: string; projects: string; education: string; skills: string; }
export interface Memory { id: string; text: string; createdAt: string; includeOnline: boolean; }
export interface Chat { id: string; role: 'user' | 'assistant'; text: string; at: string; opportunityId?: string; reasoning?: string; sources?: { title: string; url: string }[]; error?: boolean; }
export interface ProviderSettings {
  mode: Mode; format: Format; base: string; resolvedBase: string; model: string;
  outputMode: 'auto' | 'manual'; maxTokens: number; effort: 'auto' | 'low' | 'medium' | 'high';
  workerEndpoint: string; webSearch: boolean;
}
export interface AppState {
  version: 2; profile: Profile; opportunities: Opportunity[]; actions: Action[];
  evidence: Evidence[]; resumes: Resume[]; memories: Memory[]; chats: Chat[];
  reviews: { id: string; at: string; observed: string; adjustment: string }[];
  provider: ProviderSettings; legacySnapshot?: unknown;
}
export const id = () => crypto.randomUUID?.() || Math.random().toString(36).slice(2);
export const today = () => new Date().toLocaleDateString('sv-SE');
export const now = () => new Date().toISOString();
export const finalStatuses: JobStatus[] = ['Offer', '未通过', '用户撤回'];
export const statuses: JobStatus[] = ['已收藏', '待判断', '准备中', '待投递', '已投递', '待回复', '测评/笔试', '面试中', 'Offer', '未通过', '用户撤回'];
export const defaultState = (): AppState => ({
  version: 2,
  profile: { status: '', target: '', city: '', strengths: '', goal: '', constraints: '', stage: '探索方向', stageConfirmed: false, onboarded: false },
  opportunities: [], actions: [], evidence: [], resumes: [], memories: [], chats: [], reviews: [],
  provider: { mode: 'guide', format: 'openai', base: '', resolvedBase: '', model: '', outputMode: 'auto', maxTokens: 2048, effort: 'auto', workerEndpoint: '', webSearch: false },
});
export function stageFor(state: AppState): Stage {
  const p = state.profile;
  if (p.stageConfirmed) return p.stage;
  if (state.opportunities.some(o => o.status === 'Offer')) return 'Offer 决策';
  if (state.opportunities.some(o => o.status === '面试中' || o.status === '测评/笔试')) return '面试推进';
  if (state.opportunities.some(o => o.status === '已投递' || o.status === '待回复')) return '等待反馈';
  if (state.opportunities.some(o => o.status === '待投递' || o.status === '准备中')) return '积极投递';
  return p.target || state.resumes.length ? '准备材料' : '探索方向';
}
export function nextAction(s: AppState): { title: string; reason: string; href: string; label: string; task?: Action } {
  const open = s.actions.filter(a => !a.done && (!a.deferredUntil || a.deferredUntil <= today()));
  const urgent = [...open].filter(a => a.dueAt && a.dueAt <= today()).sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
  if (urgent) return { title: urgent.title, reason: urgent.opportunityId ? '与你保存的机会有关' : '你记录的待办', href: urgent.opportunityId ? `#opportunities/${urgent.opportunityId}` : '#today', label: '标记完成', task: urgent };
  const follow = s.opportunities.find(o => o.followUp && o.followUp <= today() && !finalStatuses.includes(o.status));
  if (follow) return { title: `跟进「${follow.company || follow.role || '这份机会'}」`, reason: `你设定的跟进日期是 ${follow.followUp}`, href: `#opportunities/${follow.id}`, label: '查看申请' };
  if (open.length) return { title: open[0].title, reason: open[0].opportunityId ? '与你保存的机会有关' : '你记录的待办', href: open[0].opportunityId ? `#opportunities/${open[0].opportunityId}` : '#today', label: '标记完成', task: open[0] };
  const undecided = s.opportunities.find(o => o.decision === '未决定');
  if (undecided) return { title: `判断「${undecided.role || undecided.company || '这份岗位'}」是否值得投`, reason: '你保存了机会，还没有作出判断', href: `#opportunities/${undecided.id}`, label: '查看依据' };
  if (!s.profile.target && !s.opportunities.length) return { title: '先说说你想找什么工作', reason: '可以从一份真实岗位或一个模糊方向开始', href: '#profile', label: '整理方向' };
  return { title: '保存一份真实岗位，看看下一步', reason: '从岗位要求和自己的经历开始判断', href: '#opportunities/new', label: '记录机会' };
}
