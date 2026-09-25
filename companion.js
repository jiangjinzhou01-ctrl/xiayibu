(() => {
  'use strict';
  const CHAT_KEY = 'xiayibu-companion-v1';
  const CONFIG_KEY = 'xiayibu-agent-endpoint-v1';
  const PROVIDER_KEY = 'xiayibu-provider-v1';
  const $ = s => document.querySelector(s);
  const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let messages = [];
  try { const saved = JSON.parse(localStorage.getItem(CHAT_KEY)); if (Array.isArray(saved)) messages = saved.filter(x => ['user','assistant'].includes(x.role) && typeof x.text === 'string').slice(-24).map(x => ({role:x.role,text:x.text.slice(0,3500),error:!!x.error,sources:Array.isArray(x.sources)?x.sources.slice(0,6):[]})); } catch {}
  let endpoint = localStorage.getItem(CONFIG_KEY) || '';
  let provider = {}; try { provider=JSON.parse(localStorage.getItem(PROVIDER_KEY)||'{}'); } catch {}
  let mode = ['guide','device','compatible','worker'].includes(provider.mode)?provider.mode:'guide';
  let accessToken = '';
  let protocol = provider.protocol==='anthropic'?'anthropic':'openai';
  const savedConnections = provider.connections && typeof provider.connections==='object' ? provider.connections : {};
  const connections = {
    openai:{base:savedConnections.openai?.base||provider.base||'',model:savedConnections.openai?.model||provider.model||'',maxTokens:savedConnections.openai?.maxTokens||2048},
    anthropic:{base:savedConnections.anthropic?.base||'https://api.anthropic.com/v1',model:savedConnections.anthropic?.model||'',maxTokens:savedConnections.anthropic?.maxTokens||2048}
  };
  const providerKeys = {openai:'',anthropic:''};
  let modelReady = false;
  let modelLoading = null;
  let localWorker = null;
  let requestId = 0;
  const pending = new Map();
  function callLocalModel(type, messages, onProgress) {
    if (!localWorker) {
      localWorker = new Worker('./model.worker.js?v=20260925c',{type:'module'});
      localWorker.onmessage = ({data}) => {
        const request=pending.get(data.id);if(!request)return;
        if(data.type==='progress'){request.onProgress?.(data.percent);return}
        clearTimeout(request.timer);pending.delete(data.id);
        if(data.type==='error')request.reject(new Error(data.message));else request.resolve(data);
      };
      localWorker.onerror = () => {
        for(const request of pending.values()){clearTimeout(request.timer);request.reject(new Error('后台模型加载失败'))}
        pending.clear();localWorker?.terminate();localWorker=null;modelReady=false;
      };
    }
    return new Promise((resolve,reject)=>{
      const id=++requestId;
      const timer=setTimeout(()=>{pending.delete(id);localWorker?.terminate();localWorker=null;modelReady=false;reject(new Error('模型运行超时，请切回本地引导或重试'))},type==='load'?240000:90000);
      pending.set(id,{resolve,reject,onProgress,timer});localWorker.postMessage({id,type,messages});
    });
  }
  let busy = false;
  let context = {};
  const starters = [
    ['direction','我还不知道自己适合什么工作','找方向'],
    ['resume','帮我看看简历怎么改','改简历'],
    ['interview','陪我练习面试','练面试'],
    ['search','我想找合适的招聘岗位','找岗位']
  ];
  const platforms = [
    ['BOSS 直聘','https://www.zhipin.com/','企业与求职者沟通'],
    ['智联招聘','https://www.zhaopin.com/','查看社会招聘与校园招聘'],
    ['中国公共招聘网','https://job.mohrss.gov.cn/','公共就业岗位信息'],
    ['国家大学生就业服务平台','https://www.ncss.cn/','高校毕业生就业服务']
  ];
  // 官方开放权重模型仅作选择参考；API 标识以当前网关的 /models 返回为准。
  const modelCatalog = [
    {name:'千问 Qwen3.8 27B',hint:'适合中文沟通、简历与方向梳理',link:'https://huggingface.co/Qwen/Qwen3.8-27B',aliases:['qwen3827b']},
    {name:'千问 Qwen3.8 旗舰',hint:'大规模模型，调用成本和可用性由供应商决定',link:'https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B',aliases:['qwen3824ta95b']},
    {name:'Kimi K3',hint:'长对话与复杂任务；遵循模型授权条款',link:'https://huggingface.co/moonshotai/Kimi-K3',aliases:['kimik3']},
    {name:'DeepSeek V4.1 Flash',hint:'分析与日常对话；核实网关所对应的版本',link:'https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash',aliases:['deepseekv41flash']},
    {name:'GLM 5.3 Flash',hint:'中文任务备选；核实网关所对应的版本',link:'https://huggingface.co/zai-org/GLM-5.3-Flash',aliases:['glm53flash']}
  ];
  let availableModels = [];
  let fetchedBase = '';
  let fetchedProtocol = '';
  const normalizeModel = value => String(value).toLowerCase().replace(/[^a-z0-9]/g,'');
  async function readApiJson(response) {
    const raw=await response.text();
    try { return JSON.parse(raw) }
    catch { throw new Error(response.ok?'接口返回了网页或非 JSON 数据。请核对 API 基础地址，通常需要填写到 /v1。':`接口返回 ${response.status}，且不是可读取的 JSON。请核对 API 地址与密钥。`) }
  }
  function answerText(body,native) {
    const content=native?body.content:body.choices?.[0]?.message?.content;
    const parts=typeof content==='string'?content:Array.isArray(content)?content.filter(x=>x?.type==='text'||x?.type==='output_text').map(x=>x.text||'').join('\n'):'';
    if(parts.trim())return parts;
    if(!native&&typeof body.output_text==='string'&&body.output_text.trim())return body.output_text;
    if(!native&&Array.isArray(body.output))return body.output.flatMap(x=>Array.isArray(x.content)?x.content:[]).filter(x=>x?.type==='output_text'||x?.type==='text').map(x=>x.text||'').join('\n');
    return '';
  }
  function emptyAnswerMessage(body,native) {
    const reason=native?body.stop_reason:body.choices?.[0]?.finish_reason||body.incomplete_details?.reason;
    if(['length','max_tokens','max_completion_tokens','max_output_tokens'].includes(reason))return '模型已达到单次输出上限，但没有生成可显示的正文。可在接口设置里提高输出上限，或选择非推理模型；这次调用可能已经计费。';
    return '接口返回成功，但没有可显示的文字。请确认基础地址、接口格式和模型是否匹配；如果模型仅返回推理内容，请换用能输出正文的模型。';
  }
  function renderModelCatalog() {
    const list=$('#open-model-list');if(!list)return;
    const base=$('#provider-base')?.value.trim();
    for(const card of list.querySelectorAll('[data-model-card]')){
      const entry=modelCatalog[Number(card.dataset.modelCard)];
      const found=protocol==='openai'&&fetchedProtocol==='openai'&&base===fetchedBase&&fetchedBase ? availableModels.find(id=>entry.aliases.some(alias=>normalizeModel(id).includes(alias))) : null;
      const button=card.querySelector('button');button.disabled=!found;button.dataset.modelId=found||'';
      button.textContent=found?'选用此模型':'当前网关未显示';
      card.classList.toggle('available',!!found);
    }
  }
  function save() { try { localStorage.setItem(CHAT_KEY,JSON.stringify(messages.slice(-24))); } catch {} }
  function modeLabel() { return mode==='compatible' ? (protocol==='anthropic'?'Claude 接口 · 自带密钥':'兼容 API · 自带密钥') : ({guide:'本地引导 · 即刻可用',device:'浏览器小模型 · 英语试用',worker:'联网 AI · 独立接口'})[mode]; }
  function currentPrivacy() { return mode==='guide'?'本地引导在此设备运行；不发送你的对话或简历。':mode==='device'?'模型在本机后台线程运行；中文提问会自动使用本地引导。下载模型需要流量。':'使用在线接口时，对话发往所配置的服务；仅勾选后才附上求职资料。'; }
  function setMode(value) { mode=value;provider.mode=value;localStorage.setItem(PROVIDER_KEY,JSON.stringify(provider));const label=$('#agent-mode-label');if(label)label.textContent=modeLabel();const privacy=$('#chat-privacy');if(privacy)privacy.textContent=currentPrivacy();document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('selected',b.dataset.mode===mode));document.querySelectorAll('[data-mode-panel]').forEach(p=>p.hidden=p.dataset.modePanel!==mode); }
  function view(data) { if(data)context=data;return `<div class="companion-page">
    <section class="companion-hero"><div><div class="eyebrow">YOUR CAREER COMPANION</div><h1>有问题，<em>一起想下一步。</em></h1><p>聊方向、梳理真实经历、准备面试，或者去可靠渠道寻找岗位。你掌握节奏。</p></div><div class="buddy-orbit" aria-hidden="true"><span class="buddy-core"><svg class="nav-icon"><use href="./icons.svg#sparkle"></use></svg></span><i></i><i></i></div></section>
    <div class="companion-layout"><section class="chat-card" aria-label="求职伙伴对话"><div class="chat-head"><div class="chat-identity"><span class="buddy-mini"><svg class="nav-icon" aria-hidden="true"><use href="./icons.svg#sparkle"></use></svg></span><div><strong>下一步 · 伙伴</strong><small id="agent-mode-label">${modeLabel()}</small></div></div><button type="button" class="chat-text-button" id="chat-clear">清空对话</button></div><div class="chat-thread" id="chat-thread" role="log" aria-live="polite"></div><div class="chat-starters">${starters.map(x=>`<button type="button" data-starter="${x[0]}">${x[2]}</button>`).join('')}</div><form id="chat-form" class="chat-compose"><label class="sr-only" for="chat-input">对伙伴说</label><textarea id="chat-input" maxlength="3000" rows="2" placeholder="说说你现在遇到的问题…" required></textarea><button type="submit" aria-label="发送消息" class="chat-send"><svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-5 16-3.5-7zM11.5 13 20 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg></button></form><p class="chat-privacy" id="chat-privacy">${currentPrivacy()}</p></section>
    <aside class="companion-tools"><section class="tool-card"><div class="tool-kicker">01 / JOB SEARCH</div><h2>从真实岗位出发</h2><p>输入城市和岗位，带着这组关键词到招聘网站搜索、比对，再回这里记录进展。</p><form id="platform-search"><label class="field">目标岗位<input name="role" maxlength="60" placeholder="例如：产品运营" value="${escape(context.profile?.target||'')}"></label><label class="field">城市<input name="city" maxlength="40" placeholder="例如：成都 / 全国" value="${escape(context.profile?.city||'')}"></label><button class="btn btn-dark" type="submit">生成搜索清单 ↗</button></form><div id="search-results"></div></section>
    <section class="tool-card ai-settings"><div class="tool-kicker">02 / YOUR AI</div><h2>选择你的伙伴</h2><p>默认使用零费用的本地引导。设备允许时，也可下载轻量模型，或连接自己的 API。</p><div class="mode-picks"><button type="button" data-mode="guide">本地引导</button><button type="button" data-mode="device">浏览器模型</button><button type="button" data-mode="compatible">兼容 API</button><button type="button" data-mode="worker">联网接口</button></div>
    <div data-mode-panel="guide" class="mode-detail"><p>方向、简历、面试和岗位搜索都可以直接开始。回复由本地规则生成，不会冒充大模型。</p></div>
    <div data-mode-panel="device" class="mode-detail"><p>英语试用：SmolLM2 135M 量化模型。首次需下载约 200 MB，生成速度受设备影响。中文提问会自动使用本地引导；无需 API 费用。</p><button type="button" id="model-load" class="btn btn-ghost btn-sm">下载并加载模型</button><p class="subtle" id="model-status">加载后只在当前页面会话中使用；无需预先下载也可继续本地引导。</p></div>
    <div data-mode-panel="compatible" class="mode-detail"><form id="provider-form"><label class="field">接口格式<select id="provider-protocol"><option value="openai" ${protocol==='openai'?'selected':''}>OpenAI 兼容（GPT、兼容网关）</option><option value="anthropic" ${protocol==='anthropic'?'selected':''}>Claude 原生（Messages API）</option></select></label><label class="field"><span id="provider-base-label">${protocol==='anthropic'?'Claude API 基础地址':'兼容网关基础地址'}</span><input id="provider-base" type="url" inputmode="url" placeholder="${protocol==='anthropic'?'https://api.anthropic.com/v1':'https://example.com/v1'}" value="${escape(connections[protocol].base)}"></label><p class="subtle">填写供应商提供的 API 基础地址（通常以 /v1 结尾），不是官网首页；可先点“读取模型列表”验证。</p><label class="field">API 密钥<input id="provider-key" type="password" autocomplete="off" placeholder="仅在本次页面会话中保留"></label><button type="button" id="fetch-models" class="btn btn-ghost btn-sm">读取模型列表</button><label class="field" style="margin-top:12px">选择或输入模型<input id="provider-model" list="provider-models" value="${escape(connections[protocol].model)}"><datalist id="provider-models"></datalist></label><label class="field">单次输出上限（Token）<input id="provider-max-tokens" type="number" min="256" max="8192" step="256" value="${escape(connections[protocol].maxTokens)}"></label><p class="subtle">推理模型也会消耗输出 Token；过小可能只生成推理而没有正文。提高上限可能增加费用。</p><label class="chat-opt"><input type="checkbox" id="share-context"> <span>发送求职方向和简历文字（不含联系方式）</span></label><button type="submit" class="btn btn-dark btn-sm">保存接口和模型</button><p class="subtle" id="provider-status">密钥只在当前页面内存中；请填写可信供应商的 API 密钥。接口须允许浏览器跨域请求，使用可能产生费用。</p></form><p class="subtle" id="provider-protocol-note" ${protocol==='openai'?'hidden':''}>Claude 原生使用 /v1/messages；API 密钥与 Claude 聊天订阅分开。浏览器直连需供应商允许跨域请求，也会把密钥交给本页面代码。</p><div class="model-catalog" id="model-catalog" ${protocol==='anthropic'?'hidden':''}><div class="model-catalog-head"><strong>开放权重模型参考</strong><span>2026 / 09</span></div><p>开放权重不等于免费 API。先读取当前网关的模型列表，出现“选用此模型”后才能一键填入；也可以手动输入准确的模型 ID。</p><div id="open-model-list">${modelCatalog.map((item,index)=>`<article data-model-card="${index}" class="open-model-card"><div><strong>${escape(item.name)}</strong><small>${escape(item.hint)}</small><a href="${escape(item.link)}" target="_blank" rel="noopener noreferrer">官方模型页 ↗</a></div><button type="button" disabled data-model-pick="${index}">当前网关未显示</button></article>`).join('')}</div></div></div>
    <div data-mode-panel="worker" class="mode-detail"><p>连接你部署的受保护接口。联网搜索仅在接口已开启并支持时可用。</p><form id="config-form"><label class="field">接口地址<input id="agent-endpoint" type="url" inputmode="url" placeholder="https://你的-worker.workers.dev/api/chat" value="${escape(endpoint)}"></label><label class="field">访问令牌<input id="agent-token" type="password" autocomplete="off" placeholder="只在当前页面会话中保留"></label><label class="chat-opt"><input type="checkbox" id="share-worker-context"> <span>发送求职方向和简历文字（不含联系方式）</span></label><div class="form-actions"><button class="btn btn-dark btn-sm" type="submit">保存接口</button><button class="btn btn-ghost btn-sm" type="button" id="config-remove">清除接口</button></div><p class="subtle">令牌刷新后需重新输入，请勿将模型 API Key 填在这里。</p></form></div></section></aside></div></div>`; }
  function renderMessages() {
    const thread = $('#chat-thread'); if (!thread) return;
    thread.innerHTML = messages.length ? messages.map(m => `<div class="chat-row ${m.role}"><span class="chat-avatar">${m.role==='assistant'?'✦':'我'}</span><div class="chat-bubble"><div class="chat-text">${escape(m.text)}</div>${m.sources?.length?`<div class="chat-sources"><strong>来源</strong>${m.sources.map(s=>{try{const u=new URL(s.url);if(u.protocol!=='https:')return '';return `<a href="${escape(u.href)}" target="_blank" rel="noopener noreferrer">${escape((s.title||u.hostname).slice(0,75))} ↗</a>`}catch{return ''}}).join('')}</div>`:''}</div></div>`).join('') : `<div class="chat-welcome"><span class="buddy-mini"><svg class="nav-icon" aria-hidden="true"><use href="./icons.svg#sparkle"></use></svg></span><h2>你好，我在。</h2><p>现在最想解决哪件事？可以直接说，也可以从下面的提问开始。</p></div>`;
    if (busy) thread.insertAdjacentHTML('beforeend','<div class="chat-row assistant"><span class="chat-avatar">✦</span><div class="chat-bubble chat-thinking"><i></i><i></i><i></i><span class="sr-only">正在思考</span></div></div>');
    thread.scrollTop = thread.scrollHeight;
  }
  function offlineReply(text) {
    const p=context.profile||{}, r=context.resume||{};
    const role=(p.target||r.title||'你感兴趣的岗位').slice(0,35), city=(p.city||'你希望工作的城市').slice(0,30);
    if (/简历|经历|项目|润色|改写|自我介绍/.test(text)) {
      const section = r.experience?.trim()||r.projects?.trim();
      return section ? `我看到你已经写了经历。先挑一段与「${role}」有关的内容，按“任务 → 自己做的动作 → 真实结果”重写。你可以把一段原文贴给我，我会帮你拆句；在当前本地引导模式下，我会给结构和核对清单，文字润色需要接入 AI。\n\n核对：动作是否具体？结果是否能举证？有没有凭空编造数字？联系方式不必放进对话。` : `先写一段真实经历，无论实习、课程项目还是志愿活动都可以。用三句填空：\n1. 当时要解决的问题是____。\n2. 我具体做了____，使用____。\n3. 最后得到____（没有数字也可以写可核实的变化）。\n\n写完贴给我，或者去「简历工坊」保存完整简历。`;
    }
    if (/面试|压力|回答|自我介绍/.test(text)) return `我们从一道常见题开始：“请用 60 秒介绍自己，以及为什么想做${role}？”\n\n回答可以按“现在的方向 → 一段相关经历 → 为什么匹配这个岗位”组织。你先用自己的话写 3 到 5 句，再检查是否有具体事例、是否超过一分钟。接入 AI 后可继续多轮模拟追问。`;
    if (/岗位|招聘|搜索|职位|找工作|boss|智联|联网/.test(text)) return `先把搜索范围定为「${city} · ${role}」。建议到右侧“从真实岗位出发”生成搜索清单，分别在 BOSS 直聘、智联招聘和公共招聘网站查看原始岗位。\n\n挑 3 个岗位，记录企业、发布日期、地点、职责和招聘主体；登录、申请和真实性核实都在原站完成。接入联网 AI 后，我也可以提供带来源的公开网页线索。`;
    if (/方向|适合|迷茫|转行|不知道|选择|职业/.test(text)) return `我们先把方向缩小，不用今天做终身决定。\n\n请列出：① 做过且愿意继续做的两件事；② 愿意学习的一项技能；③ 不能接受的工作条件（地点、班次或薪酬）。然后挑两个岗位，在真实招聘页各读 5 条要求，标出你已有的证据。\n\n${p.strengths?`你在方向页提过“${p.strengths.slice(0,80)}”，可以先从这里找可迁移的例子。`:'如果你愿意，可以在「定方向」写下已有技能，我会据此给你更具体的下一步。'}`;
    return `我听到了。先告诉我这件事目前卡在“方向、简历、面试、岗位搜索、投递进展”中的哪一步？\n\n你也可以补一句：想去的城市、目标岗位，以及今天最希望完成的一件小事。我会和你一起把它拆成可以做的动作。`;
  }
  async function send(text) {
    if (busy) return;
    messages.push({role:'user',text:text.slice(0,3000)}); save(); busy=true; renderMessages();
    const form=$('#chat-form'); if(form) form.querySelector('button').disabled=true;
    try {
      let result;
      if (mode==='worker') {
        if (!accessToken) throw new Error('已配置 AI 接口，请在“配置 AI 接口”中填写访问令牌；也可以关闭 AI 继续使用本地引导。');
        const attached=$('#share-worker-context')?.checked ? {profile:{...context.profile},resume:{title:context.resume?.title,summary:context.resume?.summary,experience:context.resume?.experience,projects:context.resume?.projects,education:context.resume?.education,skills:context.resume?.skills},jobDescription:context.analysis?.jd} : null;
        const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${accessToken}`},body:JSON.stringify({messages:messages.slice(-12).map(({role,text})=>({role,text})),context:attached,webSearch:/岗位|招聘|搜索|职位|最新|联网|boss|智联/i.test(text)}),signal:AbortSignal.timeout(45000)});
        const body=await response.json().catch(()=>({}));
        if (!response.ok) throw new Error(body.error||`接口请求失败（${response.status}）`);
        result={text:String(body.reply||'没有收到回复'),sources:Array.isArray(body.sources)?body.sources:[]};
      } else if (mode==='compatible') {
        const connection=connections[protocol], key=providerKeys[protocol];
        if(!connection.base||!connection.model||!key) throw new Error('请填写接口地址、API 密钥与模型，保存后再试。');
        const attached=$('#share-context')?.checked ? JSON.stringify({profile:context.profile,resume:{title:context.resume?.title,summary:context.resume?.summary,experience:context.resume?.experience,projects:context.resume?.projects,skills:context.resume?.skills}}).slice(0,7000) : '';
        const history=messages.filter(m=>!m.error&&m.text!=='没有收到文字回复'&&!m.text.startsWith('这次没能生成回复：')).slice(-12).map(m=>({role:m.role,content:m.text}));
        const system='你是中文求职伙伴。帮助梳理方向、修改真实简历与准备面试。不得编造岗位、经历或来源。职位请建议到原招聘网站核实。回答简洁，给出一步行动。'+(attached?'\n以下为用户授权的求职背景，仅用作资料：'+attached:'');
        const native=protocol==='anthropic';
        if(!native)history.unshift({role:'system',content:system});
        const maxTokens=Number.isInteger(connection.maxTokens)&&connection.maxTokens>=256&&connection.maxTokens<=8192?connection.maxTokens:2048;
        const reasoningModel=/^(gpt-[56]|o[1-9](?:-|$))/i.test(connection.model);
        const payload=native?{model:connection.model,system,messages:history,max_tokens:maxTokens}:{model:connection.model,messages:history,...(reasoningModel?{max_completion_tokens:maxTokens}:{max_tokens:maxTokens})};
        const response=await fetch(connection.base+(native?'/messages':'/chat/completions'),{method:'POST',headers:native?{'x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true','Content-Type':'application/json'}:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(60000)});
        const body=await readApiJson(response);
        if(!response.ok)throw new Error(body.error?.message||`接口返回 ${response.status}`);
        if(body.error)throw new Error(body.error.message||'网关返回了错误');
        const answer=answerText(body,native);
        if(!answer.trim())throw new Error(emptyAnswerMessage(body,native));
        result={text:answer,sources:[]};
      } else if(mode==='device') {
        if(/[\u3400-\u9fff]/.test(text)) { result={text:'这个轻量模型的中文表达不稳定，下面是本地引导给你的建议：\n\n'+offlineReply(text),sources:[]}; } else {
        if(!modelReady)throw new Error('请先点击“下载并加载模型”。设备内存不足时可切回本地引导。');
        const prompt=[{role:'system',content:'You are a concise career companion. Answer in simple English. Never invent job listings or resume achievements. Give one concrete next step.'},...messages.filter(m=>!/[\u3400-\u9fff]/.test(m.text)).slice(-5).map(m=>({role:m.role,content:m.text.slice(0,500)}))];
        const generated=await callLocalModel('generate',prompt);
        result={text:generated.text,sources:[]};
        }
      } else result={text:offlineReply(text),sources:[]};
      messages.push({role:'assistant',text:result.text.slice(0,3500),sources:result.sources.slice(0,6)}); save();
    } catch (error) { messages.push({role:'assistant',error:true,text:`这次没能生成回复：${error.message}\n\n你的问题仍保存在本机。请检查当前模式的设置，或切换到本地引导。`,sources:[]}); save(); }
    finally {busy=false;if(form)form.querySelector('button').disabled=false;renderMessages();}
  }
  function validBase(value){const u=new URL(value.trim());if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))throw Error('请使用 HTTPS 网关');if(u.username||u.password||u.search||u.hash)throw Error('网关地址不要包含账号、参数或片段');return u.href.replace(/\/$/,'')}
  function mount(root, data) {
    context=data||{}; renderMessages();
    root.querySelector('#chat-form')?.addEventListener('submit',e=>{e.preventDefault();const input=$('#chat-input');const text=input.value.trim();if(!text||busy)return;input.value='';send(text)});
    root.querySelector('#chat-input')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();e.target.closest('form').requestSubmit()}});
    root.querySelectorAll('[data-starter]').forEach(b=>b.addEventListener('click',()=>{const starter=starters.find(x=>x[0]===b.dataset.starter);if(starter)send(starter[1])}));
    root.querySelector('#chat-clear')?.addEventListener('click',()=>{if(!confirm('清空伙伴的本地对话记录？'))return;messages=[];save();renderMessages()});
    root.querySelector('#platform-search')?.addEventListener('submit',e=>{e.preventDefault();const form=e.target;const d=new FormData(form);const query=[String(d.get('city')||'').trim(),String(d.get('role')||'').trim()].filter(Boolean).join(' ');const out=$('#search-results');if(!query){out.textContent='先填写岗位或城市。';return}out.innerHTML=`<div class="search-query"><strong>搜索词：${escape(query)}</strong><button type="button" id="copy-search" class="chat-text-button">复制</button></div><div class="platform-list">${platforms.map(([name,url,note])=>`<a href="${url}" target="_blank" rel="noopener noreferrer"><span><strong>${name}</strong><small>${note}</small></span><span aria-hidden="true">↗</span></a>`).join('')}</div><p class="subtle">打开原站后粘贴搜索词；岗位、薪资及发布日期以原站为准。</p>`;$('#copy-search').addEventListener('click',()=>navigator.clipboard?.writeText(query).then(()=>{$('#copy-search').textContent='已复制'}).catch(()=>{$('#copy-search').textContent='请手动复制'}));});
    root.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));setMode(mode);
    root.querySelector('#model-load')?.addEventListener('click',async()=>{const status=$('#model-status');if(modelReady){status.textContent='模型已加载，可以直接开始对话。';return}if(modelLoading)return;status.textContent='正在后台加载模型，请保持此页面打开…';modelLoading=callLocalModel('load',null,p=>{if(status)status.textContent=`下载模型：${p}%`});try{await modelLoading;modelReady=true;status.textContent='模型已加载，可以直接开始对话。'}catch(error){status.textContent='加载失败：'+error.message+'。可切回本地引导。'}finally{modelLoading=null}});
    root.querySelector('#provider-protocol')?.addEventListener('change',e=>{
      const previous=protocol;
      providerKeys[previous]=$('#provider-key').value.trim()||providerKeys[previous];
      protocol=e.target.value==='anthropic'?'anthropic':'openai';
      provider.protocol=protocol;
      provider.connections=connections;
      localStorage.setItem(PROVIDER_KEY,JSON.stringify(provider));
      $('#provider-base').value=connections[protocol].base;
      $('#provider-base').placeholder=protocol==='anthropic'?'https://api.anthropic.com/v1':'https://example.com/v1';
      $('#provider-base-label').textContent=protocol==='anthropic'?'Claude API 基础地址':'兼容网关基础地址';
      $('#provider-model').value=connections[protocol].model;
      $('#provider-max-tokens').value=connections[protocol].maxTokens;
      $('#provider-key').value=providerKeys[protocol];
      $('#provider-models').replaceChildren();
      $('#provider-protocol-note').hidden=protocol!=='anthropic';
      $('#model-catalog').hidden=protocol==='anthropic';
      availableModels=[];fetchedBase='';fetchedProtocol='';renderModelCatalog();
      $('#provider-status').textContent='已切换接口格式。填写并保存该接口的地址、密钥和模型后使用。';
      $('#agent-mode-label').textContent=modeLabel();
    });
    root.querySelectorAll('[data-model-pick]').forEach(button=>button.addEventListener('click',()=>{if(!button.dataset.modelId)return;$('#provider-model').value=button.dataset.modelId;$('#provider-status').textContent='已选中当前网关提供的 '+button.dataset.modelId+'；点击“保存网关和模型”后生效。'}));
    root.querySelector('#provider-base')?.addEventListener('input',renderModelCatalog);renderModelCatalog();
    root.querySelector('#fetch-models')?.addEventListener('click',async()=>{const status=$('#provider-status'),requestedProtocol=protocol;try{const base=validBase($('#provider-base').value);const key=$('#provider-key').value.trim()||providerKeys[protocol];if(!key)throw Error('请先填写 API 密钥');status.textContent='正在读取模型列表…';const headers=requestedProtocol==='anthropic'?{'x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'}:{Authorization:'Bearer '+key};const response=await fetch(base+'/models',{headers,signal:AbortSignal.timeout(15000)});const data=await readApiJson(response);if(!response.ok)throw Error(data.error?.message||`接口返回 ${response.status}`);if(data.error)throw Error(data.error.message||'网关返回了错误');if(requestedProtocol!==protocol||base!==validBase($('#provider-base').value))return;const models=Array.isArray(data.data)?data.data.map(x=>x.id).filter(x=>typeof x==='string'&&x.length<160).slice(0,500):[];availableModels=models;fetchedBase=$('#provider-base').value.trim();fetchedProtocol=protocol;renderModelCatalog();$('#provider-models').innerHTML=models.map(x=>`<option value="${escape(x)}"></option>`).join('');status.textContent=models.length?`读取到 ${models.length} 个模型。可选择或手动输入。`:'接口未返回模型列表，请核对基础地址或联系供应商；也可手动输入模型 ID。'}catch(error){if(requestedProtocol!==protocol)return;availableModels=[];fetchedBase='';fetchedProtocol='';renderModelCatalog();status.textContent='读取失败：'+error.message+' 若浏览器提示跨域限制，请使用允许 CORS 的接口。'}});
    root.querySelector('#provider-form')?.addEventListener('submit',e=>{e.preventDefault();try{const base=validBase($('#provider-base').value),model=$('#provider-model').value.trim().slice(0,150),key=$('#provider-key').value.trim()||providerKeys[protocol],maxTokens=Number($('#provider-max-tokens').value);if(!model)throw Error('请输入模型名');if(!key)throw Error('请输入 API 密钥');if(!Number.isInteger(maxTokens)||maxTokens<256||maxTokens>8192)throw Error('输出上限请填写 256 到 8192 之间的整数');connections[protocol]={base,model,maxTokens};providerKeys[protocol]=key;provider.protocol=protocol;provider.connections=connections;delete provider.base;delete provider.model;localStorage.setItem(PROVIDER_KEY,JSON.stringify(provider));$('#provider-status').textContent='已保存该接口和模型；密钥只在当前页面会话保留。'}catch(error){$('#provider-status').textContent=error.message}});
    root.querySelector('#config-form')?.addEventListener('submit',e=>{e.preventDefault();const raw=$('#agent-endpoint').value.trim();try{const url=new URL(raw);if(url.protocol!=='https:' && !(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw Error('请使用 HTTPS 接口');endpoint=url.href;localStorage.setItem(CONFIG_KEY,endpoint);accessToken=$('#agent-token').value.trim();setMode('worker');}catch(error){alert(error.message)}});
    root.querySelector('#config-remove')?.addEventListener('click',()=>{endpoint='';accessToken='';localStorage.removeItem(CONFIG_KEY);$('#agent-endpoint').value='';$('#agent-token').value='';setMode('guide')});
  }
  window.NextStepCompanion={view,mount};
})();
