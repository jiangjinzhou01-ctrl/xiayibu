import { useEffect, useState } from 'preact/hooks';
import { AppState, Decision, JobStatus, Opportunity, finalStatuses, id, now, statuses, today } from '../domain';
import { Card, Empty, Header, Icon, Modal } from '../ui';

type Props = { state: AppState; change: (fn: (s: AppState) => void) => void; detail: string; notify: (message: string) => void; askWith: (id: string) => void };
type Draft = Pick<Opportunity, 'company' | 'role' | 'source' | 'url' | 'jd' | 'notes' | 'followUp'> & { id?: string };
const blank = (): Draft => ({ company: '', role: '', source: '', url: '', jd: '', notes: '', followUp: '' });
const skills = ['Excel', 'SQL', 'Python', 'JavaScript', 'React', 'Vue', '数据分析', '项目管理', '运营', '用户研究', '沟通', '销售', '财务', '会计', '设计', '测试', '电商', '客服', '机械', '电气', '行政', '教育', '护理'];
function sourceUrl(input: string) { try { const u = new URL(input); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } }
function analysis(o: Opportunity, s: AppState) {
  const userText = [s.profile.strengths, ...s.evidence.map(e => [e.situation, e.action, e.outcome].join(' ')), ...s.resumes.map(r => [r.experience, r.skills, r.projects].join(' '))].join(' ').toLowerCase();
  const found = skills.filter(k => o.jd.toLowerCase().includes(k.toLowerCase()));
  const covered = found.filter(k => userText.includes(k.toLowerCase()));
  const unanswered = found.filter(k => !covered.includes(k));
  const risk = ['押金', '培训贷', '先交费', '保证录用', '身份证原件', '垫付'].filter(k => o.jd.includes(k));
  return { covered, unanswered, risk };
}
const group = (o: Opportunity) => finalStatuses.includes(o.status) ? '已结束' : ['已收藏', '待判断', '准备中', '待投递'].includes(o.status) ? '待判断' : '进行中';
export function Opportunities({ state: s, change, detail, notify, askWith }: Props) {
  const [filter, setFilter] = useState('待判断');
  const [draft, setDraft] = useState<Draft>(blank);
  const [editor, setEditor] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [eventStatus, setEventStatus] = useState<JobStatus>('已投递');
  const [eventNote, setEventNote] = useState('');
  const [eventDate, setEventDate] = useState(today());
  const [eventResume, setEventResume] = useState('');
  const selected = s.opportunities.find(o => o.id === detail);
  const opportunityIds = s.opportunities.map(o => o.id).join(',');
  useEffect(() => { if (detail === 'new') { setDraft(d => d.id ? blank() : d); setEditor(true); } }, [detail]);
  useEffect(() => { if (selected && group(selected) !== filter) setFilter(group(selected)); }, [selected?.id, selected?.status]);
  useEffect(() => {
    if (!selected && s.opportunities.length && !s.opportunities.some(o => group(o) === filter)) setFilter(group(s.opportunities[0]));
  }, [opportunityIds]);
  const openEdit = (o?: Opportunity) => {
    if (o) setDraft({ id: o.id, company: o.company, role: o.role, source: o.source, url: o.url, jd: o.jd, notes: o.notes, followUp: o.followUp });
    else if (draft.id) setDraft(blank());
    setEditor(true);
  };
  const save = (e: Event) => {
    e.preventDefault();
    if (!draft.role.trim() && !draft.jd.trim() && !draft.url.trim()) { notify('请至少填写岗位名称、原文或链接'); return; }
    if (draft.url.trim() && !sourceUrl(draft.url)) { notify('岗位链接请使用 http 或 https'); return; }
    const key = draft.id || id();
    change(st => {
      const old = st.opportunities.find(o => o.id === key);
      if (old) Object.assign(old, draft);
      else st.opportunities.unshift({ ...draft, id: key, capturedAt: today(), status: '已收藏', verified: false, decision: '未决定', decisionNote: '', events: [] });
      st.profile.onboarded = true;
    });
    setEditor(false); setDraft(blank()); location.hash = 'opportunities/' + key; notify('机会已保存在此设备');
  };
  const decide = (o: Opportunity, choice: Decision) => {
    change(st => {
      const item = st.opportunities.find(x => x.id === o.id)!;
      item.decision = choice;
      item.decisionNote = `用户于 ${today()} 选择“${choice}”`;
      if (choice !== '暂缓' && ['已收藏', '待判断'].includes(item.status)) {
        item.status = choice === '现在投' ? '待投递' : '准备中';
        item.events.push({ id: id(), at: now(), status: item.status, source: 'user', note: item.decisionNote });
      }
    });
    notify('已记录你的判断；正式投递仍需在招聘原站完成');
  };
  const addEvent = (e: Event) => {
    e.preventDefault(); if (!selected) return;
    if (!confirm(`确认将「${selected.role || selected.company}」记录为“${eventStatus}”？这不会向招聘方发送任何内容。`)) return;
    change(st => {
      const item = st.opportunities.find(x => x.id === selected.id)!;
      item.status = eventStatus;
      item.events.push({ id: id(), at: new Date(eventDate + 'T12:00:00').toISOString(), status: eventStatus, source: 'user', note: eventNote.trim().slice(0, 1500), resumeId: eventResume || undefined });
      if (eventResume) item.resumeId = eventResume;
    });
    setEventOpen(false); setEventNote(''); notify('申请时间线已更新');
  };
  const visible = s.opportunities.filter(o => group(o) === filter);
  return <>
    <Header eyebrow="OPPORTUNITIES · 真实机会" title="机会与申请" sub="把原站看到的岗位带回来，做判断、准备、记录真实进展。" action={<button class="button primary" onClick={() => openEdit()}><Icon name="plus" size={17}/> 记录机会</button>} />
    <div class="opportunities-layout">
      <div class="opportunities-list">
        <div class="segmented" role="group" aria-label="筛选机会">{['待判断', '进行中', '已结束'].map(f => <button class={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>{f} <span>{s.opportunities.filter(o => group(o) === f).length}</span></button>)}</div>
        {visible.length ? visible.map(o => <a class={'opportunity-row ' + (selected?.id === o.id ? 'selected' : '')} href={`#opportunities/${o.id}`} key={o.id}>
          <span class="row-top"><strong>{o.role || '待补充岗位'}</strong><span class="status">{o.status}</span></span>
          <span class="row-sub">{o.company || '公司待填写'} · {o.capturedAt}</span><span class="row-note">{o.verified ? '已自行核实' : '来源待核实'} · {o.decision === '未决定' ? '尚未判断' : o.decision}</span>
        </a>) : <Card><Empty title={filter === '待判断' ? '从一份真实岗位开始' : '这里还没有记录'} body="从招聘平台复制岗位原文或链接，先保存，再决定是否投递。" action={<button class="button subtle" onClick={() => openEdit()}>记录岗位</button>}/></Card>}
        <Card className="source-card"><strong>去原站寻找机会</strong><p>下列网站由你自行搜索并核实岗位。见程不会抓取或代投。</p><div class="source-links">
          {[['BOSS 直聘','https://www.zhipin.com/'], ['智联招聘','https://www.zhaopin.com/'], ['中国公共招聘网','https://job.mohrss.gov.cn/'], ['国家大学生就业服务平台','https://www.ncss.cn/']].map(([name,url]) => <a href={url} target="_blank" rel="noopener noreferrer">{name}<Icon name="external" size={15}/></a>)}
        </div></Card>
      </div>
      <div class="opportunity-detail">
        {selected ? <><Card className="detail-head">
          <div class="detail-meta"><span class="eyebrow">保存于 {selected.capturedAt}</span><span class="status">{selected.status}</span></div>
          <h2>{selected.role || '待补充岗位'}</h2><p>{selected.company || '公司待填写'} · {selected.source || '来源待填写'}</p>
          <div class="button-row">{sourceUrl(selected.url) && <a class="button outline" href={sourceUrl(selected.url)} target="_blank" rel="noopener noreferrer">打开原始岗位 <Icon name="external" size={16}/></a>}<button class="button subtle" onClick={() => openEdit(selected)}>编辑资料</button><button class="button subtle" onClick={() => askWith(selected.id)}>问伙伴</button></div>
          <label class="checkline"><input type="checkbox" checked={selected.verified} onChange={e => change(st => { st.opportunities.find(x => x.id === selected.id)!.verified = e.currentTarget.checked; })}/> 我已在原站自行核实来源和岗位</label>
        </Card>
        <Card><div class="section-title"><h2>判断这份机会</h2><span>本地证据对照</span></div>
          {selected.jd ? (() => { const a = analysis(selected, s); return <div class="analysis-grid">
            <div><b>为什么值得看</b><p>{s.profile.target && selected.role.includes(s.profile.target) ? `岗位名称与你记录的「${s.profile.target}」目标一致。` : '目标关联尚待确认：请对照目标方向、地点和岗位职责。'} {a.covered.length ? `你的资料提及 ${a.covered.slice(0, 3).join('、')}。` : '尚未找到对应的经历文字证据。'}</p><small>来源：用户档案 + 岗位原文；仅为词语对照</small></div>
            <div><b>需要确认</b><p>招聘主体、发布日期、地点、薪资与经验要求，请回原站逐项核对。{selected.verified ? '你已标记来源已核实。' : '来源尚未标记为已核实。'}</p><small>来源：用户保存时间 {selected.capturedAt}</small></div>
            <div><b>尚未提供的证据</b><p>{a.unanswered.length ? `原文提到 ${a.unanswered.slice(0, 5).join('、')}，你的资料中尚无相同词语；这不等于你不会。` : '词表内暂未发现遗漏；仍需人工阅读全文核对硬性条件。'}</p><small>来源：岗位原文 + 用户已填文字</small></div>
            <div><b>准备成本与成长</b><p>先预留一轮核对 JD、选择简历版本和检查招聘主体的时间。实际耗时与成长价值需由你判断。</p><small>估算依据：目前资料是否完整</small></div>
            <div><b>风险线索</b><p>{a.risk.length ? `原文含“${a.risk.join('、')}”，建议核实收费与资料请求。` : '预设风险词中暂无命中；这不能证明招聘信息真实。'}</p><small>本地词表线索，不能判定合法性</small></div>
          </div>; })() : <Empty title="还没有岗位原文" body="补充职责和要求后，会显示有来源的对照；仅有链接时本站不会擅自抓取。" action={<button class="button subtle" onClick={() => openEdit(selected)}>补充原文</button>}/>}
          <div class="decision"><strong>你的判断：{selected.decision === '未决定' ? '尚未决定' : selected.decision}</strong><div class="button-row">{(['现在投','准备后投','暂缓'] as Decision[]).map(c => <button class={'button ' + (selected.decision === c ? 'primary' : 'outline')} onClick={() => decide(selected,c)}>{c}</button>)}</div></div>
        </Card>
        <Card><div class="section-title"><h2>申请时间线</h2><button class="button subtle" onClick={() => { setEventStatus('已投递'); setEventDate(today()); setEventOpen(true); }}>记录状态</button></div>
          {selected.events.length ? <div class="timeline">{[...selected.events].reverse().map(ev => <div class="timeline-event" key={ev.id}><span class="timeline-pin"/><strong>{ev.status}</strong><small>{ev.at.slice(0,10)} · {ev.source === 'legacy' ? '来自旧版，待确认' : '你记录的'}</small>{ev.note && <p>{ev.note}</p>}{ev.resumeId && <small>关联简历：{s.resumes.find(r => r.id === ev.resumeId)?.title || '旧版简历'}</small>}</div>)}</div> : <Empty title="尚无申请事件" body="打开招聘网站不会自动计为已投递。完成外部动作后由你在这里记录。" />}
          <label class="field">下次跟进日期<input type="date" value={selected.followUp} onChange={e => change(st => { st.opportunities.find(x => x.id === selected.id)!.followUp = e.currentTarget.value; })}/></label>
          <label class="field">面试反馈 / 备注<textarea value={selected.notes} onInput={e => change(st => { st.opportunities.find(x => x.id === selected.id)!.notes = e.currentTarget.value.slice(0, 2000); })} placeholder="例如：面试问到了哪个项目？下次要改进什么？"/></label>
        </Card></> : <Card className="detail-placeholder"><Empty title="选择一份机会" body="左侧选择已保存岗位，就能查看判断依据和申请进程。" /></Card>}
        {selected && <Card><div class="section-title"><h2>围绕这份岗位练面试</h2><span>文本练习</span></div>
          <p class="hint">这些是本地生成的练习提问，不是招聘方真题。答案与复盘只保存在此设备。</p>
          {!selected.practice?.length ? <button class="button subtle" onClick={() => change(st => {
            const item = st.opportunities.find(x => x.id === selected.id)!;
            item.practice = [
              { question: `为什么选择「${item.role || '这份岗位'}」？请结合一条真实经历回答。`, answer: '', reflection: '' },
              { question: `岗位要求中的「${analysis(item, st).unanswered[0] || '核心职责'}」，你能提供哪些具体证据？`, answer: '', reflection: '' },
              { question: '讲一次遇到困难后调整做法的经历。你具体做了什么，结果如何？', answer: '', reflection: '' },
              { question: '你想向招聘方核实哪些岗位信息或工作条件？', answer: '', reflection: '' },
            ];
          })}>创建 4 道练习题</button> : <div class="practice-list">{selected.practice.map((practice, index) => <div class="practice-item" key={index}>
            <strong>{index + 1}. {practice.question}</strong>
            <label class="field">我的真实回答<textarea rows={3} value={practice.answer} onInput={e => change(st => { st.opportunities.find(x => x.id === selected.id)!.practice![index].answer = e.currentTarget.value.slice(0, 3000); })}/></label>
            <label class="field">复盘：下次想改进什么<input value={practice.reflection} onInput={e => change(st => { st.opportunities.find(x => x.id === selected.id)!.practice![index].reflection = e.currentTarget.value.slice(0, 500); })}/></label>
          </div>)}</div>}
        </Card>}
      </div>
    </div>
    {editor && <Modal title={draft.id ? '编辑机会' : '记录一份机会'} onClose={() => { setEditor(false); if (detail === 'new') location.hash = 'opportunities'; }}>
      <form onSubmit={save} class="form-stack">
        <label class="field">岗位名称<input value={draft.role} onInput={e => setDraft({ ...draft, role: e.currentTarget.value.slice(0, 100) })} placeholder="例如：产品运营"/></label>
        <label class="field">公司 / 机构<input value={draft.company} onInput={e => setDraft({ ...draft, company: e.currentTarget.value.slice(0, 100) })} placeholder="以原站信息为准"/></label>
        <div class="form-two"><label class="field">来源<input value={draft.source} onInput={e => setDraft({ ...draft, source: e.currentTarget.value.slice(0, 100) })} placeholder="例如：智联招聘"/></label><label class="field">跟进日期<input type="date" value={draft.followUp} onInput={e => setDraft({ ...draft, followUp: e.currentTarget.value })}/></label></div>
        <label class="field">岗位链接<input type="url" value={draft.url} onInput={e => setDraft({ ...draft, url: e.currentTarget.value.slice(0, 1000) })} placeholder="https://…"/></label>
        <label class="field">岗位原文 / 职责要求<textarea rows={8} value={draft.jd} onInput={e => setDraft({ ...draft, jd: e.currentTarget.value.slice(0, 8000) })} placeholder="从真实招聘页复制。只保存你有权使用的文字；链接不会被自动抓取。"/></label>
        <label class="field">备注<textarea rows={3} value={draft.notes} onInput={e => setDraft({ ...draft, notes: e.currentTarget.value.slice(0, 2000) })}/></label>
        <div class="button-row"><button type="button" class="button outline" onClick={() => setEditor(false)}>稍后继续</button><button class="button primary" type="submit">保存机会</button></div>
      </form>
    </Modal>}
    {eventOpen && selected && <Modal title="记录真实进展" onClose={() => setEventOpen(false)}>
      <form onSubmit={addEvent} class="form-stack">
        <p class="hint">仅记录你实际完成或收到的情况，本站不会自动投递或向招聘方发送消息。</p>
        <label class="field">当前状态<select value={eventStatus} onChange={e => setEventStatus(e.currentTarget.value as JobStatus)}>{statuses.map(st => <option>{st}</option>)}</select></label>
        <label class="field">发生日期<input type="date" value={eventDate} onChange={e => setEventDate(e.currentTarget.value)} required/></label>
        <label class="field">当时使用的简历版本<select value={eventResume} onChange={e => setEventResume(e.currentTarget.value)}><option value="">未记录</option>{s.resumes.map(r => <option value={r.id}>{r.title}</option>)}</select></label>
        <label class="field">备注 / 面试结果<textarea rows={4} value={eventNote} onInput={e => setEventNote(e.currentTarget.value)} placeholder="例如：已在原站投递；收到第一轮面试邀请"/></label>
        <button class="button primary" type="submit">确认记录</button>
      </form>
    </Modal>}
  </>;
}
