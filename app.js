const STORE={books:'tg_vocab_books_v1',results:'tg_vocab_results_v1'};
const state={books:load(STORE.books,[]),results:load(STORE.results,[]),pendingWords:[],questions:[],answers:[],index:0,current:null,lastWrong:[]};
const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
function load(key,fallback){try{return JSON.parse(localStorage.getItem(key))||fallback}catch{return fallback}}
function save(key,value){localStorage.setItem(key,JSON.stringify(value))}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2200)}
function show(view){$$('.view').forEach(v=>v.classList.remove('active'));$(`#${view}View`).classList.add('active');window.scrollTo({top:0,behavior:'smooth'});if(view==='home')renderStats();if(view==='upload')renderBooks();if(view==='setup')renderBookSelect();if(view==='results')renderResults()}
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.view)));

function normalize(v){return String(v??'').trim().toLowerCase().replace(/[.,!?]/g,'').replace(/\s+/g,' ')}
function shuffle(a){return [...a].sort(()=>Math.random()-.5)}
function renderStats(){const scores=state.results.map(r=>r.score);$('#statWords').textContent=state.books.reduce((n,b)=>n+b.words.length,0);$('#statTests').textContent=state.results.length;$('#statAverage').textContent=scores.length?`${Math.round(scores.reduce((a,b)=>a+b,0)/scores.length)}점`:'-'}

$('#excelFile').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{const data=await file.arrayBuffer();const wb=XLSX.read(data);const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''});let words=rows.map(r=>({english:String(r[0]).trim(),korean:String(r[1]).trim()})).filter(w=>w.english&&w.korean);if(words.length&&/english|영어|단어|word/i.test(words[0].english))words.shift();state.pendingWords=words;$('#uploadPreview').classList.remove('hidden');$('#uploadPreview').innerHTML=`<strong>${file.name}</strong><p>${words.length}개 단어를 확인했어요.</p>`;$('#saveBookBtn').disabled=!words.length;if(!$('#bookName').value)$('#bookName').value=file.name.replace(/\.[^.]+$/,'')}catch{toast('파일을 읽지 못했어요. 엑셀 형식을 확인해주세요.')}});
$('#saveBookBtn').addEventListener('click',()=>{const name=$('#bookName').value.trim();if(!name||!state.pendingWords.length)return toast('단어장 이름과 파일을 확인해주세요.');state.books.unshift({id:Date.now().toString(),name,words:state.pendingWords,createdAt:new Date().toISOString()});save(STORE.books,state.books);state.pendingWords=[];$('#bookName').value='';$('#excelFile').value='';$('#uploadPreview').classList.add('hidden');$('#saveBookBtn').disabled=true;renderBooks();toast('단어장을 저장했어요!')});
function renderBooks(){$('#bookList').innerHTML=state.books.map(b=>`<div class="book-item"><div><strong>${escapeHtml(b.name)}</strong><small>${b.words.length}개 단어</small></div><button data-delete-book="${b.id}">삭제</button></div>`).join('')||'<div class="card tip">아직 등록된 단어장이 없어요.</div>';$$('[data-delete-book]').forEach(btn=>btn.onclick=()=>{if(confirm('이 단어장을 삭제할까요?')){state.books=state.books.filter(b=>b.id!==btn.dataset.deleteBook);save(STORE.books,state.books);renderBooks();renderStats()}})}
function renderBookSelect(){$('#bookSelect').innerHTML='<option value="">단어장을 선택하세요</option>'+state.books.map(b=>`<option value="${b.id}">${escapeHtml(b.name)} (${b.words.length})</option>`).join('')}

$('#startTestBtn').addEventListener('click',()=>startTest());
function startTest(overrideWords){const className=$('#className').value,student=$('#studentName').value.trim(),book=state.books.find(b=>b.id===$('#bookSelect').value),type=$('input[name="testType"]:checked').value;if(!className||!student||(!book&&!overrideWords))return toast('반, 학생 이름, 단어장을 모두 선택해주세요.');const base=overrideWords||book.words;const count=$('#questionCount').value==='all'?base.length:Math.min(Number($('#questionCount').value),base.length);state.questions=shuffle(base).slice(0,count);state.answers=[];state.index=0;state.current={className,student,bookId:book?.id||'retry',bookName:book?.name||'오답 재시험',type};$('#testStudent').textContent=`${className} · ${student}`;$('#testBook').textContent=state.current.bookName;show('test');renderQuestion()}
function renderQuestion(){const q=state.questions[state.index],type=state.current.type;$('#progressText').textContent=`${state.index+1} / ${state.questions.length}`;$('#progressBar').style.width=`${((state.index+1)/state.questions.length)*100}%`;$('#speakBtn').classList.toggle('hidden',type!=='spelling');$('#questionLabel').textContent=type==='en-ko'?'뜻을 입력하세요':type==='ko-en'?'영어 단어를 입력하세요':'소리를 듣고 영어 단어를 입력하세요';$('#questionPrompt').textContent=type==='en-ko'?q.english:type==='ko-en'?q.korean:'🔊';$('#answerInput').value='';$('#answerInput').focus();$('#nextQuestionBtn').textContent=state.index===state.questions.length-1?'채점하기':'다음 문제';if(type==='spelling')speak(q.english)}
function speak(word){if(!('speechSynthesis'in window))return toast('이 브라우저는 음성 듣기를 지원하지 않아요.');speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(word);u.lang='en-US';u.rate=.78;speechSynthesis.speak(u)}
$('#speakBtn').onclick=()=>speak(state.questions[state.index].english);
$('#answerInput').addEventListener('keydown',e=>{if(e.key==='Enter')$('#nextQuestionBtn').click()});
$('#nextQuestionBtn').addEventListener('click',()=>{const answer=$('#answerInput').value.trim();if(!answer)return toast('정답을 입력해주세요.');const word=state.questions[state.index],correct=state.current.type==='en-ko'?word.korean:word.english;const accepted=state.current.type==='en-ko'?correct.split(/[,;/·]| 또는 /).map(normalize):[normalize(correct)];state.answers.push({word,answer,correct,isCorrect:accepted.some(v=>v===normalize(answer))});if(++state.index<state.questions.length)renderQuestion();else finishTest()});
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
async function initCloudMode(){
  if(!cloudConfig.supabaseUrl||!cloudConfig.supabaseAnonKey)return;
  cloudClient=window.supabase.createClient(cloudConfig.supabaseUrl,cloudConfig.supabaseAnonKey);
  const {data:{session}}=await cloudClient.auth.getSession();
  if(session)await loadCloudProfile(session.user.id);else show('auth');
  cloudClient.auth.onAuthStateChange(async(_event,nextSession)=>{
    if(nextSession)await loadCloudProfile(nextSession.user.id);else{cloudProfile=null;$('#accountBtn').classList.add('hidden');show('auth')}
  });
}
async function loadCloudProfile(userId){
  const {data,error}=await cloudClient.from('profiles').select('id,display_name,role,is_active').eq('id',userId).single();
  if(error||!data?.is_active){await cloudClient.auth.signOut();$('#loginError').textContent='등록된 활성 사용자 정보를 찾을 수 없습니다.';return}
  cloudProfile=data;$('#accountBtn').classList.remove('hidden');$('.brand strong').innerHTML=`TG Vocabulary <span class="role-badge">${roleLabel(data.role)}</span>`;show('home');
}
function roleLabel(role){return({student:'학생',teacher:'선생님',admin:'관리자'})[role]||role}
$('#loginForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!cloudClient)return;
  const btn=$('#loginBtn');btn.disabled=true;$('#loginError').textContent='';
  const {error}=await cloudClient.auth.signInWithPassword({email:$('#loginEmail').value.trim(),password:$('#loginPassword').value});
  if(error)$('#loginError').textContent='이메일 또는 비밀번호를 확인해주세요.';btn.disabled=false;
});
$('#accountBtn').addEventListener('click',()=>cloudClient?.auth.signOut());
initCloudMode();
