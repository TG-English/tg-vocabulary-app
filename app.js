const STORE={books:'tg_vocab_books_v1',results:'tg_vocab_results_v1'};
const state={books:load(STORE.books,[]),results:load(STORE.results,[]),pendingWords:[],questions:[],answers:[],index:0,current:null,lastWrong:[]};
const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
function load(key,fallback){try{return JSON.parse(localStorage.getItem(key))||fallback}catch{return fallback}}
function save(key,value){localStorage.setItem(key,JSON.stringify(value))}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2200)}
function show(view){if(view==='admin'&&cloudProfile?.role!=='admin')return toast('관리자만 이용할 수 있습니다.');if(['upload','setup','results'].includes(view)&&cloudProfile?.role==='student')return toast('학생 계정에서는 이용할 수 없습니다.');$$('.view').forEach(v=>v.classList.remove('active'));$(`#${view}View`).classList.add('active');window.scrollTo({top:0,behavior:'smooth'});if(view==='home')renderStats();if(view==='upload')renderBooks();if(view==='setup')renderBookSelect();if(view==='results')renderResults();if(view==='admin')loadAdminData();if(view==='student')loadStudentTests()}
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.view)));

function normalize(v){return String(v??'').trim().toLowerCase().replace(/[.,!?]/g,'').replace(/\s+/g,' ')}
function normalizeKorean(v){return String(v??'').trim().toLowerCase().replace(/[\s.,!?~'\"()[\]{}·]/g,'')}
function editDistance(a,b){const row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let previous=row[0];row[0]=i;for(let j=1;j<=b.length;j++){const saved=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,previous+(a[i-1]===b[j-1]?0:1));previous=saved}}return row[b.length]}
function koreanAnswerMatches(answer,expected){const typed=normalizeKorean(answer),target=normalizeKorean(expected);if(!typed||!target)return false;if(typed===target)return true;const length=Math.max(typed.length,target.length),allowed=length>=8?2:length>=4?1:0;return editDistance(typed,target)<=allowed}
function shuffle(a){return [...a].sort(()=>Math.random()-.5)}
function renderStats(){const scores=state.results.map(r=>r.score);$('#statWords').textContent=state.books.reduce((n,b)=>n+b.words.length,0);$('#statTests').textContent=state.results.length;$('#statAverage').textContent=scores.length?`${Math.round(scores.reduce((a,b)=>a+b,0)/scores.length)}점`:'-'}

function parseDayNumber(value){const match=String(value??'').trim().match(/^(?:day\s*)?(\d+)$/i);return match?Number(match[1]):null}
function parseVocabularyRows(rows){let currentDay=null;const words=[];for(const row of rows){const english=String(row[0]??'').trim(),korean=String(row[1]??'').trim();if(!korean&&/^day\s*\d+$/i.test(english)){currentDay=parseDayNumber(english);continue}if(!english||!korean||/^(english|영어|단어|word)$/i.test(english))continue;const explicitDay=parseDayNumber(row[2]);if(explicitDay)currentDay=explicitDay;words.push({english,korean,dayNumber:explicitDay||currentDay||null})}return words}
$('#excelFile').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{const data=await file.arrayBuffer();const wb=XLSX.read(data);const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''});const words=parseVocabularyRows(rows);state.pendingWords=words;const days=[...new Set(words.map(w=>w.dayNumber).filter(Boolean))].sort((a,b)=>a-b);$('#uploadPreview').classList.remove('hidden');$('#uploadPreview').innerHTML=`<strong>${file.name}</strong><p>${words.length}개 단어를 확인했어요.${days.length?` · DAY ${days[0]}~${days.at(-1)} 인식`: ' · DAY 정보 없음'}</p>`;$('#saveBookBtn').disabled=!words.length;if(!$('#bookName').value)$('#bookName').value=file.name.replace(/\.[^.]+$/,'')}catch{toast('파일을 읽지 못했어요. 엑셀 형식을 확인해주세요.')}});
$('#saveBookBtn').addEventListener('click',async()=>{const name=$('#bookName').value.trim();if(!name||!state.pendingWords.length)return toast('단어장 이름과 파일을 확인해주세요.');if(cloudClient&&['admin','teacher'].includes(cloudProfile?.role))return saveCloudBook(name);state.books.unshift({id:Date.now().toString(),name,words:state.pendingWords,createdAt:new Date().toISOString()});save(STORE.books,state.books);clearBookForm();renderBooks();toast('단어장을 저장했어요!')});
function clearBookForm(){state.pendingWords=[];$('#bookName').value='';$('#excelFile').value='';$('#uploadPreview').classList.add('hidden');$('#saveBookBtn').disabled=true}
function renderBooks(){$('#bookList').innerHTML=state.books.map(b=>`<div class="book-item"><div><strong>${escapeHtml(b.name)}</strong><small>${b.words.length}개 단어 · ${b.isCloud?'학원 공유':'이 기기'}</small></div><button data-delete-book="${b.id}">삭제</button></div>`).join('')||'<div class="card tip">아직 등록된 단어장이 없어요.</div>';$$('[data-delete-book]').forEach(btn=>btn.onclick=()=>deleteBook(btn.dataset.deleteBook))}
async function deleteBook(id){const book=state.books.find(b=>b.id===id);if(!book||!confirm('이 단어장을 삭제할까요?'))return;if(book.isCloud){const {error}=await cloudClient.from('vocabulary_books').delete().eq('id',id);if(error)return toast(`삭제 실패: ${error.message}`)}state.books=state.books.filter(b=>b.id!==id);save(STORE.books,state.books.filter(b=>!b.isCloud));renderBooks();renderStats();toast('단어장을 삭제했습니다.')}
function renderBookSelect(){$('#bookSelect').innerHTML='<option value="">단어장을 선택하세요</option>'+state.books.map(b=>`<option value="${b.id}">${escapeHtml(b.name)} (${b.words.length})</option>`).join('')}

$('#startTestBtn').addEventListener('click',()=>startTest());
$$('input[name="testType"]').forEach(input=>input.addEventListener('change',()=>{const mixed=$('input[name="testType"]:checked').value==='mixed';$('#mixedOptions').classList.toggle('hidden',!mixed);$('#questionCount').closest('label').classList.toggle('hidden',mixed)}));
function startTest(overrideWords){const className=$('#className').value,student=$('#studentName').value.trim(),book=state.books.find(b=>b.id===$('#bookSelect').value),type=$('input[name="testType"]:checked').value;if(!className||!student||(!book&&!overrideWords))return toast('반, 학생 이름, 단어장을 모두 선택해주세요.');const base=overrideWords||book.words;if(type==='mixed'&&!overrideWords){const meaningCount=Number($('#meaningQuestionCount').value),spellingCount=Number($('#spellingQuestionCount').value),total=meaningCount+spellingCount;if(!meaningCount||!spellingCount)return toast('혼합 시험의 문제 수를 확인해주세요.');if(total>base.length)return toast(`단어가 ${base.length}개입니다. 혼합 시험 문제 수를 ${base.length}개 이하로 줄여주세요.`);const selected=shuffle(base).slice(0,total);state.questions=shuffle([...selected.slice(0,meaningCount).map(word=>({...word,questionType:'en-ko'})),...selected.slice(meaningCount).map(word=>({...word,questionType:'ko-en'}))])}else{const count=$('#questionCount').value==='all'?base.length:Math.min(Number($('#questionCount').value),base.length);state.questions=shuffle(base).slice(0,count)}state.answers=[];state.index=0;state.current={className,student,bookId:book?.id||'retry',bookName:book?.name||'오답 재시험',type};$('#testStudent').textContent=`${className} · ${student}`;$('#testBook').textContent=state.current.bookName;show('test');renderQuestion()}
function renderQuestion(){const q=state.questions[state.index],type=q.questionType||state.current.type;$('#progressText').textContent=`${state.index+1} / ${state.questions.length}`;$('#progressBar').style.width=`${((state.index+1)/state.questions.length)*100}%`;$('#speakBtn').classList.toggle('hidden',type!=='spelling');$('#questionLabel').textContent=type==='en-ko'?'뜻을 입력하세요':type==='ko-en'?'영어 단어를 입력하세요':'소리를 듣고 영어 단어를 입력하세요';$('#questionPrompt').textContent=type==='en-ko'?q.english:type==='ko-en'?q.korean:'🔊';$('#answerInput').value='';$('#answerInput').focus();$('#nextQuestionBtn').textContent=state.index===state.questions.length-1?'채점하기':'다음 문제';if(type==='spelling')speak(q.english)}
function speak(word){if(!('speechSynthesis'in window))return toast('이 브라우저는 음성 듣기를 지원하지 않아요.');speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(word);u.lang='en-US';u.rate=.78;speechSynthesis.speak(u)}
$('#speakBtn').onclick=()=>speak(state.questions[state.index].english);
$('#answerInput').addEventListener('keydown',e=>{if(e.key==='Enter')$('#nextQuestionBtn').click()});
$('#nextQuestionBtn').addEventListener('click',()=>{const answer=$('#answerInput').value.trim();if(!answer)return toast('정답을 입력해주세요.');const word=state.questions[state.index],type=word.questionType||state.current.type,correct=type==='en-ko'?word.korean:word.english;const accepted=type==='en-ko'?correct.split(/[,;/·]| 또는 /).map(v=>v.trim()).filter(Boolean):[correct];const isCorrect=type==='en-ko'?accepted.some(v=>koreanAnswerMatches(answer,v)):accepted.some(v=>normalize(v)===normalize(answer));state.answers.push({word,answer,correct,isCorrect,type});if(++state.index<state.questions.length)renderQuestion();else finishTest()});
function finishTest(){const correct=state.answers.filter(a=>a.isCorrect).length,score=Math.round(correct/state.answers.length*100),wrong=state.answers.filter(a=>!a.isCorrect);state.lastWrong=wrong.map(a=>a.word);const result={id:Date.now().toString(),date:new Date().toISOString(),...state.current,score,total:state.answers.length,correct,wrong:state.answers.filter(a=>!a.isCorrect)};state.results.unshift(result);save(STORE.results,state.results);$('#scoreValue').textContent=score;$('#scoreCircle').style.background=`conic-gradient(var(--blue) ${score}%,#e9eef4 0)`;$('#scoreMessage').textContent=score===100?'완벽해요! 최고예요 🎉':score>=80?'아주 잘했어요! 👏':'오답을 한 번 더 복습해요.';$('#scoreDetail').textContent=`${state.answers.length}문제 중 ${correct}문제를 맞혔어요.`;$('#wrongAnswers').innerHTML=wrong.length?'<h3>틀린 단어</h3>'+wrong.map(a=>`<div class="wrong-item"><div><strong>${escapeHtml(a.word.english)}</strong><small>${escapeHtml(a.word.korean)}</small></div><div>내 답: ${escapeHtml(a.answer)}</div></div>`).join(''):'<div class="card tip">틀린 문제가 없어요. 정말 훌륭해요!</div>';$('#retryWrongBtn').classList.toggle('hidden',!wrong.length);show('score')}
$('#retryWrongBtn').onclick=()=>{if(state.lastWrong.length)startTest(state.lastWrong)};

function renderResults(){const classes=[...new Set(state.results.map(r=>r.className))];const selected=$('#resultClass').value;$('#resultClass').innerHTML='<option value="all">전체 반</option>'+classes.map(c=>`<option>${escapeHtml(c)}</option>`).join('');$('#resultClass').value=classes.includes(selected)?selected:'all';filterResults()}
function filterResults(){const c=$('#resultClass').value,q=normalize($('#resultSearch').value);const rows=state.results.filter(r=>(c==='all'||r.className===c)&&(!q||normalize(r.student).includes(q)));$('#resultsList').innerHTML=rows.map(r=>`<div class="result-item"><div><strong>${escapeHtml(r.student)} · ${escapeHtml(r.className)}</strong><small>${escapeHtml(r.bookName)} · ${new Date(r.date).toLocaleDateString('ko-KR')}</small></div><span class="score">${r.score}점</span></div>`).join('')||'<div class="card tip">조건에 맞는 성적 기록이 없어요.</div>'}
$('#resultClass').onchange=filterResults;$('#resultSearch').oninput=filterResults;
$('#downloadResultsBtn').onclick=()=>{if(!state.results.length)return toast('저장된 성적이 없어요.');const rows=[['날짜','반','학생','단어장','시험유형','점수','정답수','문제수'],...state.results.map(r=>[new Date(r.date).toLocaleString('ko-KR'),r.className,r.student,r.bookName,r.type,r.score,r.correct,r.total])];const csv='\ufeff'+rows.map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='TG_학생별_성적.csv';a.click();URL.revokeObjectURL(a.href)};
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
let installPrompt;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('#installBtn').classList.remove('hidden')});$('#installBtn').onclick=async()=>{if(installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('#installBtn').classList.add('hidden')}};
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js');renderStats();

// Supabase production mode. With empty config, the existing local/demo app stays available.
const cloudConfig=window.TG_CONFIG||{};
let cloudClient=null,cloudProfile=null,profileLoadPromise=null,profileLoadUserId=null,authGeneration=0;
const adminState={classes:[],students:[],enrollments:[],teachers:[],teacherAssignments:[]};
async function initCloudMode(){
  if(!cloudConfig.supabaseUrl||!cloudConfig.supabaseAnonKey)return;
  const configuredUrl=String(cloudConfig.supabaseUrl).trim().replace(/^['\"]|['\"]$/g,'');
  const supabaseUrl=new URL(configuredUrl).origin;
  cloudClient=window.supabase.createClient(supabaseUrl,cloudConfig.supabaseAnonKey);
  cloudClient.auth.onAuthStateChange((event,nextSession)=>{
    // Supabase warns against awaiting database calls inside this callback.
    // Defer them to avoid an auth lock/deadlock during sign-in and token refresh.
    setTimeout(()=>{
      if(event==='SIGNED_OUT'||!nextSession){resetCloudSession();return}
      if(nextSession.user.id!==cloudProfile?.id&&nextSession.user.id!==profileLoadUserId)loadCloudProfile(nextSession.user.id);
    },0);
  });
  try{
    const {data:{session},error}=await cloudClient.auth.getSession();
    if(error)throw error;
    if(session)await loadCloudProfile(session.user.id);else show('auth');
  }catch(error){show('auth');$('#loginError').textContent='로그인 상태를 확인하지 못했습니다. 새로고침 후 다시 시도해 주세요.'}
}
function resetCloudSession(){
  authGeneration++;profileLoadPromise=null;profileLoadUserId=null;cloudProfile=null;
  $('#accountBtn').classList.add('hidden');$('.brand strong').textContent='TG Vocabulary';show('auth');
}
async function queryProfileWithRetry(userId){
  let last;
  for(let attempt=0;attempt<2;attempt++){
    last=await cloudClient.from('profiles').select('id,academy_id,display_name,role,is_active').eq('id',userId).maybeSingle();
    if(!last.error)return last;
    if(attempt===0)await new Promise(resolve=>setTimeout(resolve,350));
  }
  return last;
}
async function loadCloudProfile(userId){
  if(profileLoadPromise&&profileLoadUserId===userId)return profileLoadPromise;
  const generation=authGeneration,client=cloudClient;profileLoadUserId=userId;
  profileLoadPromise=(async()=>{
    const {data,error}=await queryProfileWithRetry(userId);
    if(client!==cloudClient||generation!==authGeneration)return false;
    if(error){$('#loginError').textContent=`사용자 정보를 불러오지 못했습니다: ${error.message} · 잠시 후 다시 로그인해 주세요.`;show('auth');return false}
    if(!data||!data.is_active){$('#loginError').textContent='등록된 활성 사용자 정보를 찾을 수 없습니다. 관리자에게 학생 계정 상태를 확인해 주세요.';await cloudClient.auth.signOut();return false}
    cloudProfile=data;$('#loginError').textContent='';applyRoleMenus(data.role);$('#accountBtn').classList.remove('hidden');$('.brand strong').innerHTML=`TG Vocabulary <span class="role-badge">${roleLabel(data.role)}</span>`;
    if(data.role!=='student')await Promise.all([loadCloudBooks(),loadCloudClasses()]);
    if(client===cloudClient&&generation===authGeneration){show(data.role==='student'?'student':'home');return true}
    return false;
  })().finally(()=>{if(profileLoadUserId===userId){profileLoadPromise=null;profileLoadUserId=null}});
  return profileLoadPromise;
}
function roleLabel(role){return({student:'학생',teacher:'선생님',admin:'관리자'})[role]||role}
function applyRoleMenus(role){const student=role==='student';$('#adminMenuBtn').classList.toggle('hidden',role!=='admin');$('#studentMenuBtn').classList.toggle('hidden',!student);$('#statsPanel').classList.toggle('hidden',student);['#testMenuBtn','#uploadMenuBtn','#resultsMenuBtn'].forEach(id=>$(id).classList.toggle('hidden',student));if(student){state.books=[];state.results=[]}else{state.books=load(STORE.books,[]);state.results=load(STORE.results,[])}}
$('#loginForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!cloudClient)return;
  const btn=$('#loginBtn');btn.disabled=true;btn.textContent='확인 중...';$('#loginError').textContent='';
  try{
    const {data,error}=await cloudClient.auth.signInWithPassword({email:$('#loginEmail').value.trim().toLowerCase(),password:$('#loginPassword').value});
    if(error)$('#loginError').textContent=loginErrorMessage(error);
    else if(data.session)await loadCloudProfile(data.session.user.id);
  }catch(error){
    $('#loginError').textContent='Supabase 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.';
  }finally{
    btn.disabled=false;btn.textContent='로그인';
  }
});
function loginErrorMessage(error){
  const message=String(error?.message||'').toLowerCase();
  if(message.includes('email not confirmed'))return '이메일 확인이 완료되지 않은 계정입니다. Supabase Users에서 Confirm 상태를 확인해주세요.';
  if(message.includes('invalid login credentials'))return '이메일 또는 비밀번호가 일치하지 않습니다.';
  if(message.includes('rate limit'))return '로그인을 여러 번 시도해 잠시 제한됐습니다. 몇 분 후 다시 시도해주세요.';
  if(message.includes('fetch'))return 'Supabase 연결에 실패했습니다. 인터넷 연결을 확인해주세요.';
  return `로그인 오류: ${error?.message||'알 수 없는 오류'}`;
}
$('#accountBtn').addEventListener('click',()=>cloudClient?.auth.signOut());

async function loadCloudBooks(){
  const {data:books,error}=await cloudClient.from('vocabulary_books').select('id,title,created_at').order('created_at',{ascending:false});
  if(error)return toast(`공유 단어장을 불러오지 못했습니다: ${error.message}`);
  const ids=(books||[]).map(book=>book.id);let words=[];
  if(ids.length){const result=await cloudClient.from('vocabulary_words').select('book_id,english,korean,accepted_answers,position,day_number').in('book_id',ids).order('position');if(result.error)return toast(`단어를 불러오지 못했습니다: ${result.error.message}`);words=result.data||[]}
  const cloudBooks=(books||[]).map(book=>({id:book.id,name:book.title,createdAt:book.created_at,isCloud:true,words:words.filter(word=>word.book_id===book.id).map(word=>({english:word.english,korean:word.korean,acceptedAnswers:word.accepted_answers,dayNumber:word.day_number}))}));
  state.books=[...cloudBooks,...load(STORE.books,[])];renderStats();
}
async function loadCloudClasses(){
  const {data,error}=await cloudClient.from('classes').select('id,name,school_year').eq('is_active',true).order('school_year',{ascending:false}).order('name');
  if(error)return toast(`반 목록을 불러오지 못했습니다: ${error.message}`);
  $('#className').innerHTML='<option value="">반을 선택하세요</option>'+(data||[]).map(item=>`<option value="${escapeHtml(item.name)}">${escapeHtml(item.name)} (${item.school_year})</option>`).join('');
}
async function saveCloudBook(name){
  const button=$('#saveBookBtn');setBusy(button,true,'업로드 중...');
  const {data:book,error:bookError}=await cloudClient.from('vocabulary_books').insert({academy_id:cloudProfile.academy_id,owner_id:cloudProfile.id,title:name,is_sample:false}).select('id,title,created_at').single();
  if(bookError){setBusy(button,false,'단어장 저장');return toast(`단어장 저장 실패: ${bookError.message}`)}
  const rows=state.pendingWords.map((word,index)=>({book_id:book.id,english:word.english,korean:word.korean,position:index+1,day_number:word.dayNumber||null}));
  for(let index=0;index<rows.length;index+=500){const {error}=await cloudClient.from('vocabulary_words').insert(rows.slice(index,index+500));if(error){await cloudClient.from('vocabulary_books').delete().eq('id',book.id);setBusy(button,false,'단어장 저장');return toast(`단어 업로드 실패: ${error.message}`)}}
  clearBookForm();setBusy(button,false,'단어장 저장');toast(`${rows.length}개 단어를 학원 공유 단어장에 저장했습니다.`);await loadCloudBooks();renderBooks();
}

async function loadStudentTests(){
  if(cloudProfile?.role!=='student')return;
  const list=$('#studentTestList');list.innerHTML='<div class="loading-row">시험을 불러오는 중...</div>';
  const assignmentsResult=await cloudClient.from('test_assignments').select('test_id,assigned_at').eq('student_id',cloudProfile.id);
  if(assignmentsResult.error){list.innerHTML='<div class="empty-row">시험을 불러오지 못했습니다.</div>';return toast(assignmentsResult.error.message)}
  const assignments=assignmentsResult.data||[],testIds=assignments.map(item=>item.test_id);if(!testIds.length){list.innerHTML='<div class="empty-row">아직 배정된 시험이 없습니다.</div>';return}
  const testsResult=await cloudClient.from('tests').select('id,title,test_type,question_count,pass_score,available_from,available_until,is_published,class_id,book_id').in('id',testIds);
  const attemptsResult=await cloudClient.from('test_attempts').select('test_id,score,status,submitted_at,attempt_number').eq('student_id',cloudProfile.id).in('test_id',testIds).order('attempt_number',{ascending:false});
  if(testsResult.error||attemptsResult.error){list.innerHTML='<div class="empty-row">시험 정보를 불러오지 못했습니다.</div>';return toast((testsResult.error||attemptsResult.error).message)}
  const tests=testsResult.data||[],classIds=[...new Set(tests.map(test=>test.class_id))],bookIds=[...new Set(tests.map(test=>test.book_id))];
  const [classesResult,booksResult]=await Promise.all([cloudClient.from('classes').select('id,name').in('id',classIds),cloudClient.from('vocabulary_books').select('id,title').in('id',bookIds)]);
  const classes=classesResult.data||[],books=booksResult.data||[],attempts=attemptsResult.data||[],now=Date.now();
  list.innerHTML=tests.map(test=>{const latest=attempts.find(item=>item.test_id===test.id),klass=classes.find(item=>item.id===test.class_id),book=books.find(item=>item.id===test.book_id),notStarted=test.available_from&&new Date(test.available_from).getTime()>now,expired=test.available_until&&new Date(test.available_until).getTime()<now,available=test.is_published&&!notStarted&&!expired;return `<div class="student-test-row"><div><span class="test-state ${available?'ready':''}">${latest?.status==='submitted'?`${latest.score}점`:available?'응시 가능':notStarted?'시작 전':expired?'종료':'준비 중'}</span><strong>${escapeHtml(test.title)}</strong><small>${escapeHtml(klass?.name||'배정 반')} · ${escapeHtml(book?.title||'단어장')} · ${test.question_count}문제</small></div><button class="secondary" ${available?'':'disabled'} data-cloud-test="${test.id}">${latest?.status==='submitted'?'다시 보기':'시험 보기'}</button></div>`}).join('');
  $$('[data-cloud-test]').forEach(button=>button.onclick=()=>toast('시험 응시 기능은 다음 단계에서 연결됩니다.'));
}

async function loadAdminData(){
  if(!cloudClient||cloudProfile?.role!=='admin')return;
  $('#adminClassYear').value=new Date().getFullYear();
  $('#adminClassList').innerHTML=$('#adminStudentList').innerHTML=$('#adminTeacherList').innerHTML='<div class="loading-row">불러오는 중...</div>';
  const [classesResult,studentsResult,enrollmentsResult,teachersResult,teacherAssignmentsResult]=await Promise.all([
    cloudClient.from('classes').select('id,name,school_year,is_active,created_at').order('school_year',{ascending:false}).order('name'),
    cloudClient.from('profiles').select('id,display_name,is_active').eq('role','student').order('display_name'),
    cloudClient.from('class_students').select('class_id,student_id,student_number,is_active,joined_at'),
    cloudClient.from('profiles').select('id,display_name,is_active').eq('role','teacher').order('display_name'),
    cloudClient.from('class_teachers').select('class_id,teacher_id')
  ]);
  const error=classesResult.error||studentsResult.error||enrollmentsResult.error||teachersResult.error||teacherAssignmentsResult.error;
  if(error){$('#adminClassList').innerHTML=$('#adminStudentList').innerHTML=$('#adminTeacherList').innerHTML='<div class="empty-row">데이터를 불러오지 못했습니다.</div>';toast(`관리 데이터 오류: ${error.message}`);return}
  adminState.classes=classesResult.data||[];adminState.students=studentsResult.data||[];adminState.enrollments=enrollmentsResult.data||[];adminState.teachers=teachersResult.data||[];adminState.teacherAssignments=teacherAssignmentsResult.data||[];renderAdminData();
}
function classCheckboxes(classes,name,selected=[]){
  if(!classes.length)return '<span class="empty-check-list">먼저 운영 중인 반을 등록해 주세요.</span>';
  const chosen=new Set(selected);return classes.map(c=>`<label><input type="checkbox" name="${name}" value="${c.id}" ${chosen.has(c.id)?'checked':''}/><span>${escapeHtml(c.name)} (${c.school_year})</span></label>`).join('');
}
function checkedValues(name){return $$(`input[name="${name}"]:checked`).map(input=>input.value)}
function renderAdminData(){
  const activeClasses=adminState.classes.filter(c=>c.is_active);
  $('#classCount').textContent=`${adminState.classes.length}개`;$('#studentCount').textContent=`${adminState.students.length}명`;$('#teacherCount').textContent=`${adminState.teachers.length}명`;
  $('#adminClassSelect').innerHTML='<option value="">반을 선택하세요</option>'+activeClasses.map(c=>`<option value="${c.id}">${escapeHtml(c.name)} (${c.school_year})</option>`).join('');
  $('#newStudentClass').innerHTML='<option value="">반을 선택하세요</option>'+activeClasses.map(c=>`<option value="${c.id}">${escapeHtml(c.name)} (${c.school_year})</option>`).join('');
  $('#adminStudentSelect').innerHTML='<option value="">학생을 선택하세요</option>'+adminState.students.filter(s=>s.is_active).map(s=>`<option value="${s.id}">${escapeHtml(s.display_name)}</option>`).join('');
  $('#adminTeacherSelect').innerHTML='<option value="">선생님을 선택하세요</option>'+adminState.teachers.filter(t=>t.is_active).map(t=>`<option value="${t.id}">${escapeHtml(t.display_name)}</option>`).join('');
  $('#newTeacherClasses').innerHTML=classCheckboxes(activeClasses,'newTeacherClass');
  $('#adminTeacherClasses').innerHTML=classCheckboxes(activeClasses,'adminTeacherClass');
  $('#adminClassList').innerHTML=adminState.classes.map(c=>`<div class="management-row"><div><strong>${escapeHtml(c.name)}</strong><small>${c.school_year}학년도 · ${c.is_active?'운영 중':'종료'}</small></div><button class="status-btn ${c.is_active?'':'off'}" data-toggle-class="${c.id}">${c.is_active?'운영 종료':'다시 운영'}</button></div>`).join('')||'<div class="empty-row">등록된 반이 없습니다.</div>';
  $('#adminTeacherList').innerHTML=adminState.teachers.map(t=>{const classNames=adminState.teacherAssignments.filter(a=>a.teacher_id===t.id).map(a=>adminState.classes.find(c=>c.id===a.class_id)?.name).filter(Boolean);return `<div class="management-row"><div><strong>${escapeHtml(t.display_name)}</strong><small class="teacher-assignment-summary">${classNames.length?`담당: ${classNames.map(escapeHtml).join(', ')}`:'담당 반 없음'} · ${t.is_active?'활성':'비활성'}</small></div><div class="row-actions"><button data-edit-teacher="${t.id}">이름 수정</button><button class="status-btn ${t.is_active?'':'off'}" data-toggle-teacher="${t.id}">${t.is_active?'사용 중':'비활성'}</button></div></div>`}).join('')||'<div class="empty-row">등록된 선생님이 없습니다.</div>';
  $('#adminStudentList').innerHTML=adminState.enrollments.map(e=>{const student=adminState.students.find(s=>s.id===e.student_id),klass=adminState.classes.find(c=>c.id===e.class_id);if(!student||!klass)return'';return `<div class="management-row"><div><strong>${escapeHtml(student.display_name)}</strong><small>${escapeHtml(klass.name)}${e.student_number?` · ${escapeHtml(e.student_number)}번`:''} · ${e.is_active?'재원':'퇴원/이동'}</small></div><div class="row-actions"><button data-edit-student="${student.id}">이름 수정</button><button class="status-btn ${e.is_active?'':'off'}" data-toggle-enrollment="${e.class_id}|${e.student_id}">${e.is_active?'재원 중':'비활성'}</button></div></div>`}).join('')||'<div class="empty-row">반에 배정된 학생이 없습니다.</div>';
  $$('[data-toggle-class]').forEach(btn=>btn.onclick=()=>toggleClass(btn.dataset.toggleClass));$$('[data-toggle-enrollment]').forEach(btn=>btn.onclick=()=>toggleEnrollment(btn.dataset.toggleEnrollment));$$('[data-edit-student]').forEach(btn=>btn.onclick=()=>editStudentName(btn.dataset.editStudent));$$('[data-toggle-teacher]').forEach(btn=>btn.onclick=()=>toggleTeacher(btn.dataset.toggleTeacher));$$('[data-edit-teacher]').forEach(btn=>btn.onclick=()=>editTeacherName(btn.dataset.editTeacher));
}
$('#adminTeacherSelect').addEventListener('change',event=>{const selected=adminState.teacherAssignments.filter(a=>a.teacher_id===event.target.value).map(a=>a.class_id);$('#adminTeacherClasses').innerHTML=classCheckboxes(adminState.classes.filter(c=>c.is_active),'adminTeacherClass',selected)});
$('#classForm').addEventListener('submit',async event=>{
  event.preventDefault();const name=$('#adminClassName').value.trim(),school_year=Number($('#adminClassYear').value);if(!name)return;
  setBusy($('#saveClassBtn'),true,'저장 중...');const {error}=await cloudClient.from('classes').insert({academy_id:cloudProfile.academy_id,name,school_year});setBusy($('#saveClassBtn'),false,'반 저장');
  if(error)return toast(error.code==='23505'?'같은 학년도의 반 이름이 이미 있습니다.':`반 저장 실패: ${error.message}`);event.target.reset();toast('새 반을 등록했습니다.');await loadAdminData();
});
$('#studentAssignForm').addEventListener('submit',async event=>{
  event.preventDefault();const class_id=$('#adminClassSelect').value,student_id=$('#adminStudentSelect').value,student_number=$('#adminStudentNumber').value.trim()||null;
  setBusy($('#assignStudentBtn'),true,'배정 중...');const {error}=await cloudClient.from('class_students').upsert({class_id,student_id,student_number,is_active:true},{onConflict:'class_id,student_id'});setBusy($('#assignStudentBtn'),false,'학생 배정');
  if(error)return toast(`학생 배정 실패: ${error.message}`);event.target.reset();toast('학생을 반에 배정했습니다.');await loadAdminData();
});
$('#studentAccountForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const display_name=$('#newStudentName').value.trim(),email=$('#newStudentEmail').value.trim().toLowerCase(),password=$('#newStudentPassword').value,class_id=$('#newStudentClass').value,student_number=$('#newStudentNumber').value.trim()||null;
  if(password.length<8)return toast('임시 비밀번호는 8자 이상으로 입력해 주세요.');
  const button=$('#createStudentBtn');setBusy(button,true,'계정 만드는 중...');
  const configuredUrl=String(cloudConfig.supabaseUrl).trim().replace(/^['\"]|['\"]$/g,'');
  const signupClient=window.supabase.createClient(new URL(configuredUrl).origin,cloudConfig.supabaseAnonKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const {data:signup,error:signupError}=await signupClient.auth.signUp({email,password,options:{data:{display_name,role:'student'}}});
  if(signupError||!signup.user){setBusy(button,false,'계정 발급');return toast(`계정 생성 실패: ${signupError?.message||'사용자 정보가 없습니다.'}`)}
  if(Array.isArray(signup.user.identities)&&signup.user.identities.length===0){setBusy(button,false,'계정 발급');return toast('이미 등록된 이메일입니다. 기존 학생 계정을 반에 배정해 주세요.')}
  const {error:profileError}=await cloudClient.from('profiles').insert({id:signup.user.id,academy_id:cloudProfile.academy_id,role:'student',display_name,is_active:true});
  if(profileError){setBusy(button,false,'계정 발급');return toast(`학생 정보 저장 실패: ${profileError.message}`)}
  const {error:classError}=await cloudClient.from('class_students').insert({class_id,student_id:signup.user.id,student_number,is_active:true});setBusy(button,false,'계정 발급');
  if(classError)return toast(`계정은 생성됐지만 반 배정에 실패했습니다: ${classError.message}`);
  event.target.reset();toast(signup.session?'학생 계정을 발급했습니다. 바로 로그인할 수 있습니다.':'학생 계정을 발급했습니다. 확인 메일 승인 후 로그인할 수 있습니다.');await loadAdminData();
});
$('#teacherAccountForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const display_name=$('#newTeacherName').value.trim(),email=$('#newTeacherEmail').value.trim().toLowerCase(),password=$('#newTeacherPassword').value,classIds=checkedValues('newTeacherClass');
  if(password.length<8)return toast('임시 비밀번호는 8자 이상으로 입력해 주세요.');
  if(!classIds.length)return toast('담당 반을 한 개 이상 선택해 주세요.');
  const button=$('#createTeacherBtn');setBusy(button,true,'계정 만드는 중...');
  const configuredUrl=String(cloudConfig.supabaseUrl).trim().replace(/^['\"]|['\"]$/g,'');
  const signupClient=window.supabase.createClient(new URL(configuredUrl).origin,cloudConfig.supabaseAnonKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const {data:signup,error:signupError}=await signupClient.auth.signUp({email,password,options:{data:{display_name,role:'teacher'}}});
  if(signupError||!signup.user){setBusy(button,false,'선생님 계정 발급');return toast(`계정 생성 실패: ${signupError?.message||'사용자 정보가 없습니다.'}`)}
  if(Array.isArray(signup.user.identities)&&signup.user.identities.length===0){setBusy(button,false,'선생님 계정 발급');return toast('이미 등록된 이메일입니다. 기존 계정을 확인해 주세요.')}
  const {error:profileError}=await cloudClient.from('profiles').insert({id:signup.user.id,academy_id:cloudProfile.academy_id,role:'teacher',display_name,is_active:true});
  if(profileError){setBusy(button,false,'선생님 계정 발급');return toast(`선생님 정보 저장 실패: ${profileError.message}`)}
  const {error:classError}=await cloudClient.from('class_teachers').insert(classIds.map(class_id=>({class_id,teacher_id:signup.user.id})));setBusy(button,false,'선생님 계정 발급');
  if(classError)return toast(`계정은 생성됐지만 담당 반 배정에 실패했습니다: ${classError.message}`);
  event.target.reset();toast(signup.session?'선생님 계정을 발급했습니다. 바로 로그인할 수 있습니다.':'선생님 계정을 발급했습니다. 확인 메일 승인 후 로그인할 수 있습니다.');await loadAdminData();
});
$('#teacherAssignForm').addEventListener('submit',async event=>{
  event.preventDefault();const teacher_id=$('#adminTeacherSelect').value,classIds=checkedValues('adminTeacherClass');
  if(!teacher_id)return toast('선생님을 선택해 주세요.');
  if(!classIds.length)return toast('담당 반을 한 개 이상 선택해 주세요.');
  const current=adminState.teacherAssignments.filter(a=>a.teacher_id===teacher_id).map(a=>a.class_id),add=classIds.filter(id=>!current.includes(id)),remove=current.filter(id=>!classIds.includes(id));
  const button=$('#assignTeacherBtn');setBusy(button,true,'저장 중...');
  if(add.length){const {error}=await cloudClient.from('class_teachers').insert(add.map(class_id=>({class_id,teacher_id})));if(error){setBusy(button,false,'담당 반 저장');return toast(`담당 반 추가 실패: ${error.message}`)}}
  if(remove.length){const {error}=await cloudClient.from('class_teachers').delete().eq('teacher_id',teacher_id).in('class_id',remove);if(error){setBusy(button,false,'담당 반 저장');return toast(`담당 반 해제 실패: ${error.message}`)}}
  setBusy(button,false,'담당 반 저장');toast('담당 반을 저장했습니다.');await loadAdminData();
});
async function toggleClass(id){const item=adminState.classes.find(c=>c.id===id);if(!item)return;const {error}=await cloudClient.from('classes').update({is_active:!item.is_active}).eq('id',id);if(error)return toast(`변경 실패: ${error.message}`);toast('반 상태를 변경했습니다.');await loadAdminData()}
async function toggleEnrollment(key){const [class_id,student_id]=key.split('|'),item=adminState.enrollments.find(e=>e.class_id===class_id&&e.student_id===student_id);if(!item)return;const {error}=await cloudClient.from('class_students').update({is_active:!item.is_active}).eq('class_id',class_id).eq('student_id',student_id);if(error)return toast(`변경 실패: ${error.message}`);toast('학생 상태를 변경했습니다.');await loadAdminData()}
async function editStudentName(id){const student=adminState.students.find(s=>s.id===id),display_name=prompt('학생 이름을 입력하세요.',student?.display_name||'')?.trim();if(!display_name||display_name===student.display_name)return;const {error}=await cloudClient.from('profiles').update({display_name}).eq('id',id);if(error)return toast(`이름 수정 실패: ${error.message}`);toast('학생 이름을 수정했습니다.');await loadAdminData()}
async function toggleTeacher(id){const teacher=adminState.teachers.find(t=>t.id===id);if(!teacher)return;const {error}=await cloudClient.from('profiles').update({is_active:!teacher.is_active}).eq('id',id);if(error)return toast(`선생님 상태 변경 실패: ${error.message}`);toast('선생님 계정 상태를 변경했습니다.');await loadAdminData()}
async function editTeacherName(id){const teacher=adminState.teachers.find(t=>t.id===id),display_name=prompt('선생님 이름을 입력하세요.',teacher?.display_name||'')?.trim();if(!display_name||display_name===teacher.display_name)return;const {error}=await cloudClient.from('profiles').update({display_name}).eq('id',id);if(error)return toast(`이름 수정 실패: ${error.message}`);toast('선생님 이름을 수정했습니다.');await loadAdminData()}
function setBusy(button,busy,label){button.disabled=busy;button.textContent=label}
initCloudMode();
// Review and assigned exams. Official student grades always come from submit_attempt.
let reviewResult = null;
let submittingAttempt = false;
const originalFinishTest = finishTest;
const originalFilterResults = filterResults;

function beginQuestions(questions, current) {
  if (!questions.length) return toast('출제할 단어가 없습니다.');
  state.questions = questions;
  state.current = current;
  state.answers = [];
  state.index = 0;
  $('#testStudent').textContent = `${current.className} · ${current.student}`;
  $('#testBook').textContent = current.bookName;
  $('#nextQuestionBtn').disabled = false;
  document.querySelector('#submitAgainBtn')?.remove();
  show('test');
  renderQuestion();
}

function reviewAnswers(result) {
  return result.answers || result.wrong || [];
}

function showSavedResult(result) {
  reviewResult = result;
  const answers = reviewAnswers(result);
  const wrong = answers.filter(a => !a.isCorrect);
  state.lastWrong = wrong.map(a => ({...a.word, questionType:a.type || a.word.questionType || result.type}));
  $('#scoreValue').textContent = result.score;
  $('#scoreCircle').style.background = `conic-gradient(var(--blue) ${result.score}%,#e9eef4 0)`;
  $('#scoreMessage').textContent = result.isPractice ? '오답 복습 결과' : '시험 결과';
  $('#scoreDetail').textContent = `${result.student} · ${result.bookName} · ${result.total}문제 중 ${result.correct}문제 정답`;
  $('#wrongAnswers').innerHTML = `<h3>${result.answers ? '전체 답안 · 오답 확인' : '틀린 단어'}</h3>` +
    (!result.answers ? '<p>이전 버전 기록은 틀린 단어만 보관되어 있습니다.</p>' : '') +
    answers.map(a => `<div class="wrong-item"><div><strong>${a.isCorrect ? '✓' : '✕'} ${escapeHtml(a.word.english)}</strong><small>${escapeHtml(a.word.korean)}</small></div><div>내 답: ${escapeHtml(a.answer)}<br>정답: ${escapeHtml(a.correct)}</div></div>`).join('') +
    (!wrong.length ? '<p>틀린 문제가 없습니다!</p>' : '') +
    (result.isPractice ? '<p>복습 결과이며 원래 시험 점수는 바뀌지 않습니다.</p>' : '');
  $('#retryWrongBtn').classList.toggle('hidden', !wrong.length);
  show('score');
}

$('#retryWrongBtn').onclick = () => {
  if (!reviewResult) return;
  const words = reviewAnswers(reviewResult).filter(a => !a.isCorrect)
    .map(a => ({...a.word, questionType:a.type || a.word.questionType || reviewResult.type}));
  // No setup form dependency and no question-count cap, including mixed exams.
  beginQuestions(shuffle(words), {
    className:reviewResult.className, student:reviewResult.student,
    bookId:reviewResult.bookId, bookName:reviewResult.bookName,
    type:reviewResult.type, isPractice:true,
    sourceResultId:reviewResult.id,
    studentOwnerId:cloudProfile?.role === 'student' ? cloudProfile.id : null
  });
};

function studentPracticeKey() { return `tg_vocab_practice_${cloudProfile.id}`; }

finishTest = function() {
  if (state.current.cloudAttemptId) return submitCloudAttempt();
  if (state.current.studentOwnerId) {
    if (cloudProfile?.id !== state.current.studentOwnerId) return toast('다시 로그인해 주세요.');
    const answers = state.answers.map(a => ({...a, word:{...a.word}}));
    const correct = answers.filter(a => a.isCorrect).length;
    const result = {...state.current, id:Date.now().toString(), date:new Date().toISOString(),
      answers, wrong:answers.filter(a => !a.isCorrect), correct, total:answers.length,
      score:Math.round(correct / answers.length * 100)};
    const history = load(studentPracticeKey(), []);
    history.unshift(result);
    save(studentPracticeKey(), history);
    showSavedResult(result);
    return;
  }
  originalFinishTest();
  const result = state.results[0];
  result.answers = state.answers.map(a => ({...a, word:{...a.word}}));
  save(STORE.results, state.results);
  showSavedResult(result);
};

filterResults = function() {
  originalFilterResults();
  const klass = $('#resultClass').value, query = normalize($('#resultSearch').value);
  const rows = state.results.filter(r => (klass === 'all' || r.className === klass) && (!query || normalize(r.student).includes(query)));
  document.querySelectorAll('#resultsList .result-item').forEach((row, index) => {
    const button = document.createElement('button');
    button.className = 'secondary';
    button.textContent = rows[index].isPractice ? '복습 결과·오답' : '답안·오답 보기';
    button.onclick = () => showSavedResult(rows[index]);
    row.append(button);
  });
};
// Existing listeners held the old function value.
$('#resultClass').onchange = filterResults;
$('#resultSearch').oninput = filterResults;

function checked(response) {
  if (response.error) throw new Error(response.error.message);
  return response.data || [];
}

async function fetchTestWords(testId) {
  const questions = await readAllRows(() => cloudClient.from('test_questions').select('*').eq('test_id', testId).order('position'));
  if (!questions.length) return [];
  const words = checked(await cloudClient.from('vocabulary_words').select('id,english,korean,accepted_answers').in('id', questions.map(q => q.word_id)));
  return questions.map(q => {
    const word = words.find(w => w.id === q.word_id);
    if (!word) throw new Error('시험 단어를 불러오지 못했습니다. 선생님께 문의해 주세요.');
    return {english:word.english, korean:word.korean, acceptedAnswers:word.accepted_answers, questionId:q.id,
      ...(q.question_type ? {questionType:q.question_type.replaceAll('_','-')} : {})};
  });
}

async function openStudentAttempt(test, attempt, className, bookName) {
  const words = await fetchTestWords(test.id);
  const saved = checked(await cloudClient.from('attempt_answers').select('question_id,submitted_answer,correct_answer_snapshot,is_correct').eq('attempt_id', attempt.id));
  const type = test.test_type.replaceAll('_', '-');
  const answers = saved.map(a => {
    const word = words.find(w => w.questionId === a.question_id);
    if (!word) throw new Error('저장된 답안의 단어를 찾을 수 없습니다.');
    const questionType = word.questionType || type;
    return {word:{...word, questionType}, answer:a.submitted_answer, correct:a.correct_answer_snapshot, isCorrect:a.is_correct, type:questionType};
  });
  showSavedResult({id:attempt.id, date:attempt.submitted_at, student:cloudProfile.display_name,
    className, bookId:test.book_id, bookName, type, answers,
    score:attempt.score, correct:attempt.correct_count, total:attempt.total_count});
}

async function startStudentAttempt(test, className, bookName, existingAttempt) {
  // Check current assignment and availability again, rather than trusting a stale list.
  const fresh = checked(await cloudClient.from('tests').select('*').eq('id', test.id).single());
  const now = Date.now();
  if (!fresh.is_published || (fresh.available_from && new Date(fresh.available_from).getTime() > now) ||
      (fresh.available_until && new Date(fresh.available_until).getTime() < now)) throw new Error('현재 응시할 수 없는 시험입니다.');
  const words = await fetchTestWords(test.id);
  if (words.length !== fresh.question_count) throw new Error('등록된 시험 문항 수가 맞지 않습니다. 선생님께 문의해 주세요.');
  let attempt = existingAttempt;
  if (!attempt || attempt.status !== 'in_progress') {
    const previous = checked(await cloudClient.from('test_attempts').select('attempt_number').eq('test_id', test.id).eq('student_id', cloudProfile.id).order('attempt_number', {ascending:false}).limit(1));
    attempt = checked(await cloudClient.from('test_attempts').insert({test_id:test.id, student_id:cloudProfile.id,
      attempt_number:(previous[0]?.attempt_number || 0) + 1}).select('id,status').single());
  }
  beginQuestions(words, {className, student:cloudProfile.display_name, bookId:test.book_id, bookName,
    type:fresh.test_type.replaceAll('_', '-'), cloudAttemptId:attempt.id, studentOwnerId:cloudProfile.id});
}

async function submitCloudAttempt() {
  if (submittingAttempt) return;
  if (cloudProfile?.id !== state.current.studentOwnerId) return toast('다시 로그인해 주세요.');
  submittingAttempt = true;
  $('#nextQuestionBtn').disabled = true;
  $('#nextQuestionBtn').textContent = '채점·저장 중...';
  document.querySelector('#submitAgainBtn')?.remove();
  try {
    // If the response was lost after a successful save, recover without resubmitting.
    let attempt = checked(await cloudClient.from('test_attempts').select('id,status,score,correct_count,total_count').eq('id', state.current.cloudAttemptId).single());
    if (attempt.status !== 'submitted') {
      checked(await cloudClient.rpc('submit_attempt', {p_attempt_id:attempt.id,
        p_answers:state.answers.map(a => ({question_id:a.word.questionId, answer:a.answer}))}));
      attempt = checked(await cloudClient.from('test_attempts').select('id,status,score,correct_count,total_count').eq('id', attempt.id).single());
    }
    const saved = checked(await cloudClient.from('attempt_answers').select('question_id,submitted_answer,correct_answer_snapshot,is_correct').eq('attempt_id', attempt.id));
    if (saved.length !== state.answers.length) throw new Error('저장된 답안을 모두 불러오지 못했습니다. 다시 시도해 주세요.');
    const answers = state.answers.map(a => {
      const row = saved.find(item => item.question_id === a.word.questionId);
      if (!row) throw new Error('저장된 답안을 확인하지 못했습니다.');
      return {...a, answer:row.submitted_answer, isCorrect:row.is_correct, correct:row.correct_answer_snapshot};
    });
    showSavedResult({...state.current, id:attempt.id, answers,
      score:attempt.score, correct:attempt.correct_count, total:attempt.total_count});
  } catch (error) {
    toast(`채점·저장 실패: ${error.message}`);
    const button = document.createElement('button');
    button.id = 'submitAgainBtn'; button.className = 'primary';
    button.textContent = '답안 다시 저장하기'; button.onclick = submitCloudAttempt;
    $('#nextQuestionBtn').after(button);
  } finally { submittingAttempt = false; }
}

loadStudentTests = async function() {
  if (cloudProfile?.role !== 'student') return;
  const owner = cloudProfile.id;
  const list = $('#studentTestList');
  list.innerHTML = '<p>시험과 지난 답안을 불러오는 중...</p>';
  try {
    const assignments = await readAllRows(() => cloudClient.from('test_assignments').select('test_id,assigned_at').eq('student_id', owner).order('assigned_at',{ascending:false}).order('test_id'));
    const ids = [...new Set(assignments.map(a => a.test_id))];
    list.innerHTML = '';
    if (ids.length) {
      const tests = checked(await cloudClient.from('tests').select('*').in('id', ids));
      if (tests.length !== ids.length) throw new Error(`배정 ${ids.length}건 중 시험 ${tests.length}건만 조회됐습니다. Supabase 시험 권한 설정을 확인해 주세요.`);
      const attempts = await readAllRows(() => cloudClient.from('test_attempts').select('id,test_id,status,score,correct_count,total_count,submitted_at,attempt_number').eq('student_id', owner).in('test_id', ids).order('attempt_number', {ascending:false}).order('id'));
      const classIds=[...new Set(tests.map(test=>test.class_id))],bookIds=[...new Set(tests.map(test=>test.book_id))];
      const [classes,books]=await Promise.all([
        checked(await cloudClient.from('classes').select('id,name').in('id',classIds)),
        checked(await cloudClient.from('vocabulary_books').select('id,title').in('id',bookIds))
      ]);
      if(cloudProfile?.id!==owner||cloudProfile?.role!=='student')return;
      for (const test of tests) {
        const klass = classes.find(item=>item.id===test.class_id);
        const book = books.find(item=>item.id===test.book_id);
        const row = document.createElement('div'); row.className = 'card form-card';
        row.innerHTML = `<h3>${escapeHtml(test.title)}</h3><p>${escapeHtml(klass?.name||'배정 반')} · ${escapeHtml(book?.title||'단어장')} · ${test.question_count}문제</p>`;
        const available = test.is_published && (!test.available_from || new Date(test.available_from).getTime() <= Date.now()) && (!test.available_until || new Date(test.available_until).getTime() >= Date.now());
        const history = attempts.filter(a => a.test_id === test.id);
        const pending = history.find(a => a.status === 'in_progress');
        if (available) addStudentButton(row, pending ? '시험 다시 시작' : '시험 보기', () => startStudentAttempt(test, klass?.name||'배정 반', book?.title||'단어장', pending));
        else row.insertAdjacentHTML('beforeend', '<p>현재 응시 기간이 아닙니다.</p>');
        history.filter(a => a.status === 'submitted').forEach(a => addStudentButton(row,
          `${a.attempt_number}회 · ${a.score}점 · 답안·오답 보기`, () => openStudentAttempt(test, a, klass?.name||'배정 반', book?.title||'단어장')));
        list.append(row);
      }
    }
    const practices = load(studentPracticeKey(), []);
    if (practices.length) {
      const heading = document.createElement('h3'); heading.textContent = '이 기기의 오답 복습 기록'; list.append(heading);
      practices.forEach(result => addStudentButton(list, `${result.bookName} · ${result.score}점 · ${new Date(result.date).toLocaleDateString('ko-KR')}`, () => showSavedResult(result)));
    }
    if (!ids.length && !practices.length) list.innerHTML = '<p>아직 배정된 시험이 없습니다.</p>';
  } catch (error) {
    if(cloudProfile?.id!==owner)return;
    list.innerHTML = `<div class="card tip"><strong>시험을 불러오지 못했습니다.</strong><p>${escapeHtml(error.message)}</p></div>`;
    addStudentButton(list,'시험 목록 다시 불러오기',loadStudentTests);
  }
};

function addStudentButton(parent, label, action) {
  const button = document.createElement('button'); button.className = 'secondary'; button.textContent = label;
  button.onclick = async () => {
    button.disabled = true;
    try { await action(); } catch (error) { toast(error.message); }
    finally { button.disabled = false; }
  };
  parent.append(button);
}

// Staff shared results. Keep server data out of shared browser result storage.
const staffResultsState = {generation:0, owner:null, classes:[], students:[], rows:[], offset:0, more:false};
const localRenderResults = renderResults;
function isStaff() { return !!cloudClient && ['admin','teacher'].includes(cloudProfile?.role); }
renderResults = function() {
  const staff = isStaff();
  $('#resultSource').disabled = !staff;
  if (!staff) $('#resultSource').value = 'local';
  const shared = staff && $('#resultSource').value === 'cloud';
  $('#staffResults').classList.toggle('hidden', !shared);
  $('#localResults').classList.toggle('hidden', shared);
  $('#resultsDescription').textContent = shared ? '학생 계정으로 제출한 시험입니다. 관리자는 학원 전체, 선생님은 담당 반을 조회합니다.' : '이 브라우저에 저장된 시험 기록입니다.';
  if (shared) loadStaffResults();
  else { staffResultsState.generation++; localRenderResults(); }
};
$('#resultSource').onchange = () => renderResults();
$('#staffResultFind').onclick = () => loadStaffResults();
$('#staffResultSearch').onkeydown = event => { if (event.key === 'Enter') loadStaffResults(); };
$('#staffResultClass').onchange = () => loadStaffResults();
$('#staffResultMore').onclick = () => loadStaffResults(true);

async function readAllRows(makeQuery) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const page = checked(await makeQuery().range(offset, offset + 499));
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}

function makeStaffAttemptsQuery(profile, classIds, studentIds, offset) {
  let query = cloudClient.from('test_attempts')
    .select('id,test_id,student_id,attempt_number,score,correct_count,total_count,submitted_at,tests!inner(id,title,class_id,book_id,test_type,academy_id)')
    .eq('status','submitted').eq('tests.academy_id',profile.academy_id)
    .in('tests.class_id',classIds);
  if (studentIds) query = query.in('student_id',studentIds);
  return query.order('submitted_at',{ascending:false}).order('id').range(offset,offset + 49);
}

async function loadStaffResults(more = false) {
  if (!isStaff()) return;
  const profile = {...cloudProfile};
  const generation = ++staffResultsState.generation;
  const current = () => generation === staffResultsState.generation && cloudProfile?.id === profile.id && isStaff();
  $('#staffResultFind').disabled = true;
  $('#staffResultMore').disabled = true;
  $('#staffResultExport').disabled = true;
  $('#staffResultStatus').textContent = '성적을 불러오는 중...';
  try {
    if (!more || staffResultsState.owner !== profile.id) {
      more = false;
      staffResultsState.rows = []; staffResultsState.offset = 0; staffResultsState.more = false;
      $('#staffResultList').innerHTML = '';
      $('#staffResultMore').classList.add('hidden');
      let allowed = null;
      if (profile.role === 'teacher') {
        const assignments = await readAllRows(() => cloudClient.from('class_teachers').select('class_id').eq('teacher_id',profile.id).order('class_id'));
        allowed = assignments.map(a => a.class_id);
      }
      const classes = allowed && !allowed.length ? [] : await readAllRows(() => {
        let query = cloudClient.from('classes').select('id,name,school_year').eq('academy_id',profile.academy_id);
        if (allowed) query = query.in('id',allowed);
        return query.order('id');
      });
      const students = classes.length ? await readAllRows(() => cloudClient.from('profiles').select('id,display_name').eq('academy_id',profile.academy_id).eq('role','student').order('id')) : [];
      if (!current()) return;
      staffResultsState.owner = profile.id;
      staffResultsState.classes = classes; staffResultsState.students = students;
      const selected = $('#staffResultClass').value;
      $('#staffResultClass').innerHTML = '<option value="all">전체 반</option>' + classes.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)} (${c.school_year})</option>`).join('');
      $('#staffResultClass').value = classes.some(c => c.id === selected) ? selected : 'all';
      staffResultsState.filterClass = $('#staffResultClass').value;
      staffResultsState.filterName = normalize($('#staffResultSearch').value);
    }
    const classIds = staffResultsState.classes.filter(c => staffResultsState.filterClass === 'all' || c.id === staffResultsState.filterClass).map(c => c.id);
    const studentIds = staffResultsState.filterName ? staffResultsState.students.filter(s => normalize(s.display_name).includes(staffResultsState.filterName)).map(s => s.id) : null;
    if (!classIds.length || (studentIds && !studentIds.length)) {
      $('#staffResultStatus').textContent = !classIds.length ? (profile.role === 'teacher' ? '담당 반이 배정되지 않았습니다. 관리자에게 담당 반 배정을 요청해 주세요.' : '등록된 반이 없습니다.') : '이름에 맞는 학생이 없습니다.';
      return;
    }
    const page = checked(await makeStaffAttemptsQuery(profile,classIds,studentIds,staffResultsState.offset));
    if (!current()) return;
    staffResultsState.rows.push(...page);
    staffResultsState.offset += page.length;
    staffResultsState.more = page.length === 50;
    renderStaffRows();
  } catch (error) {
    if (current()) $('#staffResultStatus').textContent = `성적 조회 실패: ${error.message} · 조회·새로고침을 눌러 다시 시도해 주세요.`;
  } finally {
    if (current()) {
      $('#staffResultFind').disabled = false;
      $('#staffResultMore').disabled = false;
      $('#staffResultExport').disabled = !staffResultsState.rows.length;
    }
  }
}

function staffRowInfo(row) {
  const test = row.tests;
  return {test, student:staffResultsState.students.find(s => s.id === row.student_id)?.display_name || '이름 조회 불가',
    className:staffResultsState.classes.find(c => c.id === test.class_id)?.name || '반 조회 불가'};
}

function renderStaffRows() {
  const rows = staffResultsState.rows;
  $('#staffResultStatus').textContent = rows.length ? `${rows.length}건 조회 · ${staffResultsState.more ? '더 보기를 누르면 이전 기록을 불러옵니다.' : '조회 완료'}` : '제출된 시험 결과가 없습니다.';
  $('#staffResultMore').classList.toggle('hidden',!staffResultsState.more);
  $('#staffResultList').innerHTML = '';
  rows.forEach(row => {
    const {test,student,className} = staffRowInfo(row);
    const card = document.createElement('div'); card.className = 'card form-card';
    card.innerHTML = `<strong>${escapeHtml(student)} · ${escapeHtml(className)}</strong><span>${escapeHtml(test.title)} · ${row.attempt_number}회</span><small>${new Date(row.submitted_at).toLocaleString('ko-KR')}</small><b>${row.score}점 · ${row.total_count}문제 중 ${row.correct_count}문제 정답</b>`;
    addStudentButton(card,'답안·오답 보기',() => openStaffResult(row));
    $('#staffResultList').append(card);
  });
}

async function openStaffResult(row) {
  if (!isStaff() || staffResultsState.owner !== cloudProfile.id) return;
  const owner = cloudProfile.id;
  const {test,student,className} = staffRowInfo(row);
  const saved = checked(await cloudClient.from('attempt_answers').select('question_id,submitted_answer,correct_answer_snapshot,is_correct').eq('attempt_id',row.id));
  const words = await fetchTestWords(test.id);
  if (cloudProfile?.id !== owner || !isStaff()) return;
  if (saved.length !== row.total_count) throw new Error('전체 답안을 불러오지 못했습니다. 다시 조회해 주세요.');
  const type = test.test_type.replaceAll('_','-');
  const answers = saved.map(a => {
    const word = words.find(w => w.questionId === a.question_id);
    if (!word) throw new Error('답안의 단어를 찾을 수 없습니다.');
    return {word, type:word.questionType || type, answer:a.submitted_answer, correct:a.correct_answer_snapshot,isCorrect:a.is_correct};
  });
  showSavedResult({id:row.id, student, className, bookId:test.book_id, bookName:test.title,
    score:row.score,correct:row.correct_count,total:row.total_count,type,answers});
  $('#retryWrongBtn').classList.add('hidden');
  let back = $('#staffResultsBack');
  if (!back) {
    back = document.createElement('button'); back.id = 'staffResultsBack'; back.className = 'secondary full';
    back.textContent = '학생 성적 목록으로';
    back.onclick = () => { back.remove(); show('results'); };
  }
  $('#wrongAnswers').append(back);
}

function safeCsvCell(value) {
  const text = String(value ?? '');
  return '"' + (/^[\s]*[=+@-]/.test(text) ? "'" + text : text).replaceAll('"','""') + '"';
}
$('#staffResultExport').onclick = () => {
  if (!isStaff() || staffResultsState.owner !== cloudProfile.id || !staffResultsState.rows.length) return;
  const data = [['시험일','반','학생','시험명','응시회차','점수','정답수','문제수'], ...staffResultsState.rows.map(row => {
    const {test,student,className} = staffRowInfo(row);
    return [new Date(row.submitted_at).toLocaleString('ko-KR'),className,student,test.title,row.attempt_number,row.score,row.correct_count,row.total_count];
  })];
  const url = URL.createObjectURL(new Blob(['\ufeff' + data.map(row => row.map(safeCsvCell).join(',')).join('\n')],{type:'text/csv;charset=utf-8'}));
  const link = document.createElement('a'); link.href = url; link.download = 'TG_조회된_학생성적.csv'; link.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
};

// Create and assign exams using the existing protected tables.
const examBuilder = {generation:0, rosterGeneration:0, bookGeneration:0, listGeneration:0,
  classes:[], books:[], students:[], words:[], mixed:false, multipleMeanings:false, busy:false, owner:null};
const originalRoleMenus = applyRoleMenus;
applyRoleMenus = function(role) {
  originalRoleMenus(role);
  $('#assignExamMenuBtn').classList.toggle('hidden', !['admin','teacher'].includes(role));
};
const showBeforeAssignments = show;
show = function(view) {
  if (view === 'assignExam' && !isStaff()) return toast('관리자와 선생님만 이용할 수 있습니다.');
  showBeforeAssignments(view);
  if (view === 'assignExam') loadExamBuilder();
};
if (cloudProfile) applyRoleMenus(cloudProfile.role);

async function staffAssignableClasses(profile) {
  let ids = null;
  if (profile.role === 'teacher') {
    ids = (await readAllRows(() => cloudClient.from('class_teachers').select('class_id').eq('teacher_id',profile.id).order('class_id'))).map(c => c.class_id);
    if (!ids.length) return [];
  }
  return readAllRows(() => {
    let query = cloudClient.from('classes').select('id,name,school_year').eq('academy_id',profile.academy_id).eq('is_active',true);
    if (ids) query = query.in('id',ids);
    return query.order('id');
  });
}

async function loadExamBuilder() {
  if (!isStaff() || examBuilder.busy) return;
  const profile = {...cloudProfile}, generation = ++examBuilder.generation;
  examBuilder.owner = profile.id;
  examBuilder.students = []; examBuilder.words = [];
  $('#assignExamSubmit').disabled = true;
  $('#assignExamStatus').textContent = '반과 단어장을 불러오는 중...';
  $('#assignExamStudents').innerHTML = '';
  try {
    const classes = await staffAssignableClasses(profile);
    const books = await readAllRows(() => cloudClient.from('vocabulary_books').select('id,title').eq('academy_id',profile.academy_id).order('id'));
    const features = await cloudClient.rpc('tg_exam_features');
    if (cloudProfile?.id !== profile.id || generation !== examBuilder.generation) return;
    examBuilder.classes = classes; examBuilder.books = books;
    examBuilder.mixed = !features.error && features.data?.mixed_questions === true;
    examBuilder.multipleMeanings = !features.error && features.data?.duplicate_meanings === true;
    const oldClass = $('#assignExamClass').value, oldBook = $('#assignExamBook').value;
    $('#assignExamClass').innerHTML = '<option value="">반을 선택하세요</option>' + classes.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)} (${c.school_year})</option>`).join('');
    $('#assignExamBook').innerHTML = '<option value="">단어장을 선택하세요</option>' + books.map(b => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.title)}</option>`).join('');
    if (classes.some(c => c.id === oldClass)) $('#assignExamClass').value = oldClass;
    if (books.some(b => b.id === oldBook)) $('#assignExamBook').value = oldBook;
    $('#assignExamMixedChoice').disabled = !examBuilder.mixed;
    $('#assignExamMixedChoice').textContent = examBuilder.mixed ? '혼합 시험 · 뜻 쓰기 + 뜻을 보고 스펠링 쓰기' : '혼합 시험 · 서버 설정 필요';
    if (!examBuilder.mixed && $('#assignExamType').value === 'mixed') $('#assignExamType').value = 'en_ko';
    updateExamType();
    $('#assignExamStatus').textContent = !classes.length ? '배정할 반이 없습니다. 반 등록 또는 선생님 담당 반 배정을 먼저 해 주세요.' : !books.length ? '공유 단어장이 없습니다. 엑셀 단어 등록에서 단어장을 먼저 저장해 주세요.' : `반을 선택하면 해당 반에 등록된 학생이 표시됩니다.${examBuilder.multipleMeanings?' 같은 철자의 여러 뜻을 모두 정답으로 인정합니다.':' 같은 철자의 중복 출제는 방지됩니다.'}`;
    $('#assignExamSubmit').disabled = !classes.length || !books.length;
    await Promise.all([loadExamRoster(),loadExamBook(),loadAssignedExams()]);
  } catch (error) {
    if (generation === examBuilder.generation) $('#assignExamStatus').textContent = `불러오기 실패: ${error.message}`;
  }
}

async function fetchClassRoster(classId, academyId) {
  const memberships = await readAllRows(() => cloudClient.from('class_students').select('student_id,student_number').eq('class_id',classId).eq('is_active',true).order('student_id'));
  const students = [];
  for (let offset = 0; offset < memberships.length; offset += 200) {
    const ids = memberships.slice(offset,offset + 200).map(m => m.student_id);
    const page = checked(await cloudClient.from('profiles').select('id,display_name').eq('academy_id',academyId).eq('role','student').eq('is_active',true).in('id',ids));
    students.push(...page);
  }
  return students.map(s => ({...s, studentNumber:memberships.find(m => m.student_id === s.id)?.student_number})).sort((a,b) => a.display_name.localeCompare(b.display_name,'ko'));
}

async function loadExamRoster() {
  const generation = ++examBuilder.rosterGeneration, owner = cloudProfile?.id;
  const classId = $('#assignExamClass').value;
  examBuilder.students = [];
  $('#assignExamStudents').innerHTML = '';
  $('#assignExamStudentCount').textContent = classId ? '학생을 불러오는 중...' : '반을 먼저 선택하세요.';
  if (!isStaff() || !examBuilder.classes.some(c => c.id === classId)) return;
  try {
    const students = await fetchClassRoster(classId,cloudProfile.academy_id);
    if (generation !== examBuilder.rosterGeneration || cloudProfile?.id !== owner) return;
    examBuilder.students = students;
    $('#assignExamStudents').innerHTML = students.map(s => `<label><input type="checkbox" name="examStudent" value="${escapeHtml(s.id)}" /><span>${escapeHtml(s.display_name)}${s.studentNumber ? ` · ${escapeHtml(s.studentNumber)}번` : ''}</span></label>`).join('');
    $$('input[name="examStudent"]').forEach(input => input.onchange = updateExamStudentCount);
    updateExamStudentCount();
  } catch (error) {
    if (generation === examBuilder.rosterGeneration) $('#assignExamStudentCount').textContent = `학생 조회 실패: ${error.message}`;
  }
}
function selectedExamStudents() { return Array.from($$('input[name="examStudent"]:checked')).map(input => input.value); }
function updateExamStudentCount() {
  $('#assignExamStudentCount').textContent = examBuilder.students.length ? `${examBuilder.students.length}명 중 ${selectedExamStudents().length}명 선택` : '이 반에 배정된 활성 학생 계정이 없습니다. 학원 관리에서 학생을 먼저 배정해 주세요.';
}
$('#assignExamAll').onclick = () => { $$('input[name="examStudent"]').forEach(input => input.checked = true); updateExamStudentCount(); };
$('#assignExamNone').onclick = () => { $$('input[name="examStudent"]').forEach(input => input.checked = false); updateExamStudentCount(); };
$('#assignExamClass').onchange = () => { loadExamRoster(); loadAssignedExams(); };

async function loadExamBook() {
  const generation = ++examBuilder.bookGeneration, owner = cloudProfile?.id;
  const bookId = $('#assignExamBook').value;
  examBuilder.words = [];
  $('#assignExamRange').textContent = bookId ? '단어를 불러오는 중...' : '단어장을 선택하세요.';
  if (!isStaff() || !examBuilder.books.some(b => b.id === bookId)) return;
  try {
    const words = await readAllRows(() => cloudClient.from('vocabulary_words').select('id,english,korean,position,day_number').eq('book_id',bookId).order('position').order('id'));
    if (generation !== examBuilder.bookGeneration || cloudProfile?.id !== owner) return;
    examBuilder.words = words.map(word=>({...word,dayNumber:word.day_number}));
    $('#assignExamFrom').value = 1; $('#assignExamTo').value = words.length || 1;
    $('#assignExamFrom').max = $('#assignExamTo').max = words.length;
    const days=[...new Set(examBuilder.words.map(word=>word.dayNumber).filter(Number.isInteger))].sort((a,b)=>a-b);
    const options=days.map(day=>`<option value="${day}">DAY ${day}</option>`).join('');
    $('#assignExamDayFrom').innerHTML=options;$('#assignExamDayTo').innerHTML=options;
    if(days.length)$('#assignExamDayTo').value=days.at(-1);
    const dayMode=$('input[name="examRangeMode"][value="day"]');dayMode.disabled=!days.length;
    if(!days.length)$('input[name="examRangeMode"][value="position"]').checked=true;else dayMode.checked=true;
    updateExamRangeMode();
    updateExamRange();
  } catch (error) { if (generation === examBuilder.bookGeneration) $('#assignExamRange').textContent = `단어 조회 실패: ${error.message}`; }
}
function updateExamRange() {
  const dayMode=$('input[name="examRangeMode"]:checked')?.value==='day';
  let start = Number($('#assignExamFrom').value), end = Number($('#assignExamTo').value);
  const words = examBuilder.words;
  if(dayMode){const from=Number($('#assignExamDayFrom').value),to=Number($('#assignExamDayTo').value),selected=words.filter(word=>word.dayNumber>=from&&word.dayNumber<=to);$('#assignExamRange').textContent=Number.isInteger(from)&&Number.isInteger(to)&&from<=to&&selected.length?`DAY ${from}~${to} · ${selected.length}개: ${selected[0].english} ~ ${selected.at(-1).english}`:'유효한 DAY 범위를 선택하세요.';return}
  $('#assignExamRange').textContent = Number.isInteger(start) && Number.isInteger(end) && start >= 1 && end >= start && end <= words.length ? `${start}~${end}번 · ${end-start+1}개: ${words[start-1].english} ~ ${words[end-1].english}` : '유효한 단어 범위를 입력하세요.';
}
$('#assignExamBook').onchange = loadExamBook;
$('#assignExamFrom').oninput = $('#assignExamTo').oninput = updateExamRange;
$('#assignExamDayFrom').onchange=$('#assignExamDayTo').onchange=updateExamRange;
function updateExamRangeMode(){const day=$('input[name="examRangeMode"]:checked')?.value==='day';$('#assignExamDayRange').classList.toggle('hidden',!day);$('#assignExamPositionRange').classList.toggle('hidden',day);$('#assignExamFrom').required=$('#assignExamTo').required=!day;updateExamRange()}
$$('input[name="examRangeMode"]').forEach(input=>input.onchange=updateExamRangeMode);
function updateExamType() {
  const mixed = $('#assignExamType').value === 'mixed';
  $('#assignExamSingleCount').classList.toggle('hidden',mixed);
  $('#assignExamMixedCounts').classList.toggle('hidden',!mixed);
  $('#assignExamCount').required = !mixed;
}
$('#assignExamType').onchange = updateExamType;

function uniqueExamWords(words) {
  const byEnglish = new Map();
  words.forEach(word => {
    const key = normalize(word.english);
    if (!key) return;
    if (!byEnglish.has(key)) byEnglish.set(key,{...word,acceptedMeanings:[]});
    const item=byEnglish.get(key);
    [word.korean,...(word.acceptedAnswers||[])].filter(Boolean).forEach(meaning=>{
      if(!item.acceptedMeanings.some(saved=>normalizeKorean(saved)===normalizeKorean(meaning)))item.acceptedMeanings.push(meaning);
    });
  });
  return [...byEnglish.values()];
}
function buildExamPlan(input, words, eligibleIds, mixedAvailable, multipleMeaningsAvailable=false, random = Math.random) {
  const title = input.title.trim();
  if (!title || title.length > 120) throw new Error('시험 이름을 120자 이내로 입력하세요.');
  const selected = [...new Set(input.students)];
  if (!selected.length) throw new Error('시험을 볼 학생을 한 명 이상 선택하세요.');
  if (selected.some(id => !eligibleIds.includes(id))) throw new Error('학생의 반 배정이 변경되었습니다. 학생 목록을 새로 불러와 주세요.');
  if (!['en_ko','ko_en','spelling','mixed'].includes(input.type)) throw new Error('시험 유형을 확인하세요.');
  if (input.type === 'mixed' && !mixedAvailable) throw new Error('혼합시험 서버 설정을 먼저 완료해 주세요.');
  const dayMode=input.rangeMode==='day';const start = Number(input.start), end = Number(input.end),dayFrom=Number(input.dayFrom),dayTo=Number(input.dayTo);
  if(dayMode&&(!Number.isInteger(dayFrom)||!Number.isInteger(dayTo)||dayFrom<1||dayTo<dayFrom))throw new Error('DAY 범위를 확인하세요.');
  if(!dayMode&&(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end<start||end>words.length))throw new Error('단어 범위를 확인하세요.');
  const meaning = Number(input.meaning), spelling = Number(input.spelling), count = input.type === 'mixed' ? meaning + spelling : Number(input.count);
  if (input.type === 'mixed' && (![meaning,spelling].every(n => Number.isInteger(n) && n > 0))) throw new Error('혼합시험의 각 문항 수는 1 이상의 정수로 입력하세요.');
  if (!Number.isInteger(count) || count < 1 || count > 500) throw new Error('문항 수는 1~500개의 정수로 입력하세요.');
  const pass = Number(input.pass);
  if (!Number.isInteger(pass) || pass < 0 || pass > 100) throw new Error('합격 점수는 0~100점으로 입력하세요.');
  const parseTime = value => { if (!value) return null; const time = new Date(value); if (!Number.isFinite(time.getTime())) throw new Error('응시 시간을 확인하세요.'); return time.toISOString(); };
  const from = parseTime(input.availableFrom), until = parseTime(input.availableUntil);
  if (until && (new Date(until).getTime() <= Date.now() || (from && until <= from))) throw new Error('응시 마감은 현재와 시작 시간보다 나중이어야 합니다.');
  const rangeRows=dayMode?words.filter(word=>Number(word.dayNumber)>=dayFrom&&Number(word.dayNumber)<=dayTo):words.slice(start-1,end);
  if(!rangeRows.length)throw new Error('선택한 범위에 단어가 없습니다.');
  const pool=uniqueExamWords(rangeRows);
  if(count>pool.length)throw new Error(`선택 범위 ${rangeRows.length}개 중 같은 철자를 제외하면 ${pool.length}개입니다. 문항 수를 ${pool.length}개 이하로 줄여 주세요.`);
  for (let i = pool.length-1; i > 0; i--) { const j = Math.floor(random()*(i+1)); [pool[i],pool[j]] = [pool[j],pool[i]]; }
  return {title,students:selected,pass,from,until,type:input.type,count,
    questions:pool.slice(0,count).map((word,index) => ({word_id:word.id,position:index+1,
      ...(multipleMeaningsAvailable ? {accepted_answers:word.acceptedMeanings} : {}),
      ...(input.type === 'mixed' ? {question_type:index < meaning ? 'en_ko' : 'ko_en'} : {})}))};
}

async function persistAssignedExam(client, profile, classId, bookId, plan) {
  let testId;
  try {
    const exam = checked(await client.from('tests').insert({academy_id:profile.academy_id,class_id:classId,book_id:bookId,created_by:profile.id,
      title:plan.title,test_type:plan.type === 'mixed' ? 'en_ko' : plan.type,question_count:plan.count,pass_score:plan.pass,
      available_from:plan.from,available_until:plan.until,is_published:false}).select('id').single());
    testId = exam.id;
    for (let offset = 0; offset < plan.questions.length; offset += 200) checked(await client.from('test_questions').insert(plan.questions.slice(offset,offset+200).map(q => ({...q,test_id:testId}))));
    for (let offset = 0; offset < plan.students.length; offset += 200) checked(await client.from('test_assignments').insert(plan.students.slice(offset,offset+200).map(id => ({test_id:testId,student_id:id}))));
    checked(await client.from('tests').update({is_published:true}).eq('id',testId).select('id').single());
    return testId;
  } catch (error) {
    if (testId) {
      // A lost publish response must not delete an exam that was actually published.
      const status = await client.from('tests').select('id,is_published').eq('id',testId).single();
      if (!status.error && status.data?.is_published) return testId;
      if (!status.error && status.data?.is_published === false) {
        const cleanup = await client.from('tests').delete().eq('id',testId).eq('is_published',false);
        if (cleanup.error) throw new Error(`${error.message} · 미완료 시험이 남았습니다. 배정한 시험 목록을 확인하세요.`);
      } else throw new Error('저장 결과를 확인하지 못했습니다. 중복 배정 전에 배정한 시험 목록을 새로고침하세요.');
    }
    throw error;
  }
}

$('#assignExamForm').onsubmit = async event => {
  event.preventDefault();
  if (!isStaff() || examBuilder.busy || examBuilder.owner !== cloudProfile.id) return;
  const profile = {...cloudProfile}, classId = $('#assignExamClass').value, bookId = $('#assignExamBook').value;
  if (!examBuilder.classes.some(c => c.id === classId) || !examBuilder.books.some(b => b.id === bookId)) return toast('반과 공유 단어장을 선택하세요.');
  const input = {title:$('#assignExamTitle').value,students:selectedExamStudents(),type:$('#assignExamType').value,rangeMode:$('input[name="examRangeMode"]:checked')?.value,
    start:$('#assignExamFrom').value,end:$('#assignExamTo').value,dayFrom:$('#assignExamDayFrom').value,dayTo:$('#assignExamDayTo').value,count:$('#assignExamCount').value,meaning:$('#assignExamMeaning').value,
    spelling:$('#assignExamSpelling').value,pass:$('#assignExamPass').value,availableFrom:$('#assignExamStart').value,availableUntil:$('#assignExamEnd').value};
  examBuilder.busy = true;
  const controls = Array.from($('#assignExamForm').querySelectorAll('input,select,button'));
  const disabledStates = controls.map(control => control.disabled);
  controls.forEach(control => control.disabled = true);
  $('#assignExamSubmitStatus').textContent = '학생 명단 확인 후 시험을 배정하는 중...';
  try {
    const roster = await fetchClassRoster(classId,profile.academy_id);
    const plan = buildExamPlan(input,examBuilder.words,roster.map(s => s.id),examBuilder.mixed,examBuilder.multipleMeanings);
    if (cloudProfile?.id !== profile.id) throw new Error('로그인 계정이 변경되었습니다. 다시 로그인하세요.');
    await persistAssignedExam(cloudClient,profile,classId,bookId,plan);
    $('#assignExamSubmitStatus').textContent = `배정 완료! ${plan.students.length}명에게 ${plan.count}문항을 배정했습니다.\n학생 계정의 ‘내 시험’에서 확인할 수 있습니다.`;
    $('#assignExamTitle').value = '';
    $$('input[name="examStudent"]').forEach(input => input.checked = false);
    updateExamStudentCount();
    await loadAssignedExams();
  } catch (error) { $('#assignExamSubmitStatus').textContent = `배정 실패: ${error.message}`; }
  finally { examBuilder.busy = false; controls.forEach((control,index) => control.disabled = disabledStates[index]); }
};

$('#assignedExamRefresh').onclick = loadAssignedExams;
async function loadAssignedExams() {
  if (!isStaff()) return;
  const generation = ++examBuilder.listGeneration, owner = cloudProfile.id;
  const selectedClass = $('#assignExamClass').value;
  const ids = examBuilder.classes.filter(c => !selectedClass || c.id === selectedClass).map(c => c.id);
  $('#assignedExamList').textContent = '배정한 시험을 불러오는 중...';
  if (!ids.length) { $('#assignedExamList').textContent = '조회할 반이 없습니다.'; return; }
  try {
    const tests = checked(await cloudClient.from('tests').select('id,title,class_id,question_count,is_published,available_from,available_until').eq('academy_id',cloudProfile.academy_id).in('class_id',ids).order('created_at',{ascending:false}).limit(50));
    if (generation !== examBuilder.listGeneration || cloudProfile?.id !== owner) return;
    $('#assignedExamList').innerHTML = tests.length ? '<p>최근 시험 최대 50개입니다. 시험을 눌러 학생별 응시 현황을 확인하세요.</p>' : '아직 배정한 시험이 없습니다.';
    tests.forEach(test => {
      const card = document.createElement('div'); card.className = 'card form-card';
      const klass = examBuilder.classes.find(c => c.id === test.class_id);
      card.innerHTML = `<strong>${escapeHtml(test.title)}</strong><span>${escapeHtml(klass?.name || '')} · ${test.question_count}문항 · ${test.is_published ? '배정 완료' : '미완료 · 학생 응시 불가'}</span><small>시작: ${test.available_from ? new Date(test.available_from).toLocaleString('ko-KR') : '즉시'} / 마감: ${test.available_until ? new Date(test.available_until).toLocaleString('ko-KR') : '없음'}</small>`;
      const detail = document.createElement('div');
      addStudentButton(card,'학생별 응시 현황',() => showExamParticipation(test,detail));
      card.append(detail); $('#assignedExamList').append(card);
    });
  } catch (error) { if (generation === examBuilder.listGeneration) $('#assignedExamList').textContent = `조회 실패: ${error.message}`; }
}

async function showExamParticipation(test, container) {
  if (!isStaff()) return;
  const owner = cloudProfile.id;
  const assignments = await readAllRows(() => cloudClient.from('test_assignments').select('student_id').eq('test_id',test.id).order('student_id'));
  const attempts = await readAllRows(() => cloudClient.from('test_attempts').select('student_id,status,score,attempt_number').eq('test_id',test.id).order('attempt_number',{ascending:false}).order('id'));
  const profiles = [];
  for (let offset = 0; offset < assignments.length; offset += 200) profiles.push(...checked(await cloudClient.from('profiles').select('id,display_name').eq('academy_id',cloudProfile.academy_id).in('id',assignments.slice(offset,offset+200).map(a => a.student_id))));
  if (cloudProfile?.id !== owner) return;
  const submitted = assignments.filter(a => attempts.some(t => t.student_id === a.student_id && t.status === 'submitted')).length;
  container.innerHTML = `<p>${assignments.length}명 배정 · ${submitted}명 제출 · ${assignments.length-submitted}명 미제출</p>` + assignments.map(a => {
    const completed = attempts.find(t => t.student_id === a.student_id && t.status === 'submitted');
    const started = attempts.some(t => t.student_id === a.student_id && t.status === 'in_progress');
    return `<p>${escapeHtml(profiles.find(p => p.id === a.student_id)?.display_name || '이름 조회 불가')} · ${completed ? `제출 완료 ${completed.score}점` : started ? '응시 시작 · 미제출' : '미응시'}</p>`;
  }).join('');
}
