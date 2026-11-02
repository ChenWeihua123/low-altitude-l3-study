const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../src/model.js'),C=require('../src/cloud.js'),D=require('../src/study-data.json');
const token='github_pat_'+'x'.repeat(40),settings={owner:'ChenWeihua123',repo:'low-altitude-l3-progress',branch:'main',path:'progress.json'},fresh=()=>M.migrate(null,D.banks,1000);
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
test('未调用manualSync时不发请求；空访问码不联网',async()=>{let requests=0;await assert.rejects(C.manualSync({state:fresh(),banks:D.banks,settings,token:'',fetchImpl:()=>{requests++;}}),/访问码/);assert.equal(requests,0);});
test('公共仓库绝不上传学习记录',async()=>{const calls=[];await assert.rejects(C.manualSync({state:fresh(),banks:D.banks,settings,token,fetchImpl:async(url,o)=>{calls.push(o.method||'GET');return response({private:false});}}),/不是私有仓库/);assert.deepEqual(calls,['GET']);});
test('点击手动同步后才读取并创建私有进度文件，令牌只在Authorization',async()=>{
 const calls=[];let uploaded;
 const result=await C.manualSync({state:fresh(),banks:D.banks,settings,token,now:()=>2000,fetchImpl:async(url,o)=>{calls.push({url,method:o.method||'GET'});assert.equal(o.headers.Authorization,'Bearer '+token);if(!url.includes('/contents/'))return response({private:true});if(!o.method)return response({},404);uploaded=JSON.parse(C.decode(JSON.parse(o.body).content));assert.equal(o.body.includes(token),false);return response({content:{sha:'new'}},201);}});
 assert.deepEqual(calls.map(x=>x.method),['GET','GET','PUT']);assert.equal(result.created,true);assert.equal(uploaded.kind,'low-altitude-study-cloud');assert.equal(JSON.stringify(uploaded).includes(token),false);assert.equal(result.state.sync.lastSuccessAt,2000);
});
test('合并云端新数据并使用真实SHA写回',async()=>{
 const local=fresh(),remote=fresh();local.reading.N001='2026-11-01';remote.reading.N002='2026-11-02';let body;
 const result=await C.manualSync({state:local,banks:D.banks,settings,token,fetchImpl:async(url,o)=>{if(!url.includes('/contents/'))return response({private:true});if(!o.method)return response({type:'file',sha:'oldsha',encoding:'base64',content:C.encode(JSON.stringify({kind:'low-altitude-study-cloud',version:5,state:remote}))});body=JSON.parse(o.body);return response({content:{sha:'new'}});}});
 assert.equal(body.sha,'oldsha');assert.equal(Object.keys(result.state.reading).length,2);
});
test('SHA冲突重新拉取，不覆盖另一设备更新',async()=>{
 let reads=0,writes=0;const remote=fresh();
 const result=await C.manualSync({state:fresh(),banks:D.banks,settings,token,fetchImpl:async(url,o)=>{if(!url.includes('/contents/'))return response({private:true});if(!o.method){reads++;if(reads===2)remote.reading.N003='2026-11-02';return response({type:'file',sha:'s'+reads,encoding:'base64',content:C.encode(JSON.stringify({kind:'low-altitude-study-cloud',version:5,state:remote}))});}writes++;return writes===1?response({},409):response({content:{sha:'ok'}});}});
 assert.equal(reads,2);assert.equal(writes,2);assert.equal(result.state.reading.N003,'2026-11-02');
});
test('不识别的云端文件不覆盖；网络失败不修改本机数据',async()=>{
 const state=fresh(),before=M.clone(state);let writes=0;
 await assert.rejects(C.manualSync({state,banks:D.banks,settings,token,fetchImpl:async(url,o)=>{if(!url.includes('/contents/'))return response({private:true});if(o.method)writes++;return response({type:'file',sha:'s',encoding:'base64',content:C.encode('{"other":"file"}')});}}),/不会覆盖/);assert.equal(writes,0);assert.deepEqual(state,before);
 await assert.rejects(C.manualSync({state,banks:D.banks,settings,token,fetchImpl:async()=>{throw Error('offline');}}),/日常网络/);assert.deepEqual(state,before);
});
