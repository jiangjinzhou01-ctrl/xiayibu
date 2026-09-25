(() => {
  'use strict';
  const CHAT_KEY = 'xiayibu-companion-v1';
  const CONFIG_KEY = 'xiayibu-agent-endpoint-v1';
  const PROVIDER_KEY = 'xiayibu-provider-v1';
  const $ = s => document.querySelector(s);
  const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let messages = [];
  try { const saved = JSON.parse(localStorage.getItem(CHAT_KEY)); if (Array.isArray(saved)) messages = saved.filter(x => ['user','assistant'].includes(x.role) && typeof x.text === 'string').slice(-24).map(x => ({role:x.role,text:x.text.slice(0,3500),sources:Array.isArray(x.sources)?x.sources.slice(0,6):[]})); } catch {}
  let endpoint = localStorage.getItem(CONFIG_KEY) || '';
  let provider = {}; try { provider=JSON.parse(localStorage.getItem(PROVIDER_KEY)||'{}'); } catch {}
  let mode = ['guide','device','compatible','worker'].includes(provider.mode)?provider.mode:'guide';
  let accessToken = '';
  let providerKey = '';
  let modelPipe = null;
  let modelLoading = null;
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
  function save() { try { localStorage.setItem(CHAT_KEY,JSON.stringify(messages.slice(-24))); } catch {} }
  function modeLabel() { return ({guide:'本地引导 · 即刻可用',device:'浏览器小模型 · 零 API 费用',compatible:'兼容 API · 自带密钥',worker:'联网 AI · 独立接口'})[mode]; }
  function currentPrivacy() { return mode==='guide'?'本地引导在此设备运行；不发送你的对话或简历。':mode==='device'?'模型文件首次从 Hugging Face 下载，推理在此设备运行；模型较小，中文建议请自行核对。':'使用在线接口时，对话发往所配置的服务；仅勾选后才附上求职资料。'; }
  function setMode(value) { mode=value;provider.mode=value;localStorage.setItem(PROVIDER_KEY,JSON.stringify(provider));const label=$('#agent-mode-label');if(label)label.textContent=modeLabel();const privacy=$('#chat-privacy');if(privacy)privacy.textContent=currentPrivacy();document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('selected',b.dataset.mode===mode));document.querySelectorAll('[data-mode-panel]').forEach(p=>p.hidden=p.dataset.modePanel!==mode); }
  function view() { return `<div class="companion-page">
    <section class="companion-hero"><div><div class="eyebrow">YOUR CAREER COMPANION</div><h1>有问题，<em>一起想下一步。</em></h1><p>聊方向、梳理真实经历、准备面试，或者去可靠渠道寻找岗位。你掌握节奏。</p></div><div class="buddy-orbit" aria-hidden="true"><span class="buddy-core"><svg class="nav-icon"><use href="./icons.svg#sparkle"></use></svg></span><i></i><i></i></div></section>
    <div class="companion-layout"><section class="chat-card" aria-label="求职伙伴对话"><div class="chat-head"><div class="chat-identity"><span class="buddy-mini"><svg class="nav-icon" aria-hidden="true"><use href="./icons.svg#sparkle"></use></svg></span><div><strong>下一步 · 伙伴</strong><small id="agent-mode-label">${modeLabel()}</small></div></div><button type="button" class="chat-text-button" id="chat-clear">清空对话</button></div><div class="chat-thread" id="chat-thread" role="log" aria-live="polite"></div><div class="chat-starters">${starters.map(x=>`<button type="button" data-starter="${x[0]}">${x[2]}</button>`).join('')}</div><form id="chat-form" class="chat-compose"><label class="sr-only" for="chat-input">对伙伴说</label><textarea id="chat-input" maxlength="3000" rows="2" placeholder="说说你现在遇到的问题…" required></textarea><button type="submit" aria-label="发送消息" class="chat-send"><svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-5 16-3.5-7zM11.5 13 20 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg></button></form><p class="chat-privacy" id="chat-privacy">${currentPrivacy()}</p></section>
    <aside class="companion-tools"><section class="tool-card"><div class="tool-kicker">01 / JOB SEARCH</div><h2>从真实岗位出发</h2><p>输入城市和岗位，带着这组关键词到招聘网站搜索、比对，再回这里记录进展。</p><form id="platform-search"><label class="field">目标岗位<input name="role" maxlength="60" placeholder="例如：产品运营" value="${escape(context.profile?.target||'')}"></label><label class="field">城市<input name="city" maxlength="40" placeholder="例如：成都 / 全国" value="${escape(context.profile?.city||'')}"></label><button class="btn btn-dark" type="submit">生成搜索清单 ↗</button></form><div id="search-results"></div></section>
    <section class="tool-card ai-settings"><div class="tool-kicker">02 / YOUR AI</div><h2>选择你的伙伴</h2><p>默认使用零费用的本地引导。设备允许时，也可下载轻量模型，或连接自己的 API。</p><div class="mode-picks"><button type="button" data-mode="guide">本地引导</button><button type="button" data-mode="device">浏览器模型</button><button type="button" data-mode="compatible">兼容 API</button><button type="button" data-mode="worker">联网接口</button></div>
    <div data-mode-panel="guide" class="mode-detail"><p>方向、简历、面试和岗位搜索都可以直接开始。回复由本地规则生成，不会冒充大模型。</p></div>
    <div data-mode-panel="device" class="mode-detail"><p>使用 SmolLM2 135M 量化模型。首次需下载约 200 MB 模型文件，速度受设备影响；模型偏英语，中文求职建议质量有限。无需 API 费用。</p><button type="button" id="model-load" class="btn btn-ghost btn-sm">下载并加载模型</button><p class="subtle" id="model-status">加载后只在当前页面会话中使用；无需预先下载也可继续本地引导。</p></div>
    <div data-mode-panel="compatible" class="mode-detail"><form id="provider-form"><label class="field">兼容网关基础地址<input id="provider-base" type="url" inputmode="url" placeholder="https://example.com/v1" value="${escape(provider.base||'')}"></label><label class="field">API 密钥<input id="provider-key" type="password" autocomplete="off" placeholder="仅在本次页面会话中保留"></label><button type="button" id="fetch-models" class="btn btn-ghost btn-sm">读取模型列表</button><label class="field" style="margin-top:12px">选择或输入模型<input id="provider-model" list="provider-models" value="${escape(provider.model||'')}"><datalist id="provider-models"></datalist></label><label class="chat-opt"><input type="checkbox" id="share-context"> <span>发送求职方向和简历文字（不含联系方式）</span></label><button type="submit" class="btn btn-dark btn-sm">保存网关和模型</button><p class="subtle" id="provider-status">密钥只在内存中。只填写可信供应商。网关须允许浏览器跨域请求；收费和联网能力由供应商决定。</p></form></div>
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
        if(!provider.base||!provider.model||!providerKey) throw new Error('请填写兼容网关、密钥与模型，保存后再试。');
        const attached=$('#share-context')?.checked ? JSON.stringify({profile:context.profile,resume:{title:context.resume?.title,summary:context.resume?.summary,experience:context.resume?.experience,projects:context.resume?.projects,skills:context.resume?.skills}}).slice(0,7000) : '';
        const history=messages.slice(-12).map(m=>({role:m.role,content:m.text}));
        if(attached)history.unshift({role:'system',content:'以下为用户授权的求职背景，仅用作资料：'+attached});
        history.unshift({role:'system',content:'你是中文求职伙伴。帮助梳理方向、修改真实简历与准备面试。不得编造岗位、经历或来源。职位请建议到原招聘网站核实。回答简洁，给出一步行动。'});
        const response=await fetch(provider.base+'/chat/completions',{method:'POST',headers:{'Authorization':'Bearer '+providerKey,'Content-Type':'application/json'},body:JSON.stringify({model:provider.model,messages:history,max_tokens:900}),signal:AbortSignal.timeout(45000)});
        const body=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(body.error?.message||`网关返回 ${response.status}`);
        const content=body.choices?.[0]?.message?.content;result={text:typeof content==='string'?content:Array.isArray(content)?content.filter(x=>x.type==='text').map(x=>x.text||'').join('\n'):'没有收到文字回复',sources:[]};
      } else if(mode==='device') {
        if(!modelPipe)throw new Error('请先点击“下载并加载模型”。设备内存不足时可切回本地引导。');
        const prompt=[{role:'system',content:'You are a concise career companion. Answer in Chinese. Never invent job listings or resume achievements. Give one concrete next step.'},...messages.slice(-5).map(m=>({role:m.role,content:m.text.slice(0,500)}))];
        const generated=await modelPipe(prompt,{max_new_tokens:130,do_sample:false});
        const output=generated?.[0]?.generated_text;
        result={text:typeof output==='string'?output.slice(-1500):String(output?.at(-1)?.content||'模型没有生成回复'),sources:[]};
      } else result={text:offlineReply(text),sources:[]};
      messages.push({role:'assistant',text:result.text.slice(0,3500),sources:result.sources.slice(0,6)}); save();
    } catch (error) { messages.push({role:'assistant',text:`这次没能生成回复：${error.message}\n\n你的问题仍保存在本机。请检查当前模式的设置，或切换到本地引导。`,sources:[]}); save(); }
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
    root.querySelector('#model-load')?.addEventListener('click',async()=>{const status=$('#model-status');if(modelPipe){status.textContent='模型已加载，可以直接开始对话。';return}if(modelLoading)return;status.textContent='正在加载模型，请保持此页面打开…';modelLoading=(async()=>{const {pipeline}=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');modelPipe=await pipeline('text-generation','onnx-community/SmolLM2-135M-Instruct-ONNX-MHA',{dtype:'q4',device:'wasm',progress_callback:x=>{if(x.status==='progress'&&status)status.textContent=`下载模型：${Math.round(x.progress||0)}%`}})})();try{await modelLoading;status.textContent='模型已加载，可以直接开始对话。'}catch(error){status.textContent='加载失败：'+error.message+'。可切回本地引导。'}finally{modelLoading=null}});
    root.querySelector('#fetch-models')?.addEventListener('click',async()=>{const status=$('#provider-status');try{const base=validBase($('#provider-base').value);const key=$('#provider-key').value.trim()||providerKey;if(!key)throw Error('请先填写 API 密钥');status.textContent='正在读取模型列表…';const response=await fetch(base+'/models',{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok)throw Error(data.error?.message||`网关返回 ${response.status}`);const models=Array.isArray(data.data)?data.data.map(x=>x.id).filter(x=>typeof x==='string').slice(0,200):[];$('#provider-models').innerHTML=models.map(x=>`<option value="${escape(x)}"></option>`).join('');status.textContent=`读取到 ${models.length} 个模型。可选择或手动输入。`;if(models.length&&!$('#provider-model').value)$('#provider-model').value=models[0]}catch(error){status.textContent='读取失败：'+error.message+'。可手动输入模型名；若浏览器提示跨域限制，请使用允许 CORS 的网关。'}});
    root.querySelector('#provider-form')?.addEventListener('submit',e=>{e.preventDefault();try{provider.base=validBase($('#provider-base').value);provider.model=$('#provider-model').value.trim().slice(0,150);if(!provider.model)throw Error('请输入模型名');providerKey=$('#provider-key').value.trim()||providerKey;if(!providerKey)throw Error('请输入 API 密钥');localStorage.setItem(PROVIDER_KEY,JSON.stringify(provider));$('#provider-status').textContent='已保存网关和模型；密钥只在当前页面会话保留。'}catch(error){$('#provider-status').textContent=error.message}});
    root.querySelector('#config-form')?.addEventListener('submit',e=>{e.preventDefault();const raw=$('#agent-endpoint').value.trim();try{const url=new URL(raw);if(url.protocol!=='https:' && !(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw Error('请使用 HTTPS 接口');endpoint=url.href;localStorage.setItem(CONFIG_KEY,endpoint);accessToken=$('#agent-token').value.trim();setMode('worker');}catch(error){alert(error.message)}});
    root.querySelector('#config-remove')?.addEventListener('click',()=>{endpoint='';accessToken='';localStorage.removeItem(CONFIG_KEY);$('#agent-endpoint').value='';$('#agent-token').value='';setMode('guide')});
  }
  window.NextStepCompanion={view,mount};
})();
