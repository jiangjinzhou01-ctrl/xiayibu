import { useState } from 'preact/hooks';
import { discover, hasApiKey, setApiKey, setWorkerToken, validBase } from '../ai';
import { AppState, Evidence, Profile as ProfileData, Resume, Stage, defaultState, id, now, today, stageFor } from '../domain';
import { backup, migrateLegacy, parseBackup } from '../storage';
import { deviceReady, loadDevice } from '../device';
import { Card, Header, Icon, Modal } from '../ui';

type Props = { state: AppState; change: (fn: (s: AppState) => void) => void; notify: (msg: string) => void };
const saveFile = (name: string, contents: string, type = 'application/json') => {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
};
const newResume = (old?: Resume): Resume => ({
  id: id(), title: old ? old.title + ' · 新版本' : '我的简历 v1', createdAt: now(),
  name: old?.name || '', phone: old?.phone || '', email: old?.email || '', city: old?.city || '',
  summary: old?.summary || '', experience: old?.experience || '', projects: old?.projects || '',
  education: old?.education || '', skills: old?.skills || '',
});
export function Profile({ state: s, change, notify }: Props) {
  const [profileDraft, setProfileDraft] = useState<ProfileData>({ ...s.profile, stage: stageFor(s) });
  const [stageChosen, setStageChosen] = useState(false);
  const [evidence, setEvidence] = useState<Pick<Evidence,'situation'|'action'|'outcome'|'source'>>({ situation: '', action: '', outcome: '', source: '' });
  const [resumeId, setResumeId] = useState(s.resumes[0]?.id || '');
  const [resumeDraft, setResumeDraft] = useState<Resume | null>(null);
  const [memoryText, setMemoryText] = useState('');
  const [review, setReview] = useState({ observed: '', adjustment: '' });
  const [apiInput, setApiInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [providerMessage, setProviderMessage] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);
  const [deviceMessage, setDeviceMessage] = useState('');
  const [importFile, setImportFile] = useState<HTMLInputElement | null>(null);
  const selected = s.resumes.find(r => r.id === resumeId) || s.resumes[0];
  const editProfile = (k: keyof ProfileData, value: string | boolean) => setProfileDraft({ ...profileDraft, [k]: value });
  const updateProvider = (key: keyof AppState['provider'], value: string | number | boolean) => change(st => { (st.provider as unknown as Record<string, unknown>)[key] = value; });
  const probe = async () => {
    try {
      setLoadingModels(true); setProviderMessage('正在检测同一网关域名的模型列表…');
      const result = await discover(s.provider.base, s.provider.format, apiInput);
      setModels(result.models);
      setApiKey(apiInput); updateProvider('resolvedBase', result.base);
      setProviderMessage(`已找到 ${result.models.length} 个模型；接口地址：${result.base}`);
    } catch (e) { setProviderMessage(e instanceof Error ? e.message : '检测失败'); }
    finally { setLoadingModels(false); }
  };
  const importData = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = parseBackup(await file.text());
      if (!confirm(`确认导入？这会替换此设备的见程记录。当前数据建议先导出备份。`)) return;
      change(st => { Object.assign(st, parsed); });
      setProfileDraft(parsed.profile); setResumeId(parsed.resumes[0]?.id || '');
      notify('备份已导入'); if (importFile) importFile.value = '';
    } catch (e) { notify(e instanceof Error ? e.message : '导入失败'); }
  };
  return <>
    <Header eyebrow="你的空间" title="我的资料" sub="管理求职方向、经历、简历和伙伴记忆。资料默认留在此设备。" />
    <nav class="profile-shortcuts" aria-label="资料快捷导航">{[['profile-goal','求职方向'],['profile-experience','真实经历'],['profile-resume','简历版本'],['profile-memory','伙伴记忆'],['profile-model','模型设置'],['profile-data','数据备份']].map(([target,label]) => <button type="button" onClick={() => document.getElementById(target)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })}>{label}</button>)}</nav>
    <div class="profile-layout">
      <div class="profile-main">
        <Card id="profile-goal"><div class="section-title"><h2>求职坐标</h2><span>你确认的事实</span></div>
          <form class="form-stack" onSubmit={e => { e.preventDefault(); change(st => { st.profile = { ...profileDraft, stageConfirmed: stageChosen || st.profile.stageConfirmed, onboarded: true }; }); notify('求职方向已保存'); }}>
            <div class="form-two"><label class="field">目前状态<select value={profileDraft.status} onChange={e => editProfile('status', e.currentTarget.value)}><option value="">选择或暂时跳过</option>{['应届毕业','正在求职','在职探索','转行探索','重返职场'].map(v => <option>{v}</option>)}</select></label><label class="field">目标城市<input value={profileDraft.city} onInput={e => editProfile('city', e.currentTarget.value.slice(0, 80))} placeholder="例如：成都 / 不限"/></label></div>
            <label class="field">目标岗位 / 方向<input value={profileDraft.target} onInput={e => editProfile('target', e.currentTarget.value.slice(0, 80))} placeholder="还不确定也可以留空"/></label>
            <label class="field">已有经历或技能<textarea rows={4} value={profileDraft.strengths} onInput={e => editProfile('strengths', e.currentTarget.value.slice(0, 3000))} placeholder="写真实做过的事，不必先包装"/></label>
            <div class="form-two"><label class="field">眼下最想解决的问题<input value={profileDraft.goal} onInput={e => editProfile('goal', e.currentTarget.value.slice(0, 500))}/></label><label class="field">工作约束<input value={profileDraft.constraints} onInput={e => editProfile('constraints', e.currentTarget.value.slice(0, 500))} placeholder="例如：不接受夜班"/></label></div>
            <label class="field">当前阶段<select value={profileDraft.stage} onChange={e => { editProfile('stage', e.currentTarget.value); setStageChosen(true); }}>{(['探索方向','准备材料','积极投递','等待反馈','面试推进','Offer 决策','已入职','暂停'] as Stage[]).map(v => <option>{v}</option>)}</select></label>
            {s.profile.stageConfirmed && <button class="quiet-link" type="button" onClick={() => { change(st => { st.profile.stageConfirmed = false; }); setStageChosen(false); notify('阶段改为按实际申请记录判断'); }}>按实际记录自动判断阶段</button>}
            <div class="button-row"><button class="button primary" type="submit">保存档案</button><span class="hint">更改事实后，伙伴会依据新资料重新判断。</span></div>
          </form>
        </Card>
        <Card id="profile-experience"><div class="section-title"><h2>真实经历证据</h2><span>{s.evidence.length} 条</span></div>
          <p class="hint">记录做过的事，简历改写时从这里取材；没有发生的结果不要补写。</p>
          {!!s.evidence.length && <div class="evidence-list">{s.evidence.map(item => <div class="evidence-item" key={item.id}><strong>{item.situation || '一段经历'}</strong><p>我做的事：{item.action}</p><small>结果：{item.outcome || '尚未填写'} · 依据：{item.source || '自己记录'}</small><button class="inline-action" onClick={() => change(st => { st.evidence = st.evidence.filter(x => x.id !== item.id); })}>删除</button></div>)}</div>}
          <form class="form-stack" onSubmit={e => { e.preventDefault(); if (!evidence.action.trim()) return; change(st => st.evidence.push({ ...evidence, id: id(), createdAt: now() })); setEvidence({ situation: '', action: '', outcome: '', source: '' }); notify('经历已保存'); }}>
            <label class="field">情境 / 项目<input value={evidence.situation} onInput={e => setEvidence({ ...evidence, situation: e.currentTarget.value.slice(0, 300) })} placeholder="在哪里、为了解决什么"/></label>
            <label class="field">我具体做了什么<input required value={evidence.action} onInput={e => setEvidence({ ...evidence, action: e.currentTarget.value.slice(0, 1000) })}/></label>
            <div class="form-two"><label class="field">可核实的结果<input value={evidence.outcome} onInput={e => setEvidence({ ...evidence, outcome: e.currentTarget.value.slice(0, 500) })}/></label><label class="field">证据出处<input value={evidence.source} onInput={e => setEvidence({ ...evidence, source: e.currentTarget.value.slice(0, 200) })} placeholder="作品链接 / 实习记录"/></label></div>
            <button class="button subtle" type="submit"><Icon name="plus" size={17}/> 添加经历</button>
          </form>
        </Card>
        <Card id="profile-resume"><div class="section-title"><h2>简历版本</h2><button class="button subtle" onClick={() => setResumeDraft(newResume(selected))}><Icon name="plus" size={16}/> 新建版本</button></div>
          {s.resumes.length ? <><div class="resume-tabs">{s.resumes.map(r => <button class={selected?.id === r.id ? 'active' : ''} onClick={() => setResumeId(r.id)}>{r.title}</button>)}</div>
            {selected && <><div class="resume-preview"><h3>{selected.name || '姓名待填写'}</h3><small>{[selected.city,selected.phone,selected.email].filter(Boolean).join(' · ')}</small><p>{selected.summary}</p>{(['experience','projects','education','skills'] as const).map((key, i) => selected[key] && <section><strong>{['经历','项目','教育','技能'][i]}</strong><p>{selected[key]}</p></section>)}</div><div class="button-row"><button class="button outline" onClick={() => setResumeDraft({ ...selected })}>编辑版本</button><button class="button subtle" onClick={() => window.print()}>打印 / 保存 PDF</button></div></>}
          </> : <p class="hint">先整理一份真实简历，修改时保留旧版，申请记录才能知道当时用了哪份材料。</p>}
        </Card>
        <Card><div class="section-title"><h2>本周复盘</h2><span>依据真实反馈</span></div>
          <p class="hint">目前记录了 {s.opportunities.length} 份机会、{s.opportunities.filter(o => o.status === '面试中').length} 份面试中机会。样本少时不要从数量推断录用概率。</p>
          <form class="form-stack" onSubmit={e => { e.preventDefault(); if (!review.observed.trim()) return; change(st => st.reviews.push({ id: id(), at: today(), observed: review.observed.trim(), adjustment: review.adjustment.trim() })); setReview({ observed: '', adjustment: '' }); notify('复盘已保存'); }}>
            <label class="field">观察到了什么<textarea rows={3} value={review.observed} onInput={e => setReview({ ...review, observed: e.currentTarget.value.slice(0,2000) })} placeholder="例如：哪些岗位有回复？哪里卡住了？"/></label>
            <label class="field">下一次打算调整什么<input value={review.adjustment} onInput={e => setReview({ ...review, adjustment: e.currentTarget.value.slice(0,500) })} placeholder="一项可验证的小改变"/></label>
            <button class="button subtle" type="submit">保存复盘</button>
          </form>
          {s.reviews?.length > 0 && <div class="evidence-list review-list">{[...s.reviews].reverse().slice(0, 3).map(r => <div class="evidence-item" key={r.id}><small>{r.at}</small><p>{r.observed}</p>{r.adjustment && <small>调整：{r.adjustment}</small>}</div>)}</div>}
        </Card>
      </div>
      <div class="profile-aside">
        <Card id="profile-memory"><div class="section-title"><h2>伙伴记忆</h2><span>由你控制</span></div><p class="hint">只有经你确认的句子会留存；可单独决定是否发送给在线模型。</p>
          {s.memories.map(m => <div class="memory-item" key={m.id}><p>{m.text}</p><label class="checkline"><input type="checkbox" checked={m.includeOnline} onChange={e => change(st => { st.memories.find(x => x.id === m.id)!.includeOnline = e.currentTarget.checked; })}/> 在线提问时允许发送</label><button class="inline-action" onClick={() => change(st => { st.memories = st.memories.filter(x => x.id !== m.id); })}>删除</button></div>)}
          <label class="field">记住一条偏好或事实<textarea rows={3} value={memoryText} onInput={e => setMemoryText(e.currentTarget.value.slice(0, 2000))} placeholder="例如：我不接受夜班；希望回答更简短"/></label><button class="button subtle" onClick={() => { if (memoryText.trim()) { change(st => st.memories.push({ id: id(), text: memoryText.trim(), includeOnline: false, createdAt: now() })); setMemoryText(''); } }}>添加记忆</button>
        </Card>
        <Card id="profile-model"><div class="section-title"><h2>模型与联网</h2><span><Icon name="settings" size={17}/></span></div>
          <div class="mode-tabs">{(['guide','compatible','worker','device'] as const).map((mode,i) => <button class={s.provider.mode === mode ? 'active' : ''} onClick={() => updateProvider('mode',mode)}>{['本地','兼容 API','联网接口','浏览器模型'][i]}</button>)}</div>
          {s.provider.mode === 'guide' && <p class="hint">零配置、零 API 费用。使用本地规则和模板，不是大语言模型，也不搜索实时岗位。</p>}
          {s.provider.mode === 'compatible' && <div class="form-stack">
            <p class="hint">供应商可能收费。会把本次问题发送给你填写的网关；只有勾选后才附上档案。浏览器跨域权限由网关决定。</p>
            <label class="field">接口格式<select value={s.provider.format} onChange={e => { updateProvider('format',e.currentTarget.value); setModels([]); }}><option value="openai">OpenAI 兼容</option><option value="anthropic">Claude 原生</option></select></label>
            <label class="field">商家提供的网关<input type="url" value={s.provider.base} onInput={e => { updateProvider('base',e.currentTarget.value.slice(0, 1000)); updateProvider('resolvedBase',''); }} placeholder="https://example.com"/></label>
            <label class="field">API 密钥（仅此页面内存）<input type="password" value={apiInput} onInput={e => { setApiInput(e.currentTarget.value); setApiKey(e.currentTarget.value); }} placeholder={hasApiKey() ? '本次会话已有密钥' : '粘贴密钥，不进入备份或仓库'}/></label>
            <button class="button outline" disabled={loadingModels} onClick={probe}>{loadingModels ? '检测中…' : '检测网关并获取模型'}</button>
            {models.length > 0 && <label class="field">从检测结果选择<select value={s.provider.model} onChange={e => updateProvider('model',e.currentTarget.value)}><option value="">请选择</option>{models.map(m => <option value={m}>{m}</option>)}</select></label>}
            <label class="field">或手动填写模型名<input value={s.provider.model} onInput={e => updateProvider('model',e.currentTarget.value.slice(0,150))} placeholder="以商家提供的模型 ID 为准"/></label>
            <details class="advanced"><summary>高级选项</summary><label class="field">实际 API 基址（检测失败时可手填）<input value={s.provider.resolvedBase} onInput={e => updateProvider('resolvedBase',e.currentTarget.value)} placeholder="例如 https://example.com/v1"/></label><label class="field">思考深度<select value={s.provider.effort} onChange={e => updateProvider('effort',e.currentTarget.value)}><option value="auto">自动（默认）</option><option value="low">快速</option><option value="medium">均衡</option><option value="high">深入</option></select></label><label class="field">输出长度<select value={s.provider.outputMode} onChange={e => updateProvider('outputMode',e.currentTarget.value)}><option value="auto">自动（不额外限制）</option><option value="manual">手动</option></select></label>{s.provider.outputMode === 'manual' && <label class="field">单次上限 Token<input type="number" min="256" max="131072" value={s.provider.maxTokens} onInput={e => updateProvider('maxTokens',Number(e.currentTarget.value))}/></label>}</details>
            {!!providerMessage && <p class="hint" role="status">{providerMessage}</p>}
            <button class="button primary" onClick={() => { try { validBase(s.provider.base); if (!s.provider.model || !hasApiKey()) throw Error('请填写模型名和密钥'); if (s.provider.resolvedBase && new URL(s.provider.resolvedBase).origin !== new URL(validBase(s.provider.base)).origin) throw Error('API 基址必须与所填网关同域名'); notify('模型配置已就绪；密钥关闭网页后需要重新填写'); } catch(e) { notify(e instanceof Error ? e.message : '配置错误'); } }}>保存并连接</button>
          </div>}
          {s.provider.mode === 'worker' && <div class="form-stack"><p class="hint">需要自行部署有访问控制和预算限制的联网 Worker。联网搜索仅在你开启后随请求执行，结果需在原站核对。</p><label class="field">接口地址<input value={s.provider.workerEndpoint} onInput={e => updateProvider('workerEndpoint',e.currentTarget.value.slice(0,1000))} placeholder="https://…/api/chat"/></label><label class="field">访问令牌（仅此页面内存）<input type="password" value={tokenInput} onInput={e => { setTokenInput(e.currentTarget.value); setWorkerToken(e.currentTarget.value); }} placeholder="服务端访问令牌"/></label><label class="checkline"><input type="checkbox" checked={s.provider.webSearch} onChange={e => updateProvider('webSearch', e.currentTarget.checked)}/>本次允许联网搜索</label></div>}
          {s.provider.mode === 'device' && <div class="form-stack"><p class="hint">实验功能：SmolLM2 135M 英语模型，首次下载约 200 MB。设备内存不足时可能无法运行；中文问题会回退到本地规则。</p><button class="button outline" disabled={loadingModels} onClick={async () => { try { setLoadingModels(true); setDeviceMessage('准备下载…'); await loadDevice(n => setDeviceMessage(`正在下载模型：${n}%`)); setDeviceMessage('模型已加载，可以用英语提问'); } catch(e) { setDeviceMessage(e instanceof Error ? e.message : '加载失败'); } finally { setLoadingModels(false); } }}>{deviceReady() ? '已加载' : '下载并加载模型'}</button>{deviceMessage && <p class="hint" role="status">{deviceMessage}</p>}</div>}
        </Card>
        <Card id="profile-data"><div class="section-title"><h2>数据与备份</h2><span>本机保存</span></div><p class="hint">更换设备或清除浏览器数据前，请导出备份。密钥永不包含在备份中。</p><div class="button-row"><button class="button outline" onClick={() => saveFile(`见程-完整备份-${today()}.json`,backup(s))}>导出完整备份</button><label class="button subtle upload">导入 JSON<input ref={setImportFile} type="file" accept=".json,application/json" onChange={e => importData(e.currentTarget.files?.[0])}/></label></div>
          {!!s.legacySnapshot && <details class="advanced"><summary>旧版数据保护</summary><p class="hint">旧版原始记录仍在浏览器中。迁移后暂不删除，可导出原始快照或将本应用恢复为旧版数据映射。</p><div class="button-row"><button class="button subtle" onClick={() => saveFile(`职向-迁移前原始快照-${today()}.json`,JSON.stringify(s.legacySnapshot,null,2))}>下载原始快照</button><button class="button subtle" onClick={() => { if (!confirm('把见程数据恢复到旧版导入时的状态？请先导出当前备份。')) return; const snap = s.legacySnapshot as Record<string, unknown>; const restored = migrateLegacy(snap.data,snap.chats,snap.memory,snap.provider,snap.endpoint); change(st => Object.assign(st,restored)); notify('已恢复迁移前的记录'); }}>恢复迁移时的记录</button></div></details>}
          <details class="advanced danger-zone"><summary>清除本机资料</summary><p class="hint">包括见程中的简历、申请记录和记忆。此操作不会撤销已在外部招聘平台提交的申请。</p><button class="button danger" onClick={() => { if (!confirm('确定清除见程记录？建议先下载备份。')) return; change(st => Object.assign(st,defaultState())); notify('本机见程记录已清除'); }}>清除见程数据</button></details>
        </Card>
        <Card><div class="section-title"><h2>公共资源</h2></div><div class="compact-list">{[['中国公共招聘网','https://job.mohrss.gov.cn/'],['国家大学生就业服务平台','https://www.ncss.cn/'],['中国就业网','https://chinajob.mohrss.gov.cn/']].map(([title,url]) => <a class="list-row" href={url} target="_blank" rel="noopener noreferrer"><strong>{title}</strong><Icon name="external" size={15}/></a>)}</div></Card>
      </div>
    </div>
    {resumeDraft && <Modal title={s.resumes.some(r => r.id === resumeDraft.id) ? '编辑简历版本' : '新建简历版本'} onClose={() => setResumeDraft(null)}>
      <form class="form-stack" onSubmit={e => { e.preventDefault(); const item = resumeDraft; change(st => { const i = st.resumes.findIndex(r => r.id === item.id); if (i < 0) st.resumes.push(item); else st.resumes[i] = item; }); setResumeId(item.id); setResumeDraft(null); notify('简历版本已保存'); }}>
        <label class="field">版本名称<input value={resumeDraft.title} required onInput={e => setResumeDraft({ ...resumeDraft, title: e.currentTarget.value.slice(0,100) })} placeholder="例如：运营岗 · 9月"/></label>
        <div class="form-two">{(['name','city','phone','email'] as const).map((key,i) => <label class="field">{['姓名','城市','电话','邮箱'][i]}<input value={resumeDraft[key]} onInput={e => setResumeDraft({ ...resumeDraft, [key]: e.currentTarget.value.slice(0,120) })}/></label>)}</div>
        {(['summary','experience','projects','education','skills'] as const).map((key,i) => <label class="field">{['个人概述','经历','项目','教育','技能'][i]}<textarea rows={key === 'experience' ? 7 : 4} value={resumeDraft[key]} onInput={e => setResumeDraft({ ...resumeDraft, [key]: e.currentTarget.value.slice(0,5000) })}/></label>)}
        <p class="hint">请仅描述真实经历；系统不会自动编造数字、项目或头衔。</p><button class="button primary" type="submit">保存版本</button>
      </form>
    </Modal>}
  </>;
}
