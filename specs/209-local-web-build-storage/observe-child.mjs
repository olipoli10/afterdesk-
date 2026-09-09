// Terminal recording remains bounded even if the OS cannot confirm termination.
export function observeChild(child,{timeoutMs,terminate,maxBytes=25000000,graceMs=2000}){
 return new Promise(resolve=>{
  let incident=null,size=0,stopping=false,finished=false,forceTimer;
  const out=[],err=[];
  const finish=(exitCode)=>{if(finished)return;finished=true;clearTimeout(timer);clearTimeout(forceTimer);resolve({exitCode,incident,stdout:Buffer.concat(out),stderr:Buffer.concat(err)});};
  const stop=()=>{
   if(stopping||finished)return;stopping=true;incident='EXECUTION_OR_CAPTURE_INCOMPLETE';
   forceTimer=setTimeout(()=>{
    incident='CHILD_STOP_UNCONFIRMED';
    child.stdout.destroy();child.stderr.destroy();child.unref();finish(null);
   },graceMs);
   try{terminate();}catch{/* forceTimer still guarantees the terminal record */}
   try{child.kill();}catch{}
  };
  const collect=target=>b=>{if(stopping)return;size+=b.length;if(size>maxBytes)stop();else target.push(b);};
  child.stdout.on('data',collect(out));child.stderr.on('data',collect(err));
  child.on('error',()=>{incident='CHILD_LAUNCH_FAILED';finish(null);});
  child.on('close',(code,signal)=>{if(signal&&!incident)incident='CHILD_SIGNAL';finish(code);});
  const timer=setTimeout(stop,timeoutMs);
 });
}
