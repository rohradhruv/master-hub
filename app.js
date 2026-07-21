/* ================= MASTER HUB — app logic ================= */
'use strict';

/* ---------- state ---------- */
const LS_KEY = 'masterhub_v1';

const SEED = {
  name: '',
  view: 'dashboard',
  linkSections: ['College', 'Coding', 'Placement Prep'],
  links: [],
  resCats: ['Notes', 'Books', 'Papers', 'Cheat Sheets'],
  resources: [],           // {id,title,cat,url,fileId,fileName}
  companies: [],           // {id,name,role,status,link,ctc,process,dates:[{label,date}],notes}
  vidTags: ['DSA', 'Dev', 'Placement', 'Core Subjects'],
  videos: [],              // {id,title,url,vid,tag}
  clips: [],               // {id,label,text,pinned,copies}
  igCollections: ['Coding', 'College Life', 'Motivation', 'Memes'],
  igSubs: {},              // {collection: [subtopic,…]}
  igLinks: [],             // {id,title,url,coll,sub,note}
  aiCats: ['Chat', 'Coding', 'Research', 'Design', 'Productivity'],
  aitools: [
    {id:'a1', name:'Claude',      url:'https://claude.ai',       cat:'Chat',   desc:'Deep reasoning, coding & long documents'},
    {id:'a2', name:'ChatGPT',     url:'https://chat.openai.com', cat:'Chat',   desc:'General purpose assistant'},
    {id:'a3', name:'Perplexity',  url:'https://perplexity.ai',   cat:'Research', desc:'AI search engine with sources'},
    {id:'a4', name:'NotebookLM',  url:'https://notebooklm.google.com', cat:'Research', desc:'Chat with your PDFs & notes'},
  ],
  courses: [],             // {id,name,platform,url,progress,goal}
  semesters: ['Sem 5', 'Sem 6', 'Sem 7', 'Sem 8'],
  academics: [],           // {id,sem,subject,title,url}
  tasks: [],               // {id,text,due,pri,tag,done}
  plans: [],               // {id,title,why,deadline,steps:[{text,done}]}
  chat: [],                // {role,text}
  apiKey: '',
  theme: 'light',
  notes: [],               // {id,title,body,color,ts}
  focus: {sessions:0, minutes:0, streakDays:[], last:null},  // streakDays: ['2026-07-20',…]
  toolkit: {sems:[], att:{attended:'', held:'', target:75}}, // sems: [{sgpa,credits}]
};

let S = load();
function load(){
  try{ const raw = localStorage.getItem(LS_KEY); if(raw){ return Object.assign({}, SEED, JSON.parse(raw)); } }catch(e){}
  return JSON.parse(JSON.stringify(SEED));
}

/* ---------- single shared database ----------
   Two backends, used automatically:
   • LOCAL  — the Python server's /api/state (when the app is opened from your PC's server)
   • CLOUD  — a private blob at jsonblob.com reachable from anywhere over https
   Every save() writes localStorage first (instant, offline-safe), then pushes,
   debounced. A light poll keeps all devices in sync; newest `rev` wins and
   diverged edits are union-merged so nothing is lost. */
const IS_LOCAL_HOST = /^(localhost|127\.|192\.168\.|10\.|172\.)/.test(location.hostname);
const API_OK = location.protocol !== 'file:' && IS_LOCAL_HOST;
const CLOUD_BASE = 'https://jsonblob.com/api/jsonBlob';
let CLOUD_ID = localStorage.getItem('mh_cloud') || '';
// join a shared database via ?db=… (from the pairing QR)
(function(){
  const dbp = new URLSearchParams(location.search).get('db');
  if(dbp && /^[a-f0-9-]{20,50}$/i.test(dbp)){
    CLOUD_ID = dbp;
    localStorage.setItem('mh_cloud', dbp);
    history.replaceState(null, '', location.pathname);
  }
})();
let cloudCoolOff = 0;   // when the service says "too many requests", back off politely
function cloudGuard(r){
  if(r.status === 429){ cloudCoolOff = Date.now() + 90000; throw new Error(429); }
  return r;
}
async function cloudCreate(){
  const st = Object.assign({}, S); delete st.apiKey;   // API key never leaves this device
  const res = cloudGuard(await fetch(CLOUD_BASE, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(st)}));
  const loc = res.headers.get('Location') || '';
  const id = loc.split('/').pop();
  if(!id) throw new Error('no id');
  CLOUD_ID = id;
  localStorage.setItem('mh_cloud', id);
  return id;
}
async function cloudPush(){
  if(!CLOUD_ID || Date.now() < cloudCoolOff) return;
  const st = Object.assign({}, S); delete st.apiKey;
  const r = cloudGuard(await fetch(CLOUD_BASE + '/' + CLOUD_ID, {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(st)}));
  if(!r.ok) throw new Error(r.status);
}
let lastCloudPullAt = 0;
async function cloudPull(force){
  if(!CLOUD_ID || Date.now() < cloudCoolOff) return null;
  if(!force && Date.now() - lastCloudPullAt < 25000) return null;   // be gentle with the free service
  lastCloudPullAt = Date.now();
  const r = cloudGuard(await fetch(CLOUD_BASE + '/' + CLOUD_ID, {cache:'no-store'}));
  if(!r.ok) throw new Error(r.status);
  return r.json();
}
let syncT = null, lastPushed = '';
function save(){
  S.rev = Date.now();
  localStorage.setItem(LS_KEY, JSON.stringify(S));
  if(!API_OK) return;
  clearTimeout(syncT);
  syncT = setTimeout(pushState, 500);
}
async function pushState(depth){
  if(!API_OK && !CLOUD_ID){ return; }
  const body = JSON.stringify(S);
  if(body === lastPushed) return;
  try{
    if(API_OK){
      const r = await fetch('/api/state', {method:'POST', headers:{'Content-Type':'application/json'}, body});
      if(r.status === 409 && (depth||0) < 2){
        // someone else saved newer data meanwhile → merge theirs + ours, push the union
        const remote = await (await fetch('/api/state', {cache:'no-store'})).json();
        S = mergeRemote(remote);
        localStorage.setItem(LS_KEY, JSON.stringify(S));
        applyTheme(); render();
        return pushState((depth||0) + 1);
      }
      if(!r.ok) throw new Error(r.status);
    }
    if(CLOUD_ID) await cloudPush();
    lastPushed = body;
    setSyncDot(true);
  }catch(e){ setSyncDot(false); }
}
async function pullState(initial){
  if(!API_OK && !CLOUD_ID){ setSyncDot(false); return; }
  try{
    let remote = null;
    if(API_OK){
      remote = await (await fetch('/api/state', {cache:'no-store'})).json();
      // local server + cloud both on: take whichever is newest so PC & phone meet
      if(CLOUD_ID){
        try{
          const c = await cloudPull(initial);
          if(c && (c.rev||0) > (remote && remote.rev || 0)) remote = c;
        }catch(e){}
      }
    } else {
      remote = await cloudPull(initial);
      if(remote === null && !initial){ return; }   // gated tick — nothing to do
    }
    setSyncDot(true);
    if(!remote || !Object.keys(remote).length){
      if(initial) pushState();               // fresh server: seed it with this device's data
      return;
    }
    if((remote.rev||0) > (S.rev||0)){
      const dirty = lastPushed !== '' && lastPushed !== JSON.stringify(S);
      if(dirty){
        // we have unsent local changes → merge (nothing gets lost), then push the union
        S = mergeRemote(remote);
        localStorage.setItem(LS_KEY, JSON.stringify(S));
        pushState();
      } else {
        const keep = initial ? {apiKey: S.apiKey} : {view: S.view, theme: S.theme, apiKey: S.apiKey};
        S = Object.assign({}, SEED, remote, keep);
        localStorage.setItem(LS_KEY, JSON.stringify(S));
        lastPushed = JSON.stringify(S);
      }
      applyTheme(); render();
    } else if(initial && (S.rev||0) > (remote.rev||0)){
      pushState();                           // this device is ahead → update the database
    }
  }catch(e){ setSyncDot(false); }
}
/* union-merge: remote + local, local wins on the same id; nothing silently lost */
function mergeRemote(remote){
  const out = Object.assign({}, SEED, remote);
  Object.keys(SEED).forEach(k => {
    const l = S[k], r = remote ? remote[k] : null;
    if(Array.isArray(l) && Array.isArray(r)){
      if(l.every(x => typeof x === 'string') && r.every(x => typeof x === 'string')){
        out[k] = [...new Set([...r, ...l])];
      } else {
        const map = new Map();
        r.forEach(it => it && it.id && map.set(it.id, it));
        l.forEach(it => it && it.id && map.set(it.id, it));
        out[k] = [...map.values()];
      }
    }
  });
  // igSubs is {collection:[topics]}
  out.igSubs = Object.assign({}, remote && remote.igSubs, S.igSubs);
  out.view = S.view; out.theme = S.theme; out.apiKey = S.apiKey;
  out.rev = Date.now();
  return out;
}
function setSyncDot(ok){
  const el = $('syncDot');
  if(el){
    el.style.color = ok ? 'var(--good)' : 'var(--warn)';
    el.title = ok ? 'Connected — one shared database' : 'NOT connected to the hub database';
  }
  const bar = $('connBar');
  if(bar){
    bar.hidden = !!ok;
    if(!ok){
      bar.innerHTML = location.protocol === 'file:'
        ? '⚠ You opened the file directly — launch with the <b>Master Hub</b> desktop icon instead, otherwise nothing syncs. Tap for help.'
        : '⚠ Not connected to your hub database — changes stay on this device for now. <b>Tap to fix</b>';
    }
  }
}
setInterval(() => { if(!document.hidden){ pullState(false); pushState(); } }, 5000);
window.addEventListener('focus', () => pullState(false));
document.addEventListener('click', e => {
  if(e.target.closest('#connBar')) connHelp();
});
async function connHelp(){
  let reach = false, info = null;
  try{ info = await (await fetch('/api/info', {cache:'no-store'})).json(); reach = true; }catch(e){}
  const onPhone = /android|iphone|mobile/i.test(navigator.userAgent);
  openModal('🔌 Get everything syncing',
    `<div style="font-size:13px;line-height:1.8;color:var(--muted)">
    <p><b style="color:var(--text)">Status:</b> ${reach
      ? '<span style="color:var(--good)">✓ Connected to the database — you are good, everything syncs.</span>'
      : '<span style="color:var(--bad)">✗ This device cannot reach the hub database right now.</span>'}</p>
    <p style="margin-top:10px"><b style="color:var(--text)">This page:</b> ${esc(location.href)}</p>
    ${location.protocol === 'file:' ? `<p style="color:var(--bad)">You opened index.html as a file. Close this and use the <b>Master Hub</b> icon on the desktop (or http://localhost:8787). File-mode cannot sync.</p>` : ''}
    ${!reach && !onPhone ? `<p style="margin-top:10px"><b style="color:var(--text)">On this PC, in the master-hub folder:</b><br>
      1. Double-click <b>Master Hub.bat</b> (starts the database server)<br>
      2. Run <b>FIX - allow phone connection.bat</b> once → click Yes (lets your phone in through the firewall)</p>` : ''}
    ${!reach && onPhone ? `<p style="margin-top:10px"><b style="color:var(--text)">Checklist for the phone:</b><br>
      1. The PC must be ON with Master Hub running<br>
      2. Phone on the <b>same Wi-Fi</b> as the PC<br>
      3. On the PC, run <b>FIX - allow phone connection.bat</b> once (firewall)<br>
      4. Open the app from the icon installed via the 📱 QR — the address must look like <b>http://192.168.x.x:8787</b></p>` : ''}
    <p style="margin-top:10px;color:var(--faint)">While disconnected, everything you add is saved safely on this device and merges into the database automatically the moment the connection is back — nothing is lost.</p>
    </div>`);
}
function uid(){ return 'x' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

/* ---------- helpers ---------- */
function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function $(id){ return document.getElementById(id); }
function toast(msg){
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2200);
}
function fmtDate(d){
  if(!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', {day:'numeric', month:'short', year:'numeric'});
}
function daysUntil(d){
  if(!d) return null;
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.round((new Date(d + 'T00:00:00') - now) / 86400000);
}
function dueBadge(d){
  const n = daysUntil(d);
  if(n === null) return '';
  let cls = '', txt = fmtDate(d);
  if(n < 0){ cls = 'urgent'; txt = Math.abs(n) + 'd overdue'; }
  else if(n === 0){ cls = 'urgent'; txt = 'Today'; }
  else if(n === 1){ cls = 'soon'; txt = 'Tomorrow'; }
  else if(n <= 7){ cls = 'soon'; txt = 'in ' + n + ' days'; }
  return `<span class="dl ${cls}">${txt}</span>`;
}
function host(u){ try{ return new URL(u).hostname.replace('www.',''); }catch(e){ return u; } }
function openURL(u){ if(u) window.open(u, '_blank', 'noopener'); }
function ytId(u){
  const m = String(u).match(/(?:youtu\.be\/|v=|shorts\/|embed\/|live\/)([\w-]{11})/);
  return m ? m[1] : null;
}

/* ---------- IndexedDB for PDF files ---------- */
let dbP = null;
function idb(){
  if(dbP) return dbP;
  dbP = new Promise((res, rej) => {
    const r = indexedDB.open('masterhub_files', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbP;
}
async function idbPut(id, blob){
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').put(blob, id);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}
async function idbGet(id){
  const db = await idb();
  return new Promise((res, rej) => {
    const rq = db.transaction('files').objectStore('files').get(id);
    rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
  });
}
/* Files live on the server (shared across devices); IndexedDB is a local cache
   + offline fallback. */
async function filePut(id, blob){
  idbPut(id, blob).catch(() => {});
  if(API_OK){
    try{
      await fetch('/api/file/' + id, {method:'POST', headers:{'Content-Type': blob.type || 'application/octet-stream'}, body: blob});
    }catch(e){ toast('Saved on this device — will need the server for other devices'); }
  }
}
async function fileGet(id){
  if(API_OK){
    try{
      const res = await fetch('/api/file/' + id);
      if(res.ok){
        const blob = await res.blob();
        idbPut(id, blob).catch(() => {});
        return blob;
      }
    }catch(e){}
  }
  return idbGet(id).catch(() => null);
}
async function fileDel(id){
  try{
    const db = await idb();
    db.transaction('files', 'readwrite').objectStore('files').delete(id);
  }catch(e){}
  if(API_OK) fetch('/api/file/' + id, {method:'DELETE'}).catch(() => {});
}
async function openStoredFile(id, name){
  const blob = await fileGet(id);
  if(!blob){ toast('File not found'); return; }
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

/* ---------- theme ---------- */
function applyTheme(){
  document.documentElement.dataset.theme = S.theme || 'light';
  $('themeBtn').textContent = S.theme === 'dark' ? '☀️' : '🌙';
  const meta = document.querySelector('meta[name=theme-color]');
  if(meta) meta.content = S.theme === 'dark' ? '#0c1222' : '#eaf1fa';
}
$('themeBtn').addEventListener('click', () => {
  S.theme = S.theme === 'dark' ? 'light' : 'dark';
  save(); applyTheme();
  toast(S.theme === 'dark' ? 'Dark mode 🌙' : 'Light mode ☀️');
});

/* ---------- cursor FX (desktop) ---------- */
(function cursorFX(){
  if(window.matchMedia('(pointer:coarse)').matches) return;
  const dot = $('curDot'), ring = $('curRing');
  let mx = -100, my = -100, rx = -100, ry = -100, raf;
  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    dot.style.transform = `translate(${mx}px,${my}px) translate(-50%,-50%)`;
    const t = e.target.closest('button, a, .link-btn, .card, .clip-row, input, textarea, select');
    ring.classList.toggle('hovering', !!t);
    if(!raf) loop();
    // spotlight position for hovered cards
    const spot = e.target.closest('.link-btn, .card');
    if(spot){
      const r = spot.getBoundingClientRect();
      spot.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      spot.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }
  });
  function loop(){
    rx += (mx - rx) * 0.16; ry += (my - ry) * 0.16;
    ring.style.transform = `translate(${rx}px,${ry}px) translate(-50%,-50%)`;
    raf = requestAnimationFrame(loop);
  }
})();

/* ---------- modal ---------- */
function openModal(title, bodyHTML, onMount){
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = bodyHTML;
  $('modalBackdrop').classList.add('open');
  if(onMount) onMount();
  const f = $('modalBody').querySelector('input,textarea,select');
  if(f) setTimeout(() => f.focus(), 60);
}
function closeModal(){ $('modalBackdrop').classList.remove('open'); }
function field(label, inner){ return `<div class="field"><label>${label}</label>${inner}</div>`; }
function inp(id, ph, type, val){ return `<input id="${id}" type="${type||'text'}" placeholder="${ph||''}" value="${esc(val||'')}">`; }
function sel(id, opts, val){
  return `<select id="${id}">${opts.map(o => `<option ${o===val?'selected':''}>${esc(o)}</option>`).join('')}</select>`;
}
function saveBtn(label){ return `<button class="btn btn-primary" id="mSave" style="margin-top:6px">${label||'Save'}</button>`; }

/* ---------- navigation ---------- */
function setView(v){
  S.view = v; save();
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  render();
  window.scrollTo({top:0});
}
document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

/* ---------- render dispatcher ---------- */
const VIEWS = {};
function render(){
  const fabViews = ['links','resources','internships','videos','clipboard','instagram','notes','aitools','courses','academics','tasks','planner'];
  $('fab').classList.toggle('hidden', !fabViews.includes(S.view));
  greet();
  ($('viewRoot').innerHTML = '');
  (VIEWS[S.view] || VIEWS.dashboard)();
  stagger();
  if(typeof updatePill === 'function') updatePill();
}
function stagger(){
  const kids = $('viewRoot').querySelectorAll('.grid > *, .stat, .task-row, .clip-row, .note-card, .empty, .dash-cols > div > .card');
  kids.forEach((el, i) => {
    if(i > 24) return;
    el.classList.add('rise');
    el.style.animationDelay = (i * 35) + 'ms';
  });
}
function greet(){
  const h = new Date().getHours();
  const g = h < 5 ? 'Burning the midnight oil' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const name = S.name ? ', ' + S.name : '';
  $('greet').innerHTML = `<h2>${g}${esc(name)} 👋</h2><p>${new Date().toLocaleDateString('en-IN',{weekday:'long', day:'numeric', month:'long'})}</p>`;
}

/* ================= DASHBOARD ================= */
VIEWS.dashboard = function(){
  const pending = S.tasks.filter(t => !t.done);
  const active = S.companies.filter(c => !['Offer ✦','Rejected'].includes(c.status));
  const avgProg = S.courses.length ? Math.round(S.courses.reduce((a,c) => a + (+c.progress||0), 0) / S.courses.length) : 0;

  // upcoming: tasks + company dates within 30 days
  const upcoming = [];
  S.tasks.filter(t => !t.done && t.due).forEach(t => upcoming.push({label:t.text, date:t.due, kind:'📌 Task', go:'tasks'}));
  S.companies.forEach(c => (c.dates||[]).forEach(d => { if(d.date) upcoming.push({label:c.name + ' — ' + d.label, date:d.date, kind:'💼', go:'internships'}); }));
  upcoming.sort((a,b) => a.date.localeCompare(b.date));
  const soon = upcoming.filter(u => { const n = daysUntil(u.date); return n !== null && n >= -3 && n <= 45; }).slice(0, 8);

  $('viewRoot').innerHTML = `
  <div class="stat-grid">
    <div class="stat"><div class="glow" style="background:#7c6cff"></div><div class="num">${pending.length}</div><div class="lbl">Tasks pending</div></div>
    <div class="stat"><div class="glow" style="background:#ff6ec7"></div><div class="num">${active.length}</div><div class="lbl">Companies in play</div></div>
    <div class="stat"><div class="glow" style="background:#3ec8ff"></div><div class="num">${avgProg}%</div><div class="lbl">Avg course progress</div></div>
    <div class="stat"><div class="glow" style="background:#3ddc97"></div><div class="num">${S.links.length + S.resources.length + S.videos.length}</div><div class="lbl">Resources saved</div></div>
  </div>
  <div class="dash-cols">
    <div style="display:flex;flex-direction:column;gap:18px">
      <div class="card" style="transform:none">
        <div class="panel-title">⚡ Quick launch</div>
        ${S.links.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">${
          S.links.slice(0, 6).map(l => `
          <button class="link-btn" onclick="openURL('${esc(l.url)}')" style="padding:11px 13px">
            <div class="link-ic" style="width:34px;height:34px;font-size:15px">${esc(l.icon || '🔗')}</div>
            <div class="link-meta"><div class="t" style="font-size:13px">${esc(l.title)}</div></div>
          </button>`).join('')}</div>`
        : `<p style="color:var(--muted);font-size:13px">Save your first link in <b>Quick Links</b> and it appears here as a one-click button.</p>`}
      </div>
      <div class="card" style="transform:none">
        <div class="panel-title">📅 Coming up</div>
        ${soon.length ? soon.map(u => `
          <div class="mini-item" style="cursor:pointer" onclick="setView('${u.go}')">
            <span>${u.kind}</span><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(u.label)}</span>${dueBadge(u.date)}
          </div>`).join('')
        : `<p style="color:var(--muted);font-size:13px">No deadlines on the radar. Add tasks or company dates and they show up here automatically.</p>`}
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:18px">
      <div class="card" style="transform:none">
        <div class="panel-title">✅ Today's focus</div>
        ${pending.slice(0, 6).map(t => `
          <div class="mini-item">
            <button class="cb ${t.done?'on':''}" onclick="toggleTask('${t.id}')">${t.done?'✓':''}</button>
            <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.text)}</span>
            ${t.due ? dueBadge(t.due) : ''}
          </div>`).join('') || `<p style="color:var(--muted);font-size:13px">All clear! Add tasks from the Tasks section.</p>`}
      </div>
      <div class="card" style="transform:none">
        <div class="panel-title">🎓 Course momentum</div>
        ${S.courses.slice(0, 4).map(c => `
          <div style="margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px"><span>${esc(c.name)}</span><span class="prog-num">${c.progress||0}%</span></div>
            <div class="prog-track"><div class="prog-fill" style="width:${c.progress||0}%"></div></div>
          </div>`).join('') || `<p style="color:var(--muted);font-size:13px">Track courses in the Courses section and watch the bars fill up.</p>`}
      </div>
    </div>
  </div>`;
};

/* ================= QUICK LINKS ================= */
VIEWS.links = function(){
  const cur = S._linkFilter || 'All';
  const items = S.links.filter(l => cur === 'All' || l.section === cur);
  $('viewRoot').innerHTML = `
  <div class="sec-head">
    <div><div class="sec-title"><span class="em">🔗</span>Quick Links</div><div class="sec-sub">Every saved link becomes a one-click launch button</div></div>
    <button class="btn btn-soft" onclick="addLinkSection()">＋ New section</button>
  </div>
  <div class="chip-row">
    <button class="chip ${cur==='All'?'active':''}" onclick="S._linkFilter='All';render()">All</button>
    ${S.linkSections.map(s => `<button class="chip ${cur===s?'active':''}" onclick="S._linkFilter='${esc(s)}';render()">${esc(s)}</button>`).join('')}
  </div>
  ${items.length ? `<div class="grid grid-3">${items.map(l => `
    <div style="position:relative">
      <button class="link-btn" onclick="openURL('${esc(l.url)}')">
        <div class="link-ic">${esc(l.icon || '🔗')}</div>
        <div class="link-meta"><div class="t">${esc(l.title)}</div><div class="u">${esc(host(l.url))} · ${esc(l.section)}</div></div>
      </button>
      <div class="card-actions">
        <button class="icon-btn" onclick="addLink('${l.id}')" title="Edit">✏️</button>
        <button class="icon-btn danger" onclick="delItem('links','${l.id}')" title="Delete">🗑</button>
      </div>
    </div>`).join('')}</div>`
  : `<div class="empty"><div class="big">🔗</div><h3>No links yet</h3><p>Hit the ＋ button to save your first link — it becomes a button that opens the site instantly.</p></div>`}`;
};
function addLinkSection(){
  openModal('New section', field('Section name', inp('f1', 'e.g. Semester 6, Job Portals…')) + saveBtn('Create'), () => {
    $('mSave').onclick = () => {
      const v = $('f1').value.trim();
      if(!v) return;
      if(!S.linkSections.includes(v)) S.linkSections.push(v);
      save(); closeModal(); render(); toast('Section "' + v + '" created');
    };
  });
}
function addLink(editId){
  const e = editId ? S.links.find(x => x.id === editId) : null;
  openModal(e ? 'Edit link' : 'Add link',
    field('Title', inp('f1', 'e.g. College ERP Portal', 'text', e && e.title)) +
    field('URL', inp('f2', 'https://…', 'url', e && e.url)) +
    field('Section', sel('f3', S.linkSections, e && e.section)) +
    field('Emoji icon (optional)', inp('f4', '🎓', 'text', e && e.icon)) +
    saveBtn(), () => {
    $('mSave').onclick = () => {
      const title = $('f1').value.trim(); let url = $('f2').value.trim();
      if(!title || !url) return toast('Title and URL are required');
      if(!/^https?:\/\//i.test(url)) url = 'https://' + url;
      if(e){ Object.assign(e, {title, url, section: $('f3').value, icon: $('f4').value.trim()}); }
      else S.links.push({id: uid(), title, url, section: $('f3').value, icon: $('f4').value.trim()});
      save(); closeModal(); render(); toast(e ? 'Link updated' : 'Link button created ✦');
    };
  });
}

/* ================= RESOURCES & PDFS ================= */
VIEWS.resources = function(){
  const cur = S._resFilter || 'All';
  const items = S.resources.filter(r => cur === 'All' || r.cat === cur);
  $('viewRoot').innerHTML = `
  <div class="sec-head">
    <div><div class="sec-title"><span class="em">📚</span>Resources & PDFs</div><div class="sec-sub">Upload PDFs or save resource links — classified your way</div></div>
    <button class="btn btn-soft" onclick="addResCat()">＋ New category</button>
  </div>
  <div class="chip-row">
    <button class="chip ${cur==='All'?'active':''}" onclick="S._resFilter='All';render()">All</button>
    ${S.resCats.map(c => `<button class="chip ${cur===c?'active':''}" onclick="S._resFilter='${esc(c)}';render()">${esc(c)}</button>`).join('')}
  </div>
  ${items.length ? `<div class="grid grid-3">${items.map(r => `
    <div class="res-card" style="position:relative">
      <button class="link-btn" onclick="${r.fileId ? `openStoredFile('${r.fileId}')` : `openURL('${esc(r.url)}')`}">
        <div class="link-ic">${r.fileId ? '📄' : '🌐'}</div>
        <div class="link-meta"><div class="t">${esc(r.title)}</div><div class="u">${esc(r.cat)}${r.fileName ? ' · ' + esc(r.fileName) : r.url ? ' · ' + esc(host(r.url)) : ''}</div></div>
      </button>
      <div class="card-actions"><button class="icon-btn danger" onclick="delResource('${r.id}')" title="Delete">🗑</button></div>
    </div>`).join('')}</div>`
  : `<div class="empty"><div class="big">📚</div><h3>Your library is empty</h3><p>Tap ＋ to upload a PDF (stored right in this app) or save a resource link, then classify it into a category.</p></div>`}`;
};
function addResCat(){
  openModal('New category', field('Category name', inp('f1', 'e.g. Aptitude, Interview Qs…')) + saveBtn('Create'), () => {
    $('mSave').onclick = () => {
      const v = $('f1').value.trim(); if(!v) return;
      if(!S.resCats.includes(v)) S.resCats.push(v);
      save(); closeModal(); render(); toast('Category created');
    };
  });
}
function addResource(){
  openModal('Add resource',
    field('Title', inp('f1', 'e.g. OS Notes Unit 3')) +
    field('Category', sel('f2', S.resCats)) +
    field('Link (or upload a file below)', inp('f3', 'https://…', 'url')) +
    `<div class="drop" id="drop">📄 Click to upload PDF / any file<br><small id="dropName" style="color:var(--acc2)"></small></div>
     <input type="file" id="fileInp" hidden>` +
    saveBtn(), () => {
    let picked = null;
    $('drop').onclick = () => $('fileInp').click();
    $('fileInp').onchange = () => { picked = $('fileInp').files[0]; $('dropName').textContent = picked ? picked.name : ''; };
    $('mSave').onclick = async () => {
      const title = $('f1').value.trim(); let url = $('f3').value.trim();
      if(!title) return toast('Give it a title');
      if(!url && !picked) return toast('Add a link or upload a file');
      const item = {id: uid(), title, cat: $('f2').value, url: '', fileId: '', fileName: ''};
      if(picked){
        item.fileId = uid(); item.fileName = picked.name;
        await filePut(item.fileId, picked);
      } else {
        if(!/^https?:\/\//i.test(url)) url = 'https://' + url;
        item.url = url;
      }
      S.resources.push(item); save(); closeModal(); render(); toast('Saved to library ✦');
    };
  });
}
function delResource(id){
  const r = S.resources.find(x => x.id === id);
  if(r && r.fileId) fileDel(r.fileId);
  S.resources = S.resources.filter(x => x.id !== id);
  save(); render(); toast('Deleted');
}

/* ================= INTERNSHIPS ================= */
const CO_STATUSES = ['Researching','Preparing','Applied','Online Assessment','Interview','Offer ✦','Rejected'];
const CO_COLORS = {'Researching':'#8b93b0','Preparing':'#3ec8ff','Applied':'#7c6cff','Online Assessment':'#ffc857','Interview':'#ff6ec7','Offer ✦':'#3ddc97','Rejected':'#ff6b6b'};
VIEWS.internships = function(){
  const cur = S._coFilter || 'All';
  const items = S.companies.filter(c => cur === 'All' || c.status === cur);
  $('viewRoot').innerHTML = `
  <div class="sec-head">
    <div><div class="sec-title"><span class="em">💼</span>Internship Tracker</div><div class="sec-sub">Every target company, its process, and key dates in one place</div></div>
  </div>
  <div class="chip-row">
    <button class="chip ${cur==='All'?'active':''}" onclick="S._coFilter='All';render()">All (${S.companies.length})</button>
    ${CO_STATUSES.map(s => { const n = S.companies.filter(c => c.status === s).length; return n ? `<button class="chip ${cur===s?'active':''}" onclick="S._coFilter='${s}';render()">${s} (${n})</button>` : ''; }).join('')}
  </div>
  ${items.length ? `<div class="grid grid-2">${items.map(c => `
    <div class="card co-card">
      <div class="co-top">
        <div class="co-logo">${esc((c.name||'?')[0].toUpperCase())}</div>
        <div style="flex:1;min-width:0">
          <div class="co-name">${esc(c.name)}</div>
          <div class="co-role">${esc(c.role || 'Role TBD')}${c.ctc ? ' · ' + esc(c.ctc) : ''}</div>
        </div>
        <span class="status-pill" style="background:${CO_COLORS[c.status]}22;color:${CO_COLORS[c.status]}">${c.status}</span>
      </div>
      ${c.process ? `<div class="co-block"><div class="bt">Recruitment process</div><div class="co-process">${esc(c.process)}</div></div>` : ''}
      ${(c.dates||[]).length ? `<div class="co-block"><div class="bt">Key dates</div>${c.dates.map(d => `<div class="co-date-row"><b>${esc(d.label)}</b><span>${fmtDate(d.date)} ${dueBadge(d.date)}</span></div>`).join('')}</div>` : ''}
      ${c.notes ? `<div class="co-block"><div class="bt">Notes</div><div class="co-process">${esc(c.notes)}</div></div>` : ''}
      <div style="display:flex;gap:8px;margin-top:2px">
        ${c.link ? `<button class="btn btn-soft" style="padding:8px 14px;font-size:12px" onclick="openURL('${esc(c.link)}')">↗ Careers page</button>` : ''}
        <button class="btn btn-soft" style="padding:8px 14px;font-size:12px" onclick="addCompany('${c.id}')">✏️ Edit</button>
        <button class="btn btn-soft btn-danger" style="padding:8px 14px;font-size:12px" onclick="delItem('companies','${c.id}')">🗑</button>
      </div>
    </div>`).join('')}</div>`
  : `<div class="empty"><div class="big">💼</div><h3>No companies tracked yet</h3><p>Internship season is coming — tap ＋ and add your first target company with its full recruitment process and expected dates.</p></div>`}`;
};
function addCompany(editId){
  const e = editId ? S.companies.find(x => x.id === editId) : null;
  const dates = e && e.dates ? e.dates : [];
  openModal(e ? 'Edit company' : 'Track a company',
    field('Company name', inp('f1', 'e.g. Google', 'text', e && e.name)) +
    field('Role', inp('f2', 'e.g. SDE Intern', 'text', e && e.role)) +
    field('Status', sel('f3', CO_STATUSES, e ? e.status : 'Researching')) +
    field('Stipend / CTC (optional)', inp('f4', 'e.g. ₹80k/month', 'text', e && e.ctc)) +
    field('Careers / application link', inp('f5', 'https://…', 'url', e && e.link)) +
    field('Recruitment process', `<textarea id="f6" placeholder="e.g.&#10;1. Online Assessment — 2 DSA questions&#10;2. Technical Interview x2&#10;3. HR round">${esc(e && e.process || '')}</textarea>`) +
    field('Key dates', `<div id="dateRows"></div><button class="btn btn-soft" style="padding:7px 13px;font-size:12px" id="addDate">＋ Add date</button>`) +
    field('Notes / prep pointers', `<textarea id="f7" placeholder="Referral contacts, topics they focus on…">${esc(e && e.notes || '')}</textarea>`) +
    saveBtn(), () => {
    const rows = $('dateRows');
    function addRow(label, date){
      const div = document.createElement('div');
      div.style.cssText = 'display:flex;gap:8px;margin-bottom:8px';
      div.innerHTML = `<input placeholder="e.g. OA date" value="${esc(label||'')}" style="flex:1;padding:9px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg2);font-size:13px">
        <input type="date" value="${esc(date||'')}" style="padding:9px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg2);font-size:13px">
        <button class="icon-btn danger" onclick="this.parentElement.remove()">✕</button>`;
      rows.appendChild(div);
    }
    dates.forEach(d => addRow(d.label, d.date));
    if(!dates.length) addRow('', '');
    $('addDate').onclick = () => addRow('', '');
    $('mSave').onclick = () => {
      const name = $('f1').value.trim();
      if(!name) return toast('Company name is required');
      let link = $('f5').value.trim();
      if(link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
      const ds = [...rows.children].map(r => {
        const [l, d] = r.querySelectorAll('input');
        return {label: l.value.trim(), date: d.value};
      }).filter(x => x.label || x.date);
      const data = {name, role: $('f2').value.trim(), status: $('f3').value, ctc: $('f4').value.trim(), link, process: $('f6').value.trim(), dates: ds, notes: $('f7').value.trim()};
      if(e) Object.assign(e, data); else S.companies.push(Object.assign({id: uid()}, data));
      save(); closeModal(); render(); toast(e ? 'Updated' : name + ' added to tracker ✦');
    };
  });
}

/* ================= YOUTUBE VAULT ================= */
VIEWS.videos = function(){
  const cur = S._vidFilter || 'All';
  const items = S.videos.filter(v => cur === 'All' || v.tag === cur);
  $('viewRoot').innerHTML = `
  <div class="sec-head">
    <div><div class="sec-title"><span class="em">▶️</span>YouTube Vault</div><div class="sec-sub">Your important videos & playlists — one click to watch</div></div>
    <button class="btn btn-soft" onclick="addVidTag()">＋ New tag</button>
  </div>
  <div class="chip-row">
    <button class="chip ${cur==='All'?'active':''}" onclick="S._vidFilter='All';render()">All</button>
    ${S.vidTags.map(t => `<button class="chip ${cur===t?'active':''}" onclick="S._vidFilter='${esc(t)}';render()">${esc(t)}</button>`).join('')}
  </div>
  ${items.length ? `<div class="grid grid-3">${items.map(v => `
    <div class="card vid-card" onclick="openURL('${esc(v.url)}')" style="cursor:pointer">
      ${v.vid ? `<img class="vid-thumb" loading="lazy" src="https://i.ytimg.com/vi/${v.vid}/hqdefault.jpg" alt=""><div class="play-ov">▶️</div>` : `<div class="vid-thumb" style="display:grid;place-items:center;font-size:38px">🎬</div>`}
      <div class="vid-body"><div class="t">${esc(v.title)}</div><div class="u" style="font-size:11px;color:var(--faint);margin-top:4px">${esc(v.tag)}</div></div>
      <div class="card-actions"><button class="icon-btn danger" onclick="event.stopPropagation();delItem('videos','${v.id}')">🗑</button></div>
    </div>`).join('')}</div>`
  : `<div class="empty"><div class="big">▶️</div><h3>No videos saved</h3><p>Paste any YouTube link with ＋ — the thumbnail appears automatically and one click plays it.</p></div>`}`;
};
function addVidTag(){
  openModal('New tag', field('Tag name', inp('f1', 'e.g. System Design')) + saveBtn('Create'), () => {
    $('mSave').onclick = () => { const v = $('f1').value.trim(); if(!v) return; if(!S.vidTags.includes(v)) S.vidTags.push(v); save(); closeModal(); render(); };
  });
}
function addVideo(){
  openModal('Save a video',
    field('YouTube URL', inp('f1', 'https://youtube.com/watch?v=…', 'url')) +
    field('Title', inp('f2', 'e.g. Striver DP Playlist Ep. 12')) +
    field('Tag', sel('f3', S.vidTags)) + saveBtn(), () => {
    $('mSave').onclick = () => {
      let url = $('f1').value.trim(); const title = $('f2').value.trim();
      if(!url || !title) return toast('URL and title are required');
      if(!/^https?:\/\//i.test(url)) url = 'https://' + url;
      S.videos.push({id: uid(), url, title, tag: $('f3').value, vid: ytId(url)});
      save(); closeModal(); render(); toast('Added to vault ✦');
    };
  });
}

/* ================= CLIPBOARD ================= */
VIEWS.clipboard = function(){
  const items = [...S.clips].sort((a,b) => (b.pinned?1:0) - (a.pinned?1:0) || (b.copies||0) - (a.copies||0));
  $('viewRoot').innerHTML = `
  <div class="sec-head">
    <div><div class="sec-title"><span class="em">📋</span>Clipboard</div><div class="sec-sub">Tap any row → instantly copied. Perfect for links, emails, IDs you paste all the time</div></div>
    <button class="btn btn-soft" onclick="pasteFromClipboard()">📥 Paste from clipboard</button>
  </div>
  ${items.length ? `<div style="display:flex;flex-direction:column;gap:9px">${items.map(c => `
    <div class="clip-row ${c.pinned?'pinned':''}" id="clip-${c.id}" onclick="copyClip('${c.id}')" title="Click to copy">
      <div class="clip-ic">${c.pinned ? '📌' : looksLikeURL(c.text) ? '🔗' : '📄'}</div>
      <div class="clip-main">
        <div class="clip-label">${esc(c.label)}</div>
        <div class="clip-text">${esc(c.text)}</div>
      </div>
      ${c.copies ? `<span class="dl" title="times copied">${c.copies}×</span>` : ''}
      <div class="clip-acts" onclick="event.stopPropagation()">
        ${looksLikeURL(c.text) ? `<button class="icon-btn" onclick="openURL('${esc(normURL(c.text))}')" title="Open link">↗</button>` : ''}
        <button class="icon-btn" onclick="pinClip('${c.id}')" title="${c.pinned?'Unpin':'Pin to top'}">${c.pinned?'📌':'📍'}</button>
        <button class="icon-btn" onclick="addClip('${c.id}')" title="Edit">✏️</button>
        <button class="icon-btn danger" onclick="delItem('clips','${c.id}')" title="Delete">🗑</button>
      </div>
    </div>`).join('')}</div>`
  : `<div class="empty"><div class="big">📋</div><h3>Your instant-copy board is empty</h3><p>Save links, your email, LinkedIn URL, resume link, UPI ID — anything you paste often. One click copies it.</p></div>`}`;
};
function looksLikeURL(t){ return /^(https?:\/\/|www\.)\S+$/i.test(String(t||'').trim()); }
function normURL(t){ t = String(t).trim(); return /^https?:\/\//i.test(t) ? t : 'https://' + t; }
async function copyClip(id){
  const c = S.clips.find(x => x.id === id); if(!c) return;
  try{
    await navigator.clipboard.writeText(c.text);
    c.copies = (c.copies||0) + 1; save();
    const row = $('clip-' + id);
    if(row){ row.classList.remove('copied-flash'); void row.offsetWidth; row.classList.add('copied-flash'); }
    toast('Copied ✓ — ' + c.label);
  }catch(e){
    // fallback for non-secure contexts
    const ta = document.createElement('textarea');
    ta.value = c.text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
    c.copies = (c.copies||0) + 1; save();
    toast('Copied ✓ — ' + c.label);
  }
  render();
}
function pinClip(id){
  const c = S.clips.find(x => x.id === id);
  if(c){ c.pinned = !c.pinned; save(); render(); }
}
async function pasteFromClipboard(){
  let text = '';
  try{ text = await navigator.clipboard.readText(); }catch(e){}
  addClip(null, text);
}
function addClip(editId, prefill){
  const e = editId ? S.clips.find(x => x.id === editId) : null;
  openModal(e ? 'Edit snippet' : 'Save to clipboard',
    field('Label', inp('f1', 'e.g. My LinkedIn / Resume link / UPI ID', 'text', e && e.label)) +
    field('Text / link to copy', `<textarea id="f2" placeholder="https://… or any text">${esc(e ? e.text : prefill || '')}</textarea>`) +
    saveBtn(), () => {
    $('mSave').onclick = () => {
      const label = $('f1').value.trim(), text = $('f2').value.trim();
      if(!label || !text) return toast('Label and text are required');
      if(e) Object.assign(e, {label, text});
      else S.clips.push({id: uid(), label, text, pinned:false, copies:0});
      save(); closeModal(); render(); toast(e ? 'Updated' : 'Saved — click it anytime to copy ✦');
    };
  });
}

/* ================= INSTAGRAM ================= */
VIEWS.instagram = function(){
  const cur = S._igFilter || 'All';
  const subs = cur !== 'All' ? (S.igSubs[cur] || []) : [];
  const curSub = subs.includes(S._igSubFilter) ? S._igSubFilter : 'All';
  let items = S.igLinks.filter(l => cur === 'All' || l.coll === cur);
  if(cur !== 'All' && curSub !== 'All') items = items.filter(l => l.sub === curSub);
  $('viewRoot').innerHTML = `
  <div class="sec-head">
    <div><div class="sec-title"><span class="em">📸</span>Instagram Saves</div><div class="sec-sub">Reels, posts & profiles — organised into collections and sub-topics</div></div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-soft" onclick="addIgColl()">＋ Collection</button>
      ${cur !== 'All' ? `<button class="btn btn-soft" onclick="addIgSub('${esc(cur)}')">＋ Sub-topic</button>` : ''}
    </div>
  </div>
  <div class="chip-row">
    <button class="chip ${cur==='All'?'active':''}" onclick="S._igFilter='All';S._igSubFilter='All';render()">All (${S.igLinks.length})</button>
    ${S.igCollections.map(c => { const n = S.igLinks.filter(l => l.coll === c).length; return `<button class="chip ${cur===c?'active':''}" onclick="S._igFilter='${esc(c)}';S._igSubFilter='All';render()">${esc(c)}${n?` (${n})`:''}</button>`; }).join('')}
  </div>
  ${subs.length ? `<div class="chip-row sub">
    <button class="chip mini ${curSub==='All'?'active':''}" onclick="S._igSubFilter='All';render()">All ${esc(cur)}</button>
    ${subs.map(s => `<button class="chip mini ${curSub===s?'active':''}" onclick="S._igSubFilter='${esc(s)}';render()">${esc(s)}</button>`).join('')}
  </div>` : ''}
  ${items.length ? `<div class="grid grid-3">${items.map(l => `
    <div style="position:relative">
      <button class="link-btn" onclick="openURL('${esc(l.url)}')">
        <div class="link-ic ig-ic">${igKindIcon(l.url)}</div>
        <div class="link-meta">
          <div class="t">${esc(l.title)}</div>
          <div class="u">${esc(l.coll)}${l.sub ? ' · ' : ''}${l.sub ? `<span class="ig-badge">${esc(l.sub)}</span>` : ''}${l.note ? ' · ' + esc(l.note) : ''}</div>
        </div>
      </button>
      <div class="card-actions">
        <button class="icon-btn" onclick="addIgLink('${l.id}')" title="Edit">✏️</button>
        <button class="icon-btn danger" onclick="delItem('igLinks','${l.id}')" title="Delete">🗑</button>
      </div>
    </div>`).join('')}</div>`
  : `<div class="empty"><div class="big">📸</div><h3>No saves yet${cur!=='All' ? ' in ' + esc(cur) : ''}</h3><p>Paste any Instagram reel, post or profile link with ＋ — then file it into a collection and sub-topic so you can actually find it again.</p></div>`}`;
};
function igKindIcon(u){
  u = String(u||'');
  if(u.includes('/reel')) return '🎬';
  if(u.includes('/p/')) return '🖼️';
  return '👤';
}
function addIgColl(){
  openModal('New collection', field('Collection name', inp('f1', 'e.g. Fitness, Recipes, Study hacks…')) + saveBtn('Create'), () => {
    $('mSave').onclick = () => {
      const v = $('f1').value.trim(); if(!v) return;
      if(!S.igCollections.includes(v)) S.igCollections.push(v);
      S._igFilter = v; save(); closeModal(); render(); toast('Collection "' + v + '" created');
    };
  });
}
function addIgSub(coll){
  openModal('New sub-topic in ' + coll, field('Sub-topic name', inp('f1', 'e.g. DSA reels, Gym form…')) + saveBtn('Create'), () => {
    $('mSave').onclick = () => {
      const v = $('f1').value.trim(); if(!v) return;
      S.igSubs[coll] = S.igSubs[coll] || [];
      if(!S.igSubs[coll].includes(v)) S.igSubs[coll].push(v);
      S._igSubFilter = v; save(); closeModal(); render(); toast('Sub-topic created');
    };
  });
}
function addIgLink(editId){
  const e = editId ? S.igLinks.find(x => x.id === editId) : null;
  const curColl = e ? e.coll : (S._igFilter !== 'All' && S._igFilter) || S.igCollections[0];
  openModal(e ? 'Edit save' : 'Save from Instagram',
    field('Instagram link', inp('f1', 'https://instagram.com/reel/…', 'url', e && e.url)) +
    field('Title (what is it?)', inp('f2', 'e.g. Best pointers explanation ever', 'text', e && e.title)) +
    field('Collection', sel('f3', S.igCollections, curColl)) +
    field('Sub-topic (optional)', `<select id="f4"></select>`) +
    field('Note (optional)', inp('f5', 'why you saved it', 'text', e && e.note)) +
    saveBtn(), () => {
    function fillSubs(){
      const c = $('f3').value;
      const subs = S.igSubs[c] || [];
      $('f4').innerHTML = `<option value="">— none —</option>` + subs.map(s => `<option ${e && e.sub === s ? 'selected' : ''}>${esc(s)}</option>`).join('');
    }
    fillSubs();
    $('f3').onchange = fillSubs;
    $('mSave').onclick = () => {
      let url = $('f1').value.trim(); const title = $('f2').value.trim();
      if(!url || !title) return toast('Link and title are required');
      if(!/^https?:\/\//i.test(url)) url = 'https://' + url;
      const data = {url, title, coll: $('f3').value, sub: $('f4').value, note: $('f5').value.trim()};
      if(e) Object.assign(e, data);
      else S.igLinks.push(Object.assign({id: uid()}, data));
      save(); closeModal(); render(); toast(e ? 'Updated' : 'Saved to ' + data.coll + ' ✦');
    };
  });
}

/* ================= AI ARSENAL ================= */
VIEWS.aitools = function(){
  const cur = S._aiFilter || 'All';
  const items = S.aitools.filter(a => cur === 'All' || a.cat === cur);
  $('viewRoot').innerHTML = `
  <div class="sec-head">
    <div><div class="sec-title"><span class="em">🤖</span>AI Arsenal</div><div class="sec-sub">Every AI tool you know, organised & launchable</div></div>
    <button class="btn btn-soft" onclick="addAiCat()">＋ New category</button>
  </div>
  <div class="chip-row">
    <button class="chip ${cur==='All'?'active':''}" onclick="S._aiFilter='All';render()">All</button>
    ${S.aiCats.map(c => `<button class="chip ${cur===c?'active':''}" onclick="S._aiFilter='${esc(c)}';render()">${esc(c)}</button>`).join('')}
  </div>
  <div class="grid grid-3">${items.map(a => `
    <div style="position:relative">
      <button class="link-btn" onclick="openURL('${esc(a.url)}')">
        <div class="link-ic" style="background:linear-gradient(135deg,rgba(61,220,151,.22),rgba(62,200,255,.18))">🤖</div>
        <div class="link-meta"><div class="t">${esc(a.name)}</div><div class="u">${esc(a.desc || a.cat)}</div></div>
      </button>
      <div class="card-actions"><button class="icon-btn danger" onclick="delItem('aitools','${a.id}')">🗑</button></div>
    </div>`).join('')}</div>`;
};
function addAiCat(){
  openModal('New AI category', field('Category', inp('f1', 'e.g. Video, Slides…')) + saveBtn('Create'), () => {
    $('mSave').onclick = () => { const v = $('f1').value.trim(); if(!v) return; if(!S.aiCats.includes(v)) S.aiCats.push(v); save(); closeModal(); render(); };
  });
}
function addAiTool(){
  openModal('Add AI tool',
    field('Name', inp('f1', 'e.g. Midjourney')) +
    field('URL', inp('f2', 'https://…', 'url')) +
    field('Category', sel('f3', S.aiCats)) +
    field('What is it best at?', inp('f4', 'one line…')) + saveBtn(), () => {
    $('mSave').onclick = () => {
      const name = $('f1').value.trim(); let url = $('f2').value.trim();
      if(!name || !url) return toast('Name and URL required');
      if(!/^https?:\/\//i.test(url)) url = 'https://' + url;
      S.aitools.push({id: uid(), name, url, cat: $('f3').value, desc: $('f4').value.trim()});
      save(); closeModal(); render(); toast('Added to arsenal ✦');
    };
  });
}

/* ================= COURSES ================= */
VIEWS.courses = function(){
  $('viewRoot').innerHTML = `
  <div class="sec-head">
    <div><div class="sec-title"><span class="em">🎓</span>Courses</div><div class="sec-sub">Current courses + your index of courses to do next</div></div>
  </div>
  ${S.courses.length ? `<div class="grid grid-2">${S.courses.map(c => `
    <div class="card course-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
        <div style="min-width:0">
          <div style="font-weight:700;font-size:15px;font-family:'Sora'">${esc(c.name)}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:3px">${esc(c.platform || '')}${c.goal ? ' · goal: ' + esc(c.goal) : ''}</div>
        </div>
        <span class="tag" style="background:${(+c.progress||0) >= 100 ? 'rgba(61,220,151,.18);color:var(--good)' : (+c.progress||0) > 0 ? 'rgba(124,108,255,.18);color:var(--acc1)' : 'rgba(255,255,255,.08);color:var(--muted)'}">${(+c.progress||0) >= 100 ? 'Completed' : (+c.progress||0) > 0 ? 'In progress' : 'Up next'}</span>
      </div>
      <div class="prog-track"><div class="prog-fill" style="width:${c.progress||0}%"></div></div>
      <div style="display:flex;align-items:center;gap:12px">
        <input class="range" type="range" min="0" max="100" value="${c.progress||0}" oninput="setProgress('${c.id}', this.value, this)">
        <span class="prog-num" style="min-width:38px;text-align:right" id="pn-${c.id}">${c.progress||0}%</span>
      </div>
      <div style="display:flex;gap:8px">
        ${c.url ? `<button class="btn btn-soft" style="padding:8px 14px;font-size:12px" onclick="openURL('${esc(c.url)}')">↗ Open course</button>` : ''}
        <button class="btn btn-soft btn-danger" style="padding:8px 14px;font-size:12px" onclick="delItem('courses','${c.id}')">🗑</button>
      </div>
    </div>`).join('')}</div>`
  : `<div class="empty"><div class="big">🎓</div><h3>No courses tracked</h3><p>Add courses you're doing now and ones queued for later — drag the slider as you progress.</p></div>`}`;
};
function setProgress(id, val, elm){
  const c = S.courses.find(x => x.id === id);
  if(!c) return;
  c.progress = +val; save();
  $('pn-' + id).textContent = val + '%';
  elm.closest('.course-card').querySelector('.prog-fill').style.width = val + '%';
}
function addCourse(){
  openModal('Add course',
    field('Course name', inp('f1', 'e.g. DSA in C++ — Striver A2Z')) +
    field('Platform', inp('f2', 'e.g. YouTube / Coursera / Udemy')) +
    field('Link', inp('f3', 'https://…', 'url')) +
    field('Target finish (optional)', inp('f4', 'e.g. before Sept OA season')) + saveBtn(), () => {
    $('mSave').onclick = () => {
      const name = $('f1').value.trim();
      if(!name) return toast('Course name required');
      let url = $('f3').value.trim();
      if(url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
      S.courses.push({id: uid(), name, platform: $('f2').value.trim(), url, goal: $('f4').value.trim(), progress: 0});
      save(); closeModal(); render(); toast('Course added ✦');
    };
  });
}

/* ================= ACADEMICS ================= */
VIEWS.academics = function(){
  const cur = S._semFilter || (S.semesters[0] || 'Sem 5');
  const items = S.academics.filter(a => a.sem === cur);
  const subjects = [...new Set(items.map(i => i.subject))];
  $('viewRoot').innerHTML = `
  <div class="sec-head">
    <div><div class="sec-title"><span class="em">🏛️</span>Academics</div><div class="sec-sub">Semester-wise subjects & their resources</div></div>
    <button class="btn btn-soft" onclick="addSemester()">＋ New semester</button>
  </div>
  <div class="chip-row">${S.semesters.map(s => `<button class="chip ${cur===s?'active':''}" onclick="S._semFilter='${esc(s)}';render()">${esc(s)}</button>`).join('')}</div>
  ${items.length ? subjects.map(sub => `
    <div style="margin-bottom:22px">
      <div class="panel-title" style="margin-bottom:10px">📖 ${esc(sub)}</div>
      <div class="grid grid-3">${items.filter(i => i.subject === sub).map(a => `
        <div style="position:relative">
          <button class="link-btn" onclick="openURL('${esc(a.url)}')" style="padding:12px 15px">
            <div class="link-ic" style="width:36px;height:36px;font-size:16px">📎</div>
            <div class="link-meta"><div class="t" style="font-size:13px">${esc(a.title)}</div><div class="u">${esc(host(a.url))}</div></div>
          </button>
          <div class="card-actions"><button class="icon-btn danger" onclick="delItem('academics','${a.id}')">🗑</button></div>
        </div>`).join('')}</div>
    </div>`).join('')
  : `<div class="empty"><div class="big">🏛️</div><h3>Nothing for ${esc(cur)} yet</h3><p>Add subject-wise links: lecture playlists, PYQs, lab manuals, syllabus copies — everything for the semester in one place.</p></div>`}`;
};
function addSemester(){
  openModal('New semester', field('Name', inp('f1', 'e.g. Sem 6')) + saveBtn('Create'), () => {
    $('mSave').onclick = () => { const v = $('f1').value.trim(); if(!v) return; if(!S.semesters.includes(v)) S.semesters.push(v); S._semFilter = v; save(); closeModal(); render(); };
  });
}
function addAcademic(){
  const cur = S._semFilter || S.semesters[0];
  openModal('Add academic resource',
    field('Semester', sel('f1', S.semesters, cur)) +
    field('Subject', inp('f2', 'e.g. Operating Systems')) +
    field('Resource title', inp('f3', 'e.g. Gate Smashers playlist / PYQ 2024')) +
    field('Link', inp('f4', 'https://…', 'url')) + saveBtn(), () => {
    $('mSave').onclick = () => {
      const subject = $('f2').value.trim(), title = $('f3').value.trim(); let url = $('f4').value.trim();
      if(!subject || !title || !url) return toast('All fields are required');
      if(!/^https?:\/\//i.test(url)) url = 'https://' + url;
      S.academics.push({id: uid(), sem: $('f1').value, subject, title, url});
      S._semFilter = $('f1').value;
      save(); closeModal(); render(); toast('Added ✦');
    };
  });
}

/* ================= TASKS ================= */
const PRI_COLORS = {High:'#ff6b6b', Medium:'#ffc857', Low:'#3ddc97'};
VIEWS.tasks = function(){
  const open = S.tasks.filter(t => !t.done).sort((a,b) => (a.due||'9999').localeCompare(b.due||'9999'));
  const done = S.tasks.filter(t => t.done);
  $('viewRoot').innerHTML = `
  <div class="sec-head">
    <div><div class="sec-title"><span class="em">✅</span>Tasks</div><div class="sec-sub">${open.length} open · ${done.length} completed</div></div>
    ${done.length ? `<button class="btn btn-soft" onclick="clearDone()">Clear completed</button>` : ''}
  </div>
  <div style="display:flex;flex-direction:column;gap:9px">
    ${open.map(taskRow).join('')}
    ${open.length === 0 ? `<div class="empty"><div class="big">🎉</div><h3>All caught up</h3><p>Tap ＋ to add a task with a due date and priority.</p></div>` : ''}
    ${done.length ? `<div style="color:var(--faint);font-size:12px;letter-spacing:1.5px;text-transform:uppercase;margin:14px 0 4px">Completed</div>` + done.map(taskRow).join('') : ''}
  </div>`;
};
function taskRow(t){
  return `<div class="task-row ${t.done?'done':''}">
    <button class="cb ${t.done?'on':''}" onclick="toggleTask('${t.id}')">${t.done?'✓':''}</button>
    <span class="pri" style="background:${PRI_COLORS[t.pri]||'#8b93b0'}" title="${t.pri}"></span>
    <span class="tx">${esc(t.text)}${t.tag ? ` <span class="tag" style="background:rgba(124,108,255,.15);color:var(--acc1);margin-left:6px">${esc(t.tag)}</span>` : ''}</span>
    ${t.due ? dueBadge(t.due) : ''}
    <button class="icon-btn danger" onclick="delItem('tasks','${t.id}')">🗑</button>
  </div>`;
}
function toggleTask(id){
  const t = S.tasks.find(x => x.id === id);
  if(t){
    t.done = !t.done; save(); render();
    if(t.done && S.tasks.length && S.tasks.every(x => x.done)){ confetti(); toast('🎉 ALL tasks done — legend!'); }
  }
}
function clearDone(){ S.tasks = S.tasks.filter(t => !t.done); save(); render(); toast('Cleared'); }
function addTask(){
  openModal('Add task',
    field('What needs doing?', inp('f1', 'e.g. Finish resume v2')) +
    field('Due date (optional)', `<input id="f2" type="date" >`) +
    field('Priority', sel('f3', ['High','Medium','Low'], 'Medium')) +
    field('Tag (optional)', inp('f4', 'e.g. Placement, Sem, Personal')) + saveBtn('Add task'), () => {
    $('mSave').onclick = () => {
      const text = $('f1').value.trim();
      if(!text) return toast('Task text required');
      S.tasks.push({id: uid(), text, due: $('f2').value, pri: $('f3').value, tag: $('f4').value.trim(), done: false});
      save(); closeModal(); render(); toast('Task added ✦');
    };
  });
}

/* ================= PLANNER ================= */
VIEWS.planner = function(){
  $('viewRoot').innerHTML = `
  <div class="sec-head">
    <div><div class="sec-title"><span class="em">🗺️</span>Planner</div><div class="sec-sub">Big goals broken into steps — placement prep, projects, anything</div></div>
  </div>
  ${S.plans.length ? `<div class="grid grid-2">${S.plans.map(p => {
    const doneN = p.steps.filter(s => s.done).length;
    const pct = p.steps.length ? Math.round(doneN / p.steps.length * 100) : 0;
    return `<div class="card plan-card">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
        <div><div style="font-weight:700;font-size:15px;font-family:'Sora'">${esc(p.title)}</div>
        ${p.why ? `<div style="font-size:12.5px;color:var(--muted);margin-top:4px">${esc(p.why)}</div>` : ''}</div>
        ${p.deadline ? dueBadge(p.deadline) : ''}
      </div>
      <div class="prog-track"><div class="prog-fill" style="width:${pct}%;background:var(--grad2)"></div></div>
      <div>${p.steps.map((st, i) => `
        <div class="step-row ${st.done?'on':''}">
          <button class="cb ${st.done?'on':''}" onclick="toggleStep('${p.id}',${i})">${st.done?'✓':''}</button>
          <span style="${st.done?'text-decoration:line-through;opacity:.6':''}">${esc(st.text)}</span>
        </div>`).join('')}</div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-soft" style="padding:8px 14px;font-size:12px" onclick="addStep('${p.id}')">＋ Step</button>
        <button class="btn btn-soft btn-danger" style="padding:8px 14px;font-size:12px" onclick="delItem('plans','${p.id}')">🗑</button>
      </div>
    </div>`; }).join('')}</div>`
  : `<div class="empty"><div class="big">🗺️</div><h3>No plans yet</h3><p>Create a plan like "Crack SDE internship by December", break it into steps, and tick them off one by one.</p></div>`}`;
};
function addPlan(){
  openModal('Create a plan',
    field('Goal', inp('f1', 'e.g. Crack SDE internship')) +
    field('Why it matters (optional)', inp('f2', 'one line of motivation')) +
    field('Deadline (optional)', `<input id="f3" type="date" >`) +
    field('Steps (one per line)', `<textarea id="f4" placeholder="Finish DSA sheet&#10;Build 2 projects&#10;Mock interviews x5"></textarea>`) + saveBtn('Create plan'), () => {
    $('mSave').onclick = () => {
      const title = $('f1').value.trim();
      if(!title) return toast('Goal is required');
      const steps = $('f4').value.split('\n').map(s => s.trim()).filter(Boolean).map(text => ({text, done:false}));
      S.plans.push({id: uid(), title, why: $('f2').value.trim(), deadline: $('f3').value, steps});
      save(); closeModal(); render(); toast('Plan created ✦');
    };
  });
}
function addStep(pid){
  openModal('Add step', field('Step', inp('f1', 'next milestone…')) + saveBtn('Add'), () => {
    $('mSave').onclick = () => {
      const v = $('f1').value.trim(); if(!v) return;
      const p = S.plans.find(x => x.id === pid);
      if(p){ p.steps.push({text:v, done:false}); save(); }
      closeModal(); render();
    };
  });
}
function toggleStep(pid, i){
  const p = S.plans.find(x => x.id === pid);
  if(p && p.steps[i]){ p.steps[i].done = !p.steps[i].done; save(); render(); }
}

/* ================= ASSISTANT ================= */
VIEWS.assistant = function(){
  $('viewRoot').innerHTML = `
  <div class="sec-head">
    <div><div class="sec-title"><span class="em">✨</span>Hub Assistant</div><div class="sec-sub">Knows everything inside your hub. ${S.apiKey ? 'Claude API connected ●' : 'Running in smart-local mode — connect an Anthropic API key below for full AI'}</div></div>
    <button class="btn btn-soft" onclick="setApiKey()">${S.apiKey ? '🔑 Change key' : '🔑 Connect Claude API'}</button>
  </div>
  <div class="chat-wrap">
    <div class="chat-log" id="chatLog">
      ${S.chat.length ? S.chat.map(m => `<div class="msg ${m.role}">${m.role === 'ai' ? m.text : esc(m.text)}</div>`).join('')
      : `<div class="msg ai">Hey! I'm your hub assistant ✨ I can see all your tasks, companies, courses and deadlines.\n\nTry: "what's due this week?", "summary", "add task revise DBMS", or "find os notes".${S.apiKey ? '' : '\n\n(Connect a Claude API key for full conversational AI — I work offline meanwhile.)'}</div>`}
    </div>
    <div class="suggest-row">
      <button class="chip" onclick="quickAsk(\`What's due this week?\`)">📅 Due this week</button>
      <button class="chip" onclick="quickAsk('summary')">📊 Summary</button>
      <button class="chip" onclick="quickAsk('What should I focus on today?')">🎯 Focus</button>
    </div>
    <div class="chat-input-row">
      <textarea class="chat-input" id="chatInput" rows="1" placeholder="Ask anything about your hub…"></textarea>
      <button class="btn btn-primary" id="chatSend">Send ➤</button>
    </div>
  </div>`;
  const log = $('chatLog'); log.scrollTop = log.scrollHeight;
  $('chatSend').onclick = sendChat;
  $('chatInput').addEventListener('keydown', e => {
    if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); sendChat(); }
  });
};
function quickAsk(q){ $('chatInput').value = q; sendChat(); }
function setApiKey(){
  openModal('Connect Claude API',
    `<p style="font-size:12.5px;color:var(--muted);line-height:1.6">Paste an Anthropic API key (from <a href="https://console.anthropic.com" target="_blank">console.anthropic.com</a>) to give the assistant full AI powers. The key is stored only in your browser. Without it, the assistant still works in smart-local mode.</p>` +
    field('API key', inp('f1', 'sk-ant-…', 'password', S.apiKey)) + saveBtn('Connect'), () => {
    $('mSave').onclick = () => { S.apiKey = $('f1').value.trim(); save(); closeModal(); render(); toast(S.apiKey ? 'Claude connected ✦' : 'Key removed'); };
  });
}
function hubContext(){
  const lines = [];
  lines.push('TASKS: ' + (S.tasks.filter(t=>!t.done).map(t => `${t.text}${t.due ? ' (due ' + t.due + ')' : ''} [${t.pri}]`).join('; ') || 'none'));
  lines.push('COMPANIES: ' + (S.companies.map(c => `${c.name} — ${c.role||''} — status ${c.status}${(c.dates||[]).length ? ' — dates: ' + c.dates.map(d => d.label + ' ' + d.date).join(', ') : ''}`).join(' | ') || 'none'));
  lines.push('COURSES: ' + (S.courses.map(c => `${c.name} ${c.progress||0}%`).join('; ') || 'none'));
  lines.push('PLANS: ' + (S.plans.map(p => `${p.title} (${p.steps.filter(s=>s.done).length}/${p.steps.length} steps)`).join('; ') || 'none'));
  lines.push('SAVED: ' + S.links.length + ' links, ' + S.resources.length + ' resources, ' + S.videos.length + ' videos, ' + S.clips.length + ' clipboard snippets, ' + S.igLinks.length + ' Instagram saves');
  return lines.join('\n');
}
async function sendChat(){
  const inpEl = $('chatInput');
  const q = inpEl.value.trim();
  if(!q) return;
  inpEl.value = '';
  S.chat.push({role:'user', text:q});
  if(S.chat.length > 60) S.chat = S.chat.slice(-60);
  save(); VIEWS.assistant();
  const log = $('chatLog');
  const think = document.createElement('div');
  think.className = 'msg ai'; think.textContent = '…thinking';
  log.appendChild(think); log.scrollTop = log.scrollHeight;
  let ans;
  if(S.apiKey){
    try{ ans = await askClaude(q); }
    catch(err){ ans = localBrain(q) + '\n\n⚠️ (Claude API error: ' + esc(err.message) + ' — answered locally instead)'; }
  } else {
    ans = localBrain(q);
  }
  S.chat.push({role:'ai', text:ans}); save(); VIEWS.assistant();
}
async function askClaude(q){
  const history = S.chat.slice(-12).map(m => ({role: m.role === 'ai' ? 'assistant' : 'user', content: m.text.replace(/<[^>]+>/g,'')}));
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': S.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 700,
      system: 'You are the assistant inside "Master Hub", a BTech student\'s personal command-center app. Be warm, concise, practical. Today is ' + new Date().toDateString() + '. Their current hub data:\n' + hubContext(),
      messages: history,
    }),
  });
  if(!res.ok){ const e = await res.json().catch(() => ({})); throw new Error(e.error && e.error.message || res.status); }
  const data = await res.json();
  return esc(data.content.map(b => b.text || '').join(''));
}
function localBrain(qRaw){
  const q = qRaw.toLowerCase();
  // add task command
  const mAdd = qRaw.match(/^add task (.+)/i);
  if(mAdd){
    S.tasks.push({id: uid(), text: mAdd[1].trim(), due:'', pri:'Medium', tag:'', done:false});
    save();
    return '✅ Done — added task: <b>' + esc(mAdd[1].trim()) + '</b>. You can set a due date from the Tasks section.';
  }
  // due / deadlines
  if(/due|deadline|upcoming|this week|coming/.test(q)){
    const ev = [];
    S.tasks.filter(t => !t.done && t.due).forEach(t => ev.push({d:t.due, s:'📌 ' + t.text}));
    S.companies.forEach(c => (c.dates||[]).forEach(d => d.date && ev.push({d:d.date, s:'💼 ' + c.name + ' — ' + d.label})));
    const soon = ev.filter(e => { const n = daysUntil(e.d); return n >= 0 && n <= 14; }).sort((a,b) => a.d.localeCompare(b.d));
    if(!soon.length) return 'Nothing due in the next 14 days 🎉 Maybe add company dates in the Internship tracker so I can watch them for you.';
    return '<b>Next 14 days:</b>\n' + soon.map(e => '• ' + esc(e.s) + ' — ' + fmtDate(e.d) + ' (' + daysUntil(e.d) + 'd)').join('\n');
  }
  // summary
  if(/summary|status|overview|report/.test(q)){
    const open = S.tasks.filter(t => !t.done).length;
    const avg = S.courses.length ? Math.round(S.courses.reduce((a,c) => a + (+c.progress||0), 0) / S.courses.length) : 0;
    return `<b>📊 Hub summary</b>\n• ${open} open task${open===1?'':'s'}\n• ${S.companies.length} companies tracked (${S.companies.filter(c=>c.status==='Interview').length} at interview stage)\n• ${S.courses.length} courses, avg ${avg}% done\n• ${S.plans.length} active plans\n• Library: ${S.links.length} links · ${S.resources.length} resources · ${S.videos.length} videos`;
  }
  // focus
  if(/focus|priorit|today|what should/.test(q)){
    const hi = S.tasks.filter(t => !t.done && t.pri === 'High');
    const due = S.tasks.filter(t => !t.done && t.due && daysUntil(t.due) <= 2 && daysUntil(t.due) >= 0);
    const picks = [...new Set([...due, ...hi, ...S.tasks.filter(t => !t.done)])].slice(0, 3);
    if(!picks.length) return 'No open tasks — great time to push a course forward or research a new target company 🎯';
    return '<b>🎯 Focus on:</b>\n' + picks.map(t => '• ' + esc(t.text) + (t.due ? ' (due ' + fmtDate(t.due) + ')' : '')).join('\n');
  }
  // search
  const mFind = q.match(/(?:find|search|open|where.*?is|show me)\s+(.+)/);
  const term = mFind ? mFind[1].replace(/[?.!]/g,'').trim() : null;
  if(term){
    const hits = searchAll(term);
    if(hits.length) return '<b>🔎 Found in your hub:</b>\n' + hits.slice(0,6).map(h => '• ' + h.kind + ' <b>' + esc(h.title) + '</b>' + (h.url ? ' — <a href="' + esc(h.url) + '" target="_blank">open ↗</a>' : '')).join('\n');
    return 'Couldn\'t find "' + esc(term) + '" in your hub yet — maybe save it first?';
  }
  const hits = searchAll(qRaw);
  if(hits.length) return '<b>🔎 This matches in your hub:</b>\n' + hits.slice(0,5).map(h => '• ' + h.kind + ' <b>' + esc(h.title) + '</b>' + (h.url ? ' — <a href="' + esc(h.url) + '" target="_blank">open ↗</a>' : '')).join('\n');
  return 'I can help with: <b>"what\'s due this week"</b>, <b>"summary"</b>, <b>"what should I focus on"</b>, <b>"add task …"</b>, or <b>"find &lt;anything saved&gt;"</b>.' + (S.apiKey ? '' : '\n\nFor open-ended questions, connect a Claude API key (🔑 button above) and I become a full AI assistant.');
}

/* ================= NOTES ================= */
const NOTE_COLORS = [
  {bg:'linear-gradient(135deg,#fff6d9,#ffedc2)', fg:'#5c4a12', name:'Sun'},
  {bg:'linear-gradient(135deg,#dcefff,#c9e4ff)', fg:'#173d66', name:'Sky'},
  {bg:'linear-gradient(135deg,#e3fbef,#cdf5e2)', fg:'#14563a', name:'Mint'},
  {bg:'linear-gradient(135deg,#f3e8ff,#e5d5ff)', fg:'#46246e', name:'Lilac'},
  {bg:'linear-gradient(135deg,#ffe9ef,#ffd6e2)', fg:'#6e2440', name:'Rose'},
  {bg:'linear-gradient(135deg,#ffffff,#eef3fa)', fg:'#16233f', name:'Paper'},
];
VIEWS.notes = function(){
  const items = [...S.notes].sort((a,b) => (b.ts||0) - (a.ts||0));
  $('viewRoot').innerHTML = `
  <div class="sec-head">
    <div><div class="sec-title"><span class="em">📝</span>Sticky Notes</div><div class="sec-sub">Quick thoughts, exam formulas, interview one-liners — colourful & instant</div></div>
  </div>
  ${items.length ? `<div class="grid grid-notes">${items.map(n => { const c = NOTE_COLORS[n.color||0];
    return `<div class="note-card" style="background:${c.bg};color:${c.fg}" onclick="addNote('${n.id}')">
      ${n.title ? `<div class="nt-t">${esc(n.title)}</div>` : ''}
      <div class="nt-b">${esc(n.body)}</div>
      <div class="nt-d">${new Date(n.ts).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</div>
      <div class="card-actions" onclick="event.stopPropagation()">
        <button class="icon-btn danger" onclick="delItem('notes','${n.id}')" title="Delete">🗑</button>
      </div>
    </div>`; }).join('')}</div>`
  : `<div class="empty"><div class="big">📝</div><h3>No notes yet</h3><p>Tap ＋ for an instant sticky note — pick a colour, jot the thought, done. Click any note to edit it.</p></div>`}`;
};
function addNote(editId){
  const e = editId ? S.notes.find(x => x.id === editId) : null;
  const curColor = e ? (e.color||0) : Math.floor(Math.random()*5);
  openModal(e ? 'Edit note' : 'New sticky note',
    field('Title (optional)', inp('f1', 'e.g. OS one-liners', 'text', e && e.title)) +
    field('Note', `<textarea id="f2" style="min-height:130px" placeholder="write anything…">${esc(e ? e.body : '')}</textarea>`) +
    field('Colour', `<div style="display:flex;gap:9px" id="colorRow">${NOTE_COLORS.map((c,i) =>
      `<button data-i="${i}" title="${c.name}" style="width:34px;height:34px;border-radius:11px;background:${c.bg};border:2.5px solid ${i===curColor?'var(--acc1)':'transparent'};transition:.15s"></button>`).join('')}</div>`) +
    saveBtn(), () => {
    let picked = curColor;
    $('colorRow').querySelectorAll('button').forEach(b => b.onclick = () => {
      picked = +b.dataset.i;
      $('colorRow').querySelectorAll('button').forEach(x => x.style.borderColor = 'transparent');
      b.style.borderColor = 'var(--acc1)';
    });
    $('mSave').onclick = () => {
      const body = $('f2').value.trim();
      if(!body) return toast('Write something first');
      if(e) Object.assign(e, {title: $('f1').value.trim(), body, color: picked, ts: Date.now()});
      else S.notes.push({id: uid(), title: $('f1').value.trim(), body, color: picked, ts: Date.now()});
      save(); closeModal(); render(); toast(e ? 'Note updated' : 'Stuck it ✦');
    };
  });
}

/* ================= FOCUS TIMER ================= */
const FOCUS_MODES = [{label:'Focus 25', min:25}, {label:'Focus 50', min:50}, {label:'Break 5', min:5}, {label:'Break 10', min:10}];
let FT = {left: 25*60, total: 25*60, mode: 0, running: false, iv: null};
function todayKey(){ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function focusStreak(){
  const days = new Set(S.focus.streakDays || []);
  let n = 0; const d = new Date();
  if(!days.has(todayKey())) d.setDate(d.getDate()-1); // streak alive if yesterday done
  for(;;){
    const k = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    if(days.has(k)){ n++; d.setDate(d.getDate()-1); } else break;
  }
  return n;
}
VIEWS.focus = function(){
  const R = 118, C = 2*Math.PI*R;
  const frac = FT.left / FT.total;
  $('viewRoot').innerHTML = `
  <div class="sec-head">
    <div><div class="sec-title"><span class="em">⏱️</span>Focus</div><div class="sec-sub">Pomodoro deep-work timer — sessions build your streak</div></div>
  </div>
  <div class="focus-wrap">
    <div class="focus-modes">${FOCUS_MODES.map((m,i) =>
      `<button class="chip ${FT.mode===i?'active':''}" onclick="setFocusMode(${i})">${m.label}</button>`).join('')}</div>
    <div class="focus-ring-wrap">
      <svg width="260" height="260">
        <circle cx="130" cy="130" r="${R}" fill="none" stroke="rgba(79,124,255,.13)" stroke-width="13"/>
        <circle id="focusArc" cx="130" cy="130" r="${R}" fill="none" stroke="url(#fgrad)" stroke-width="13"
          stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C*(1-frac)}" style="transition:stroke-dashoffset .5s linear"/>
        <defs><linearGradient id="fgrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#4f7cff"/><stop offset="1" stop-color="#00c2e8"/>
        </linearGradient></defs>
      </svg>
      <div class="focus-time">
        <div class="ft" id="focusTime">${fmtTimer(FT.left)}</div>
        <div class="fl">${FOCUS_MODES[FT.mode].label}</div>
      </div>
    </div>
    <div class="focus-ctl">
      <button class="btn btn-primary" style="padding:13px 34px;font-size:15px" onclick="toggleFocus()" id="focusGo">${FT.running ? '⏸ Pause' : '▶ Start'}</button>
      <button class="btn btn-soft" onclick="resetFocus()">↺ Reset</button>
    </div>
    <div class="focus-stats">
      <div class="stat"><div class="num">${S.focus.sessions||0}</div><div class="lbl">Sessions done</div></div>
      <div class="stat"><div class="num">${Math.round((S.focus.minutes||0)/60*10)/10}h</div><div class="lbl">Deep work total</div></div>
      <div class="stat"><div class="num">🔥 ${focusStreak()}</div><div class="lbl">Day streak</div></div>
    </div>
  </div>`;
};
function fmtTimer(s){ return Math.floor(s/60) + ':' + String(s%60).padStart(2,'0'); }
function setFocusMode(i){
  clearInterval(FT.iv);
  FT = {left: FOCUS_MODES[i].min*60, total: FOCUS_MODES[i].min*60, mode: i, running: false, iv: null};
  updatePill(); if(S.view==='focus') render();
}
function toggleFocus(){
  if(FT.running){ clearInterval(FT.iv); FT.running = false; }
  else{
    FT.running = true;
    FT.iv = setInterval(() => {
      FT.left--;
      if(FT.left <= 0){ finishFocus(); return; }
      tickFocusUI();
    }, 1000);
  }
  updatePill(); if(S.view==='focus') render();
}
function resetFocus(){ setFocusMode(FT.mode); }
function tickFocusUI(){
  updatePill();
  if(S.view !== 'focus') return;
  const t = $('focusTime'); if(t) t.textContent = fmtTimer(FT.left);
  const arc = $('focusArc');
  if(arc){ const C = 2*Math.PI*118; arc.style.strokeDashoffset = C * (1 - FT.left/FT.total); }
  document.title = fmtTimer(FT.left) + ' · Master Hub';
}
function finishFocus(){
  clearInterval(FT.iv); FT.running = false;
  const wasFocus = FOCUS_MODES[FT.mode].min >= 25;
  if(wasFocus){
    S.focus.sessions = (S.focus.sessions||0) + 1;
    S.focus.minutes = (S.focus.minutes||0) + FOCUS_MODES[FT.mode].min;
    S.focus.streakDays = S.focus.streakDays || [];
    if(!S.focus.streakDays.includes(todayKey())) S.focus.streakDays.push(todayKey());
    save();
    confetti();
    toast('🎉 Session complete! ' + FOCUS_MODES[FT.mode].min + ' min of deep work logged');
  } else toast('Break over — back to it 💪');
  try{ new Notification('Master Hub', {body: wasFocus ? '🎉 Focus session complete!' : 'Break over!'}); }catch(e){}
  document.title = 'Master Hub — Your Personal Command Center';
  FT.left = FT.total;
  updatePill(); if(S.view==='focus') render();
}
function updatePill(){
  const pill = $('focusPill');
  pill.hidden = !(FT.running && S.view !== 'focus');
  $('pillTime').textContent = fmtTimer(FT.left);
}
$('focusPill').addEventListener('click', () => setView('focus'));

/* ================= TOOLKIT ================= */
VIEWS.toolkit = function(){
  const tk = S.toolkit;
  const sems = tk.sems.length ? tk.sems : [{sgpa:'', credits:''}];
  // cgpa calc
  let totC = 0, totP = 0;
  tk.sems.forEach(s => { const c = +s.credits, g = +s.sgpa; if(c > 0 && g > 0){ totC += c; totP += c*g; } });
  const cgpa = totC ? (totP/totC) : null;
  // attendance calc
  const at = +tk.att.attended, hd = +tk.att.held, target = +tk.att.target || 75;
  let attHTML = '<div class="tr-num">—</div><div class="tr-lbl">enter your numbers</div>';
  if(hd > 0 && at >= 0 && at <= hd){
    const pct = at/hd*100;
    let msg;
    if(pct >= target){
      const canBunk = Math.floor((at - target/100*hd) / (target/100));
      msg = canBunk > 0 ? `😎 you can bunk <b>${canBunk}</b> more class${canBunk===1?'':'es'} and stay ≥${target}%` : `right at the edge — attend the next ones!`;
    } else {
      const need = Math.ceil((target/100*hd - at) / (1 - target/100));
      msg = `⚠️ attend the next <b>${need}</b> class${need===1?'':'es'} straight to reach ${target}%`;
    }
    attHTML = `<div class="tr-num" style="${pct < target ? '-webkit-text-fill-color:var(--bad);color:var(--bad)' : ''}">${pct.toFixed(1)}%</div><div class="tr-lbl">${msg}</div>`;
  }
  $('viewRoot').innerHTML = `
  <div class="sec-head">
    <div><div class="sec-title"><span class="em">🧮</span>Student Toolkit</div><div class="sec-sub">The calculations every BTech student does on scrap paper — automated</div></div>
  </div>
  <div class="grid grid-2">
    <div class="card tool-card" style="transform:none">
      <div class="tool-title">🎯 CGPA Calculator</div>
      <div id="semRows">${sems.map((s,i) => `
        <div class="sub-row">
          <span style="font-size:12px;color:var(--muted);width:52px;flex-shrink:0">Sem ${i+1}</span>
          <input type="number" step="0.01" min="0" max="10" placeholder="SGPA" value="${esc(s.sgpa)}" style="flex:1" oninput="tkSem(${i},'sgpa',this.value)">
          <input type="number" step="1" min="1" placeholder="Credits" value="${esc(s.credits)}" style="flex:1" oninput="tkSem(${i},'credits',this.value)">
        </div>`).join('')}</div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-soft" style="padding:8px 14px;font-size:12px" onclick="tkAddSem()">＋ Semester</button>
        ${tk.sems.length > 1 ? `<button class="btn btn-soft" style="padding:8px 14px;font-size:12px" onclick="tkPopSem()">− Remove last</button>` : ''}
      </div>
      <div class="tool-res">${cgpa !== null
        ? `<div class="tr-num">${cgpa.toFixed(2)}</div><div class="tr-lbl">CGPA over ${totC} credits · ≈ ${(cgpa*9.5).toFixed(1)}% equivalent</div>`
        : `<div class="tr-num">—</div><div class="tr-lbl">fill SGPA + credits per semester</div>`}</div>
    </div>
    <div class="card tool-card" style="transform:none">
      <div class="tool-title">🏃 Attendance / Bunk Planner</div>
      <div class="tool-row">
        ${field('Attended', `<input type="number" min="0" value="${esc(tk.att.attended)}" oninput="tkAtt('attended',this.value)">`)}
        ${field('Total held', `<input type="number" min="0" value="${esc(tk.att.held)}" oninput="tkAtt('held',this.value)">`)}
        ${field('Target %', `<input type="number" min="1" max="100" value="${esc(tk.att.target)}" oninput="tkAtt('target',this.value)">`)}
      </div>
      <div class="tool-res">${attHTML}</div>
      <p style="font-size:11.5px;color:var(--faint)">Tells you exactly how many classes you can skip — or must attend — to hold your target.</p>
    </div>
  </div>`;
};
function tkSem(i, k, v){ S.toolkit.sems[i] = S.toolkit.sems[i] || {sgpa:'',credits:''}; S.toolkit.sems[i][k] = v; save(); tkRefresh(); }
function tkAddSem(){ S.toolkit.sems.push({sgpa:'',credits:''}); save(); render(); }
function tkPopSem(){ S.toolkit.sems.pop(); save(); render(); }
function tkAtt(k, v){ S.toolkit.att[k] = v; save(); tkRefresh(); }
let tkT = null;
function tkRefresh(){ clearTimeout(tkT); tkT = setTimeout(() => { if(S.view === 'toolkit'){
  const focused = document.activeElement; const idx = focused ? focused.getAttribute('oninput') : null;
  render();
  if(idx){ const again = [...document.querySelectorAll('input')].find(i => i.getAttribute('oninput') === idx); if(again){ again.focus(); const v = again.value; again.value = ''; again.value = v; } }
} }, 700); }

/* ================= CONFETTI ================= */
function confetti(){
  const cv = $('confettiCanvas'), ctx = cv.getContext('2d');
  cv.width = innerWidth; cv.height = innerHeight;
  const COLORS = ['#4f7cff','#00c2e8','#8a63ff','#0fb98c','#ffc857','#ff7b8a'];
  const parts = Array.from({length: 120}, () => ({
    x: innerWidth/2 + (Math.random()-.5)*160, y: innerHeight/2,
    vx: (Math.random()-.5)*13, vy: -Math.random()*13 - 4,
    s: Math.random()*7 + 4, c: COLORS[Math.floor(Math.random()*COLORS.length)],
    r: Math.random()*Math.PI, vr: (Math.random()-.5)*.3,
  }));
  let frames = 0;
  (function tick(){
    ctx.clearRect(0,0,cv.width,cv.height);
    parts.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += .35; p.r += p.vr;
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.c; ctx.fillRect(-p.s/2,-p.s/2,p.s,p.s); ctx.restore();
    });
    if(++frames < 120) requestAnimationFrame(tick);
    else ctx.clearRect(0,0,cv.width,cv.height);
  })();
}

/* ================= COMMAND PALETTE ================= */
const PAL_CMDS = [
  {icon:'🏠', label:'Go to Dashboard', kbd:'', run:() => setView('dashboard')},
  {icon:'🔗', label:'Go to Quick Links', run:() => setView('links')},
  {icon:'📚', label:'Go to Resources & PDFs', run:() => setView('resources')},
  {icon:'💼', label:'Go to Internships', run:() => setView('internships')},
  {icon:'▶️', label:'Go to YouTube Vault', run:() => setView('videos')},
  {icon:'📋', label:'Go to Clipboard', run:() => setView('clipboard')},
  {icon:'📸', label:'Go to Instagram', run:() => setView('instagram')},
  {icon:'📝', label:'Go to Notes', run:() => setView('notes')},
  {icon:'🤖', label:'Go to AI Arsenal', run:() => setView('aitools')},
  {icon:'🎓', label:'Go to Courses', run:() => setView('courses')},
  {icon:'🏛️', label:'Go to Academics', run:() => setView('academics')},
  {icon:'🧮', label:'Go to Toolkit', run:() => setView('toolkit')},
  {icon:'✅', label:'Go to Tasks', run:() => setView('tasks')},
  {icon:'⏱️', label:'Go to Focus timer', run:() => setView('focus')},
  {icon:'🗺️', label:'Go to Planner', run:() => setView('planner')},
  {icon:'✨', label:'Go to Assistant', run:() => setView('assistant')},
  {icon:'➕', label:'Add link', run:() => { setView('links'); addLink(); }},
  {icon:'➕', label:'Add task', run:() => { setView('tasks'); addTask(); }},
  {icon:'➕', label:'Add company', run:() => { setView('internships'); addCompany(); }},
  {icon:'➕', label:'Add note', run:() => { setView('notes'); addNote(); }},
  {icon:'➕', label:'Add clipboard snippet', run:() => { setView('clipboard'); addClip(); }},
  {icon:'▶', label:'Start focus session', run:() => { setView('focus'); if(!FT.running) toggleFocus(); }},
  {icon:'🌙', label:'Toggle dark / light mode', run:() => $('themeBtn').click()},
  {icon:'⬇', label:'Backup data', run:() => $('exportBtn').click()},
];
let palSel = 0, palItems = [];
function openPal(){
  $('palBackdrop').classList.add('open');
  $('palInput').value = ''; palSel = 0; palRender('');
  setTimeout(() => $('palInput').focus(), 40);
}
function closePal(){ $('palBackdrop').classList.remove('open'); }
function palRender(q){
  q = q.toLowerCase().trim();
  const cmds = PAL_CMDS.filter(c => !q || c.label.toLowerCase().includes(q))
    .map(c => ({icon:c.icon, label:c.label, kind:'', run:c.run}));
  const data = q ? searchAll(q).slice(0, 8).map(h => ({
    icon: h.kind, label: h.title, kind: 'open',
    run: () => { if(h.fileId) openStoredFile(h.fileId); else if(h.url) openURL(h.url); else setView(h.go); },
  })) : [];
  palItems = [...cmds.slice(0, q ? 6 : 24), ...data];
  if(palSel >= palItems.length) palSel = 0;
  $('palList').innerHTML = palItems.map((it, i) => `
    <button class="pal-item ${i===palSel?'sel':''}" data-i="${i}">
      <span class="pi">${it.icon}</span><span class="pt">${esc(it.label)}</span>${it.kind ? `<span class="pk">↗ open</span>` : ''}
    </button>`).join('') || `<div style="padding:20px;text-align:center;color:var(--faint);font-size:13px">No matches</div>`;
  $('palList').querySelectorAll('.pal-item').forEach(b => b.onclick = () => palGo(+b.dataset.i));
}
function palGo(i){ const it = palItems[i]; closePal(); if(it) it.run(); }
$('palInput').addEventListener('input', function(){ palSel = 0; palRender(this.value); });
$('palInput').addEventListener('keydown', e => {
  if(e.key === 'ArrowDown'){ e.preventDefault(); palSel = Math.min(palSel+1, palItems.length-1); palRender($('palInput').value); }
  if(e.key === 'ArrowUp'){ e.preventDefault(); palSel = Math.max(palSel-1, 0); palRender($('palInput').value); }
  if(e.key === 'Enter'){ e.preventDefault(); palGo(palSel); }
});
$('palBackdrop').addEventListener('click', e => { if(e.target === $('palBackdrop')) closePal(); });

/* ================= SHARE-TO-HUB ================= */
function handleSharedURL(){
  const p = new URLSearchParams(location.search);
  const shared = p.get('add') || p.get('url') || p.get('text');
  if(!shared) return;
  history.replaceState(null, '', location.pathname);
  let url = shared.trim();
  const m = url.match(/https?:\/\/\S+/); if(m) url = m[0];
  const title = p.get('title') || '';
  setTimeout(() => routeShared(url, title), 350);
}
function routeShared(url, title){
  const isIG = /instagram\.com/i.test(url);
  const isYT = /youtu\.?be/i.test(url);
  openModal('⚡ Quick save',
    `<p style="font-size:12.5px;color:var(--muted);word-break:break-all;background:var(--block);padding:10px 13px;border-radius:10px">${esc(url)}</p>` +
    field('Save as', sel('f0', [isIG ? '📸 Instagram save' : isYT ? '▶️ YouTube video' : '🔗 Quick link', '🔗 Quick link', '📸 Instagram save', '▶️ YouTube video', '📚 Resource', '📋 Clipboard snippet'])) +
    field('Title', inp('f1', 'give it a name', 'text', title)) +
    saveBtn('Save to hub'), () => {
    $('mSave').onclick = () => {
      const t = $('f1').value.trim() || url.slice(0, 60);
      const kind = $('f0').value;
      if(kind.includes('Instagram')){ S.igLinks.push({id:uid(), title:t, url, coll:S.igCollections[0], sub:'', note:''}); setViewSoon('instagram'); }
      else if(kind.includes('YouTube')){ S.videos.push({id:uid(), url, title:t, tag:S.vidTags[0], vid:ytId(url)}); setViewSoon('videos'); }
      else if(kind.includes('Resource')){ S.resources.push({id:uid(), title:t, cat:S.resCats[0], url, fileId:'', fileName:''}); setViewSoon('resources'); }
      else if(kind.includes('Clipboard')){ S.clips.push({id:uid(), label:t, text:url, pinned:false, copies:0}); setViewSoon('clipboard'); }
      else { S.links.push({id:uid(), title:t, url, section:S.linkSections[0], icon:''}); setViewSoon('links'); }
      save(); closeModal(); toast('Saved to hub ⚡');
    };
  });
}
function setViewSoon(v){ setTimeout(() => setView(v), 80); }
$('shareSetupBtn').addEventListener('click', () => {
  const base = location.origin + location.pathname;
  const bm = `javascript:(function(){location.href='${base}?add='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title)})()`;
  openModal('⚡ Save to Hub from anywhere',
    `<p style="font-size:13px;color:var(--muted);line-height:1.7">
    <b style="color:var(--text)">On this computer:</b> drag the button below onto your bookmarks bar. On any website, click it → that page jumps into your hub.</p>
    <a href="${esc(bm)}" class="btn btn-primary" style="align-self:flex-start" onclick="return false" title="Drag me to the bookmarks bar!">⚡ Save to Hub</a>
    <p style="font-size:13px;color:var(--muted);line-height:1.7">
    <b style="color:var(--text)">On your phone:</b> install the app (Add to Home Screen) — then in Instagram/YouTube tap Share → <b>Master Hub</b> and it lands right here.<br><br>
    Or paste any link with the button below:</p>
    <button class="btn btn-soft" id="mPaste">📥 Paste link from clipboard</button>`, () => {
    $('mPaste').onclick = async () => {
      let text = '';
      try{ text = await navigator.clipboard.readText(); }catch(e){}
      const m = String(text).match(/https?:\/\/\S+/);
      if(!m) return toast('No link found in clipboard');
      closeModal(); routeShared(m[0], '');
    };
  });
});

/* ================= GLOBAL SEARCH ================= */
function searchAll(term){
  const t = term.toLowerCase();
  const hits = [];
  const test = s => s && s.toLowerCase().includes(t);
  S.links.forEach(l => test(l.title + ' ' + l.section) && hits.push({kind:'🔗', title:l.title, url:l.url, go:'links'}));
  S.resources.forEach(r => test(r.title + ' ' + r.cat + ' ' + (r.fileName||'')) && hits.push({kind:'📚', title:r.title, url:r.url, fileId:r.fileId, go:'resources'}));
  S.companies.forEach(c => test(c.name + ' ' + (c.role||'') + ' ' + (c.notes||'')) && hits.push({kind:'💼', title:c.name + (c.role ? ' — ' + c.role : ''), url:c.link, go:'internships'}));
  S.videos.forEach(v => test(v.title + ' ' + v.tag) && hits.push({kind:'▶️', title:v.title, url:v.url, go:'videos'}));
  S.clips.forEach(c => test(c.label + ' ' + c.text) && hits.push({kind:'📋', title:c.label, go:'clipboard'}));
  S.igLinks.forEach(l => test(l.title + ' ' + l.coll + ' ' + (l.sub||'') + ' ' + (l.note||'')) && hits.push({kind:'📸', title:l.title, url:l.url, go:'instagram'}));
  S.aitools.forEach(a => test(a.name + ' ' + (a.desc||'')) && hits.push({kind:'🤖', title:a.name, url:a.url, go:'aitools'}));
  S.courses.forEach(c => test(c.name + ' ' + (c.platform||'')) && hits.push({kind:'🎓', title:c.name, url:c.url, go:'courses'}));
  S.academics.forEach(a => test(a.title + ' ' + a.subject + ' ' + a.sem) && hits.push({kind:'🏛️', title:a.subject + ': ' + a.title, url:a.url, go:'academics'}));
  S.tasks.forEach(x => test(x.text + ' ' + (x.tag||'')) && hits.push({kind:'📌', title:x.text, go:'tasks'}));
  S.plans.forEach(p => test(p.title) && hits.push({kind:'🗺️', title:p.title, go:'planner'}));
  S.notes.forEach(n => test((n.title||'') + ' ' + n.body) && hits.push({kind:'📝', title:n.title || n.body.slice(0,40), go:'notes'}));
  return hits;
}
$('globalSearch').addEventListener('input', function(){
  const term = this.value.trim();
  if(!term){ render(); return; }
  const hits = searchAll(term);
  const groups = {};
  hits.forEach(h => { (groups[h.kind] = groups[h.kind] || []).push(h); });
  $('fab').classList.add('hidden');
  $('viewRoot').innerHTML = `
    <div class="sec-head"><div class="sec-title"><span class="em">🔎</span>Results for "${esc(term)}"</div></div>
    ${hits.length ? Object.entries(groups).map(([k, arr]) => `
      <div class="sr-group">
        <div class="grid grid-3">${arr.map(h => `
          <button class="link-btn" onclick="${h.fileId ? `openStoredFile('${h.fileId}')` : h.url ? `openURL('${esc(h.url)}')` : `setView('${h.go}')`}">
            <div class="link-ic">${k}</div>
            <div class="link-meta"><div class="t">${esc(h.title)}</div><div class="u">${h.url ? esc(host(h.url)) : 'in ' + h.go}</div></div>
          </button>`).join('')}</div>
      </div>`).join('')
    : `<div class="empty"><div class="big">🕳️</div><h3>Nothing found</h3><p>Nothing in your hub matches "${esc(term)}" yet.</p></div>`}`;
});
document.addEventListener('keydown', e => {
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'){
    e.preventDefault();
    $('palBackdrop').classList.contains('open') ? closePal() : openPal();
    return;
  }
  if(e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)){
    e.preventDefault(); $('globalSearch').focus();
  }
  if(e.key === 'Escape'){ closeModal(); closePal(); }
});

/* ================= SHARED ================= */
function delItem(coll, id){
  S[coll] = S[coll].filter(x => x.id !== id);
  save(); render(); toast('Deleted');
}
$('fab').addEventListener('click', () => {
  ({links:addLink, resources:addResource, internships:addCompany, videos:addVideo,
    clipboard:addClip, instagram:addIgLink, notes:addNote,
    aitools:addAiTool, courses:addCourse, academics:addAcademic, tasks:addTask, planner:addPlan}[S.view] || (()=>{}))();
});
$('modalClose').addEventListener('click', closeModal);
$('modalBackdrop').addEventListener('click', e => { if(e.target === $('modalBackdrop')) closeModal(); });

/* backup / restore */
$('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(S, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'master-hub-backup-' + new Date().toISOString().slice(0,10) + '.json';
  a.click(); toast('Backup downloaded ✦ (uploaded PDFs stay on this device)');
});
$('importBtn').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', function(){
  const f = this.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = () => {
    try{ S = Object.assign({}, SEED, JSON.parse(r.result)); save(); render(); toast('Hub restored ✦'); }
    catch(e){ toast('Invalid backup file'); }
  };
  r.readAsText(f);
});

/* first-run name ask */
if(!S.name && !localStorage.getItem('mh_named')){
  localStorage.setItem('mh_named', '1');
  setTimeout(() => {
    openModal('Welcome to Master Hub ⬢',
      `<p style="font-size:13px;color:var(--muted);line-height:1.6">Your personal command center for links, PDFs, internships, courses & plans — everything lives on this device, works offline, and installs on your phone.</p>` +
      field('What should I call you?', inp('f1', 'your name')) + saveBtn('Let’s go ➤'), () => {
      $('mSave').onclick = () => { S.name = $('f1').value.trim(); save(); closeModal(); render(); };
    });
  }, 400);
}

/* service worker for offline + install — self-updates so every device
   always runs the latest version (fixes "two different apps" staleness) */
if('serviceWorker' in navigator && location.protocol !== 'file:'){
  navigator.serviceWorker.register('sw.js').then(reg => reg.update()).catch(() => {});
  let swReloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if(swReloaded) return;
    swReloaded = true;
    location.reload();   // new version just took over → load it
  });
}

/* ---------- open on phone: cloud pairing QR ---------- */
const APP_URL = 'https://rohradhruv.github.io/master-hub/';
$('phoneBtn').addEventListener('click', async () => {
  try{
    if(!CLOUD_ID){ await cloudCreate(); await cloudPush(); toast('Cloud database created ☁️'); }
  }catch(e){
    return openModal('📱 Phone setup', `<p style="font-size:13px;color:var(--muted);line-height:1.7">Couldn't reach the cloud database service right now — check the internet connection and try again.</p>`);
  }
  const pair = APP_URL + '?db=' + CLOUD_ID;
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=210x210&data=${encodeURIComponent(pair)}`;
  openModal('📱 Install on your phone',
    `<div style="display:flex;flex-direction:column;gap:13px;align-items:center;text-align:center">
      <img src="${qr}" width="210" height="210" style="border-radius:14px;background:#fff;padding:9px" alt="QR">
      <p style="font-size:13px;color:var(--muted);line-height:1.8">
        1. Scan with your phone's camera (any internet — Wi-Fi or mobile data)<br>
        2. Opens in Chrome → menu ⋮ → <b>Add to Home screen → Install</b><br>
        3. Done — a real app, same database as here, syncs from anywhere 🌍</p>
      <button class="btn btn-soft" id="copyPair">📋 Copy link instead</button>
      <p style="font-size:11px;color:var(--faint);line-height:1.6">The link contains your private database code — share it only with your own devices.</p>
    </div>`, () => {
    $('copyPair').onclick = async () => { try{ await navigator.clipboard.writeText(pair); toast('Link copied ✓'); }catch(e){} };
  });
});

/* go */
applyTheme();
setView(S.view || 'dashboard');
pullState(true);
handleSharedURL();
if('Notification' in window && Notification.permission === 'default'){
  // ask once, quietly, after first focus session start would be nicer; keep it lazy
}
