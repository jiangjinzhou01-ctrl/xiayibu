import { useEffect, useRef, useState } from 'preact/hooks';
import { AppState, defaultState } from './domain';
import { loadState, saveState } from './storage';
import { Page, Icon, Mark, Modal } from './ui';
import { Today } from './features/today';
import { Opportunities } from './features/opportunities';
import { Companion } from './features/companion';
import { Profile } from './features/profile';

const labels: Record<Page, string> = { today: '今天', opportunities: '机会', companion: '伙伴', profile: '我的' };
function routeFromHash(): { page: Page; detail: string } {
  const [path, detail = ''] = location.hash.replace(/^#/, '').split('/');
  const old: Record<string, Page> = { overview: 'today', direction: 'profile', resume: 'profile', tracker: 'opportunities', safety: 'profile', resources: 'profile' };
  const page = (['today', 'opportunities', 'companion', 'profile'].includes(path) ? path : old[path] || 'today') as Page;
  return { page, detail };
}
export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [route, setRoute] = useState(routeFromHash);
  const [onboarding, setOnboarding] = useState(false);
  const [intro, setIntro] = useState({ status: '', target: '', city: '', goal: '' });
  const [toast, setToast] = useState('');
  const timer = useRef<number>();
  const positions = useRef<Record<Page, number>>({ today: 0, opportunities: 0, companion: 0, profile: 0 });
  const current = useRef<Page>(route.page);
  useEffect(() => {
    loadState().then(setState).catch(() => setState(defaultState()));
    const onHash = () => {
      positions.current[current.current] = window.scrollY;
      const next = routeFromHash();
      setRoute(next);
      if (next.page !== current.current) {
        current.current = next.page;
        requestAnimationFrame(() => window.scrollTo({ top: positions.current[next.page], behavior: 'instant' }));
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    const root = document.documentElement, vv = window.visualViewport;
    let baseline = Math.max(vv?.height || window.innerHeight, window.innerHeight);
    const adjust = () => {
      const height = vv?.height || window.innerHeight;
      const focus = document.activeElement;
      const editing = focus instanceof HTMLElement && !!focus.closest('input,textarea,[contenteditable=true]');
      if (!editing && height > baseline - 25) baseline = Math.max(baseline, height);
      root.style.setProperty('--visual-height', Math.round(height) + 'px');
      const keyboard = editing && height < baseline - 110;
      document.body.classList.toggle('keyboard-open', keyboard);
      if (keyboard && focus instanceof HTMLElement) {
        requestAnimationFrame(() => {
          const box = focus.getBoundingClientRect(), bottom = (vv?.offsetTop || 0) + height;
          if (box.bottom > bottom - 12) window.scrollBy({ top: box.bottom - bottom + 16, behavior: 'instant' });
        });
      }
    };
    vv?.addEventListener('resize', adjust); vv?.addEventListener('scroll', adjust);
    window.addEventListener('resize', adjust); document.addEventListener('focusin', adjust); document.addEventListener('focusout', adjust); adjust();
    return () => { vv?.removeEventListener('resize', adjust); vv?.removeEventListener('scroll', adjust); window.removeEventListener('resize', adjust); document.removeEventListener('focusin', adjust); document.removeEventListener('focusout', adjust); document.body.classList.remove('keyboard-open'); };
  }, []);
  const notify = (message: string) => {
    setToast(message); window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(''), 4000);
  };
  const change = (edit: (s: AppState) => void) => setState(previous => {
    if (!previous) return previous;
    const next = structuredClone(previous);
    edit(next);
    saveState(next).catch(() => notify('保存失败，请立即导出备份'));
    return next;
  });
  if (!state) return <div class="boot" role="status"><Mark/><span>正在读取此设备的求职记录…</span></div>;
  const nav = (mobile = false) => (Object.keys(labels) as Page[]).map(page => <a key={page} href={'#' + page} aria-current={route.page === page ? 'page' : undefined} class={route.page === page ? 'active' : ''}><Icon name={page}/><span>{labels[page]}</span></a>);
  return <div class="shell">
    <aside class="sidebar">
      <a href="#today" class="brand"><Mark size={38}/><span><strong>见程</strong><small>把下一步走清楚</small></span></a>
      <nav class="side-links" aria-label="主导航">{nav()}</nav>
      <div class="sidebar-foot"><span>你的求职进程</span><strong>仅存于此设备</strong></div>
    </aside>
    <div class="workspace">
      <header class="topbar"><a class="mobile-brand" href="#today"><Mark size={29}/><strong>见程</strong></a><div class="topbar-title"><span>见程 / </span>{labels[route.page]}</div><div class="topbar-right"><span class="local-badge">本机保存</span><a href="#profile" class="icon-button" aria-label="我的资料"><Icon name="profile" size={19}/></a></div></header>
      <main id="content">
        <section hidden={route.page !== 'today'} class="page today-page"><Today state={state} change={change} openOnboarding={() => setOnboarding(true)}/></section>
        <section hidden={route.page !== 'opportunities'} class="page opportunities-page"><Opportunities state={state} change={change} detail={route.page === 'opportunities' ? route.detail : ''} notify={notify} askWith={key => { location.hash = 'companion/' + key; }}/></section>
        <section hidden={route.page !== 'companion'} class="page companion-page"><Companion state={state} change={change} detail={route.page === 'companion' ? route.detail : ''} notify={notify}/></section>
        <section hidden={route.page !== 'profile'} class="page profile-page"><Profile state={state} change={change} notify={notify}/></section>
      </main>
    </div>
    <nav class="bottom-nav" aria-label="手机主导航">{nav(true)}</nav>
    {onboarding && <Modal title="先认识眼前的你" onClose={() => setOnboarding(false)}>
      <form class="form-stack" onSubmit={e => { e.preventDefault(); change(st => { Object.assign(st.profile,intro,{ onboarded: true }); }); setOnboarding(false); notify('方向已保存；先从一份真实岗位开始'); }}>
        <p class="hint">先填你知道的部分；方向不确定也能继续。</p>
        <label class="field">目前状态<select value={intro.status} onChange={e => setIntro({ ...intro, status: e.currentTarget.value })}><option value="">暂不确定</option>{['应届毕业','正在求职','在职探索','转行探索','重返职场'].map(v => <option>{v}</option>)}</select></label>
        <label class="field">想做的方向<input value={intro.target} onInput={e => setIntro({ ...intro, target: e.currentTarget.value.slice(0,80) })} placeholder="例如：运营 / 还在探索"/></label>
        <label class="field">工作城市<input value={intro.city} onInput={e => setIntro({ ...intro, city: e.currentTarget.value.slice(0,80) })} placeholder="例如：成都 / 不限"/></label>
        <label class="field">眼下最困扰的事<input value={intro.goal} onInput={e => setIntro({ ...intro, goal: e.currentTarget.value.slice(0,500) })} placeholder="例如：简历没有回应"/></label>
        <button class="button primary" type="submit">保存，开始下一步</button>
      </form>
    </Modal>}
    {!!toast && <div class="toast" role="status">{toast}</div>}
  </div>;
}
