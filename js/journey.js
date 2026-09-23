// Journey Logs tab: the Turiya → Waking / Dreaming / Deep Sleep / Just
// Turiya diagram, and a log for each state — places visited (pinned on an
// India map) plus the day's sādhanā for Waking, dreams (with optional voice
// notes) for Dreaming, hours slept for Deep Sleep, and time meditating as
// the observer for Turiya. A "Journey Circle" merges several profiles'
// journeys — even across different households/logins — into this one
// screen, each entry tagged with its author's name and updating live.
//
// Storage (see CLAUDE.md "Journey Logs module"):
//   workspaces/{ws}/kv/journey-<profileId>         one JSON doc per profile
//   workspaces/{ws}/kv/journey-audio-<dreamId>     one per dream voice note
//   globalKv/journey-circle-<CODE>                 {members:[{ws,pid,name}]}
import {
  cloudSet, cloudDelete, getWorkspaceKv, subscribeWorkspaceKey, getActiveWorkspace,
  journeyCircleCreate, journeyCircleJoin, journeyCircleRemove, subscribeJourneyCircle
} from "./cloud-store.js";
import { searchIndiaPlaces, nearestIndiaPlace } from "./india-places.js";

export function journeyStorageKey(profileId){ return 'journey-'+profileId; }
function audioKey(dreamId){ return 'journey-audio-'+dreamId; }

const MY_COLOR = '#4C8DFF';
const MEMBER_COLORS = ['#F2A93B','#E8619B','#34B89A','#9B7BFF','#FF7A45','#1FB3D6','#9AB83A','#D6495F'];
const MAX_RECORD_SECONDS = 120;
const MAX_AUDIO_DATAURL_CHARS = 950000; // Firestore docs cap at 1 MiB

// Mercator fit of assets/india-map.svg (612×696 viewBox) — see
// assets/india-map.ATTRIBUTION.md for how these constants were derived.
const MAP_W = 612, MAP_H = 696;
const PX_PER_LON = 20.9295, X_OFFSET = -1427.061;
const PX_PER_MERC = 20.9608, Y_OFFSET = 837.713;
function mercDeg(lat){ return (180/Math.PI)*Math.log(Math.tan(Math.PI/4 + (lat*Math.PI/180)/2)); }
export function projectLatLon(lat, lon){ return { x: PX_PER_LON*lon + X_OFFSET, y: Y_OFFSET - PX_PER_MERC*mercDeg(lat) }; }
function unprojectXY(x, y){
  const lon = (x - X_OFFSET)/PX_PER_LON;
  const m = (Y_OFFSET - y)/PX_PER_MERC;
  const lat = (2*Math.atan(Math.exp(m*Math.PI/180)) - Math.PI/2)*180/Math.PI;
  return { lat, lon };
}

const STATES = [
  { id:'waking',   label:'Waking',      sk:'Jāgrat',  x:10,  color:'#F2A93B' },
  { id:'dreaming', label:'Dreaming',    sk:'Svapna',  x:115, color:'#9B7BFF' },
  { id:'sleep',    label:'Deep Sleep',  sk:'Suṣupti', x:220, color:'#5470E8' },
  { id:'turiya',   label:'Just Turiya', sk:'Turīya',  x:325, color:'#A3284A' },
];
const BOX_Y = 14, BOX_W = 85, BOX_H = 74;
const ORB = { x:210, y:232, r:40 };

let ctx = null;
let root = null;

// --- per-profile session state (reset by resetJourneyState) ---
let started = false;
let me = null;                 // {ws, pid, name}
let myJourney = defaultJourney();
let myLoaded = false;
let myUnsub = null;
let lastSavedRaw = null;
let savePending = false;
let saveTimer = null;
let circleCode = null;
let circleMissing = false;
let circleMembersRaw = [];
let circleUnsub = null;
const memberSubs = {};
const memberJourneys = {};
const memberProfiles = {};     // key -> {status, data}
const audioCache = {};
let selectedState = 'waking';
let renderedPanelState = null;
let renderedCircleKey = null;
let arrowPos = null;
let arrowAnim = null;
let arrowState = null;
let turiyaRun = null;          // {startTime, tick}
let rec = null;                // live MediaRecorder session
let pendingAudio = null;       // {blob, mime, dur, url}
let pendingPlace = null;       // {name, lat, lon, region, source}
let placeSuggestions = [];
let pinMode = false;
let showLabels = true;
let mapSvgText = null;
let vb = { x:0, y:0, w:MAP_W, h:MAP_H };
let lastAddedPlaceId = null;
let ghostPin = null;
let mapIntroDone = false;

function defaultJourney(){ return { v:1, circle:null, places:[], dreams:[], sleep:[], turiya:[] }; }
function normalizeJourney(j){
  if(!j || typeof j !== 'object') return defaultJourney();
  ['places','dreams','sleep','turiya'].forEach(k=>{ if(!Array.isArray(j[k])) j[k] = []; });
  if(j.circle === undefined) j.circle = null;
  return j;
}
function parseJourney(raw){
  if(!raw) return defaultJourney();
  try{ return normalizeJourney(JSON.parse(raw)); }catch(e){ return defaultJourney(); }
}

function esc(s){ return ctx.escapeHtml(s == null ? '' : String(s)); }
function memberKey(m){ return m.ws+':'+m.pid; }
function myKey(){ return me ? memberKey(me) : ''; }
function colorFor(key){
  let h = 0;
  for(let i=0;i<key.length;i++) h = (h*31 + key.charCodeAt(i)) >>> 0;
  return MEMBER_COLORS[h % MEMBER_COLORS.length];
}
function tagHtml(p){ return `<span class="jl-tag" style="--tag:${p.color}">${esc(p.name)}</span>`; }
function fmtDateLong(dateStr){
  const [y,m,d] = dateStr.split('-').map(Number);
  if(!y) return dateStr;
  return new Date(y, m-1, d).toLocaleDateString(undefined, { weekday:'short', day:'numeric', month:'short', year:'numeric' });
}
function fmtClock(ts){ return new Date(ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }); }
function fmtHM(minutes){ const h = Math.floor(minutes/60), m = Math.round(minutes%60); return h ? `${h}h ${String(m).padStart(2,'0')}m` : `${m}m`; }
function daysAgoStr(n){ const d = new Date(); d.setDate(d.getDate()-n); return ctx.todayStr(d); }
function localInputValue(d){
  const p = n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function toast(msg){
  let el = document.getElementById('jlToast');
  if(!el){ el = document.createElement('div'); el.id = 'jlToast'; el.className = 'jl-toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>el.classList.remove('show'), 3200);
}

/* ================= lifecycle ================= */

export function initJourney(context){
  ctx = context;
  root = document.getElementById('tab-journey');
  root.addEventListener('click', onRootClick);
  root.addEventListener('keydown', ev=>{
    if(ev.key === 'Enter' && ev.target.id === 'jlJoinCode'){ ev.preventDefault(); joinCircle(); return; }
    if(ev.key === 'Enter' && ev.target.id === 'jlPlaceName'){
      ev.preventDefault();
      if(!pendingPlace && placeSuggestions.length) pickSuggestion(0); else addPlace();
      return;
    }
    const t = ev.target.closest('[data-jl-state]');
    if(t && (ev.key === 'Enter' || ev.key === ' ')){ ev.preventDefault(); selectState(t.dataset.jlState); }
  });
  root.addEventListener('input', onRootInput);
  root.addEventListener('change', onRootInput);
}

export function openJourneyTab(){
  const user = ctx.getCurrentUser();
  const ws = getActiveWorkspace();
  if(!user || !ws) return;
  if(started && me && (me.pid !== user.id || me.ws !== ws)) resetJourneyState();
  if(!started){
    started = true;
    me = { ws, pid:user.id, name:user.name };
    myLoaded = false;
    myUnsub = subscribeWorkspaceKey(ws, journeyStorageKey(user.id), onMyDocSnapshot);
    resumeTuriyaIfRunning();
  }
  renderedPanelState = null;
  renderedCircleKey = null;
  renderShell();
}

// Stops everything tied to the current profile: logs a running Turiya
// session (like the Practice timer does on switch-user/sign-out), discards
// an in-progress voice recording, and drops every live listener.
export function resetJourneyState(){
  if(turiyaRun) stopTuriya(true);
  discardRecording();
  if(saveTimer && savePending){ clearTimeout(saveTimer); flushSave(); }
  if(myUnsub){ myUnsub(); myUnsub = null; }
  teardownCircle();
  started = false; me = null; myJourney = defaultJourney(); myLoaded = false;
  lastSavedRaw = null; savePending = false; saveTimer = null;
  Object.keys(memberProfiles).forEach(k=>delete memberProfiles[k]);
  pendingPlace = null; placeSuggestions = []; pinMode = false; ghostPin = null;
  renderedPanelState = null; renderedCircleKey = null; arrowPos = null; arrowState = null;
  if(root) root.querySelectorAll('.jl-dyn').forEach(el=>{ el.innerHTML = ''; });
}

function onMyDocSnapshot(raw){
  if(savePending) return; // our pending save will overwrite this anyway (last write wins)
  if(myLoaded && raw === lastSavedRaw) return;
  myJourney = parseJourney(raw);
  lastSavedRaw = raw;
  myLoaded = true;
  syncCircleSubscription();
  refreshViews();
}

function saveMyJourney(){
  savePending = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 300);
}
async function flushSave(){
  if(!me) return;
  const raw = JSON.stringify(myJourney);
  lastSavedRaw = raw;
  const key = journeyStorageKey(me.pid);
  try{ await cloudSet(key, raw); }
  catch(e){ console.error('journey save failed', e); toast('Could not save — check your connection.'); }
  finally{ savePending = false; saveTimer = null; }
}

/* ================= Journey Circle ================= */

function syncCircleSubscription(){
  const code = myJourney.circle || null;
  if(code === circleCode) return;
  teardownCircle();
  circleCode = code;
  if(!code) return;
  circleUnsub = subscribeJourneyCircle(code, members=>{
    circleMissing = members === null;
    circleMembersRaw = members || [];
    syncMemberSubs();
    refreshViews();
  });
}

function teardownCircle(){
  if(circleUnsub){ circleUnsub(); circleUnsub = null; }
  Object.keys(memberSubs).forEach(k=>{ memberSubs[k](); delete memberSubs[k]; delete memberJourneys[k]; });
  circleCode = null; circleMissing = false; circleMembersRaw = [];
}

function circleMembers(){
  const byKey = new Map();
  circleMembersRaw.forEach(m=>{ if(m && m.ws && m.pid) byKey.set(memberKey(m), m); });
  return [...byKey.values()];
}

function syncMemberSubs(){
  const wanted = new Set(circleMembers().map(memberKey).filter(k=>k !== myKey()));
  Object.keys(memberSubs).forEach(k=>{
    if(!wanted.has(k)){ memberSubs[k](); delete memberSubs[k]; delete memberJourneys[k]; delete memberProfiles[k]; }
  });
  circleMembers().forEach(m=>{
    const k = memberKey(m);
    if(k === myKey() || memberSubs[k]) return;
    memberSubs[k] = subscribeWorkspaceKey(m.ws, journeyStorageKey(m.pid), raw=>{
      memberJourneys[k] = parseJourney(raw);
      refreshViews();
    });
  });
}

// Everyone whose journey is on screen: you first, then circle members.
function participants(){
  if(!me) return [];
  const list = [{ ...me, name: ctx.getCurrentUser()?.name || me.name, key: myKey(), isMe: true, color: MY_COLOR, journey: myJourney }];
  if(circleCode && !circleMissing){
    circleMembers().forEach(m=>{
      const k = memberKey(m);
      if(k === myKey()) return;
      list.push({ ...m, key: k, isMe: false, color: colorFor(k), journey: memberJourneys[k] || null });
    });
  }
  return list;
}

async function createCircle(){
  if(!myLoaded) return toast('Still loading your journey…');
  try{
    const code = await journeyCircleCreate({ ws: me.ws, pid: me.pid, name: me.name });
    myJourney.circle = code;
    saveMyJourney();
    syncCircleSubscription();
    refreshViews();
    toast(`Circle ${code} created — share this code to invite others.`);
  }catch(e){ console.error(e); toast('Could not create a circle: '+e.message); }
}

async function joinCircle(){
  if(!myLoaded) return toast('Still loading your journey…');
  const input = document.getElementById('jlJoinCode');
  const code = (input && input.value || '').trim().toUpperCase();
  if(!/^[A-Z0-9]{6}$/.test(code)) return toast('Enter the 6-character circle code.');
  try{
    await journeyCircleJoin(code, { ws: me.ws, pid: me.pid, name: me.name });
    myJourney.circle = code;
    saveMyJourney();
    syncCircleSubscription();
    refreshViews();
    toast(`Joined circle ${code}.`);
  }catch(e){ console.error(e); toast(e.message || 'Could not join that circle.'); }
}

async function leaveCircle(){
  if(!circleCode) return;
  if(!confirm('Leave this Journey Circle? Your own entries stay in your journey; you just stop seeing the others.')) return;
  const code = circleCode;
  const mine = circleMembersRaw.filter(m=>m && memberKey(m) === myKey());
  myJourney.circle = null;
  saveMyJourney();
  teardownCircle();
  refreshViews();
  try{ await journeyCircleRemove(code, mine); }catch(e){ console.error(e); }
}

async function addProfileToCircle(pid){
  const user = (ctx.getUsers() || []).find(u=>u.id === pid);
  if(!user || !circleCode) return;
  try{
    const res = await getWorkspaceKv(me.ws, journeyStorageKey(pid));
    const theirs = parseJourney(res && res.value);
    if(theirs.circle && theirs.circle !== circleCode) return toast(`${user.name} is already in circle ${theirs.circle}.`);
    theirs.circle = circleCode;
    await cloudSet(journeyStorageKey(pid), JSON.stringify(theirs));
    await journeyCircleJoin(circleCode, { ws: me.ws, pid, name: user.name });
    toast(`${user.name} added to the circle.`);
  }catch(e){ console.error(e); toast('Could not add '+user.name+': '+e.message); }
}

/* ================= rendering: shell, circle, diagram ================= */

function renderShell(){
  if(!root) return;
  root.innerHTML = `
    <div class="sec-head jl-head">
      <div>
        <h2>Journey Logs</h2>
        <div class="desc">Turiya, the witness, moves through waking, dreaming and deep sleep — and rests beyond them. Log each state here.</div>
      </div>
    </div>
    <div id="jlCircle" class="jl-dyn"></div>
    <div class="jl-diagram-wrap">${diagramSvg()}</div>
    <div class="jl-state-pills">${STATES.map(s=>`<button type="button" class="jl-state-pill" data-jl-state="${s.id}" style="--st:${s.color}">${s.label}</button>`).join('')}</div>
    <div id="jlPanel" class="jl-dyn"></div>`;
  arrowPos = null; arrowState = null;
  refreshViews();
}

function renderCircleCard(){
  const el = document.getElementById('jlCircle');
  if(!el) return;
  const key = (circleCode || '-') + (circleMissing ? ':missing' : '');
  if(renderedCircleKey !== key){
    renderedCircleKey = key;
    if(!circleCode){
      el.innerHTML = `
        <div class="jl-circle-card">
          <div class="jl-circle-intro">
            <div class="jl-circle-title">🪷 Journey Circle</div>
            <div class="jl-circle-sub">Bring other sādhakas' journey logs onto this screen — from this shared space or another household's login. Every entry carries its author's name and updates live.</div>
          </div>
          <div class="jl-circle-actions">
            <button class="pill" type="button" data-jl-action="circle-create">Start a circle</button>
            <div class="jl-join">
              <input type="text" id="jlJoinCode" placeholder="Circle code" maxlength="6" autocomplete="off" autocapitalize="characters">
              <button class="pill ghost" type="button" data-jl-action="circle-join">Join</button>
            </div>
          </div>
          <div class="jl-circle-note">Solo view — only your own journey is shown.</div>
        </div>`;
    }else if(circleMissing){
      el.innerHTML = `
        <div class="jl-circle-card">
          <div class="jl-circle-title">🪷 Journey Circle ${esc(circleCode)}</div>
          <div class="jl-circle-sub">This circle can't be found any more.</div>
          <button class="pill ghost" type="button" data-jl-action="circle-leave">Clear it</button>
        </div>`;
    }else{
      el.innerHTML = `
        <div class="jl-circle-card in">
          <div class="jl-circle-row">
            <div class="jl-circle-title">🪷 Journey Circle</div>
            <button class="jl-code-chip" type="button" data-jl-action="circle-copy" title="Copy code">${esc(circleCode)} <span aria-hidden="true">⧉</span></button>
            <button class="pill ghost jl-leave" type="button" data-jl-action="circle-leave">Leave</button>
          </div>
          <div class="jl-circle-members" id="jlCircleMembers"></div>
          <div class="jl-circle-add" id="jlCircleAdd"></div>
          <div class="jl-circle-note">Share the code — anyone signed in to Sadhana can join from their own login.</div>
        </div>`;
    }
  }
  const membersEl = document.getElementById('jlCircleMembers');
  if(membersEl){
    membersEl.innerHTML = participants().map(p=>`${tagHtml(p)}${p.isMe ? '<span class="jl-you">you</span>' : ''}`).join(' ');
  }
  const addEl = document.getElementById('jlCircleAdd');
  if(addEl){
    const inCircle = new Set(circleMembers().map(memberKey));
    const addable = (ctx.getUsers() || []).filter(u=>!inCircle.has(me.ws+':'+u.id));
    addEl.innerHTML = addable.length
      ? `<span class="jl-muted">Add from this shared space:</span> ` + addable.map(u=>`<button class="jl-add-profile" type="button" data-jl-action="circle-add-profile" data-pid="${esc(u.id)}">+ ${esc(u.name)}</button>`).join(' ')
      : '';
  }
}

function diagramSvg(){
  const boxes = STATES.map(s=>`
    <g class="jl-state-box${s.id==='turiya'?' beyond':''}" data-jl-state="${s.id}" tabindex="0" role="button" aria-label="${s.label} state" style="--st:${s.color}">
      <rect x="${s.x}" y="${BOX_Y}" width="${BOX_W}" height="${BOX_H}" rx="12"/>
      <text class="jl-box-label" x="${s.x+BOX_W/2}" y="${BOX_Y+30}">${s.label}</text>
      <text class="jl-box-sk" x="${s.x+BOX_W/2}" y="${BOX_Y+46}">${s.sk}</text>
      <text class="jl-box-badge" id="jlBadge-${s.id}" x="${s.x+BOX_W/2}" y="${BOX_Y+63}"></text>
    </g>`).join('');
  const travel = `M${ORB.x},${ORB.y-ORB.r} L${STATES[0].x+BOX_W/2},${BOX_Y+BOX_H+4} L${STATES[1].x+BOX_W/2},${BOX_Y+BOX_H+4} L${STATES[2].x+BOX_W/2},${BOX_Y+BOX_H+4} L${STATES[3].x+BOX_W/2},${BOX_Y+BOX_H+4} Z`;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return `
  <svg class="jl-diagram" viewBox="0 0 420 290" role="group" aria-label="Turiya and the three states">
    <defs>
      <radialGradient id="jlOrbGrad" cx="50%" cy="45%" r="60%">
        <stop offset="0" stop-color="#FFFFFF"/>
        <stop offset="0.55" stop-color="#CFE6FF"/>
        <stop offset="1" stop-color="#5DA8FF"/>
      </radialGradient>
      <filter id="jlGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <path class="jl-travel-path" d="${travel}"/>
    ${boxes}
    <g id="jlArrow" class="jl-arrow">
      <line id="jlArrowLine" x1="${ORB.x}" y1="${ORB.y-ORB.r}" x2="${ORB.x}" y2="${ORB.y-ORB.r}"/>
      <polygon id="jlArrowHead" points="0,0 0,0 0,0"/>
    </g>
    <g class="jl-orb" data-jl-state="turiya" tabindex="0" role="button" aria-label="Turiya — meditate as the observer">
      <circle class="jl-orb-halo" cx="${ORB.x}" cy="${ORB.y}" r="${ORB.r+14}"/>
      <circle class="jl-orb-core" cx="${ORB.x}" cy="${ORB.y}" r="${ORB.r}" fill="url(#jlOrbGrad)" filter="url(#jlGlow)"/>
      <text class="jl-orb-label" x="${ORB.x}" y="${ORB.y+2}">TURIYA</text>
      <text class="jl-orb-sub" x="${ORB.x}" y="${ORB.y+17}" id="jlOrbSub">the witness</text>
    </g>
    ${reduceMotion ? '' : `<circle class="jl-traveler" r="4"><animateMotion dur="10s" repeatCount="indefinite" path="${travel}"/></circle>`}
  </svg>`;
}

function refreshDiagram(){
  const parts = participants();
  const mine = myJourney;
  const setBadge = (id, text)=>{ const el = document.getElementById('jlBadge-'+id); if(el) el.textContent = text; };
  if(myLoaded){
    const places = parts.reduce((n,p)=>n + (p.journey ? p.journey.places.length : 0), 0);
    const dreams = parts.reduce((n,p)=>n + (p.journey ? p.journey.dreams.length : 0), 0);
    setBadge('waking', `${places} place${places===1?'':'s'}`);
    setBadge('dreaming', `${dreams} dream${dreams===1?'':'s'}`);
    const recent = mine.sleep.filter(s=>s.date >= daysAgoStr(6));
    setBadge('sleep', recent.length ? `${(recent.reduce((n,s)=>n+s.minutes,0)/recent.length/60).toFixed(1)}h avg` : 'no nights');
    const todaySecs = mine.turiya.filter(t=>t.date === ctx.todayStr()).reduce((n,t)=>n+t.seconds,0) + (turiyaRun ? (Date.now()-turiyaRun.startTime)/1000 : 0);
    setBadge('turiya', todaySecs ? `${ctx.fmtShort(todaySecs)} today` : 'observe');
  }
  root.querySelectorAll('.jl-state-box, .jl-state-pill').forEach(el=>el.classList.toggle('on', el.dataset.jlState === selectedState));
  const orb = root.querySelector('.jl-orb');
  if(orb){ orb.classList.toggle('on', selectedState === 'turiya'); orb.classList.toggle('running', !!turiyaRun); }
  const sub = document.getElementById('jlOrbSub');
  if(sub) sub.textContent = turiyaRun ? ctx.fmtTime((Date.now()-turiyaRun.startTime)/1000) : 'the witness';
  animateArrowTo(selectedState);
}

function arrowTarget(stateId){
  const s = STATES.find(x=>x.id === stateId);
  if(!s || s.id === 'turiya') return { x: ORB.x, y: ORB.y - ORB.r + 2, hidden: true };
  return { x: s.x + BOX_W/2, y: BOX_Y + BOX_H + 6, hidden: false };
}

function animateArrowTo(stateId){
  const line = document.getElementById('jlArrowLine');
  const head = document.getElementById('jlArrowHead');
  const group = document.getElementById('jlArrow');
  if(!line || !head) return;
  if(arrowPos && arrowState === stateId) return; // already there (or on its way)
  arrowState = stateId;
  const target = arrowTarget(stateId);
  const from = arrowPos || { x: ORB.x, y: ORB.y - ORB.r + 2 };
  if(arrowAnim) cancelAnimationFrame(arrowAnim);
  const t0 = performance.now(), dur = arrowPos ? 520 : 700;
  const draw = (x, y)=>{
    const sx = ORB.x, sy = ORB.y - ORB.r;
    line.setAttribute('x1', sx); line.setAttribute('y1', sy);
    line.setAttribute('x2', x); line.setAttribute('y2', y);
    const ang = Math.atan2(y - sy, x - sx), L = 13, W = 7;
    const bx = x - L*Math.cos(ang), by = y - L*Math.sin(ang);
    head.setAttribute('points', `${x},${y} ${bx + W*Math.sin(ang)},${by - W*Math.cos(ang)} ${bx - W*Math.sin(ang)},${by + W*Math.cos(ang)}`);
    arrowPos = { x, y };
  };
  group.classList.toggle('hidden', target.hidden);
  const step = now=>{
    const t = Math.min(1, (now - t0)/dur), e = 1 - Math.pow(1 - t, 3);
    draw(from.x + (target.x - from.x)*e, from.y + (target.y - from.y)*e);
    if(t < 1) arrowAnim = requestAnimationFrame(step);
  };
  arrowAnim = requestAnimationFrame(step);
}

function selectState(id){
  if(!STATES.some(s=>s.id === id)) return;
  selectedState = id;
  refreshViews();
  const panel = document.getElementById('jlPanel');
  if(panel && window.innerWidth < 720) panel.scrollIntoView({ behavior:'smooth', block:'start' });
}

/* ================= panels ================= */

function refreshViews(){
  if(!root || !started || !document.getElementById('jlPanel')) return;
  renderCircleCard();
  refreshDiagram();
  if(renderedPanelState !== selectedState) renderPanel();
  const loading = '<div class="empty-note">Loading your journey…</div>';
  if(selectedState === 'waking'){ refreshMapPins(); fill('jlPlacesList', myLoaded ? placesListHtml() : loading); refreshActivities(); }
  if(selectedState === 'dreaming') fill('jlDreamsList', myLoaded ? dreamsListHtml() : loading);
  if(selectedState === 'sleep'){ fill('jlSleepSummary', myLoaded ? sleepSummaryHtml() : loading); fill('jlSleepList', myLoaded ? sleepListHtml() : ''); }
  if(selectedState === 'turiya'){ fill('jlTuriyaStats', myLoaded ? turiyaStatsHtml() : loading); fill('jlTuriyaList', myLoaded ? turiyaListHtml() : ''); refreshOrb(); }
}
function fill(id, html){ const el = document.getElementById(id); if(el) el.innerHTML = html; }

function renderPanel(){
  const panel = document.getElementById('jlPanel');
  if(!panel) return;
  renderedPanelState = selectedState;
  const today = ctx.todayStr();
  if(selectedState === 'waking'){
    panel.innerHTML = `
      <div class="jl-panel jl-panel-waking">
        <div class="jl-panel-head"><span class="jl-panel-icon">☀️</span><div><h3>Waking · Jāgrat</h3><p>Places you've walked, and the sādhanā of each day.</p></div></div>
        <div class="jl-waking-grid">
          <div class="jl-card jl-map-card">
            <div class="jl-map-toolbar">
              <button type="button" class="jl-tool" data-jl-action="map-zoom-in" title="Zoom in">＋</button>
              <button type="button" class="jl-tool" data-jl-action="map-zoom-out" title="Zoom out">－</button>
              <button type="button" class="jl-tool" data-jl-action="map-reset" title="Show all of India">⟲</button>
              <button type="button" class="jl-tool wide${pinMode?' on':''}" data-jl-action="map-pinmode" id="jlPinModeBtn">📍 Tap to pin</button>
              <button type="button" class="jl-tool wide${showLabels?' on':''}" data-jl-action="map-labels" id="jlLabelsBtn">Aa Names</button>
            </div>
            <div class="jl-map${pinMode?' pinning':''}" id="jlMap"><div class="empty-note">Loading map…</div></div>
            <div class="jl-map-legend" id="jlMapLegend"></div>
            <div class="jl-attrib">Map: <a href="https://github.com/VictorCazanave/svg-maps" target="_blank" rel="noopener">svg-maps/india</a> by Victor Cazanave, CC BY 4.0 · Online search © OpenStreetMap contributors</div>
          </div>
          <div class="jl-card">
            <h4>Add a place</h4>
            <div class="jl-place-input-wrap">
              <input type="text" id="jlPlaceName" placeholder="Type a place — e.g. Rishikesh" autocomplete="off">
              <div class="jl-suggest" id="jlSuggest"></div>
            </div>
            <div class="jl-picked" id="jlPicked"></div>
            <div class="field-row">
              <div class="field-col"><label class="field-label" for="jlPlaceDate">Date visited</label><input type="date" id="jlPlaceDate" value="${today}" max="${today}"></div>
              <div class="field-col" style="flex:2 1 160px;"><label class="field-label" for="jlPlaceNote">Note (optional)</label><input type="text" id="jlPlaceNote" maxlength="200" placeholder="Darshan, satsang, walk by the Ganga…"></div>
            </div>
            <button class="pill" type="button" data-jl-action="place-add">📍 Add to map</button>
          </div>
        </div>
        <div class="jl-card"><h4>Places visited</h4><div id="jlPlacesList" class="jl-dyn"></div></div>
        <div class="jl-card">
          <div class="jl-row-between">
            <h4>Daily sādhanā</h4>
            <div class="jl-inline">
              <input type="date" id="jlActsDate" value="${today}" max="${today}">
              <button class="pill ghost" type="button" data-jl-action="acts-refresh" title="Reload circle members' activity">↻</button>
            </div>
          </div>
          <div id="jlActs" class="jl-dyn"></div>
        </div>
      </div>`;
    updatePickedLabel();
    loadMap();
  }else if(selectedState === 'dreaming'){
    panel.innerHTML = `
      <div class="jl-panel jl-panel-dreaming">
        <div class="jl-panel-head"><span class="jl-panel-icon">🌙</span><div><h3>Dreaming · Svapna</h3><p>Write down a dream — or just speak it — before it fades.</p></div></div>
        <div class="jl-card">
          <h4>Record a dream</h4>
          <div class="field-row">
            <div class="field-col"><label class="field-label" for="jlDreamDate">Night of</label><input type="date" id="jlDreamDate" value="${today}" max="${today}"></div>
            <div class="field-col" style="flex:2 1 160px;"><label class="field-label" for="jlDreamSubject">Subject</label><input type="text" id="jlDreamSubject" maxlength="120" placeholder="A river of light…"></div>
          </div>
          <label class="field-label" for="jlDreamDesc">Description</label>
          <textarea id="jlDreamDesc" class="journal-textarea" placeholder="What happened, who was there, how it felt…"></textarea>
          <div class="jl-recorder" id="jlRecorder"></div>
          <button class="pill" type="button" data-jl-action="dream-save">Save dream</button>
        </div>
        <div class="jl-card"><h4>Dream log</h4><div id="jlDreamsList" class="jl-dyn"></div></div>
      </div>`;
    renderRecorder();
  }else if(selectedState === 'sleep'){
    const now = new Date();
    const wake = new Date(now); wake.setHours(6,0,0,0);
    if(wake > now) wake.setTime(now.getTime());
    const sleep = new Date(wake); sleep.setDate(sleep.getDate()-1); sleep.setHours(22,0,0,0);
    panel.innerHTML = `
      <div class="jl-panel jl-panel-sleep">
        <div class="jl-panel-head"><span class="jl-panel-icon">🌌</span><div><h3>Deep Sleep · Suṣupti</h3><p>When you went to sleep and when you woke — the hours are counted for you.</p></div></div>
        <div class="jl-card">
          <h4>Log a night</h4>
          <div class="field-row">
            <div class="field-col"><label class="field-label" for="jlSleepAt">Went to sleep</label><input type="datetime-local" id="jlSleepAt" value="${localInputValue(sleep)}"></div>
            <div class="field-col"><label class="field-label" for="jlWakeAt">Woke up</label><input type="datetime-local" id="jlWakeAt" value="${localInputValue(wake)}"></div>
          </div>
          <div class="jl-sleep-preview" id="jlSleepPreview"></div>
          <button class="pill" type="button" data-jl-action="sleep-save">Save night</button>
        </div>
        <div class="jl-card"><h4>Last 7 nights</h4><div id="jlSleepSummary" class="jl-dyn"></div></div>
        <div class="jl-card"><h4>Nights</h4><div id="jlSleepList" class="jl-dyn"></div></div>
      </div>`;
    updateSleepPreview();
  }else{
    panel.innerHTML = `
      <div class="jl-panel jl-panel-turiya">
        <div class="jl-panel-head"><span class="jl-panel-icon">✦</span><div><h3>Turiya · the witness</h3><p>Sit as the observer of waking, dream and deep sleep. The time you spend there is counted here.</p></div></div>
        <div class="jl-card jl-orb-card">
          <button type="button" class="jl-witness" id="jlWitness" data-jl-action="turiya-toggle">
            <span class="jl-witness-ring"></span>
            <span class="jl-witness-label" id="jlWitnessLabel">Begin observing</span>
            <span class="jl-witness-time" id="jlWitnessTime"></span>
          </button>
          <p class="jl-muted" id="jlWitnessHint">Tap to begin. Tap again when you return.</p>
        </div>
        <div class="jl-card"><h4>Time as the observer</h4><div id="jlTuriyaStats" class="jl-dyn"></div></div>
        <div class="jl-card">
          <h4>Add a past session</h4>
          <div class="field-row">
            <div class="field-col"><label class="field-label" for="jlTuriyaDate">Date</label><input type="date" id="jlTuriyaDate" value="${today}" max="${today}"></div>
            <div class="field-col"><label class="field-label" for="jlTuriyaMin">Minutes</label><input type="number" id="jlTuriyaMin" min="1" max="720" placeholder="30"></div>
          </div>
          <button class="pill ghost" type="button" data-jl-action="turiya-manual">Add session</button>
        </div>
        <div class="jl-card"><h4>Sessions</h4><div id="jlTuriyaList" class="jl-dyn"></div></div>
      </div>`;
  }
}

/* ================= Waking: map ================= */

async function loadMap(){
  const host = document.getElementById('jlMap');
  if(!host) return;
  try{
    if(!mapSvgText){
      const res = await fetch('assets/india-map.svg');
      if(!res.ok) throw new Error('HTTP '+res.status);
      mapSvgText = await res.text();
    }
  }catch(e){
    host.innerHTML = '<div class="empty-note">The map couldn\'t load — check your connection and reopen this tab.</div>';
    return;
  }
  if(!document.getElementById('jlMap')) return;
  const doc = new DOMParser().parseFromString(mapSvgText, 'image/svg+xml');
  const svg = document.importNode(doc.documentElement, true);
  svg.setAttribute('class', 'jl-map-svg');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.querySelectorAll('path').forEach(p=>{
    p.classList.add('jl-region');
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    t.textContent = p.getAttribute('aria-label') || '';
    p.appendChild(t);
  });
  const pins = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  pins.setAttribute('id', 'jlPins');
  svg.appendChild(pins);
  host.innerHTML = '';
  host.appendChild(svg);
  mapIntroDone = false;
  applyViewBox();
  wireMapGestures(svg);
  refreshMapPins();
}

function applyViewBox(){
  const svg = root.querySelector('.jl-map-svg');
  if(svg) svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
}

function zoomAt(factor, cx, cy){
  const newW = Math.max(MAP_W/14, Math.min(MAP_W, vb.w / factor));
  const f = newW / vb.w;
  const newH = vb.h * f;
  if(cx === undefined){ cx = vb.x + vb.w/2; cy = vb.y + vb.h/2; }
  vb = { x: cx - (cx - vb.x)*f, y: cy - (cy - vb.y)*f, w: newW, h: newH };
  clampViewBox();
  applyViewBox();
  refreshMapPins();
}

function clampViewBox(){
  const padX = vb.w*0.35, padY = vb.h*0.35;
  vb.x = Math.min(Math.max(vb.x, -padX), MAP_W - vb.w + padX);
  vb.y = Math.min(Math.max(vb.y, -padY), MAP_H - vb.h + padY);
}

function svgPoint(svg, clientX, clientY){
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

function wireMapGestures(svg){
  const pointers = new Map();
  let gesture = null;
  svg.addEventListener('pointerdown', ev=>{
    svg.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if(pointers.size === 1){
      gesture = { type:'pan', startX: ev.clientX, startY: ev.clientY, vb0: { ...vb }, moved: 0, target: ev.target };
    }else if(pointers.size === 2){
      const [a, b] = [...pointers.values()];
      const mid = svgPoint(svg, (a.x+b.x)/2, (a.y+b.y)/2);
      gesture = { type:'pinch', dist0: Math.hypot(a.x-b.x, a.y-b.y), vb0: { ...vb }, mid, moved: 99 };
    }
  });
  svg.addEventListener('pointermove', ev=>{
    if(!pointers.has(ev.pointerId) || !gesture) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    const scale = svg.getScreenCTM().a;
    if(gesture.type === 'pan' && pointers.size === 1){
      const dx = ev.clientX - gesture.startX, dy = ev.clientY - gesture.startY;
      gesture.moved = Math.max(gesture.moved, Math.hypot(dx, dy));
      if(gesture.moved < 4) return;
      vb.x = gesture.vb0.x - dx/scale;
      vb.y = gesture.vb0.y - dy/scale;
      clampViewBox();
      applyViewBox();
    }else if(gesture.type === 'pinch' && pointers.size === 2){
      const [a, b] = [...pointers.values()];
      const factor = Math.hypot(a.x-b.x, a.y-b.y) / gesture.dist0;
      vb = { ...gesture.vb0 };
      zoomAt(factor, gesture.mid.x, gesture.mid.y);
    }
  });
  const end = ev=>{
    if(!pointers.has(ev.pointerId)) return;
    pointers.delete(ev.pointerId);
    if(gesture && gesture.type === 'pan' && gesture.moved < 4 && ev.type === 'pointerup'){
      onMapTap(svg, ev.clientX, ev.clientY, gesture.target);
    }
    if(gesture && gesture.type === 'pan' && gesture.moved >= 4) refreshMapPins();
    if(pointers.size === 0) gesture = null;
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('wheel', ev=>{
    ev.preventDefault();
    const p = svgPoint(svg, ev.clientX, ev.clientY);
    zoomAt(ev.deltaY < 0 ? 1.25 : 0.8, p.x, p.y);
  }, { passive:false });
}

function onMapTap(svg, clientX, clientY, target){
  const pin = target && target.closest && target.closest('.jl-pin');
  if(pin && !pinMode){
    const label = pin.querySelector('title');
    if(label) toast(label.textContent);
    return;
  }
  if(!pinMode) return;
  const p = svgPoint(svg, clientX, clientY);
  const onLand = [...svg.querySelectorAll('path.jl-region')].some(path=>{
    try{ return path.isPointInFill(new DOMPoint(p.x, p.y)); }catch(e){ return false; }
  });
  if(!onLand) return toast('That spot is outside India — tap on land to drop a pin.');
  const { lat, lon } = unprojectXY(p.x, p.y);
  const near = nearestIndiaPlace(lat, lon);
  const suggested = near && near.km < 12 ? near.place.name : near && near.km < 60 ? `Near ${near.place.name}` : 'Pinned place';
  const input = document.getElementById('jlPlaceName');
  const typed = input && input.value.trim();
  pendingPlace = { name: typed && (!pendingPlace || pendingPlace.source === 'tap') ? typed : suggested, lat, lon, region: near ? near.place.region : '', source:'tap' };
  if(input && (!typed || (pendingPlace.name === suggested))) input.value = pendingPlace.name;
  ghostPin = { x: p.x, y: p.y };
  hideSuggestions();
  updatePickedLabel();
  refreshMapPins();
}

function refreshMapPins(){
  const layer = document.getElementById('jlPins');
  const legend = document.getElementById('jlMapLegend');
  const parts = participants();
  if(legend){
    legend.innerHTML = parts.map(p=>`${tagHtml(p)}<span class="jl-muted">${p.journey ? p.journey.places.length : '…'}</span>`).join(' ');
  }
  if(!layer) return;
  // Sized in on-screen pixels (not map units), so pins and names stay
  // readable whether the map is phone-width or zoomed right in.
  const svgEl = layer.ownerSVGElement;
  const ctm = svgEl && svgEl.getScreenCTM();
  const k = ctm && ctm.a > 0 ? 1/ctm.a : vb.w / MAP_W;
  const r = 5.5*k, fs = 10.5*k, sw = 1.6*k;
  let html = '';
  // oldest first so the newest pins draw on top
  const all = [];
  parts.forEach(p=>{ if(p.journey) p.journey.places.forEach(pl=>all.push({ p, pl })); });
  all.sort((a,b)=>(a.pl.createdAt||0) - (b.pl.createdAt||0));
  // Pins drop in one after another the first time the map draws, and a
  // freshly added pin drops in on its own; every later redraw (zoom, a
  // collaborator's live update) just repaints them in place.
  const intro = !mapIntroDone && all.length > 0;
  if(intro) mapIntroDone = true;
  all.forEach(({ p, pl }, i)=>{
    const { x, y } = projectLatLon(pl.lat, pl.lon);
    const isNew = pl.id === lastAddedPlaceId;
    const label = `${pl.name} · ${p.name}`;
    const cls = isNew ? ' jl-pin-new' : intro ? ' jl-pin-intro' : '';
    html += `<g class="jl-pin${cls}" style="--pin:${p.color};${intro ? ` animation-delay:${Math.min(i,40)*45}ms` : ''}">
      <title>${esc(label)} — ${esc(fmtDateLong(pl.date))}</title>
      <circle cx="${x}" cy="${y}" r="${r*2.1}" class="jl-pin-halo"/>
      <circle cx="${x}" cy="${y}" r="${r}" stroke-width="${sw}"/>
      ${showLabels ? `<text x="${x + r*1.5}" y="${y + fs*0.35}" font-size="${fs}" stroke-width="${2.6*k}">${esc(pl.name)}<tspan class="jl-pin-who" font-size="${fs*0.82}"> · ${esc(p.name)}</tspan></text>` : ''}
    </g>`;
  });
  if(ghostPin){
    html += `<g class="jl-pin jl-pin-ghost"><circle cx="${ghostPin.x}" cy="${ghostPin.y}" r="${r*1.2}" stroke-width="${sw}"/></g>`;
  }
  layer.innerHTML = html;
  if(lastAddedPlaceId) setTimeout(()=>{ lastAddedPlaceId = null; }, 1200);
}

function focusPlace(key, id){
  const p = participants().find(x=>x.key === key);
  const pl = p && p.journey && p.journey.places.find(x=>x.id === id);
  if(!pl) return;
  const { x, y } = projectLatLon(pl.lat, pl.lon);
  const w = MAP_W/4, h = MAP_H/4;
  vb = { x: x - w/2, y: y - h/2, w, h };
  clampViewBox();
  applyViewBox();
  refreshMapPins();
  const map = document.getElementById('jlMap');
  if(map) map.scrollIntoView({ behavior:'smooth', block:'center' });
}

/* ================= Waking: add place ================= */

function showSuggestions(query){
  const box = document.getElementById('jlSuggest');
  if(!box) return;
  const q = query.trim();
  placeSuggestions = q ? searchIndiaPlaces(q, 6).map(pl=>({ ...pl, source:'gazetteer' })) : [];
  if(!q){ hideSuggestions(); return; }
  box.innerHTML = placeSuggestions.map((pl, i)=>`
      <button type="button" class="jl-suggest-item" data-jl-action="place-pick" data-idx="${i}">
        <b>${esc(pl.name)}</b><span>${esc(pl.region)}</span>
      </button>`).join('') +
    `<button type="button" class="jl-suggest-item online" data-jl-action="place-online">🔎 Search the online map for “${esc(q)}”</button>`;
  box.classList.add('open');
}
function hideSuggestions(){ const box = document.getElementById('jlSuggest'); if(box){ box.classList.remove('open'); box.innerHTML = ''; } }

async function searchOnline(){
  const input = document.getElementById('jlPlaceName');
  const q = input ? input.value.trim() : '';
  const box = document.getElementById('jlSuggest');
  if(!q || !box) return;
  box.innerHTML = '<div class="jl-suggest-msg">Searching…</div>';
  box.classList.add('open');
  try{
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=in&limit=6&accept-language=en&q=' + encodeURIComponent(q);
    const ctrl = new AbortController();
    const timer = setTimeout(()=>ctrl.abort(), 9000);
    const res = await fetch(url, { signal: ctrl.signal, headers:{ 'Accept':'application/json' } });
    clearTimeout(timer);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const rows = await res.json();
    placeSuggestions = rows
      .map(r=>({ name: (r.name || r.display_name.split(',')[0]).trim(), region: r.display_name.split(',').slice(1, 3).join(',').trim(), lat: parseFloat(r.lat), lon: parseFloat(r.lon), source:'osm' }))
      .filter(r=>r.lat > 5 && r.lat < 38 && r.lon > 67 && r.lon < 98.5);
    if(!placeSuggestions.length){ box.innerHTML = '<div class="jl-suggest-msg">No match found in India. Try another spelling, or tap the map to pin it.</div>'; return; }
    box.innerHTML = placeSuggestions.map((pl, i)=>`
      <button type="button" class="jl-suggest-item" data-jl-action="place-pick" data-idx="${i}">
        <b>${esc(pl.name)}</b><span>${esc(pl.region)}</span>
      </button>`).join('');
  }catch(e){
    box.innerHTML = '<div class="jl-suggest-msg">Online search isn\'t reachable right now. Pick from the list or tap the map to pin it.</div>';
  }
}

function pickSuggestion(i){
  const pl = placeSuggestions[i];
  if(!pl) return;
  pendingPlace = { ...pl };
  const input = document.getElementById('jlPlaceName');
  if(input) input.value = pl.name;
  ghostPin = null;
  hideSuggestions();
  updatePickedLabel();
  const { x, y } = projectLatLon(pl.lat, pl.lon);
  ghostPin = { x, y };
  refreshMapPins();
}

function updatePickedLabel(){
  const el = document.getElementById('jlPicked');
  if(!el) return;
  if(pendingPlace){
    el.innerHTML = `📍 <b>${esc(pendingPlace.name)}</b>${pendingPlace.region ? ', '+esc(pendingPlace.region) : ''} <span class="jl-muted">${pendingPlace.lat.toFixed(3)}°N ${pendingPlace.lon.toFixed(3)}°E</span>`;
    el.classList.add('ready');
  }else{
    el.textContent = 'Pick a suggestion, search online, or turn on “Tap to pin” and tap the map.';
    el.classList.remove('ready');
  }
}

function addPlace(){
  if(!myLoaded) return toast('Still loading your journey…');
  const input = document.getElementById('jlPlaceName');
  const typed = input ? input.value.trim() : '';
  if(!pendingPlace && typed){
    const exact = searchIndiaPlaces(typed, 1)[0];
    if(exact && exact.name.toLowerCase() === typed.toLowerCase()) pendingPlace = { ...exact, source:'gazetteer' };
  }
  if(!pendingPlace) return toast('Choose where it is first — a suggestion, an online result, or a tap on the map.');
  const date = document.getElementById('jlPlaceDate').value || ctx.todayStr();
  const note = document.getElementById('jlPlaceNote').value.trim();
  const name = (pendingPlace.source === 'tap' && typed) ? typed : pendingPlace.name;
  const place = { id: ctx.uid(), name, region: pendingPlace.region || '', lat: +pendingPlace.lat.toFixed(5), lon: +pendingPlace.lon.toFixed(5), date, note, source: pendingPlace.source, createdAt: Date.now() };
  myJourney.places.push(place);
  lastAddedPlaceId = place.id;
  saveMyJourney();
  pendingPlace = null; ghostPin = null;
  if(input) input.value = '';
  document.getElementById('jlPlaceNote').value = '';
  updatePickedLabel();
  refreshViews();
  toast(`${name} added to your map.`);
}

function placesListHtml(){
  const rows = [];
  participants().forEach(p=>{ if(p.journey) p.journey.places.forEach(pl=>rows.push({ p, pl })); });
  if(!rows.length) return '<div class="empty-note">No places yet — add the first one above.</div>';
  rows.sort((a,b)=>(b.pl.date||'').localeCompare(a.pl.date||'') || (b.pl.createdAt||0)-(a.pl.createdAt||0));
  return groupByDate(rows, r=>r.pl.date, ({ p, pl })=>`
    <div class="jl-entry" style="--tag:${p.color}">
      <button type="button" class="jl-entry-main" data-jl-action="place-focus" data-key="${esc(p.key)}" data-id="${esc(pl.id)}">
        <span class="jl-entry-title">📍 ${esc(pl.name)}</span>
        ${pl.region ? `<span class="jl-muted">${esc(pl.region)}</span>` : ''}
        ${pl.note ? `<span class="jl-entry-note">${esc(pl.note)}</span>` : ''}
      </button>
      <div class="jl-entry-side">${tagHtml(p)}${p.isMe ? `<button type="button" class="jl-del" data-jl-action="place-del" data-id="${esc(pl.id)}" title="Delete">✕</button>` : ''}</div>
    </div>`);
}

function groupByDate(rows, dateOf, rowHtml){
  let html = '', last = null;
  rows.forEach(r=>{
    const d = dateOf(r);
    if(d !== last){ if(last !== null) html += '</div>'; html += `<div class="jl-day"><div class="jl-day-label">${esc(fmtDateLong(d))}</div>`; last = d; }
    html += rowHtml(r);
  });
  if(last !== null) html += '</div>';
  return html;
}

/* ================= Waking: daily sādhanā ================= */

function refreshActivities(){
  const el = document.getElementById('jlActs');
  if(!el) return;
  const dateEl = document.getElementById('jlActsDate');
  const dateStr = (dateEl && dateEl.value) || ctx.todayStr();
  el.innerHTML = participants().map(p=>{
    let body;
    if(p.isMe){
      body = activityRowsHtml(ctx.getData(), dateStr);
    }else{
      const st = memberProfiles[p.key];
      if(!st){ loadMemberProfile(p); body = '<div class="empty-note">Loading…</div>'; }
      else if(st.status === 'loading') body = '<div class="empty-note">Loading…</div>';
      else if(st.status === 'err') body = '<div class="empty-note">Couldn\'t load their sādhanā.</div>';
      else body = activityRowsHtml(st.data, dateStr);
    }
    return `<div class="jl-acts-person" style="--tag:${p.color}"><div class="jl-acts-head">${tagHtml(p)}</div>${body}</div>`;
  }).join('');
}

async function loadMemberProfile(p){
  memberProfiles[p.key] = { status:'loading' };
  try{
    const res = await getWorkspaceKv(p.ws, ctx.userStorageKey(p.pid));
    memberProfiles[p.key] = { status:'ok', data: ctx.normalizeData(res && res.value ? JSON.parse(res.value) : null) };
  }catch(e){
    console.error('member profile load failed', e);
    memberProfiles[p.key] = { status:'err' };
  }
  if(selectedState === 'waking') refreshActivities();
}

// The same data Today renders — Japa counts/time per sandhyā, Practice
// sessions with their clock times, pages read, learning notes written that
// day, and completed Routine activities — read straight from the profile's
// own logs, not copied anywhere.
export function summarizeSadhanaDay(d, dateStr, sandhyaLabel){
  const day = (d && d.logs && d.logs[dateStr]) || null;
  const rows = [];
  if(!d) return rows;
  const label = s=>(sandhyaLabel && sandhyaLabel[s]) || s;
  if(day){
    (d.japa || []).forEach(c=>{
      const per = day.japa && day.japa[c.id];
      if(!per) return;
      Object.keys(per).forEach(s=>{
        const e = per[s];
        if(!e || (!e.count && !e.seconds)) return;
        rows.push({ icon:'📿', kind:'Japa', title: c.name, detail: `${label(s)} · ${e.count || 0} count${e.count===1?'':'s'}${e.seconds ? ' · '+fmtSecs(e.seconds) : ''}` });
      });
    });
    (d.practice || []).forEach(pr=>{
      const per = day.practice && day.practice[pr.id];
      if(!per) return;
      Object.keys(per).forEach(s=>{
        const e = per[s];
        if(!e || !e.seconds) return;
        const times = (e.log || []).filter(l=>l.endedAt).map(l=>`${fmtClock(l.endedAt - l.seconds*1000)}–${fmtClock(l.endedAt)}`);
        rows.push({ icon:'🧘', kind:'Practice', title: pr.name, detail: `${label(s)} · ${fmtSecs(e.seconds)}${times.length ? ' · '+times.join(', ') : ''}` });
      });
    });
    (d.books || []).forEach(b=>{
      const pages = day.reading && day.reading[b.id];
      if(pages > 0) rows.push({ icon:'📖', kind:'Reading', title: b.title, detail: `${pages} page${pages===1?'':'s'}` });
    });
    const acts = day.activities || {};
    (d.activities || []).forEach(a=>{
      const e = acts[a.id];
      if(!e || (e.status !== 'done' && !e.seconds)) return;
      const when = e.startedAt ? fmtClock(e.startedAt) + (e.completedAt ? '–'+fmtClock(e.completedAt) : '') : '';
      rows.push({ icon:'✨', kind:'Activity', title: a.name, detail: [e.status === 'done' ? 'done' : e.status, e.seconds ? fmtSecs(e.seconds) : '', when].filter(Boolean).join(' · ') });
    });
  }
  (d.learning || []).forEach(t=>{
    (t.notes || []).filter(n=>n.date === dateStr).forEach(n=>{
      rows.push({ icon:'🎓', kind:'Learning', title: t.title, detail: `note: “${n.text}”` });
    });
  });
  return rows;
}
function fmtSecs(s){ return ctx ? ctx.fmtShort(s) : Math.round(s)+'s'; }

function activityRowsHtml(d, dateStr){
  const rows = summarizeSadhanaDay(d, dateStr, ctx.sandhyaLabel);
  if(!rows.length) return '<div class="empty-note">Nothing logged on this day.</div>';
  return `<div class="jl-acts">${rows.map(r=>`
    <div class="jl-act"><span class="jl-act-icon">${r.icon}</span><div><div class="jl-act-title">${esc(r.title)} <span class="jl-act-kind">${esc(r.kind)}</span></div><div class="jl-muted">${esc(r.detail)}</div></div></div>`).join('')}</div>`;
}

/* ================= Dreaming ================= */

function renderRecorder(){
  const el = document.getElementById('jlRecorder');
  if(!el) return;
  if(rec){
    el.innerHTML = `<span class="jl-rec-dot"></span><span class="jl-rec-time" id="jlRecTime">0:00</span><span class="jl-muted">/ ${ctx.fmtTime(MAX_RECORD_SECONDS)}</span>
      <button class="pill done-btn" type="button" data-jl-action="dream-stop">■ Stop</button>`;
    updateRecTime();
  }else if(pendingAudio){
    el.innerHTML = `<audio controls src="${pendingAudio.url}"></audio>
      <button class="pill ghost" type="button" data-jl-action="dream-discard">✕ Discard</button>`;
  }else{
    el.innerHTML = `<button class="pill ghost" type="button" data-jl-action="dream-rec">🎙 Record a voice note</button><span class="jl-muted">up to ${MAX_RECORD_SECONDS/60} minutes</span>`;
  }
}
function updateRecTime(){
  const t = document.getElementById('jlRecTime');
  if(t && rec) t.textContent = ctx.fmtTime((Date.now()-rec.start)/1000);
}

async function startRecording(){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined'){
    return toast('Voice recording isn\'t supported in this browser.');
  }
  let stream;
  try{ stream = await navigator.mediaDevices.getUserMedia({ audio:true }); }
  catch(e){ return toast('Microphone access was blocked — allow it to record a voice note.'); }
  const types = ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'];
  const mime = types.find(t=>MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
  let mr;
  try{ mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 24000 } : { audioBitsPerSecond: 24000 }); }
  catch(e){ stream.getTracks().forEach(t=>t.stop()); return toast('Could not start recording.'); }
  rec = { mr, stream, chunks: [], start: Date.now(), mime: mime || mr.mimeType || 'audio/webm', tick: null, discard: false };
  mr.ondataavailable = e=>{ if(e.data && e.data.size) rec && rec.chunks.push(e.data); };
  mr.onstop = ()=>{
    const r = rec;
    rec = null;
    if(!r) return;
    clearInterval(r.tick);
    r.stream.getTracks().forEach(t=>t.stop());
    if(!r.discard && r.chunks.length){
      const blob = new Blob(r.chunks, { type: r.mime });
      if(pendingAudio) URL.revokeObjectURL(pendingAudio.url);
      pendingAudio = { blob, mime: r.mime, dur: Math.round((Date.now()-r.start)/1000), url: URL.createObjectURL(blob) };
    }
    renderRecorder();
  };
  mr.start(1000);
  rec.tick = setInterval(()=>{
    updateRecTime();
    if(rec && (Date.now()-rec.start)/1000 >= MAX_RECORD_SECONDS) stopRecording();
  }, 250);
  renderRecorder();
}
function stopRecording(){ if(rec && rec.mr.state !== 'inactive') rec.mr.stop(); }
function discardRecording(){
  if(rec){ rec.discard = true; stopRecording(); }
  if(pendingAudio){ URL.revokeObjectURL(pendingAudio.url); pendingAudio = null; }
  renderRecorder();
}

function blobToDataUrl(blob){
  return new Promise((resolve, reject)=>{
    const r = new FileReader();
    r.onload = ()=>resolve(r.result);
    r.onerror = ()=>reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function saveDream(){
  if(!myLoaded) return toast('Still loading your journey…');
  if(rec) return toast('Stop the recording first.');
  const date = document.getElementById('jlDreamDate').value || ctx.todayStr();
  const subject = document.getElementById('jlDreamSubject').value.trim();
  const description = document.getElementById('jlDreamDesc').value.trim();
  if(!subject && !description && !pendingAudio) return toast('Give the dream a subject, a description or a voice note.');
  const dream = { id: ctx.uid(), date, subject, description, audio: null, createdAt: Date.now() };
  if(pendingAudio){
    try{
      const dataUrl = await blobToDataUrl(pendingAudio.blob);
      if(dataUrl.length > MAX_AUDIO_DATAURL_CHARS) return toast('That voice note is too long to store — please record a shorter one.');
      await cloudSet(audioKey(dream.id), JSON.stringify({ mime: pendingAudio.mime, dataUrl, dur: pendingAudio.dur }));
      dream.audio = { mime: pendingAudio.mime, dur: pendingAudio.dur };
      audioCache[me.ws+':'+dream.id] = dataUrl;
    }catch(e){ console.error(e); return toast('Could not save the voice note — check your connection.'); }
  }
  myJourney.dreams.push(dream);
  saveMyJourney();
  document.getElementById('jlDreamSubject').value = '';
  document.getElementById('jlDreamDesc').value = '';
  if(pendingAudio){ URL.revokeObjectURL(pendingAudio.url); pendingAudio = null; }
  renderRecorder();
  refreshViews();
  toast('Dream saved.');
}

function dreamsListHtml(){
  const rows = [];
  participants().forEach(p=>{ if(p.journey) p.journey.dreams.forEach(dr=>rows.push({ p, dr })); });
  if(!rows.length) return '<div class="empty-note">No dreams recorded yet.</div>';
  rows.sort((a,b)=>(b.dr.date||'').localeCompare(a.dr.date||'') || (b.dr.createdAt||0)-(a.dr.createdAt||0));
  return groupByDate(rows, r=>r.dr.date, ({ p, dr })=>`
    <div class="jl-entry jl-dream" style="--tag:${p.color}">
      <div class="jl-entry-body">
        <div class="jl-entry-title">🌙 ${esc(dr.subject || 'Untitled dream')}</div>
        ${dr.description ? `<div class="jl-entry-text">${esc(dr.description)}</div>` : ''}
        ${dr.audio ? `<div class="jl-audio-slot" id="jlAudio-${esc(dr.id)}"><button type="button" class="jl-play" data-jl-action="dream-play" data-ws="${esc(p.ws)}" data-id="${esc(dr.id)}">▶ Voice note · ${ctx.fmtTime(dr.audio.dur || 0)}</button></div>` : ''}
      </div>
      <div class="jl-entry-side">${tagHtml(p)}${p.isMe ? `<button type="button" class="jl-del" data-jl-action="dream-del" data-id="${esc(dr.id)}" title="Delete">✕</button>` : ''}</div>
    </div>`);
}

async function playDream(ws, id){
  const slot = document.getElementById('jlAudio-'+id);
  if(!slot) return;
  const cacheKey = ws+':'+id;
  let url = audioCache[cacheKey];
  if(!url){
    slot.innerHTML = '<span class="jl-muted">Loading voice note…</span>';
    try{
      const res = await getWorkspaceKv(ws, audioKey(id));
      const parsed = res && res.value ? JSON.parse(res.value) : null;
      if(!parsed || !parsed.dataUrl) throw new Error('missing');
      url = audioCache[cacheKey] = parsed.dataUrl;
    }catch(e){ slot.innerHTML = '<span class="jl-muted">Voice note unavailable.</span>'; return; }
  }
  const fresh = document.getElementById('jlAudio-'+id);
  if(!fresh) return;
  fresh.innerHTML = `<audio controls autoplay src="${url}"></audio>`;
}

async function deleteDream(id){
  const dr = myJourney.dreams.find(d=>d.id === id);
  if(!dr || !confirm('Delete this dream?')) return;
  myJourney.dreams = myJourney.dreams.filter(d=>d.id !== id);
  saveMyJourney();
  refreshViews();
  if(dr.audio){ try{ await cloudDelete(audioKey(id)); }catch(e){ console.error(e); } }
}

/* ================= Deep Sleep ================= */

function readSleepInputs(){
  const a = document.getElementById('jlSleepAt'), b = document.getElementById('jlWakeAt');
  if(!a || !b || !a.value || !b.value) return null;
  const sleepAt = new Date(a.value), wakeAt = new Date(b.value);
  const minutes = Math.round((wakeAt - sleepAt)/60000);
  return { sleepAt: a.value, wakeAt: b.value, minutes, wakeDate: ctx.todayStr(wakeAt) };
}
function updateSleepPreview(){
  const el = document.getElementById('jlSleepPreview');
  if(!el) return;
  const s = readSleepInputs();
  if(!s){ el.textContent = ''; return; }
  if(s.minutes <= 0){ el.innerHTML = '<span class="jl-warn">Waking time must be after sleeping time.</span>'; return; }
  if(s.minutes > 24*60){ el.innerHTML = '<span class="jl-warn">That\'s more than 24 hours — check the dates.</span>'; return; }
  el.innerHTML = `<span class="jl-sleep-hours">${fmtHM(s.minutes)}</span> <span class="jl-muted">of sleep</span>`;
}
function saveSleep(){
  if(!myLoaded) return toast('Still loading your journey…');
  const s = readSleepInputs();
  if(!s || s.minutes <= 0 || s.minutes > 24*60) return toast('Check the sleep and waking times.');
  myJourney.sleep.push({ id: ctx.uid(), date: s.wakeDate, sleepAt: s.sleepAt, wakeAt: s.wakeAt, minutes: s.minutes, createdAt: Date.now() });
  saveMyJourney();
  refreshViews();
  toast(`${fmtHM(s.minutes)} of sleep logged.`);
}

function sleepSummaryHtml(){
  const days = [...Array(7)].map((_, i)=>daysAgoStr(6-i));
  return participants().map(p=>{
    if(!p.journey) return `<div class="jl-sleep-person">${tagHtml(p)}<span class="jl-muted">Loading…</span></div>`;
    const perDay = days.map(d=>p.journey.sleep.filter(s=>s.date === d).reduce((n,s)=>n+s.minutes, 0));
    const logged = perDay.filter(m=>m > 0);
    const avg = logged.length ? logged.reduce((a,b)=>a+b, 0)/logged.length : 0;
    const bars = perDay.map((m, i)=>{
      const [y,mo,d] = days[i].split('-').map(Number);
      const dow = new Date(y, mo-1, d).toLocaleDateString(undefined, { weekday:'narrow' });
      const h = Math.min(100, (m/600)*100);
      return `<div class="jl-bar" title="${esc(fmtDateLong(days[i]))}: ${m ? fmtHM(m) : 'not logged'}"><div class="jl-bar-track"><i style="height:${h}%; background:${p.color}"></i></div><span>${dow}</span></div>`;
    }).join('');
    return `<div class="jl-sleep-person">
      <div class="jl-sleep-meta">${tagHtml(p)}<span class="jl-muted">${logged.length ? `avg <b>${fmtHM(avg)}</b> · ${logged.length} night${logged.length===1?'':'s'}` : 'no nights this week'}</span></div>
      <div class="jl-bars">${bars}</div>
    </div>`;
  }).join('');
}

function sleepListHtml(){
  const rows = [];
  participants().forEach(p=>{ if(p.journey) p.journey.sleep.forEach(s=>rows.push({ p, s })); });
  if(!rows.length) return '<div class="empty-note">No nights logged yet.</div>';
  rows.sort((a,b)=>(b.s.date||'').localeCompare(a.s.date||'') || (b.s.createdAt||0)-(a.s.createdAt||0));
  const hm = v=>v ? v.slice(11,16) : '';
  return groupByDate(rows.slice(0, 60), r=>r.s.date, ({ p, s })=>`
    <div class="jl-entry" style="--tag:${p.color}">
      <div class="jl-entry-body"><span class="jl-entry-title">🌌 ${fmtHM(s.minutes)}</span> <span class="jl-muted">${hm(s.sleepAt)} → ${hm(s.wakeAt)}</span></div>
      <div class="jl-entry-side">${tagHtml(p)}${p.isMe ? `<button type="button" class="jl-del" data-jl-action="sleep-del" data-id="${esc(s.id)}" title="Delete">✕</button>` : ''}</div>
    </div>`);
}

/* ================= Turiya ================= */

function turiyaStoreKey(){ return me ? `sadhana-turiya-run:${me.ws}:${me.pid}` : null; }

function startTuriya(){
  if(!myLoaded) return toast('Still loading your journey…');
  if(turiyaRun) return;
  turiyaRun = { startTime: Date.now() };
  try{ localStorage.setItem(turiyaStoreKey(), String(turiyaRun.startTime)); }catch(e){ /* private mode */ }
  turiyaRun.tick = setInterval(()=>{ refreshOrb(); refreshDiagram(); }, 1000);
  refreshViews();
}

function stopTuriya(logIt = true){
  if(!turiyaRun) return;
  clearInterval(turiyaRun.tick);
  const endedAt = Date.now();
  const seconds = Math.round((endedAt - turiyaRun.startTime)/1000);
  const startedAt = turiyaRun.startTime;
  turiyaRun = null;
  try{ localStorage.removeItem(turiyaStoreKey()); }catch(e){ /* ignore */ }
  if(logIt && seconds >= 5 && me){
    myJourney.turiya.push({ id: ctx.uid(), date: ctx.todayStr(new Date(startedAt)), seconds, startedAt, endedAt, createdAt: endedAt });
    saveMyJourney();
    toast(`${ctx.fmtShort(seconds)} as the observer — logged.`);
  }
  refreshViews();
}

function resumeTuriyaIfRunning(){
  let saved = null;
  try{ saved = localStorage.getItem(turiyaStoreKey()); }catch(e){ return; }
  const start = parseInt(saved, 10);
  if(!start) return;
  if(Date.now() - start > 8*3600*1000){ try{ localStorage.removeItem(turiyaStoreKey()); }catch(e){} return; }
  turiyaRun = { startTime: start };
  turiyaRun.tick = setInterval(()=>{ refreshOrb(); refreshDiagram(); }, 1000);
}

function refreshOrb(){
  const btn = document.getElementById('jlWitness');
  if(!btn) return;
  btn.classList.toggle('running', !!turiyaRun);
  document.getElementById('jlWitnessLabel').textContent = turiyaRun ? 'Observing…' : 'Begin observing';
  document.getElementById('jlWitnessTime').textContent = turiyaRun ? ctx.fmtTime((Date.now()-turiyaRun.startTime)/1000) : '';
  document.getElementById('jlWitnessHint').textContent = turiyaRun ? 'Rest as the witness. Tap when you return.' : 'Tap to begin. Tap again when you return.';
}

function addManualTuriya(){
  if(!myLoaded) return toast('Still loading your journey…');
  const date = document.getElementById('jlTuriyaDate').value || ctx.todayStr();
  const min = parseFloat(document.getElementById('jlTuriyaMin').value);
  if(!(min > 0) || min > 720) return toast('Enter the minutes spent (1–720).');
  myJourney.turiya.push({ id: ctx.uid(), date, seconds: Math.round(min*60), manual: true, createdAt: Date.now() });
  saveMyJourney();
  document.getElementById('jlTuriyaMin').value = '';
  refreshViews();
}

function turiyaStatsHtml(){
  const today = ctx.todayStr(), weekStart = daysAgoStr(6);
  return `<div class="jl-turiya-stats">${participants().map(p=>{
    if(!p.journey) return `<div class="jl-tstat">${tagHtml(p)}<span class="jl-muted">Loading…</span></div>`;
    const t = p.journey.turiya;
    const live = p.isMe && turiyaRun ? (Date.now()-turiyaRun.startTime)/1000 : 0;
    const sum = list=>list.reduce((n,x)=>n+x.seconds, 0);
    const tToday = sum(t.filter(x=>x.date === today)) + live;
    const tWeek = sum(t.filter(x=>x.date >= weekStart)) + live;
    const tAll = sum(t) + live;
    return `<div class="jl-tstat" style="--tag:${p.color}">
      <div class="jl-tstat-head">${tagHtml(p)}${live ? '<span class="jl-live">● observing</span>' : ''}</div>
      <div class="jl-tstat-grid">
        <div><b>${ctx.fmtShort(tToday)}</b><span>today</span></div>
        <div><b>${ctx.fmtShort(tWeek)}</b><span>7 days</span></div>
        <div><b>${ctx.fmtShort(tAll)}</b><span>all time</span></div>
        <div><b>${t.length}</b><span>session${t.length===1?'':'s'}</span></div>
      </div>
    </div>`;
  }).join('')}</div>`;
}

function turiyaListHtml(){
  const rows = [];
  participants().forEach(p=>{ if(p.journey) p.journey.turiya.forEach(t=>rows.push({ p, t })); });
  if(!rows.length) return '<div class="empty-note">No sessions yet.</div>';
  rows.sort((a,b)=>(b.t.date||'').localeCompare(a.t.date||'') || (b.t.createdAt||0)-(a.t.createdAt||0));
  return groupByDate(rows.slice(0, 60), r=>r.t.date, ({ p, t })=>`
    <div class="jl-entry" style="--tag:${p.color}">
      <div class="jl-entry-body"><span class="jl-entry-title">✦ ${ctx.fmtShort(t.seconds)}</span> <span class="jl-muted">${t.startedAt ? fmtClock(t.startedAt)+'–'+fmtClock(t.endedAt) : 'added manually'}</span></div>
      <div class="jl-entry-side">${tagHtml(p)}${p.isMe ? `<button type="button" class="jl-del" data-jl-action="turiya-del" data-id="${esc(t.id)}" title="Delete">✕</button>` : ''}</div>
    </div>`);
}

/* ================= events ================= */

function onRootInput(ev){
  const id = ev.target.id;
  if(id === 'jlPlaceName' && ev.type === 'input'){
    const v = ev.target.value;
    if(pendingPlace && pendingPlace.source !== 'tap' && v.trim() !== pendingPlace.name){ pendingPlace = null; ghostPin = null; updatePickedLabel(); refreshMapPins(); }
    if(!pendingPlace || pendingPlace.source !== 'tap') showSuggestions(v);
  }
  if(id === 'jlActsDate' && ev.type === 'change') refreshActivities();
  if(id === 'jlSleepAt' || id === 'jlWakeAt') updateSleepPreview();
  if(id === 'jlJoinCode' && ev.type === 'input') ev.target.value = ev.target.value.toUpperCase();
}

function onRootClick(ev){
  const st = ev.target.closest('[data-jl-state]');
  if(st && !ev.target.closest('.jl-map')){ selectState(st.dataset.jlState); return; }
  if(!ev.target.closest('.jl-place-input-wrap')) hideSuggestions();
  const btn = ev.target.closest('[data-jl-action]');
  if(!btn) return;
  const a = btn.dataset.jlAction;
  const id = btn.dataset.id;
  switch(a){
    case 'circle-create': createCircle(); break;
    case 'circle-join': joinCircle(); break;
    case 'circle-leave': leaveCircle(); break;
    case 'circle-add-profile': addProfileToCircle(btn.dataset.pid); break;
    case 'circle-copy':
      if(navigator.clipboard) navigator.clipboard.writeText(circleCode).then(()=>toast('Circle code copied.'), ()=>toast('Circle code: '+circleCode));
      else toast('Circle code: '+circleCode);
      break;
    case 'map-zoom-in': zoomAt(1.5); break;
    case 'map-zoom-out': zoomAt(1/1.5); break;
    case 'map-reset': vb = { x:0, y:0, w:MAP_W, h:MAP_H }; applyViewBox(); refreshMapPins(); break;
    case 'map-pinmode':
      pinMode = !pinMode;
      btn.classList.toggle('on', pinMode);
      document.getElementById('jlMap').classList.toggle('pinning', pinMode);
      if(pinMode) toast('Tap anywhere in India to drop a pin.');
      break;
    case 'map-labels': showLabels = !showLabels; btn.classList.toggle('on', showLabels); refreshMapPins(); break;
    case 'place-pick': pickSuggestion(parseInt(btn.dataset.idx, 10)); break;
    case 'place-online': searchOnline(); break;
    case 'place-add': addPlace(); break;
    case 'place-focus': focusPlace(btn.dataset.key, id); break;
    case 'place-del':
      if(confirm('Remove this place?')){ myJourney.places = myJourney.places.filter(p=>p.id !== id); saveMyJourney(); refreshViews(); }
      break;
    case 'acts-refresh':
      Object.keys(memberProfiles).forEach(k=>delete memberProfiles[k]);
      refreshActivities();
      break;
    case 'dream-rec': startRecording(); break;
    case 'dream-stop': stopRecording(); break;
    case 'dream-discard': discardRecording(); break;
    case 'dream-save': saveDream(); break;
    case 'dream-play': playDream(btn.dataset.ws, id); break;
    case 'dream-del': deleteDream(id); break;
    case 'sleep-save': saveSleep(); break;
    case 'sleep-del':
      if(confirm('Delete this night?')){ myJourney.sleep = myJourney.sleep.filter(s=>s.id !== id); saveMyJourney(); refreshViews(); }
      break;
    case 'turiya-toggle': turiyaRun ? stopTuriya(true) : startTuriya(); break;
    case 'turiya-manual': addManualTuriya(); break;
    case 'turiya-del':
      if(confirm('Delete this session?')){ myJourney.turiya = myJourney.turiya.filter(t=>t.id !== id); saveMyJourney(); refreshViews(); }
      break;
  }
}
