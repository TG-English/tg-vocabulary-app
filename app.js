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

$('#excelFile').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{const data=await file.arrayBuffer();const wb=XLSX.read(data);const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''});let words=rows.map(r=>({english:String(r[0]).trim(),korean:String(r[1]).trim()})).filter(w=>w.english&&w.korean);if(words.length&&/english|영어|단어|word/i.test(words[0].english))words.shift();state.pendingWords=words;$('#uploadPreview').classList.remove('hidden');$('#uploadPreview').innerHTML=`<strong>${file.name}</strong><p>${words.length}개 단어를 확인했어요.</p>`;$('#saveBookBtn').disabled=!words.length;if(!$('#bookName').value)$('#bookName').value=file.name.replace(/\.[^.]+$/,'')}catch{toast('파일을 읽지 못했어요. 엑셀 형식을 확인해주세요.')}});
$('#saveBookBtn').addEventListener('click',async()=>{const name=$('#bookName').value.trim();if(!name||!state.pendingWords.length)return toast('단어장 이름과 파일을 확인해주세요.');if(cloudClient&&['admin','teacher'].includes(cloudProfile?.role))return saveCloudBook(name);state.books.unshift({id:Date.now().toString(),name,words:state.pendingWords,createdAt:new Date().toISOString()});save(STORE.books,state.books);clearBookForm();renderBooks();toast('단어장을 저장했어요!')});
function clearBookForm(){state.pendingWords=[];$('#bookName').value='';$('#excelFile').value='';$('#uploadPreview').classList.add('hidden');$('#saveBookBtn').disabled=true}
function renderBooks(){$('#bookList').innerHTML=state.books.map(b=>`<div class="book-item"><div><strong>${escapeHtml(b.name)}</strong><small>${b.words.length}개 단어 · ${b.isCloud?'학원 공유':'이 기기'}</small></div><button data-delete-book="${b.id}">삭제</button></div>`).join('')||'<div class="card tip">아직 등록된 단어장이 없어요.</div>';$$('[data-delete-book]').forEach(btn=>btn.onclick=()=>deleteBook(btn.dataset.deleteBook))}
async function deleteBook(id){const book=state.books.find(b=>b.id===id);if(!book||!confirm('이 단어장을 삭제할까요?'))return;if(book.isCloud){const {error}=await cloudClient.from('vocabulary_books').delete().eq('id',id);if(error)return toast(`삭제 실패: ${error.message}`)}state.books=state.books.filter(b=>b.id!==id);save(STORE.books,state.books.filter(b=>!b.isCloud));renderBooks();renderStats();toast('단어장을 삭제했습니다.')}
function renderBookSelect(){$('#bookSelect').innerHTML='<option value="">단어장을 선택하세요</option>'+state.books.map(b=>`<option value="${b.id}">${escapeHtml(b.name)} (${b.words.length})</option>`).join('')}

$('#startTestBtn').addEventListener('click',()=>startTest());
$$('input[name="testType"]').forEach(input=>input.addEventListener('change',()=>{const mixed=$('input[name="testType"]:checked').value==='mixed';$('#mixedOptions').classList.toggle('hidden',!mixed);$('#questionCount').closest('label').classList.toggle('hidden',mixed)}));
function startTest(overrideWords){const className=$('#className').value,student=$('#studentName').value.trim(),book=state.books.find(b=>b.id===$('#bookSelect').value),type=$('input[name="testType"]:checked').value;if(!className||!student||(!book&&!overrideWords))return toast('반, 학생 이름, 단어장을 모두 선택해주세요.');const base=overrideWords||book.words;if(type==='mixed'&&!overrideWords){const meaningCount=Number($('#meaningQuestionCount').value),spellingCount=Number($('#spellingQuestionCount').value),total=meaningCount+spellingCount;if(!meaningCount||!spellingCount)return toast('혼합 시험의 문제 수를 확인해주세요.');if(total>base.length)return toast(`단어가 ${base.length}개입니다. 혼합 시험 문제 수를 ${base.length}개 이하로 줄여주세요.`);const selected=shuffle(base).slice(0,total);state.questions=shuffle([...selected.slice(0,meaningCount).map(word=>({...word,questionType:'en-ko'})),...selected.slice(meaningCount).map(word=>({...word,questionType:'spelling'}))])}else{const count=$('#questionCount').value==='all'?base.length:Math.min(Number($('#questionCount').value),base.length);state.questions=shuffle(base).slice(0,count)}state.answers=[];state.index=0;state.current={className,student,bookId:book?.id||'retry',bookName:book?.name||'오답 재시험',type};$('#testStudent').textContent=`${className} · ${student}`;$('#testBook').textContent=state.current.bookName;show('test');renderQuestion()}
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
let cloudClient=null,cloudProfile=null;
const adminState={classes:[],students:[],enrollments:[]};
async function initCloudMode(){
  if(!cloudConfig.supabaseUrl||!cloudConfig.supabaseAnonKey)return;
  const configuredUrl=String(cloudConfig.supabaseUrl).trim().replace(/^['\"]|['\"]$/g,'');
  const supabaseUrl=new URL(configuredUrl).origin;
  cloudClient=window.supabase.createClient(supabaseUrl,cloudConfig.supabaseAnonKey);
  const {data:{session}}=await cloudClient.auth.getSession();
  if(session)await loadCloudProfile(session.user.id);else show('auth');
  cloudClient.auth.onAuthStateChange(async(_event,nextSession)=>{
    if(nextSession)await loadCloudProfile(nextSession.user.id);else{cloudProfile=null;$('#accountBtn').classList.add('hidden');show('auth')}
  });
}
async function loadCloudProfile(userId){
  const {data,error}=await cloudClient.from('profiles').select('id,academy_id,display_name,role,is_active').eq('id',userId).single();
  if(error||!data?.is_active){await cloudClient.auth.signOut();$('#loginError').textContent='등록된 활성 사용자 정보를 찾을 수 없습니다.';return}
  cloudProfile=data;applyRoleMenus(data.role);$('#accountBtn').classList.remove('hidden');$('.brand strong').innerHTML=`TG Vocabulary <span class="role-badge">${roleLabel(data.role)}</span>`;if(data.role!=='student')await Promise.all([loadCloudBooks(),loadCloudClasses()]);show('home');
}
function roleLabel(role){return({student:'학생',teacher:'선생님',admin:'관리자'})[role]||role}
function applyRoleMenus(role){const student=role==='student';$('#adminMenuBtn').classList.toggle('hidden',role!=='admin');$('#studentMenuBtn').classList.toggle('hidden',!student);$('#statsPanel').classList.toggle('hidden',student);['#testMenuBtn','#uploadMenuBtn','#resultsMenuBtn'].forEach(id=>$(id).classList.toggle('hidden',student));if(student){state.books=[];state.results=[]}else{state.books=load(STORE.books,[]);state.results=load(STORE.results,[])}}
$('#loginForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!cloudClient)return;
  const btn=$('#loginBtn');btn.disabled=true;btn.textContent='확인 중...';$('#loginError').textContent='';
  try{
    const {error}=await cloudClient.auth.signInWithPassword({email:$('#loginEmail').value.trim().toLowerCase(),password:$('#loginPassword').value});
    if(error)$('#loginError').textContent=loginErrorMessage(error);
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
  if(ids.length){const result=await cloudClient.from('vocabulary_words').select('book_id,english,korean,accepted_answers,position').in('book_id',ids).order('position');if(result.error)return toast(`단어를 불러오지 못했습니다: ${result.error.message}`);words=result.data||[]}
  const cloudBooks=(books||[]).map(book=>({id:book.id,name:book.title,createdAt:book.created_at,isCloud:true,words:words.filter(word=>word.book_id===book.id).map(word=>({english:word.english,korean:word.korean,acceptedAnswers:word.accepted_answers}))}));
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
  const rows=state.pendingWords.map((word,index)=>({book_id:book.id,english:word.english,korean:word.korean,position:index+1}));
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
  $('#adminClassList').innerHTML=$('#adminStudentList').innerHTML='<div class="loading-row">불러오는 중...</div>';
  const [classesResult,studentsResult,enrollmentsResult]=await Promise.all([
    cloudClient.from('classes').select('id,name,school_year,is_active,created_at').order('school_year',{ascending:false}).order('name'),
    cloudClient.from('profiles').select('id,display_name,is_active').eq('role','student').order('display_name'),
    cloudClient.from('class_students').select('class_id,student_id,student_number,is_active,joined_at')
  ]);
  const error=classesResult.error||studentsResult.error||enrollmentsResult.error;
  if(error){$('#adminClassList').innerHTML=$('#adminStudentList').innerHTML='<div class="empty-row">데이터를 불러오지 못했습니다.</div>';toast(`관리 데이터 오류: ${error.message}`);return}
  adminState.classes=classesResult.data||[];adminState.students=studentsResult.data||[];adminState.enrollments=enrollmentsResult.data||[];renderAdminData();
}
function renderAdminData(){
  const activeClasses=adminState.classes.filter(c=>c.is_active);
  $('#classCount').textContent=`${adminState.classes.length}개`;$('#studentCount').textContent=`${adminState.students.length}명`;
  $('#adminClassSelect').innerHTML='<option value="">반을 선택하세요</option>'+activeClasses.map(c=>`<option value="${c.id}">${escapeHtml(c.name)} (${c.school_year})</option>`).join('');
  $('#newStudentClass').innerHTML='<option value="">반을 선택하세요</option>'+activeClasses.map(c=>`<option value="${c.id}">${escapeHtml(c.name)} (${c.school_year})</option>`).join('');
  $('#adminStudentSelect').innerHTML='<option value="">학생을 선택하세요</option>'+adminState.students.filter(s=>s.is_active).map(s=>`<option value="${s.id}">${escapeHtml(s.display_name)}</option>`).join('');
  $('#adminClassList').innerHTML=adminState.classes.map(c=>`<div class="management-row"><div><strong>${escapeHtml(c.name)}</strong><small>${c.school_year}학년도 · ${c.is_active?'운영 중':'종료'}</small></div><button class="status-btn ${c.is_active?'':'off'}" data-toggle-class="${c.id}">${c.is_active?'운영 종료':'다시 운영'}</button></div>`).join('')||'<div class="empty-row">등록된 반이 없습니다.</div>';
  $('#adminStudentList').innerHTML=adminState.enrollments.map(e=>{const student=adminState.students.find(s=>s.id===e.student_id),klass=adminState.classes.find(c=>c.id===e.class_id);if(!student||!klass)return'';return `<div class="management-row"><div><strong>${escapeHtml(student.display_name)}</strong><small>${escapeHtml(klass.name)}${e.student_number?` · ${escapeHtml(e.student_number)}번`:''} · ${e.is_active?'재원':'퇴원/이동'}</small></div><div class="row-actions"><button data-edit-student="${student.id}">이름 수정</button><button class="status-btn ${e.is_active?'':'off'}" data-toggle-enrollment="${e.class_id}|${e.student_id}">${e.is_active?'재원 중':'비활성'}</button></div></div>`}).join('')||'<div class="empty-row">반에 배정된 학생이 없습니다.</div>';
  $$('[data-toggle-class]').forEach(btn=>btn.onclick=()=>toggleClass(btn.dataset.toggleClass));$$('[data-toggle-enrollment]').forEach(btn=>btn.onclick=()=>toggleEnrollment(btn.dataset.toggleEnrollment));$$('[data-edit-student]').forEach(btn=>btn.onclick=()=>editStudentName(btn.dataset.editStudent));
}
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
async function toggleClass(id){const item=adminState.classes.find(c=>c.id===id);if(!item)return;const {error}=await cloudClient.from('classes').update({is_active:!item.is_active}).eq('id',id);if(error)return toast(`변경 실패: ${error.message}`);toast('반 상태를 변경했습니다.');await loadAdminData()}
async function toggleEnrollment(key){const [class_id,student_id]=key.split('|'),item=adminState.enrollments.find(e=>e.class_id===class_id&&e.student_id===student_id);if(!item)return;const {error}=await cloudClient.from('class_students').update({is_active:!item.is_active}).eq('class_id',class_id).eq('student_id',student_id);if(error)return toast(`변경 실패: ${error.message}`);toast('학생 상태를 변경했습니다.');await loadAdminData()}
async function editStudentName(id){const student=adminState.students.find(s=>s.id===id),display_name=prompt('학생 이름을 입력하세요.',student?.display_name||'')?.trim();if(!display_name||display_name===student.display_name)return;const {error}=await cloudClient.from('profiles').update({display_name}).eq('id',id);if(error)return toast(`이름 수정 실패: ${error.message}`);toast('학생 이름을 수정했습니다.');await loadAdminData()}
function setBusy(button,busy,label){button.disabled=busy;button.textContent=label}
initCloudMode();
