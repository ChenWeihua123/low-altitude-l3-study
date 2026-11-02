(function(root,factory){const M=typeof module==='object'&&module.exports?require('./model.js'):root.StudyModel;const api=factory(M);if(typeof module==='object'&&module.exports)module.exports=api;else root.StudyCloud=api;})(typeof globalThis!=='undefined'?globalThis:this,function(M){
'use strict';
function config(value){
 const c={owner:String(value.owner||'').trim(),repo:String(value.repo||'').trim(),branch:String(value.branch||'main').trim(),path:String(value.path||'progress.json').trim()};
 if(!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(c.owner)||!/^[A-Za-z0-9_.-]{1,100}$/.test(c.repo)||!c.branch||c.branch.length>100||!c.path||c.path.length>180||c.path.split('/').some(p=>!p||p==='.'||p==='..'||!/^[A-Za-z0-9_.-]+$/.test(p)))throw Error('GitHub账号、仓库或文件路径格式不正确。');
 return c;
}
function encode(text){const bytes=new TextEncoder().encode(text);let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);}
function decode(text){return new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\s/g,'')),c=>c.charCodeAt(0)));}
function friendly(status,response){
 if(status===401)return'访问码无效或已过期，请重新输入有效的专用访问码。';
 if(status===403&&response.headers?.get('x-ratelimit-remaining')==='0')return'GitHub本次请求额度暂时用完，请稍后再手动同步。本机进度仍已保存。';
 if(status===403||status===404)return'无法访问这个私有仓库。请确认访问码仅选择了该仓库，并授予Contents读写权限。';
 if(status===409)return'另一台设备刚更新了云端记录，请再点一次同步。';
 if(status===422)return'云端文件或分支配置不正确，或GitHub暂时拒绝了本次写入。';
 return'GitHub暂未完成本次同步（状态 '+status+'）。本机记录仍已保存。';
}
async function manualSync({state,banks,settings,token,fetchImpl=globalThis.fetch,signal,onStep=()=>{},now=()=>Date.now()}){
 const c=config(settings);
 if(typeof token!=='string'||!/^github_pat_[A-Za-z0-9_]{20,}$/.test(token.trim()))throw Error('请输入专用的细粒度访问码（以 github_pat_ 开头），不要使用现有CLI或其他广权限令牌。');
 const headers={'Authorization':'Bearer '+token.trim(),'Accept':'application/vnd.github.object+json','X-GitHub-Api-Version':'2026-03-10'};
 const root='https://api.github.com/repos/'+encodeURIComponent(c.owner)+'/'+encodeURIComponent(c.repo);
 async function request(url,options={}){try{return await fetchImpl(url,{cache:'no-store',...options,headers:{...headers,...options.headers},signal});}catch(e){if(signal?.aborted||e.name==='AbortError')throw Error('已取消同步。本机记录保留，下一次可以继续合并。');throw Error('当前设备未能连接GitHub API。请在日常网络重试；本机进度仍已保存。');}}
 onStep('验证专用私有仓库');
 const metadataResponse=await request(root);
 if(!metadataResponse.ok)throw Error(friendly(metadataResponse.status,metadataResponse));
 const metadata=await metadataResponse.json();
 if(metadata.private!==true)throw Error('这个仓库不是私有仓库。为保护学习记录，本次不会上传；请选择专用私有仓库。');
 if(metadata.archived)throw Error('这个私有仓库已归档，无法写入。请选择可写仓库。');
 const path=c.path.split('/').map(encodeURIComponent).join('/'),endpoint=root+'/contents/'+path+'?ref='+encodeURIComponent(c.branch);
 let working=M.snapshot(state);
 for(let attempt=0;attempt<3;attempt++){
  onStep(attempt?'云端有更新，重新读取并合并':'读取云端最新进度');
  const read=await request(endpoint);let sha=null,remote=null;
  if(read.status!==404){
   if(!read.ok)throw Error(friendly(read.status,read));
   const file=await read.json();if(Array.isArray(file)||file.type!=='file'||typeof file.sha!=='string')throw Error('同步路径需要是一个JSON文件，请检查配置。');sha=file.sha;
   let text;
   if(file.encoding==='base64'&&typeof file.content==='string')text=decode(file.content);
   else{const raw=await request(endpoint,{headers:{Accept:'application/vnd.github.raw+json'}});if(!raw.ok)throw Error(friendly(raw.status,raw));text=await raw.text();}
   if(text.length>20*1024*1024)throw Error('云端文件超出20MB，请先导出备份并整理历史记录。');
   try{remote=JSON.parse(text);}catch{throw Error('云端文件不是有效学习数据，本次不会覆盖。');}
   if(remote.kind!=='low-altitude-study-cloud'||remote.version!==M.VERSION||!remote.state)throw Error('云端文件不是本工具的v5同步文件，本次不会覆盖。');
   M.validateState(remote.state,banks);
   working=M.merge(working,M.migrate(remote.state,banks),banks,now());
  }
  const stamp=now();working.sync={...working.sync,...c,mode:'manual',verified:true,lastSyncedAt:stamp,lastSuccessAt:stamp};working.updatedAt=stamp;
  const payload={kind:'low-altitude-study-cloud',version:M.VERSION,updatedAt:stamp,state:M.snapshot(working)};
  onStep('合并后保存到你的私有仓库');
  const body={message:'Manually sync L3 study progress',content:encode(JSON.stringify(payload)),branch:c.branch};if(sha)body.sha=sha;
  const write=await request(root+'/contents/'+path,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(write.status===409||write.status===422&&attempt<2){if(attempt<2)continue;}
  if(!write.ok)throw Error(friendly(write.status,write));
  const result=await write.json();return{state:working,created:!sha,sha:result.content?.sha||null,at:stamp,settings:c};
 }
 throw Error('云端同时有其他更新，请稍后再手动同步。本机记录保留。');
}
return{config,encode,decode,manualSync};
});
