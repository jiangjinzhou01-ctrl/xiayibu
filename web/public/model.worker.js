/* Optional, on-device model. Loaded only after the visitor explicitly opts in. */
let pipe;
self.onmessage = async event => {
  const {id,type,messages} = event.data || {};
  try {
    if (type === 'load') {
      if (!pipe) {
        const {pipeline}=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');
        pipe=await pipeline('text-generation','onnx-community/SmolLM2-135M-Instruct-ONNX-MHA',{
          dtype:'q4',device:'wasm',progress_callback:x=>{
            if (x.status==='progress') self.postMessage({id,type:'progress',percent:Math.round(x.progress||0)});
          }
        });
      }
      self.postMessage({id,type:'loaded'});
    } else if (type === 'generate') {
      if (!pipe) throw Error('请先加载模型');
      const generated=await pipe(messages,{max_new_tokens:130,do_sample:false});
      const output=generated?.[0]?.generated_text;
      self.postMessage({id,type:'result',text:typeof output==='string'?output.slice(-1500):String(output?.at(-1)?.content||'模型没有生成回复')});
    }
  } catch(error) { self.postMessage({id,type:'error',message:String(error?.message||error).slice(0,350)}); }
};
