import { AppState, finalStatuses, nextAction, stageFor, today } from '../domain';
import { Card, Empty, Header, Icon } from '../ui';

type Props = { state: AppState; change: (fn: (s: AppState) => void) => void; openOnboarding: () => void };
export function Today({ state: s, change, openOnboarding }: Props) {
  const next = nextAction(s);
  const due = s.opportunities.filter(o => o.followUp && o.followUp <= today() && !finalStatuses.includes(o.status)).slice(0, 3);
  const recent = [...s.opportunities].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)).slice(0, 3);
  const done = s.actions.filter(a => a.done).length;
  return <>
    <Header eyebrow="TODAY · 你的进程" title="今天，走好这一步" sub={`当前阶段：${stageFor(s)} · 资料仅保存在此设备`} />
    {!s.profile.onboarded && <Card className="welcome-card">
      <div><span class="eyebrow">从真实的你开始</span><h2>你可以带着一份岗位来，或先聊聊方向。</h2><p>无需登录和密钥，一分钟就能开始。</p></div>
      <div class="button-row"><a href="#opportunities/new" class="button primary">我已有岗位</a><button class="button outline" onClick={openOnboarding}>我想先理方向</button></div>
    </Card>}
    <Card className="focus-card">
      <div class="card-label"><span class="focus-pip"/> 今天最值得做</div>
      <h2>{next.title}</h2><p>{next.reason}</p>
      <div class="button-row">
        {next.task ? <button class="button primary" onClick={() => change(d => { const a = d.actions.find(a => a.id === next.task?.id); if (a) a.done = true; })}><Icon name="check" size={17}/> 标记完成</button>
          : <a class="button primary" href={next.href}>{next.label} <Icon name="chevron" size={17}/></a>}
        {next.task && <button class="text-button" onClick={() => change(d => { const a = d.actions.find(a => a.id === next.task?.id); if (a) a.deferredUntil = new Date(Date.now() + 86400000).toLocaleDateString('sv-SE'); })}>明天再做</button>}
      </div>
    </Card>
    <div class="dashboard-grid">
      <Card><div class="section-title"><h2>需要留意</h2><span>{due.length ? `${due.length} 项` : '已处理'}</span></div>
        {due.length ? <div class="compact-list">{due.map(o => <a href={`#opportunities/${o.id}`} class="list-row" key={o.id}><span><strong>{o.company || o.role || '一份机会'}</strong><small>你设定的跟进日期 · {o.followUp}</small></span><Icon name="chevron" size={17}/></a>)}</div>
          : <p class="compact-empty">暂时没有到期的跟进。保存岗位并设置日期后，这里会提醒你。</p>}
      </Card>
      <Card><div class="section-title"><h2>最近记录的机会</h2><a href="#opportunities" class="quiet-link">查看全部</a></div>
        {recent.length ? <div class="compact-list">{recent.map(o => <a href={`#opportunities/${o.id}`} class="list-row" key={o.id}><span><strong>{o.company ? o.company + ' · ' : ''}{o.role || '待补充岗位'}</strong><small>{o.status} · {o.capturedAt} · {o.verified ? '已自行核实' : '待核实来源'}</small></span><Icon name="chevron" size={17}/></a>)}</div>
          : <div class="compact-empty">还没有保存机会。在招聘平台看到岗位后，把原文或链接带回来。<div><a class="quiet-link" href="#opportunities/new">记录第一份机会 <Icon name="chevron" size={15}/></a></div></div>}
      </Card>
    </div>
    <Card className="observation"><div class="section-title"><h2>伙伴观察</h2><span>本地规则</span></div>
      <p>{recent.length ? `你记录了 ${s.opportunities.length} 份机会；最近一份是「${recent[0].role || '待补充岗位'}」。建议先核对岗位原文和招聘主体，再决定投递时机。` : '目前没有足够的岗位与申请反馈，伙伴不会猜测你的录用机会。先保存一份真实岗位。'}</p>
      <small>依据：此设备中的记录 · 不确定：招聘方的实时状态与录用标准</small>
      <a class="quiet-link" href="#companion">带着当前记录问伙伴 <Icon name="chevron" size={15}/></a>
    </Card>
    <div class="tiny-progress"><span>本周行动与记录</span><strong>{done} 项行动已完成 · {s.opportunities.length} 份机会已保存</strong></div>
  </>;
}
