(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StudyModel=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const VERSION=5,KEY='low-altitude-study-v5',OLD_KEY='low-altitude-study-v4';
const clone=x=>JSON.parse(JSON.stringify(x));
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const safeKey=k=>!['__proto__','constructor','prototype'].includes(k);
const entries=x=>Object.entries(obj(x)?x:{}).filter(([k])=>safeKey(k));
const uid=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
const day=(now=Date.now())=>{const d=new Date(now);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function rng(seed){let n=hash(String(seed));return()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function shuffle(items,seed){const a=[...items],r=rng(seed);for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const equal=(a,b)=>Array.isArray(a)&&a.length===b.length&&a.every(x=>b.includes(x));
function fresh(now=Date.now()){
 return {version:VERSION,deviceId:uid(),createdAt:now,updatedAt:now,bank:'advanced',reading:{},records:{},legacyRecords:{},events:{},stars:{},notes:{},changes:{stars:{},notes:{}},days:{},legacyDays:{},legacyHistory:[],customBanks:[],plans:{},sessions:{},rounds:{},currentRounds:{},lastActivity:{},settings:{goal:15,font:17},sync:{owner:'ChenWeihua123',repo:'low-altitude-l3-progress',branch:'main',path:'progress.json',lastSyncedAt:0},migration:null};
}
function makeGroups(bank,now=Date.now()){
 const qs=bank.questions.filter(q=>!q.excluded),chapters=[...new Set(qs.map(q=>q.chapter))].sort((a,b)=>a-b),groups=[];
 for(const chapter of chapters){
  const list=qs.filter(q=>q.chapter===chapter),count=Math.max(1,Math.ceil(list.length/18));
  const base=Math.floor(list.length/count),extra=list.length%count;let offset=0;
  for(let n=0;n<count;n++){
   const size=base+(n<extra?1:0),ids=list.slice(offset,offset+size).map(q=>q.id);offset+=size;
   groups.push({id:bank.id+':c'+chapter+':g'+(n+1),chapter,number:n+1,ids});
  }
 }
 return {version:'chapter-balanced-15-v1',createdAt:now,fingerprint:hash(qs.map(q=>q.id).join('|')).toString(16),groups,excludedIds:bank.questions.filter(q=>q.excluded).map(q=>q.id)};
}
function ensurePlans(s,banks,now=Date.now()){
 for(const b of banks){
  if(!s.plans[b.id])s.plans[b.id]=makeGroups(b,now);
  else{
   const plan=s.plans[b.id],valid=new Set(b.questions.filter(q=>!q.excluded).map(q=>q.id));
   plan.groups=plan.groups.map(g=>({...g,ids:g.ids.filter(id=>valid.has(id))})).filter(g=>g.ids.length);
   const used=new Set(plan.groups.flatMap(g=>g.ids)),added=b.questions.filter(q=>valid.has(q.id)&&!used.has(q.id));
   if(added.length){const extra=makeGroups({...b,questions:added},now);for(const g of extra.groups){g.number=Math.max(0,...plan.groups.filter(x=>x.chapter===g.chapter).map(x=>x.number))+1;g.id=b.id+':c'+g.chapter+':g'+g.number;plan.groups.push(g);}}
   plan.excludedIds=b.questions.filter(q=>q.excluded).map(q=>q.id);
  }
 }
 if(!banks.some(b=>b.id===s.bank))s.bank=banks[0]?.id||'advanced';
 return s;
}
function migrate(raw,banks,now=Date.now()){
 const s=fresh(now);
 if(!raw)return ensurePlans(s,banks,now);
 if(raw.version===VERSION){
  Object.assign(s,clone(raw));s.version=VERSION;
  for(const k of ['reading','records','legacyRecords','events','stars','notes','days','legacyDays','plans','sessions','rounds','currentRounds','lastActivity'])if(!obj(s[k]))s[k]={};
  s.changes={stars:{},notes:{},...(obj(s.changes)?s.changes:{})};s.settings={goal:15,font:17,...s.settings};s.sync={...fresh(now).sync,...s.sync};
  s.customBanks=Array.isArray(s.customBanks)?s.customBanks:[];s.legacyHistory=Array.isArray(s.legacyHistory)?s.legacyHistory:[];
 }else if(raw.version===4){
  s.bank=raw.bank||s.bank;s.reading=clone(raw.reading||{});s.legacyRecords=clone(raw.records||{});s.records=clone(raw.records||{});
  s.stars=clone(raw.stars||{});s.notes=clone(raw.notes||{});s.legacyDays=clone(raw.days||{});s.days=clone(raw.days||{});s.legacyHistory=clone(raw.history||[]);s.customBanks=clone(raw.customBanks||[]);s.settings={...s.settings,...raw.settings};
  s.migration={from:4,at:now,noticeSeen:false};
  for(const [id,value]of entries(s.stars))s.changes.stars[id]={value:!!value,at:0};
  for(const [id,value]of entries(s.notes))s.changes.notes[id]={value:String(value),at:0};
  const old=raw.session;
  if(old&&Array.isArray(old.ids)&&old.ids.length){
   const kind=old.mode==='study'?'study':old.mode==='mock'?'legacy-test':'legacy-practice';
   const session={id:old.id||uid(),kind,bankId:old.bankId||s.bank,title:'旧版 · '+(old.title||'未完成练习'),ids:[...old.ids],seed:old.id||'legacy',index:Math.min(old.index||0,old.ids.length-1),drafts:{},responses:{},readIds:old.readIds||[],createdAt:old.started||now,updatedAt:old.finishedAt||now,phase:old.finished?'review':'answering',submissions:[],legacy:true};
   for(const [qid,r]of entries(old.responses)){session.drafts[qid]={selected:r.selected||[],uncertain:!!r.uncertain,at:r.submitted||now};if(r.recorded||old.finished)session.responses[qid]={...clone(r),legacyRecorded:true,at:r.submitted||old.finishedAt||now};}
   if(old.selection?.length&&!session.responses[old.ids[session.index]])session.drafts[old.ids[session.index]]={selected:old.selection,uncertain:!!old.uncertain,at:now};
   if(old.finished)session.completedAt=old.finishedAt||now;
   s.sessions[session.id]=session;if(!old.finished)s.lastActivity[session.bankId]={sessionId:session.id,at:now};
  }
 }else throw Error('不支持这份学习数据的版本。');
 s.settings={goal:[5,10,15,20,30].includes(s.settings.goal)?s.settings.goal:15,font:[17,19,21].includes(s.settings.font)?s.settings.font:17};
 s.legacyHistory=s.legacyHistory.map(h=>({...h,id:String(h.id||uid()),title:String(h.title||'旧版记录'),finished:Number.isFinite(h.finished)?h.finished:0,total:Number.isFinite(h.total)?h.total:0,correct:Number.isFinite(h.correct)?h.correct:0,wrong:Number.isFinite(h.wrong)?h.wrong:0,blank:Number.isFinite(h.blank)?h.blank:0}));
 ensurePlans(s,[...banks,...s.customBanks],now);recomputeRecords(s);return s;
}
function questionMap(banks){const map=new Map();for(const b of banks)for(const q of b.questions)map.set(q.id,q);return map;}
function blankRecord(){return{attempts:0,right:0,wrong:0,streak:0,activeWrong:false,due:0,recovery:0};}
function applyEvent(r,e){
 r={...blankRecord(),...r};r.attempts++;r.right+=e.correct?1:0;r.wrong+=e.correct?0:1;r.last=e.at;r.lastAnswer=[...e.selected];r.lastCorrect=e.correct;
 if(e.correct&&!e.uncertain){
  if(r.successDay!==e.day){r.streak++;r.successDay=e.day;if(r.activeWrong)r.recovery=(r.recovery||0)+1;}
  if(r.activeWrong&&r.recovery>=2)r.activeWrong=false;
  r.due=e.at+[1,3,7,14,30][Math.min(Math.max(r.streak-1,0),4)]*86400000;
 }else{r.due=e.at+600000;if(!e.correct){r.streak=0;r.recovery=0;r.successDay=null;r.activeWrong=true;}}
 return r;
}
function recomputeRecords(s){
 s.records=clone(s.legacyRecords||{});s.days=clone(s.legacyDays||{});
 for(const e of Object.values(s.events||{}).sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id))){s.records[e.qid]=applyEvent(s.records[e.qid],e);const d=s.days[e.day]||{attempts:0,right:0};d.attempts=(d.attempts||0)+1;if(e.correct)d.right=(d.right||0)+1;s.days[e.day]=d;}
 return s;
}
function touch(s,session,now=Date.now()){session.updatedAt=now;s.updatedAt=now;s.lastActivity[session.bankId]={sessionId:session.id,at:now};return session;}
function studySession(s,bank,group,now=Date.now()){
 const id='study:'+group.id;let session=s.sessions[id];
 if(!session){session={id,kind:'study',bankId:bank.id,groupId:group.id,title:'第'+group.chapter+'章 · 第'+group.number+'组',ids:[...group.ids],index:0,seed:id,drafts:{},responses:{},readIds:[],createdAt:now,phase:'studying',submissions:[]};s.sessions[id]=session;}
 return touch(s,session,now);
}
function groupTests(s,groupId){return Object.values(s.sessions).filter(x=>x.kind==='group-test'&&x.groupId===groupId).sort((a,b)=>b.createdAt-a.createdAt||b.id.localeCompare(a.id));}
function groupTestSession(s,bank,group,{newAttempt=false,now=Date.now()}={}){
 const previous=groupTests(s,group.id)[0];if(previous&&!newAttempt)return touch(s,previous,now);
 const id=uid(),session={id,kind:'group-test',bankId:bank.id,groupId:group.id,title:'第'+group.chapter+'章 · 第'+group.number+'组自测',ids:shuffle(group.ids,id),index:0,seed:id,drafts:{},responses:{},readIds:[],createdAt:now,updatedAt:now,phase:'answering',submissions:[]};
 s.sessions[id]=session;return touch(s,session,now);
}
function markRead(s,session,qid,now=Date.now()){
 if(session.kind!=='study')return;
 session.readIds??=[];if(!session.readIds.includes(qid))session.readIds.push(qid);
 if(!s.reading[qid])s.reading[qid]=day(now);
 session.lastReadAt=now;session.lastQid=qid;
 if(session.ids.every(id=>s.reading[id]))session.completedAt??=now;
 touch(s,session,now);
}
function setDraft(s,session,qid,selected,uncertain=false,now=Date.now()){
 if(session.responses[qid]?.eventId||session.responses[qid]?.legacyRecorded)return false;
 session.drafts[qid]={selected:[...new Set(selected)].sort((a,b)=>a-b),uncertain:!!uncertain,at:now};touch(s,session,now);return true;
}
function permutation(session,q){return session.kind==='study'?[...q.options.keys()]:shuffle([...q.options.keys()],session.seed+':'+q.id);}
function sessionSummary(session){
 const responses=Object.values(session.responses||{}),answered=responses.length,correct=responses.filter(r=>r.correct).length;
 return{total:session.ids.length,answered,correct,wrong:answered-correct,blank:session.ids.length-answered,score:session.ids.length?Math.round(correct/session.ids.length*100):0};
}
function submit(s,session,qMap,now=Date.now()){
 if(session.kind==='study')return{...sessionSummary(session),newAnswers:0};
 let added=0;
 for(const qid of session.ids){
  if(session.responses[qid]?.eventId||session.responses[qid]?.legacyRecorded)continue;
  const d=session.drafts[qid],q=qMap.get(qid);if(!d?.selected?.length||!q)continue;
  const correct=equal(d.selected,q.answers),event={id:s.deviceId+':'+uid(),qid,sessionId:session.id,bankId:session.bankId,kind:session.kind,roundId:session.roundId||null,selected:[...d.selected],correct,uncertain:!!d.uncertain,at:now,day:day(now)};
  s.events[event.id]=event;session.responses[qid]={selected:[...d.selected],correct,uncertain:!!d.uncertain,at:now,eventId:event.id};added++;
 }
 const summary=sessionSummary(session);
 if(added){session.submissions??=[];session.submissions.push({id:uid(),at:now,...summary,newAnswers:added});session.phase='review';if(!summary.blank)session.completedAt=now;recomputeRecords(s);touch(s,session,now);}
 return{...summary,newAnswers:added};
}
function spreadByChapter(qs,seed){
 const chapters=[...new Set(qs.map(q=>q.chapter))].sort((a,b)=>a-b),pools=new Map(chapters.map(ch=>[ch,shuffle(qs.filter(q=>q.chapter===ch).map(q=>q.id),seed+':'+ch)])),out=[];
 let pass=0;
 while(out.length<qs.length){for(const ch of shuffle(chapters,seed+':pass'+pass)){const id=pools.get(ch).shift();if(id)out.push(id);}pass++;}
 return out;
}
function createRound(s,bank,now=Date.now(),seed=uid()){
 const qs=bank.questions.filter(q=>!q.excluded);if(!qs.length)throw Error('当前题库没有可测试题目。');
 const id=uid(),capacities=Array.from({length:Math.ceil(qs.length/50)},(_,i)=>Math.min(50,qs.length-i*50));
 const singles=qs.filter(q=>q.type==='single'),multis=qs.filter(q=>q.type==='multi'),quotas=capacities.map(n=>Math.floor(n*singles.length/qs.length));
 let remaining=singles.length-quotas.reduce((a,b)=>a+b,0);
 const priority=capacities.map((n,i)=>({i,f:n*singles.length/qs.length-quotas[i],tie:rng(seed+':quota'+i)()})).sort((a,b)=>b.f-a.f||b.tie-a.tie);
 for(const item of priority){if(!remaining)break;if(quotas[item.i]<capacities[item.i]){quotas[item.i]++;remaining--;}}
 const sOrder=spreadByChapter(singles,seed+':single'),mOrder=spreadByChapter(multis,seed+':multi');let si=0,mi=0;
 const papers=capacities.map((cap,i)=>{const ids=[...sOrder.slice(si,si+quotas[i]),...mOrder.slice(mi,mi+cap-quotas[i])];si+=quotas[i];mi+=cap-quotas[i];return{id:id+':p'+(i+1),number:i+1,ids:shuffle(ids,seed+':paper'+i),sessionId:'coverage:'+id+':'+(i+1)};});
 const list=s.rounds[bank.id]||[],round={id,bankId:bank.id,number:list.length+1,createdAt:now,seed,ids:qs.map(q=>q.id),excludedIds:bank.questions.filter(q=>q.excluded).map(q=>q.id),papers};
 s.rounds[bank.id]=[...list,round];s.currentRounds[bank.id]={id:round.id,at:now};s.updatedAt=now;return round;
}
function currentRound(s,bankId){const list=s.rounds[bankId]||[];return list.find(r=>r.id===s.currentRounds[bankId]?.id)||list[list.length-1]||null;}
function paperSession(s,bank,round,paper,now=Date.now()){
 let session=s.sessions[paper.sessionId];
 if(!session){session={id:paper.sessionId,kind:'coverage',bankId:bank.id,roundId:round.id,paperId:paper.id,title:'第'+round.number+'轮 · 第'+paper.number+'卷',ids:[...paper.ids],index:0,seed:round.seed+':'+paper.id,drafts:{},responses:{},readIds:[],createdAt:now,updatedAt:now,phase:'answering',submissions:[]};s.sessions[session.id]=session;}
 return touch(s,session,now);
}
function roundStats(s,round){
 if(!round)return{total:0,covered:0,remaining:0,completedPapers:0,paperCount:0,correct:0,wrong:0};
 const covered=new Set(),correct=new Set();let completedPapers=0;
 for(const p of round.papers){const session=s.sessions[p.sessionId];if(!session)continue;let n=0;for(const id of p.ids){const r=session.responses[id];if(r?.eventId||r?.legacyRecorded){covered.add(id);n++;if(r.correct)correct.add(id);}}if(n===p.ids.length)completedPapers++;}
 return{total:round.ids.length,covered:covered.size,remaining:round.ids.length-covered.size,completedPapers,paperCount:round.papers.length,correct:correct.size,wrong:covered.size-correct.size};
}
function groupStats(s,group){
 const read=group.ids.filter(id=>s.reading[id]).length,tests=groupTests(s,group.id),latest=tests[0],tested=new Set();
 for(const session of tests)for(const id of group.ids)if(session.responses[id]?.eventId||session.responses[id]?.legacyRecorded)tested.add(id);
 const summary=latest?sessionSummary(latest):null;
 return{total:group.ids.length,read,tested:tested.size,testCount:tests.filter(x=>x.submissions?.length).length,latest,summary,readComplete:read===group.ids.length,testComplete:tested.size===group.ids.length,wrong:group.ids.filter(id=>s.records[id]?.activeWrong).length};
}
function bankStats(s,bank){
 const qs=bank.questions.filter(q=>!q.excluded),ids=new Set(qs.map(q=>q.id)),groups=s.plans[bank.id]?.groups||[],tested=new Set();
 for(const session of Object.values(s.sessions))if(session.kind==='group-test'&&session.bankId===bank.id)for(const [id,r]of entries(session.responses))if(ids.has(id)&&(r.eventId||r.legacyRecorded))tested.add(id);
 let attempts=0,right=0;for(const q of qs){attempts+=s.records[q.id]?.attempts||0;right+=s.records[q.id]?.right||0;}
 return{total:qs.length,all:bank.questions.length,excluded:bank.questions.length-qs.length,read:qs.filter(q=>s.reading[q.id]).length,groupTested:tested.size,readGroups:groups.filter(g=>g.ids.every(id=>s.reading[id])).length,groupCount:groups.length,wrong:qs.filter(q=>s.records[q.id]?.activeWrong).length,attempts,accuracy:attempts?Math.round(right/attempts*100):null,round:roundStats(s,currentRound(s,bank.id))};
}
function setStar(s,qid,value,now=Date.now()){if(value)s.stars[qid]=true;else delete s.stars[qid];s.changes.stars[qid]={value:!!value,at:now};s.updatedAt=now;}
function setNote(s,qid,value,now=Date.now()){const v=String(value).trim();if(v)s.notes[qid]=v;else delete s.notes[qid];s.changes.notes[qid]={value:v,at:now};s.updatedAt=now;}
function latest(a,b){if(!a)return b?clone(b):a;if(!b)return clone(a);return clone((a.at||a.updatedAt||0)>=(b.at||b.updatedAt||0)?a:b);}
function mergeSession(a,b){
 if(!a)return clone(b);if(!b)return clone(a);
 const winner=(a.updatedAt||0)>=(b.updatedAt||0)?a:b,out={...clone(winner),responses:{},drafts:{},readIds:[...new Set([...(a.readIds||[]),...(b.readIds||[])])],submissions:[]};
 for(const k of new Set([...Object.keys(a.responses||{}),...Object.keys(b.responses||{})]))out.responses[k]=latest(a.responses?.[k],b.responses?.[k]);
 for(const k of new Set([...Object.keys(a.drafts||{}),...Object.keys(b.drafts||{})]))out.drafts[k]=latest(a.drafts?.[k],b.drafts?.[k]);
 const submissions=new Map([...(a.submissions||[]),...(b.submissions||[])].map(x=>[x.id,x]));out.submissions=[...submissions.values()].sort((x,y)=>x.at-y.at||x.id.localeCompare(y.id));
 return out;
}
function merge(a,b,banks,now=Date.now()){
 if(a.version!==VERSION||b.version!==VERSION)throw Error('云端与本机版本不兼容，请先更新页面。');
 const out=clone(a);out.updatedAt=now;
 for(const [id,value]of entries(b.reading))if(!out.reading[id]||String(value)<String(out.reading[id]))out.reading[id]=value;
 for(const [id,r]of entries(b.legacyRecords)){const local=out.legacyRecords[id];if(!local||(r.attempts||0)>(local.attempts||0)||((r.attempts||0)===(local.attempts||0)&&(r.last||0)>(local.last||0)))out.legacyRecords[id]=clone(r);}
 for(const [id,e]of entries(b.events))if(!out.events[id])out.events[id]=clone(e);
 for(const [id,session]of entries(b.sessions))out.sessions[id]=mergeSession(out.sessions[id],session);
 const custom=new Map([...out.customBanks,...(b.customBanks||[])].map(x=>[x.id,x]));out.customBanks=[...custom.values()];
 for(const [id,plan]of entries(b.plans))if(!out.plans[id])out.plans[id]=clone(plan);
 for(const bankId of new Set([...Object.keys(out.rounds),...Object.keys(b.rounds||{})])){
  const rounds=new Map([...(out.rounds[bankId]||[]),...(b.rounds?.[bankId]||[])].map(r=>[r.id,r]));
  out.rounds[bankId]=[...rounds.values()].sort((x,y)=>x.createdAt-y.createdAt||x.id.localeCompare(y.id)).map((r,i)=>({...r,number:i+1}));
  out.currentRounds[bankId]=latest(out.currentRounds[bankId],b.currentRounds?.[bankId]);
  for(const r of out.rounds[bankId])for(const p of r.papers){const session=out.sessions[p.sessionId];if(session)session.title='第'+r.number+'轮 · 第'+p.number+'卷';}
 }
 for(const bankId of new Set([...Object.keys(out.lastActivity),...Object.keys(b.lastActivity||{})]))out.lastActivity[bankId]=latest(out.lastActivity[bankId],b.lastActivity?.[bankId]);
 for(const kind of ['stars','notes']){
  const changes={...out.changes[kind]};for(const [id,c]of entries(b.changes?.[kind]))changes[id]=latest(changes[id],c);
  for(const [id,value]of entries(b[kind]))if(!changes[id])changes[id]={value,at:0};
  out.changes[kind]=changes;out[kind]={};for(const [id,c]of entries(changes))if(c.value)out[kind][id]=c.value;
 }
 const history=new Map([...(out.legacyHistory||[]),...(b.legacyHistory||[])].map(h=>[h.id||JSON.stringify(h),h]));out.legacyHistory=[...history.values()].sort((x,y)=>(y.finished||0)-(x.finished||0));
 for(const [d,value]of entries(b.legacyDays)){const local=out.legacyDays[d];if(!local||(value.attempts||0)>(local.attempts||0))out.legacyDays[d]=clone(value);}
 ensurePlans(out,[...banks,...out.customBanks],now);recomputeRecords(out);return out;
}
function validateBank(b){
 if(!obj(b)||typeof b.name!=='string'||!b.name.trim()||b.name.length>80||!Array.isArray(b.questions)||!b.questions.length||b.questions.length>5000)throw Error('题库需要名称和1–5000道题。');
 const ids=new Set();for(const [i,q]of b.questions.entries()){
  if(!obj(q)||!['single','multi'].includes(q.type)||typeof q.stem!=='string'||!q.stem.trim()||q.stem.length>3000||!Array.isArray(q.options)||q.options.length<2||q.options.length>6||q.options.some(o=>typeof o!=='string'||!o.trim()||o.length>3000)||new Set(q.options).size!==q.options.length||!Array.isArray(q.answers)||new Set(q.answers).size!==q.answers.length||q.answers.some(n=>!Number.isInteger(n)||n<0||n>=q.options.length)||(q.type==='single'?q.answers.length!==1:q.answers.length<2)||!Number.isInteger(q.chapter)||q.chapter<1||q.chapter>99||(q.explanation!=null&&(typeof q.explanation!=='string'||q.explanation.length>10000)))throw Error('第'+(i+1)+'题格式不正确。');
  const id=String(q.id??i+1);if(!safeKey(id)||ids.has(id))throw Error('题号重复或不合法。');ids.add(id);
 }return b;
}
function validateState(raw,banks){
 if(!obj(raw)||![4,VERSION].includes(raw.version)||!obj(raw.records)||!Array.isArray(raw.customBanks||[]))throw Error('学习备份格式或版本不正确。');
 if((raw.customBanks||[]).length>100)throw Error('自定义题库数量超出限制。');
 const bankIds=new Set(banks.map(b=>b.id));for(const b of raw.customBanks||[]){validateBank(b);if(typeof b.id!=='string'||!/^u-[a-zA-Z0-9-]+$/.test(b.id)||bankIds.has(b.id)||b.questions.some(q=>typeof q.id!=='string'||!q.id.startsWith(b.id+':')))throw Error('自定义题库标识不合法。');bankIds.add(b.id);}
 const all=[...banks,...raw.customBanks||[]],map=questionMap(all),known=new Set(map.keys());
 if(Object.keys(raw.records).length>20000)throw Error('学习记录数量超出限制。');
 for(const [id,r]of entries(raw.records))if(!known.has(id)||!obj(r)||!['attempts','right','wrong','streak'].every(k=>Number.isFinite(r[k])&&r[k]>=0&&r[k]<=1e7)||r.right+r.wrong!==r.attempts||!Number.isFinite(r.due)||typeof r.activeWrong!=='boolean')throw Error('学习记录损坏或题库不匹配。');
 if(raw.version===VERSION){
  for(const k of ['events','sessions','plans','rounds','reading','legacyRecords','changes'])if(!obj(raw[k]))throw Error('学习备份缺少完整记录。');
  for(const kind of ['stars','notes'])if(!obj(raw.changes[kind]))throw Error('收藏或笔记的修改记录不完整。');
  for(const [id,value]of entries(raw.reading))if(!known.has(id)||typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('已看记录不合法。');
  for(const [bankId,plan]of entries(raw.plans)){
   if(!bankIds.has(bankId)||!obj(plan)||!Array.isArray(plan.groups))throw Error('章节分组不完整。');
   const allowed=new Set(all.find(b=>b.id===bankId).questions.map(q=>q.id)),used=new Set(),groupIds=new Set();
   for(const g of plan.groups){if(!obj(g)||typeof g.id!=='string'||groupIds.has(g.id)||!Number.isInteger(g.chapter)||!Number.isInteger(g.number)||g.number<1||!Array.isArray(g.ids)||!g.ids.length||new Set(g.ids).size!==g.ids.length||g.ids.some(id=>!allowed.has(id)||used.has(id)||map.get(id).chapter!==g.chapter))throw Error('章节分组存在重复或无效题目。');groupIds.add(g.id);g.ids.forEach(id=>used.add(id));}
  }
  for(const [id,e]of entries(raw.events))if(!obj(e)||e.id!==id||!known.has(e.qid)||!Number.isFinite(e.at)||typeof e.correct!=='boolean'||!Array.isArray(e.selected)||!e.selected.length||e.selected.some(i=>!Number.isInteger(i)||i<0||i>=map.get(e.qid).options.length))throw Error('答题事件不合法。');
  for(const [sessionId,session] of entries(raw.sessions)){
   if(!obj(session)||session.id!==sessionId||!bankIds.has(session.bankId)||!Array.isArray(session.ids)||!session.ids.length||new Set(session.ids).size!==session.ids.length||session.ids.some(id=>!known.has(id))||!Number.isInteger(session.index)||session.index<0||session.index>=session.ids.length||!obj(session.responses)||!obj(session.drafts)||!['study','group-test','coverage','review','legacy-test','legacy-practice'].includes(session.kind))throw Error('学习或自测进度不完整。');
   for(const [qid,r]of [...entries(session.responses),...entries(session.drafts)])if(!session.ids.includes(qid)||!Array.isArray(r.selected)||r.selected.some(n=>!Number.isInteger(n)||n<0||n>=map.get(qid).options.length))throw Error('答题选项不合法。');
   if(!Array.isArray(session.submissions)||session.submissions.some(x=>!obj(x)||typeof x.id!=='string'||!['at','total','correct','wrong','blank','answered','score','newAnswers'].every(k=>Number.isFinite(x[k])&&x[k]>=0)))throw Error('交卷记录不完整。');
  }
  for(const [bankId,list]of entries(raw.rounds)){
   if(!bankIds.has(bankId)||!Array.isArray(list))throw Error('自测轮次不合法。');
   for(const r of list){if(!obj(r)||typeof r.id!=='string'||r.bankId!==bankId||!Number.isInteger(r.number)||r.number<1||!Array.isArray(r.ids)||!Array.isArray(r.papers)||r.ids.some(id=>!known.has(id))||r.papers.some(p=>!obj(p)||typeof p.id!=='string'||typeof p.sessionId!=='string'||!Number.isInteger(p.number)||p.number<1||!Array.isArray(p.ids)||!p.ids.length||p.ids.length>50))throw Error('整轮自测题目不完整。');const flat=r.papers.flatMap(p=>p.ids);if(new Set(flat).size!==flat.length||flat.length!==r.ids.length||flat.some(id=>!r.ids.includes(id)))throw Error('整轮自测存在重复或漏题。');}
  }
 }
 return raw;
}
function snapshot(s){const out={};for(const key of Object.keys(fresh()))if(s[key]!==undefined)out[key]=clone(s[key]);out.sync={};for(const key of ['owner','repo','branch','path','lastSyncedAt','lastSuccessAt','verified','mode'])if(s.sync?.[key]!==undefined)out.sync[key]=s.sync[key];return out;}
return{VERSION,KEY,OLD_KEY,clone,uid,day,hash,shuffle,equal,fresh,makeGroups,ensurePlans,migrate,questionMap,recomputeRecords,touch,studySession,groupTestSession,groupTests,markRead,setDraft,permutation,sessionSummary,submit,createRound,currentRound,paperSession,roundStats,groupStats,bankStats,setStar,setNote,merge,validateBank,validateState,snapshot};
});
