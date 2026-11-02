const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../src/model.js');
const D=require('../src/study-data.json');
const banks=D.banks,advanced=banks[0],original=banks[1],qmap=M.questionMap(banks),T=Date.parse('2026-11-02T08:00:00+08:00');
const state=()=>M.migrate(null,banks,T);
function answer(s,session,id,correct=true,time=T){const q=qmap.get(id),selected=correct?q.answers:[q.options.findIndex((_,i)=>!q.answers.includes(i))];M.setDraft(s,session,id,selected,false,time);}
test('所有固定组均不跨章、无漏题无重复，并排除5道原题争议题',()=>{
 const s=state();
 for(const b of banks){const groups=s.plans[b.id].groups,ids=groups.flatMap(g=>g.ids);assert.equal(ids.length,new Set(ids).size);assert.deepEqual(new Set(ids),new Set(b.questions.filter(q=>!q.excluded).map(q=>q.id)));for(const g of groups){assert.ok(g.ids.length<=18);assert.ok(g.ids.every(id=>qmap.get(id).chapter===g.chapter));}}
 assert.equal(s.plans.original.excludedIds.length,5);
 assert.deepEqual(s.plans.advanced.groups.filter(g=>g.chapter===1).map(g=>g.ids.length),[16,15]);
});
test('已经创建的组不会因新题加入而重排已有题目',()=>{
 const s=state(),before=M.clone(s.plans.advanced.groups),extra={...advanced.questions[0],id:'N9999'};
 M.ensurePlans(s,[{...advanced,questions:[...advanced.questions,extra]},original]);
 assert.deepEqual(s.plans.advanced.groups.slice(0,before.length),before);assert.ok(s.plans.advanced.groups.at(-1).ids.includes('N9999'));
});
test('一轮500题分10卷，每卷30单20多，整轮恰好覆盖一次',()=>{
 const s=state(),r=M.createRound(s,advanced,T,'round-1');assert.equal(r.papers.length,10);
 const ids=r.papers.flatMap(p=>p.ids);assert.equal(new Set(ids).size,500);assert.deepEqual(new Set(ids),new Set(advanced.questions.map(q=>q.id)));
 for(const p of r.papers){assert.equal(p.ids.length,50);assert.equal(p.ids.filter(id=>qmap.get(id).type==='single').length,30);}
});
test('原题库495题分10卷，最后45题；没有把排除题充进覆盖分母',()=>{
 const s=state(),r=M.createRound(s,original,T,'original');assert.equal(r.ids.length,495);assert.deepEqual(r.papers.map(p=>p.ids.length),[50,50,50,50,50,50,50,50,50,45]);assert.equal(M.roundStats(s,r).total,495);
});
test('任意题型比例和小题库均能完整分卷',()=>{
 for(const n of [1,7,49,50,51,77,101]){
  const b={id:'fixture',questions:advanced.questions.slice(0,n).map((q,i)=>({...q,id:'fixture-'+i,type:i%3?'single':'multi'}))};const s=state(),r=M.createRound(s,b,T,'n'+n),ids=r.papers.flatMap(p=>p.ids);
  assert.equal(ids.length,n);assert.equal(new Set(ids).size,n);assert.ok(r.papers.every(p=>p.ids.length<=50));
 }
});
test('打开学习不产生答题成绩，重看不增加独立题数',()=>{
 const s=state(),g=s.plans.advanced.groups[0],session=M.studySession(s,advanced,g,T);M.markRead(s,session,g.ids[0],T);M.markRead(s,session,g.ids[0],T+1);
 assert.equal(Object.keys(s.reading).length,1);assert.equal(session.readIds.length,1);assert.equal(Object.keys(s.events).length,0);assert.equal(M.bankStats(s,advanced).attempts,0);
});
test('切换其他组不覆盖上一组的阅读断点',()=>{
 const s=state(),[a,b]=s.plans.advanced.groups,first=M.studySession(s,advanced,a,T);first.index=7;M.markRead(s,first,a.ids[7],T);const other=M.studySession(s,advanced,b,T+1);other.index=3;
 assert.equal(M.studySession(s,advanced,a,T+2).index,7);assert.equal(M.studySession(s,advanced,b,T+3).index,3);
});
test('组内自测和整库覆盖分开统计，草稿不计覆盖',()=>{
 const s=state(),g=s.plans.advanced.groups[0],session=M.groupTestSession(s,advanced,g,{now:T});answer(s,session,session.ids[0]);assert.equal(M.bankStats(s,advanced).groupTested,0);M.submit(s,session,qmap,T+1);
 assert.equal(M.bankStats(s,advanced).groupTested,1);assert.equal(M.bankStats(s,advanced).round.covered,0);
});
test('交卷、重复点击、补答不会重复计分；未答不入错题或覆盖',()=>{
 const s=state(),r=M.createRound(s,advanced,T,'test'),session=M.paperSession(s,advanced,r,r.papers[0],T);
 answer(s,session,session.ids[0],false);answer(s,session,session.ids[1],true);
 const first=M.submit(s,session,qmap,T+1);assert.equal(first.answered,2);assert.equal(first.blank,48);assert.equal(M.roundStats(s,r).covered,2);assert.equal(Object.keys(s.events).length,2);assert.equal(s.records[session.ids[0]].activeWrong,true);
 assert.equal(M.submit(s,session,qmap,T+2).newAnswers,0);assert.equal(Object.keys(s.events).length,2);
 assert.equal(M.setDraft(s,session,session.ids[0],qmap.get(session.ids[0]).answers),false);
 answer(s,session,session.ids[2]);M.submit(s,session,qmap,T+3);assert.equal(M.roundStats(s,r).covered,3);assert.equal(Object.keys(s.events).length,3);assert.equal(session.submissions.length,2);assert.equal(session.submissions[0].answered,2);
});
test('开启新轮保留旧轮卷面与错题，当前覆盖归零',()=>{
 const s=state(),r1=M.createRound(s,advanced,T,'one'),session=M.paperSession(s,advanced,r1,r1.papers[0],T);answer(s,session,session.ids[0],false);M.submit(s,session,qmap,T+1);
 M.setStar(s,session.ids[0],true,T+1);M.setNote(s,session.ids[0],'复习笔记',T+1);
 const r2=M.createRound(s,advanced,T+2,'two');assert.equal(s.rounds.advanced.length,2);assert.equal(M.roundStats(s,r1).covered,1);assert.equal(M.roundStats(s,r2).covered,0);assert.equal(s.records[session.ids[0]].wrong,1);assert.equal(s.notes[session.ids[0]],'复习笔记');assert.equal(s.stars[session.ids[0]],true);assert.notDeepEqual(r1.papers[0].ids,r2.papers[0].ids);
});
test('不同卷都有独立断点，重开网页可按原卷继续',()=>{
 const s=state(),r=M.createRound(s,advanced,T,'stable'),a=M.paperSession(s,advanced,r,r.papers[0],T);a.index=8;answer(s,a,a.ids[8]);const b=M.paperSession(s,advanced,r,r.papers[1],T+1);b.index=12;
 const restored=M.migrate(JSON.parse(JSON.stringify(s)),banks,T+2),rr=M.currentRound(restored,'advanced');assert.equal(M.paperSession(restored,advanced,rr,rr.papers[0]).index,8);assert.equal(M.paperSession(restored,advanced,rr,rr.papers[1]).index,12);assert.ok(restored.sessions[a.id].drafts[a.ids[8]]);
});
test('测题换选项顺序后，答案仍按原选项身份判定',()=>{
 const s=state(),g=s.plans.advanced.groups[0],session=M.groupTestSession(s,advanced,g,{now:T}),q=qmap.get(session.ids[0]);assert.deepEqual(M.permutation(session,q),M.permutation(M.clone(session),q));answer(s,session,q.id);M.submit(s,session,qmap,T+1);assert.equal(session.responses[q.id].correct,true);
});
test('v4迁移保留已看、错题、笔记和旧历史，不冒充新轮覆盖',()=>{
 const old={version:4,bank:'advanced',reading:{N001:'2026-10-31'},records:{N001:{attempts:2,right:1,wrong:1,streak:0,activeWrong:true,due:123,last:100}},stars:{N001:true},notes:{N001:'旧笔记'},days:{'2026-10-31':{attempts:2,right:1,read:1}},history:[{id:'old',title:'限时自测',total:30,correct:18,blank:2}],customBanks:[],settings:{goal:20,font:19},session:null},copy=M.clone(old),s=M.migrate(old,banks,T);
 assert.deepEqual(old,copy);assert.equal(s.reading.N001,'2026-10-31');assert.equal(s.records.N001.wrong,1);assert.equal(s.notes.N001,'旧笔记');assert.equal(s.settings.font,19);assert.equal(s.legacyHistory.length,1);assert.equal(M.bankStats(s,advanced).groupTested,0);assert.equal(M.currentRound(s,'advanced'),null);assert.equal(s.migration.from,4);
});
test('v4未完成自测的草稿仍可继续，不纳入新轮',()=>{
 const old={version:4,records:{},reading:{},stars:{},notes:{},days:{},history:[],customBanks:[],settings:{},session:{id:'legacy',mode:'mock',bankId:'advanced',title:'旧测验',ids:['N001','N002'],index:1,responses:{N001:{selected:[0],submitted:T}},selection:[2],finished:false}},s=M.migrate(old,banks,T),session=s.sessions.legacy;
 assert.equal(session.kind,'legacy-test');assert.equal(session.index,1);assert.deepEqual(session.drafts.N001.selected,[0]);assert.deepEqual(session.drafts.N002.selected,[2]);assert.equal(M.bankStats(s,advanced).round.covered,0);
});
test('两台设备合并保留各自读题、答题；多次同步不会倍增',()=>{
 const a=state(),r=M.createRound(a,advanced,T,'merge'),b=M.clone(a);b.deviceId='phone';
 const sa=M.paperSession(a,advanced,r,r.papers[0],T),sb=M.paperSession(b,advanced,r,r.papers[0],T);answer(a,sa,sa.ids[0]);answer(b,sb,sb.ids[1],false);M.submit(a,sa,qmap,T+1);M.submit(b,sb,qmap,T+2);
 a.reading.N001='2026-11-01';b.reading.N002='2026-11-02';const merged=M.merge(a,b,banks,T+3),again=M.merge(merged,b,banks,T+4);
 assert.equal(Object.keys(merged.events).length,2);assert.equal(Object.keys(merged.reading).length,2);assert.equal(M.roundStats(merged,merged.rounds.advanced[0]).covered,2);assert.equal(M.roundStats(again,again.rounds.advanced[0]).covered,2);assert.equal(Object.values(again.records).reduce((n,r)=>n+r.attempts,0),2);
});
test('两端看过同题时保留最早日期，不把重复阅读算成今日新看',()=>{
 const a=state(),b=state();a.reading.N001='2026-11-01';b.reading.N001='2026-11-02';assert.equal(M.merge(a,b,banks,T).reading.N001,'2026-11-01');assert.equal(M.merge(b,a,banks,T).reading.N001,'2026-11-01');
});
test('两台设备各自创建轮次后合并，卷面标题与重新编号一致',()=>{
 const a=state(),b=state(),r1=M.createRound(a,advanced,T,'a'),r2=M.createRound(b,advanced,T+1,'b');M.paperSession(a,advanced,r1,r1.papers[0],T);M.paperSession(b,advanced,r2,r2.papers[0],T+1);
 const merged=M.merge(a,b,banks,T+2);assert.equal(merged.rounds.advanced.length,2);assert.equal(merged.sessions[r2.papers[0].sessionId].title,'第2轮 · 第1卷');assert.equal(merged.sessions[r1.papers[0].sessionId].title,'第1轮 · 第1卷');
});
test('云端合并保留删除标记，已取消收藏和清空笔记不会复活',()=>{
 const a=state();M.setStar(a,'N001',true,T);M.setNote(a,'N001','旧备注',T);const b=M.clone(a);M.setStar(a,'N001',false,T+2);M.setNote(a,'N001','',T+2);const merged=M.merge(a,b,banks,T+3);assert.equal(merged.stars.N001,undefined);assert.equal(merged.notes.N001,undefined);
});
test('备份及云端快照绝不带入访问码或任意认证字段',()=>{
 const s=state();s.token='secret';s.sync.token='secret';s.sync.password='secret';const payload=M.snapshot(s);assert.equal(payload.token,undefined);assert.equal(payload.sync.token,undefined);assert.equal(payload.sync.password,undefined);assert.equal(JSON.stringify(payload).includes('secret'),false);
});
test('验证备份拒绝漏题/重复卷和不合法的答案',()=>{
 const s=state();M.createRound(s,advanced,T,'validation');assert.doesNotThrow(()=>M.validateState(s,banks));const corrupt=M.clone(s);corrupt.rounds.advanced[0].papers[0].ids[0]=corrupt.rounds.advanced[0].papers[1].ids[0];assert.throws(()=>M.validateState(corrupt,banks),/重复或漏题/);
 const b={name:'空解析可导入',questions:[{id:'1',chapter:1,type:'single',stem:'题',options:['a','b'],answers:[1],explanation:null}]};assert.doesNotThrow(()=>M.validateBank(b));b.questions[0].answers=[5];assert.throws(()=>M.validateBank(b));
});
test('导入外来备份时限制显示设置，并拒绝损坏的分组和交卷字段',()=>{
 const s=state();s.settings={goal:'<img src=x>',font:'bad'};const migrated=M.migrate(s,banks,T);assert.deepEqual(migrated.settings,{goal:15,font:17});
 const bad=M.clone(s);bad.plans.advanced.groups[0].ids[1]=bad.plans.advanced.groups[0].ids[0];assert.throws(()=>M.validateState(bad,banks),/章节分组/);
 const session=M.groupTestSession(s,advanced,s.plans.advanced.groups[0],{now:T});answer(s,session,session.ids[0]);M.submit(s,session,qmap,T+1);session.submissions[0].score='<svg>';assert.throws(()=>M.validateState(s,banks),/交卷/);
});
