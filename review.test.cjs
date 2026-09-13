const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function setup() {
  const elements = new Map(), storage = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {textContent:'', innerHTML:'', disabled:false,
      style:{}, classList:{toggle(){}}, append(){}, after(){}, remove(){elements.delete(id);}});
    return elements.get(id);
  }
  const context = vm.createContext({
    state:{answers:[], results:[], current:null}, STORE:{results:'results'},
    $:element, document:{querySelector: id => elements.get(id), querySelectorAll:()=>[], createElement:()=>({})},
    finishTest(){}, filterResults(){}, normalize:s=>s, escapeHtml:s=>s,
    load:(key,fallback)=>storage.get(key)||fallback, save:(key,value)=>storage.set(key,value),
    shuffle:a=>[...a].reverse(), show:v=>context.view=v, renderQuestion:()=>{},
    toast:message=>context.error=message, cloudProfile:null, cloudClient:null,
    loadStudentTests(){}, Date, console
  });
  const source = fs.readFileSync('app.js','utf8').split('// Review and assigned exams.')[1];
  vm.runInContext('// Review and assigned exams.' + source, context);
  return {context, element, storage};
}

test('mixed retry includes every wrong word, preserves question types, and needs no setup form', () => {
  const {context, element} = setup();
  context.result = {id:'old', student:'Test', className:'Class', bookName:'Book', type:'mixed',
    total:30, correct:5, score:17, wrong:Array.from({length:25}, (_,i)=>({
      word:{english:`word${i}`,korean:`뜻${i}`}, type:i%2?'en-ko':'ko-en', answer:'wrong', correct:'answer', isCorrect:false}))};
  vm.runInContext('showSavedResult(result)', context);
  element('#retryWrongBtn').onclick();
  assert.equal(context.state.questions.length,25);
  assert.equal(context.state.questions.filter(q=>q.questionType==='ko-en').length,13);
  assert.equal(context.state.current.isPractice,true);
  assert.equal(context.state.current.cloudAttemptId,undefined);
  assert.equal(context.view,'test');
});

test('student practice is saved only under that student, without changing official attempts', () => {
  const {context, storage} = setup();
  context.cloudProfile={id:'student-a',role:'student'};
  context.state.current={studentOwnerId:'student-a',isPractice:true};
  context.state.answers=[{word:{english:'a',korean:'뜻'},answer:'a',correct:'a',isCorrect:true,type:'ko-en'}];
  vm.runInContext('finishTest()',context);
  assert.equal(storage.get('tg_vocab_practice_student-a')[0].score,100);
  assert.equal(storage.has('results'),false);
  assert.equal(context.view,'score');
});

test('official submission uses raw answers and displays server grading', async () => {
  const {context} = setup(); let rpcArgs, calls=0;
  context.cloudProfile={id:'student-a',role:'student'};
  context.state.current={cloudAttemptId:'attempt',studentOwnerId:'student-a'};
  context.state.answers=[{word:{questionId:'q1',english:'apple',korean:'사과'},answer:'x',isCorrect:true,type:'en-ko'}];
  context.cloudClient={
    from:table=>({select(){return this;},eq(){return this;},single:async()=>({data:{id:'attempt',status:calls++?'submitted':'in_progress',score:0,correct_count:0,total_count:1}}),
      then(resolve){return Promise.resolve({data:[{question_id:'q1',submitted_answer:'x',correct_answer_snapshot:'사과',is_correct:false}]}).then(resolve);}}),
    rpc:async(name,args)=>{assert.equal(name,'submit_attempt');rpcArgs=args;return {data:[{score:0}]};}
  };
  await vm.runInContext('submitCloudAttempt()', context);
  assert.deepEqual(JSON.parse(JSON.stringify(rpcArgs)),{p_attempt_id:'attempt',p_answers:[{question_id:'q1',answer:'x'}]});
  assert.equal(context.view,'score');
  assert.equal(vm.runInContext('reviewResult.answers[0].isCorrect',context),false);
  assert.equal(vm.runInContext('reviewResult.score',context),0);
});

test('response-loss recovery reads a completed attempt without resubmission', async () => {
  const {context} = setup();
  context.cloudProfile={id:'student-a',role:'student'};
  context.state.current={cloudAttemptId:'attempt',studentOwnerId:'student-a'};
  context.state.answers=[{word:{questionId:'q1',english:'a',korean:'뜻'},answer:'a',type:'ko-en'}];
  context.cloudClient={from:()=>({select(){return this;},eq(){return this;},single:async()=>({data:{id:'attempt',status:'submitted',score:100,correct_count:1,total_count:1}}),
    then(resolve){return Promise.resolve({data:[{question_id:'q1',submitted_answer:'a',correct_answer_snapshot:'a',is_correct:true}]}).then(resolve);}}),
    rpc:()=>{throw Error('must not resubmit');}};
  await vm.runInContext('submitCloudAttempt()',context);
  assert.equal(context.view,'score');
  assert.equal(context.error,undefined);
});
