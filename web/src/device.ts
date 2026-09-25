let worker: Worker | null = null;
let ready = false;
let sequence = 0;
export const deviceReady = () => ready;
function request(type: 'load' | 'generate', messages?: { role: string; content: string }[], onProgress?: (n: number) => void): Promise<string> {
  worker ||= new Worker(import.meta.env.BASE_URL + 'model.worker.js', { type: 'module' });
  const active = worker, id = ++sequence;
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => { active.removeEventListener('message', receive); active.terminate(); worker = null; ready = false; reject(Error('模型运行超时，请使用本地模式')); }, type === 'load' ? 240000 : 90000);
    const receive = (event: MessageEvent) => {
      if (event.data?.id !== id) return;
      if (event.data.type === 'progress') { onProgress?.(event.data.percent || 0); return; }
      active.removeEventListener('message', receive); window.clearTimeout(timeout);
      if (event.data.type === 'error') { reject(Error(event.data.message)); return; }
      if (type === 'load') ready = true;
      resolve(String(event.data.text || ''));
    };
    active.addEventListener('message', receive);
    active.postMessage({ id, type, messages });
  });
}
export const loadDevice = (onProgress: (n: number) => void) => request('load', undefined, onProgress);
export const generateDevice = (messages: { role: string; content: string }[]) => request('generate', messages);
