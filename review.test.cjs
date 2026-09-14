const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function setup() {
  const elements = new Map(), storage = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {textContent:'', innerHTML:'', disabled:false,
      style:{}, classList:{toggle(){},add(){}}, append(){}, after(){}, remove(){elements.delete(id);}});
    return elements.get(id);
  }
  const context = vm.createContext({
    state:{answers:[], results:[], current:null}, STORE:{results:'results'},
    $:element, $$:()=>[], document:{querySelector: id => elements.get(id), querySelectorAll:()=>[], createElement:()=>({})},
    applyRoleMenus(){}, finishTest(){}, filterResults(){}, renderResults(){}, normalize:s=>String(s).trim().toLowerCase(), normalizeKorean:s=>String(s).replace(/\s/g,''), escapeHtml:s=>s,
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

test('assignment plan keeps selected students and limits unique mixed questions to range', () => {
  const {context} = setup();
  context.words = Array.from({length:50},(_,i)=>({id:`word-${i+1}`,english:`word-${i+1}`,korean:`뜻-${i+1}`}));
  context.input = {title:'Test',students:['a','b','a'],type:'mixed',start:11,end:40,meaning:20,spelling:10,pass:80};
  const plan = vm.runInContext("buildExamPlan(input,words,['a','b','c'],true,false,()=>0.4)",context);
  assert.equal(plan.students.length,2);
  assert.equal(plan.questions.length,30);
  assert.equal(new Set(plan.questions.map(q=>q.word_id)).size,30);
  assert.equal(plan.questions.filter(q=>q.question_type==='en_ko').length,20);
  assert.equal(plan.questions.filter(q=>q.question_type==='ko_en').length,10);
  assert.ok(plan.questions.every(q=>Number(q.word_id.split('-')[1])>=11&&Number(q.word_id.split('-')[1])<=40));
});

test('DAY range includes every word from the selected consecutive days', () => {
  const {context} = setup();
  context.words = [
    {id:'d1-a',english:'apple',korean:'사과',dayNumber:1},
    {id:'d1-b',english:'book',korean:'책',dayNumber:1},
    {id:'d2-a',english:'chair',korean:'의자',dayNumber:2},
    {id:'d3-a',english:'desk',korean:'책상',dayNumber:3}
  ];
  context.input = {title:'Day 1-2',students:['a'],type:'en_ko',rangeMode:'day',dayFrom:1,dayTo:2,count:3,pass:80};
  const plan = vm.runInContext("buildExamPlan(input,words,['a'],true,false,()=>0.7)",context);
  assert.deepEqual(new Set(plan.questions.map(q=>q.word_id)),new Set(['d1-a','d1-b','d2-a']));
});

test('DAY range rejects reversed or empty day selections', () => {
  const {context} = setup();
  context.words = [{id:'d2',english:'book',korean:'책',dayNumber:2}];
  context.input = {title:'Bad day',students:['a'],type:'en_ko',rangeMode:'day',dayFrom:3,dayTo:2,count:1,pass:80};
  assert.throws(()=>vm.runInContext("buildExamPlan(input,words,['a'],true)",context),/DAY 범위/);
  context.input.dayFrom=1;context.input.dayTo=1;
  assert.throws(()=>vm.runInContext("buildExamPlan(input,words,['a'],true)",context),/단어가 없습니다/);
});

test('duplicate spellings become one question and all distinct meanings are accepted', () => {
  const {context} = setup();
  context.words=[
    {id:'first',english:'issue',korean:'문제',acceptedAnswers:['쟁점']},
    {id:'second',english:' Issue ',korean:'발행하다'},
    {id:'third',english:'apple',korean:'사과'}
  ];
  context.input={title:'Test',students:['a'],type:'en_ko',start:1,end:3,count:2,pass:80};
  const plan=vm.runInContext("buildExamPlan(input,words,['a'],true,true,()=>0.9)",context);
  assert.equal(plan.questions.length,2);
  const issue=plan.questions.find(q=>q.word_id==='first');
  assert.deepEqual(JSON.parse(JSON.stringify(issue.accepted_answers)),['문제','쟁점','발행하다']);
});

test('question count error reports unique spelling count within selected range', () => {
  const {context}=setup();
  context.words=[{id:'a',english:'same',korean:'하나'},{id:'b',english:'SAME',korean:'둘'}];
  context.input={title:'Test',students:['a'],type:'en_ko',start:1,end:2,count:2,pass:80};
  assert.throws(()=>vm.runInContext("buildExamPlan(input,words,['a'],true,true)",context),/중복|같은 철자|1개/);
});

test('assignment rejects stale student selection, fractional counts and unavailable mixed mode', () => {
  const {context} = setup();
  context.words = [{id:'one'},{id:'two'}];
  context.input = {title:'Test',students:['moved'],type:'en_ko',start:1,end:2,count:1,pass:80};
  assert.throws(()=>vm.runInContext("buildExamPlan(input,words,['active'],false)",context),/반 배정이 변경/);
  context.input.students=['active']; context.input.count=1.5;
  assert.throws(()=>vm.runInContext("buildExamPlan(input,words,['active'],false)",context),/문항 수/);
  context.input.type='mixed';
  assert.throws(()=>vm.runInContext("buildExamPlan(input,words,['active'],false)",context),/서버 설정/);
});

function assignmentClient(failTable, alreadyPublished=false) {
  const writes=[];
  const client={from(table){
    let action='select', payload;
    const query={insert(value){action='insert';payload=value;return this;},update(value){action='update';payload=value;return this;},delete(){action='delete';return this;},select(){return this;},eq(){return this;},single(){return execute();},then(resolve,reject){return execute().then(resolve,reject);}};
    async function execute(){
      writes.push({table,action,payload});
      if (table===failTable && action==='insert') return {error:{message:'network failure'}};
      if (table==='tests' && action==='insert') return {data:{id:'exam'}};
      if (table==='tests' && action==='select') return {data:{id:'exam',is_published:alreadyPublished}};
      return {data:{id:'exam'}};
    }
    return query;
  }};
  return {client,writes};
}

test('assignment publishes only after question and selected-student inserts', async () => {
  const {context} = setup(); const {client,writes}=assignmentClient();
  context.client=client;context.plan={title:'Test',type:'ko_en',count:1,pass:80,questions:[{word_id:'word',position:1}],students:['chosen']};
  await vm.runInContext("persistAssignedExam(client,{id:'teacher',academy_id:'a'},'class','book',plan)",context);
  assert.deepEqual(writes.map(w=>[w.table,w.action]),[['tests','insert'],['test_questions','insert'],['test_assignments','insert'],['tests','update']]);
  assert.equal(writes[0].payload.is_published,false);
  assert.equal(writes[2].payload[0].student_id,'chosen');
  assert.equal(writes[3].payload.is_published,true);
});

test('failed assignment never publishes and removes only its new unpublished draft', async () => {
  const {context} = setup(); const {client,writes}=assignmentClient('test_assignments');
  context.client=client;context.plan={title:'Test',type:'ko_en',count:1,questions:[{word_id:'word',position:1}],students:['chosen']};
  await assert.rejects(vm.runInContext("persistAssignedExam(client,{id:'teacher',academy_id:'a'},'class','book',plan)",context),/network failure/);
  assert.equal(writes.some(w=>w.action==='update'),false);
  assert.equal(writes.at(-1).action,'delete');
});

test('staff query scopes by academy and assigned classes with stable pagination', () => {
  const {context} = setup(); const calls=[];
  const query = new Proxy({}, {get:(_,name)=>(...args)=>{calls.push([name,...args]);return query;}});
  context.cloudClient={from:table=>{calls.push(['from',table]);return query;}};
  vm.runInContext("makeStaffAttemptsQuery({academy_id:'academy-a'},['assigned-class'],['student-a'],50)",context);
  const plain = JSON.parse(JSON.stringify(calls));
  assert.ok(plain.some(c=>c[0]==='eq'&&c[1]==='tests.academy_id'&&c[2]==='academy-a'));
  assert.ok(plain.some(c=>c[0]==='in'&&c[1]==='tests.class_id'&&c[2][0]==='assigned-class'));
  assert.ok(plain.some(c=>c[0]==='eq'&&c[1]==='status'&&c[2]==='submitted'));
  assert.ok(plain.some(c=>c[0]==='range'&&c[1]===50&&c[2]===99));
});

test('teacher without an assignment never queries student attempts', async () => {
  const {context,element} = setup(); const tables=[];
  context.cloudProfile={id:'teacher',role:'teacher',academy_id:'academy'};
  context.cloudClient={from:table=>{tables.push(table);return {select(){return this;},eq(){return this;},order(){return this;},range:async()=>({data:[]})};}};
  await vm.runInContext('loadStaffResults()',context);
  assert.deepEqual(tables,['class_teachers']);
  assert.match(element('#staffResultStatus').textContent,/담당 반이 배정되지/);
});

test('CSV preserves commas and protects formula-like names', () => {
  const {context} = setup();
  assert.equal(vm.runInContext('safeCsvCell("=1+1")',context),'"\'=1+1"');
  assert.equal(vm.runInContext('safeCsvCell("a,b")',context),'"a,b"');
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

test('student self-signup migration requires a valid active class code and creates an inactive account', () => {
  const sql=fs.readFileSync('supabase/migrations/006_student_self_signup.sql','utf8');
  assert.match(sql,/where is_active and upper\(signup_code\) = requested_code/);
  assert.match(sql,/values\(new\.id,target_class\.academy_id,'student',requested_name,false\)/);
  assert.match(sql,/values\(target_class\.id,new\.id,false\)/);
});
