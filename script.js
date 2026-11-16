import {initializeApp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {getFirestore,doc,getDoc,setDoc,onSnapshot,runTransaction,collection,addDoc,query,orderBy,limit} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 1) PASTE YOUR FIREBASE CONFIG VALUES HERE
const db=getFirestore(initializeApp({apiKey:"AIzaSyAuYg4QMek23BGqdHyFMgBb80ofh-Tc02c",authDomain:"study-with-me-556b8.firebaseapp.com",projectId:"study-with-me-556b8",appId:"1:228825929169:web:a3392265462ab69fdc7cf0"}));

/* ---------- helpers ---------- */
const $=s=>document.querySelector(s),te=new TextEncoder(),td=new TextDecoder();
const esc=s=>String(s).replace(/[&<>"']/g,c=>"&#"+c.charCodeAt(0)+";");
const b64=a=>btoa(String.fromCharCode(...new Uint8Array(a)));
const unb=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const iso=(d=new Date())=>new Date(d.getTime()-d.getTimezoneOffset()*6e4).toISOString().slice(0,10);
const hash=async s=>b64(await crypto.subtle.digest("SHA-256",te.encode(s))).replace(/[^a-z0-9]/gi,"").slice(0,32);

/* ---------- AES-256-GCM ---------- */
async function key(secret,salt){
  const k=await crypto.subtle.importKey("raw",te.encode(secret),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt:te.encode(salt),iterations:300000,hash:"SHA-256"},k,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
async function enc(k,obj){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  return {iv:b64(iv),d:b64(await crypto.subtle.encrypt({name:"AES-GCM",iv},k,te.encode(JSON.stringify(obj))))};
}
async function dec(k,p){
  return JSON.parse(td.decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:unb(p.iv)},k,unb(p.d))));
}

/* ---------- state ---------- */
let K,PK,ref,rid,room,me,pass,S,P,privRef,chatCol,tab="dash",chat=[];
const blank=()=>({members:{},challenge:{title:"100 Hours Sprint",target:100,deadline:iso(new Date(Date.now()+12096e5))},logs:[],todos:{},habits:{},goals:{weekly:[],yearly:[]}});
const mutate=(fn,must)=>runTransaction(db,async t=>{
  const sn=await t.get(ref);
  if(!sn.exists()&&must)throw Error("nf");
  const s=sn.exists()?await dec(K,sn.data()):blank();
  fn(s);
  t.set(ref,await enc(K,s));
});
const sp=async()=>setDoc(privRef,await enc(PK,P));
const mem=()=>Object.keys(S.members);
const nm=u=>esc(S.members[u]?.name||u);

/* ---------- views ---------- */
function dash(){
  const c=S.challenge,M=mem(),today=iso(),col=u=>"c"+S.members[u].c;
  const sum=u=>S.logs.filter(l=>l.u==u).reduce((a,l)=>a+l.h,0);
  const tot=M.reduce((a,u)=>a+sum(u),0);
  const days=Math.ceil((new Date(c.deadline)-Date.now())/864e5),left=Math.max(0,c.target-tot);
  return `<section class=card>
    <div class=hd><div><span class=eye>Shared study challenge</span><h2>${esc(c.title)}</h2></div><button class=sm data-a=cfg>Configure Goal</button></div>
    <div class=stats>
      <div class=stat><span>Combined Hours</span><b>${tot.toFixed(1)} / ${c.target} hrs</b></div>
      <div class=stat><span>Deadline &amp; Time Left</span><b>${days>0?days+" Days Left ("+c.deadline+")":"Deadline passed"}</b></div>
      <div class=stat><span>Daily Pace Needed</span><b>${(days>0?left/days:left).toFixed(1)} hrs/day</b></div>
    </div>
    <div class=legend>${M.map(u=>`<span><i class="dot ${col(u)}"></i><b>${nm(u)}</b>: ${sum(u).toFixed(1)} hrs</span>`).join("")}</div>
    <div class=bar>${M.map(u=>`<i class=${col(u)} style="width:${Math.min(100,sum(u)/c.target*100)}%"></i>`).join("")}</div>
    <form data-f=log class=row style="margin-top:1.2rem"><input name=h type=number step=.25 min=.25 max=24 placeholder="Hours (e.g., 1.5)" required><input name=s placeholder="Subject / Topic (e.g., SAT Math)" required><button class=btn>+ Log Hours</button></form>
    <h4>Recent Study Sessions</h4>
    <ul class=list>${S.logs.slice(-8).reverse().map(l=>`<li><span><i class="dot ${S.members[l.u]?"c"+S.members[l.u].c:""}"></i><b>${nm(l.u)}</b> logged <b>${l.h} hrs</b> — ${esc(l.s)}</span><span class=mut>${l.d} ${l.u==me?`<button class=x data-a=dl:${l.id}>✕</button>`:""}</span></li>`).join("")||"<p class=mut>No sessions yet. Log your first one above.</p>"}</ul>
  </section>
  <div class=grid>
    <section class=card>
      <div class=hd><h3>Today's Task Progress</h3><span class=mut>${new Date().toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</span></div>
      ${M.map(u=>{
        const t=S.todos[u]||[],dn=t.filter(x=>x.done).length,p=t.length?Math.round(dn/t.length*100):0;
        const h=S.logs.filter(l=>l.u==u&&l.d==today).reduce((a,l)=>a+l.h,0);
        return `<div style="margin-bottom:1.1rem"><div class=tr><span>${nm(u)}</span><span>${dn}/${t.length} tasks (${p}%) · ${h.toFixed(1)} hrs</span></div><div class=bar><i class=${col(u)} style="width:${p}%"></i></div></div>`}).join("")}
    </section>
    <section class=card style="text-align:center"><div class=hd><h3>Focus Timer</h3></div>
      <div id=tmd style="font-size:2.6rem;font-weight:700;letter-spacing:-.03em">${mmss(tm.left)}</div>
      <div class=row style="justify-content:center;margin:.8rem 0">${[25,45,60].map(m=>`<button class=sm data-a=tp:${m} style="${tm.min==m?"background:var(--ink);color:var(--bg)":""}">${m}m</button>`).join("")}</div>
      <div class=row style="justify-content:center;margin:0"><button id=tmb class=btn data-a=tm>${tm.run?"Pause":"Start"}</button><button class=sm data-a=tr>Reset</button></div>
      <p class=mut style="margin-top:.6rem">Finished sessions are logged to your hours automatically.</p>
    </section>
  </div>
  <div class=grid>${M.map(u=>`<section class="card t ${col(u)}"><div class=hd><h3>${nm(u)}'s To-Do List</h3><span class="badge ${col(u)}">${S.members[u].c?"Lavender":"Reseda"}</span></div>
    ${u==me?`<form data-f=todo class=row><input name=t placeholder="Add study task..." required><input name=h type=number step=.25 min=.25 placeholder="Hrs" style="max-width:80px;min-width:70px" required><button class=btn>Add</button></form>`:""}
    <ul class=list>${(S.todos[u]||[]).map(x=>`<li class="${x.done?"done":""}"><label><input type=checkbox ${x.done?"checked":""} data-a=tg:${x.id} ${u==me?"":"disabled"}>${esc(x.t)} <small>(${x.h||"?"}h)</small></label>${u==me?`<button class=x data-a=dt:${x.id}>✕</button>`:""}</li>`).join("")}</ul></section>`).join("")}</div>`;
}

function habits(){
  const D=[...Array(7)].map((_,i)=>iso(new Date(Date.now()-(6-i)*864e5)));
  const streak=h=>{let n=0,d=new Date();if(!h.days[iso(d)])d=new Date(d-864e5);while(h.days[iso(d)]){n++;d=new Date(d-864e5)}return n};
  return `<div class=grid>${mem().map(u=>`<section class="card t c${S.members[u].c}"><h3>${nm(u)}'s habits</h3>
    ${u==me?`<form data-f=habit class=row><input name=n placeholder="New habit (e.g. Read 20 pages)" required><button class=btn>Add</button></form>`:""}
    <div class=hh><span></span>${D.map(d=>`<small>${d.slice(8)}</small>`).join("")}<span></span><span></span></div>
    ${(S.habits[u]||[]).map(h=>`<div class=hr><span>${esc(h.n)}</span>${D.map(d=>`<button class="cell ${h.days[d]?"on":""}" ${u==me?`data-a=hab:${h.id}:${d}`:"disabled"}></button>`).join("")}<small>🔥${streak(h)}</small>${u==me?`<button class=x data-a=dh:${h.id}>✕</button>`:""}</div>`).join("")||"<p class=mut>No habits yet. Add one to start a streak.</p>"}
  </section>`).join("")}</div>`;
}

function goals(){
  return `<div class=grid>${["weekly","yearly"].map(k=>`<section class=card><h3>${k=="weekly"?"Weekly":"Yearly"} goals</h3>
    <form data-f=goal data-k=${k} class=row><input name=t placeholder="Add a ${k} goal..." required><button class=btn>Add</button></form>
    <ul class=list>${S.goals[k].map(g=>`<li class="${g.done?"done":""}"><label><input type=checkbox ${g.done?"checked":""} data-a=gt:${k}:${g.id}><i class="dot c${S.members[g.u]?.c}"></i>${esc(g.t)}</label>${g.u==me?`<button class=x data-a=gd:${k}:${g.id}>✕</button>`:""}</li>`).join("")||"<p class=mut>No goals yet.</p>"}</ul></section>`).join("")}</div>`;
}

function priv(){
  if(!PK)return `<section class="card narrow"><h2>Your private space</h2><p class=mut style="margin:.5rem 0 1rem">Only you can open it. Choose a PIN with 6 or more characters. If you forget it, this space cannot be recovered.</p><form data-f=pin class=row><input name=p type=password minlength=6 placeholder="Your PIN" required><button class=btn>Unlock</button></form><p id=perr class=err></p></section>`;
  return `<div class=grid><section class=card><h3>Personal goals</h3>
    <form data-f=pgoal class=row><input name=t placeholder="Add a personal goal..." required><button class=btn>Add</button></form>
    <ul class=list>${P.goals.map(g=>`<li class="${g.done?"done":""}"><label><input type=checkbox ${g.done?"checked":""} data-a=pg:${g.id}>${esc(g.t)}</label><button class=x data-a=pd:${g.id}>✕</button></li>`).join("")}</ul></section>
    <section class=card><h3>Private notes</h3><textarea id=notes rows=10 placeholder="Reflections, exam thoughts, reminders...">${esc(P.notes)}</textarea><p class=mut style="margin-top:.5rem">Encrypted with your PIN. Saves when you tap outside the box.</p></section></div>`;
}

function prof(){
  return `<div class=grid>${mem().map(u=>{const m=S.members[u];return `<section class="card t c${m.c}"><h3>${esc(m.name)} <small>@${esc(u)}</small></h3><p style="margin-bottom:1rem">${esc(m.bio||"No bio yet.")}</p>
    ${u==me?`<form data-f=prof class=col><input name=n value="${esc(m.name)}" maxlength=24 required><textarea name=b rows=3 maxlength=140 placeholder="Short bio...">${esc(m.bio)}</textarea><button class=btn>Save profile</button></form>`:""}</section>`}).join("")}</div>`;
}

function fill(){
  const m=$("#msgs");if(!m)return;
  m.innerHTML=chat.map(c=>`<div class="msg ${c.u==me?"mine":""}"><b>${nm(c.u)}</b>${esc(c.m)}<small>${new Date(c.t).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</small></div>`).join("")||"<p class=mut>No messages yet. Say hi.</p>";
  m.scrollTop=m.scrollHeight;
}

function render(){
  if(!S)return;
  document.querySelectorAll("nav button").forEach(b=>b.classList.toggle("on",b.dataset.a=="tab:"+tab));
  if(tab=="chat"){
    if(!$("#msgs"))$("#view").innerHTML=`<section class=card><h3>Chat</h3><div id=msgs class=msgs></div><form data-f=chat class=row><input name=m placeholder="Write a message..." autocomplete=off required><button class=btn>Send</button></form></section>`;
    return fill();
  }
  $("#view").innerHTML={dash,habits,goals,me:priv,prof}[tab]();
}/* ---------- actions ---------- */
const A={},H={};
A.tab=t=>{tab=t;render()};
A.lock=()=>location.reload();
A.cfg=()=>{
  const c=S.challenge,t=prompt("Challenge title",c.title),n=+prompt("Target hours",c.target),d=prompt("Deadline (YYYY-MM-DD)",c.deadline);
  if(t&&n>0&&/^\d{4}-\d\d-\d\d$/.test(d||""))mutate(s=>{s.challenge={title:t,target:n,deadline:d}});
};
A.tg=id=>mutate(s=>{const t=s.todos[me].find(x=>x.id==id);t.done=!t.done});
A.dt=id=>mutate(s=>{s.todos[me]=s.todos[me].filter(x=>x.id!=id)});
A.hab=(id,d)=>mutate(s=>{const h=s.habits[me].find(x=>x.id==id);h.days[d]?delete h.days[d]:h.days[d]=1});
A.dh=id=>mutate(s=>{s.habits[me]=s.habits[me].filter(x=>x.id!=id)});
A.gt=(k,id)=>mutate(s=>{const g=s.goals[k].find(x=>x.id==id);g.done=!g.done});
A.gd=(k,id)=>mutate(s=>{s.goals[k]=s.goals[k].filter(x=>x.id!=id)});
A.dl=id=>mutate(s=>{s.logs=s.logs.filter(x=>x.id!=id)});
A.pg=async id=>{const g=P.goals.find(x=>x.id==id);g.done=!g.done;await sp();render()};
A.pd=async id=>{P.goals=P.goals.filter(x=>x.id!=id);await sp();render()};

H.log=f=>mutate(s=>{s.logs.push({id:Date.now(),u:me,h:+f.get("h"),s:f.get("s").trim(),d:iso()})});
H.todo=f=>mutate(s=>{s.todos[me].push({id:Date.now(),t:f.get("t").trim(),h:+f.get("h"),done:false})});
H.habit=f=>mutate(s=>{s.habits[me].push({id:Date.now(),n:f.get("n").trim(),days:{}})});
H.goal=(f,e)=>mutate(s=>{s.goals[e.target.dataset.k].push({id:Date.now(),u:me,t:f.get("t").trim(),done:false})});
H.prof=f=>mutate(s=>{s.members[me].name=f.get("n").trim();s.members[me].bio=f.get("b").trim()});
H.pgoal=async f=>{P.goals.push({id:Date.now(),t:f.get("t").trim(),done:false});await sp();render()};
H.chat=async f=>{await addDoc(chatCol,{t:Date.now(),...await enc(K,{u:me,m:f.get("m").trim()})})};
H.pin=async f=>{
  try{
    PK=await key(f.get("p")+"|"+pass,"priv:"+room+":"+me);
    const sn=await getDoc(privRef);
    P=sn.exists()?await dec(PK,sn.data()):{goals:[],notes:""};
    if(!sn.exists())await sp();
    render();
  }catch{PK=null;$("#perr").textContent="Wrong PIN. Try again."}
};

/* ---------- focus timer ---------- */
let tm={min:25,left:1500,end:0,run:false};
const mmss=s=>String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0");
A.tm=()=>{if(tm.run){tm.left=Math.round((tm.end-Date.now())/1000);tm.run=false}else{tm.end=Date.now()+tm.left*1000;tm.run=true}};
A.tp=m=>{tm={min:+m,left:m*60,end:0,run:false};render()};
A.tr=()=>{tm.run=false;tm.left=tm.min*60};
setInterval(()=>{
  if(tm.run){
    tm.left=Math.max(0,Math.round((tm.end-Date.now())/1000));
    if(tm.left<=0){
      tm.run=false;tm.left=tm.min*60;
      const h=+(tm.min/60).toFixed(2);
      mutate(s=>{s.logs.push({id:Date.now(),u:me,h,s:"Focus session",d:iso()})});
      alert("Session complete! Logged "+tm.min+" minutes.");
    }
  }
  const d=$("#tmd"),b=$("#tmb");
  if(d)d.textContent=mmss(tm.left);
  if(b)b.textContent=tm.run?"Pause":"Start";
},500);

/* ---------- join ---------- */
const mem2=s=>Object.keys(s.members).length;
H.join=async(f,e)=>{
  const err=$("#err");err.textContent="";
  try{
    room=f.get("room").trim().toLowerCase();me=f.get("user").trim().toLowerCase();pass=f.get("pass");
    if(!/^[a-z0-9_]{3,20}$/.test(me))throw Error("user");
    rid=await hash("r:"+room);
    K=await key(pass,"costudy:"+room);
    ref=doc(db,"rooms",rid,"d","shared");
    chatCol=collection(db,"rooms",rid,"chat");
    privRef=doc(db,"rooms",rid,"d","p_"+await hash("u:"+room+me));
    await mutate(s=>{
      if(!s.members[me]){
        const n=mem2(s);if(n>=2)throw Error("full");
        s.members[me]={name:me,bio:"",c:n};s.todos[me]=[];s.habits[me]=[];
      }
    },e.submitter.id=="join");
    start();
  }catch(x){
    err.textContent={nf:"Room not found. Check the code, or choose Create room.",full:"This room already has two members.",user:"Username: 3–20 letters, numbers or underscores."}[x.message]||"Wrong passcode, or the connection failed. ("+(x.code||x.message)+")";
  }
};

function start(){
  $("#gate").hidden=true;$("#app").hidden=false;$("#rb").textContent="Room: "+room.toUpperCase();
  onSnapshot(ref,async d=>{S=await dec(K,d.data());if(tab!="me"&&tab!="chat")render();else if(tab=="chat")fill()});
  onSnapshot(query(chatCol,orderBy("t"),limit(100)),async q=>{
    chat=await Promise.all(q.docs.map(async d=>({...await dec(K,d.data()),t:d.data().t})));
    if(tab=="chat")fill();
  });
}

/* ---------- events ---------- */
document.addEventListener("click",e=>{const b=e.target.closest("[data-a]");if(!b)return;const[a,...x]=b.dataset.a.split(":");A[a]?.(...x)});
document.addEventListener("submit",e=>{e.preventDefault();const f=e.target;H[f.dataset.f]?.(new FormData(f),e);if(f.dataset.f!="join")f.reset()});
document.addEventListener("change",e=>{if(e.target.id=="notes"){P.notes=e.target.value;sp()}});
window.addEventListener("unhandledrejection",()=>alert("Couldn't save. Check your connection and try again."));