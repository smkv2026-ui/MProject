// Ashtanga tab: the eight limbs of yoga (Patañjali, YS 2.29) as a clockwise
// eight-segment dial, a detail view of each limb's daily-practice
// parameters, and a progress view (heatmap, trends, least-practised limb).
//
// Storage lives in the profile blob app.js already loads and saves:
//   data.ashtanga[dateStr][paramId] = { done: true, note: '…' }
// Entries with nothing in them are pruned, so an untouched day is simply
// absent (and reads as 0%). app.js passes a small context object rather
// than this module importing app.js — same pattern as js/journey.js.
import { ASHTANGA_ANGAS } from "./ashtanga-data.js";

const C = 200;                 // dial centre in the 400×400 viewBox
const R_OUT = 176, R_IN = 86;  // segment wedge radii
const R_ARC = 188;             // progress arc radius (outside the wedge)
const R_LABEL = 131;
const SEG_DEG = 360 / ASHTANGA_ANGAS.length;
const GAP_DEG = 1.4;
const STREAK_THRESHOLD = 50;
const NOTE_MAX = 140;

let ctx = null;
let root = null;
let view = 'practice';         // 'practice' | 'progress'
let viewDate = null;           // dateStr being viewed/edited in Practice
let selected = 0;              // index into ASHTANGA_ANGAS
let heatMode = 'week';         // 'week' | 'month'
let monthCursor = null;        // Date: first of the month shown in Month heatmap
let trendDays = 7;             // 7 | 30

/* ---------- date helpers ---------- */
function parseDate(s){ const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(s, n){ const d = parseDate(s); d.setDate(d.getDate() + n); return ctx.todayStr(d); }
function fmtLong(s){ return parseDate(s).toLocaleDateString(undefined, { weekday:'short', day:'numeric', month:'short', year:'numeric' }); }
function fmtShortDate(s){ return parseDate(s).toLocaleDateString(undefined, { weekday:'short', day:'numeric', month:'short' }); }
function today(){ return ctx.todayStr(); }

/* ---------- data helpers ---------- */
function store(){
  const d = ctx.getData();
  if(!d.ashtanga || typeof d.ashtanga !== 'object') d.ashtanga = {};
  return d.ashtanga;
}
function entry(dateStr, pid){ const day = store()[dateStr]; return (day && day[pid]) || null; }
function isDone(dateStr, pid){ const e = entry(dateStr, pid); return !!(e && e.done); }
function noteOf(dateStr, pid){ const e = entry(dateStr, pid); return (e && e.note) || ''; }

function writeEntry(dateStr, pid, patch){
  const s = store();
  const day = s[dateStr] || (s[dateStr] = {});
  const next = { ...(day[pid] || {}), ...patch };
  if(!next.done) delete next.done;
  if(!next.note) delete next.note;
  if(Object.keys(next).length) day[pid] = next; else delete day[pid];
  if(!Object.keys(day).length) delete s[dateStr];
  ctx.save();
}

export function angaPct(dateStr, anga){
  const done = anga.params.filter(p => isDone(dateStr, p.id)).length;
  return Math.round(done / anga.params.length * 100);
}
export function overallPct(dateStr){
  const sum = ASHTANGA_ANGAS.reduce((n, a) => n + angaPct(dateStr, a), 0);
  return Math.round(sum / ASHTANGA_ANGAS.length);
}
// Consecutive days at or above 50% overall, counting back from today. If
// today hasn't reached 50% yet it doesn't break the streak — counting
// starts from yesterday instead, so the streak isn't shown as 0 every
// morning before practice.
export function currentStreak(){
  let d = today();
  if(overallPct(d) < STREAK_THRESHOLD) d = addDays(d, -1);
  let n = 0;
  while(overallPct(d) >= STREAK_THRESHOLD){ n++; d = addDays(d, -1); }
  return n;
}
function statusOf(pct){ return pct >= 100 ? 'done' : pct > 0 ? 'partial' : 'none'; }

/* ---------- lifecycle ---------- */
export function initAshtanga(context){
  ctx = context;
  root = document.getElementById('tab-ashtanga');
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKeydown);
  root.addEventListener('input', onInput);
  root.addEventListener('change', onChange);
}

export function openAshtangaTab(){
  if(!viewDate || viewDate > today()) viewDate = today();
  render();
}

export function resetAshtangaState(){
  view = 'practice'; viewDate = null; selected = 0;
  heatMode = 'week'; monthCursor = null; trendDays = 7;
  if(root) root.innerHTML = '';
}

/* ---------- shell ---------- */
function render(){
  const esc = ctx.escapeHtml;
  root.innerHTML = `
    <div class="sec-head">
      <div>
        <h2>Ashtanga</h2>
        <div class="desc">The eight limbs of yoga · Patañjali's Yoga Sūtras 2.29</div>
      </div>
    </div>
    <div class="ash-toolbar">
      <div class="cal-tabbar" role="tablist" aria-label="Ashtanga view">
        <button class="cal-tab${view==='practice'?' on':''}" role="tab" aria-selected="${view==='practice'}" data-ash="view" data-v="practice">Practice</button>
        <button class="cal-tab${view==='progress'?' on':''}" role="tab" aria-selected="${view==='progress'}" data-ash="view" data-v="progress">Progress</button>
      </div>
      ${view === 'practice' ? `
      <div class="ash-datenav">
        <button class="icon-btn" data-ash="day-prev" aria-label="Previous day">‹</button>
        <input type="date" id="ashDate" value="${esc(viewDate)}" max="${esc(today())}" aria-label="Day to view">
        <button class="icon-btn" data-ash="day-next" aria-label="Next day" ${viewDate >= today() ? 'disabled' : ''}>›</button>
        ${viewDate !== today() ? '<button class="pill ghost" data-ash="day-today">Today</button>' : ''}
      </div>` : ''}
    </div>
    ${view === 'practice' ? `
      ${viewDate !== today() ? `<div class="ash-pastday">Viewing <b>${esc(fmtLong(viewDate))}</b> — you can still tick items and add notes for this day.</div>` : ''}
      <div class="ash-dial-wrap">${dialSvg()}</div>
      <div id="ashDetail"></div>` : `<div id="ashProgress"></div>`}`;
  if(view === 'practice'){ updateDial(); renderDetail(false); }
  else renderProgress();
}

/* ---------- dial ---------- */
function polar(r, deg){
  const a = deg * Math.PI / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}
function f(n){ return n.toFixed(2); }
// Segment i runs clockwise from 12 o'clock: SVG's y axis points down, so
// increasing angle already turns clockwise; -90° is straight up.
function segAngles(i){
  const a0 = -90 + i * SEG_DEG + GAP_DEG / 2;
  const a1 = -90 + (i + 1) * SEG_DEG - GAP_DEG / 2;
  return [a0, a1, (a0 + a1) / 2];
}
function wedgePath(i){
  const [a0, a1] = segAngles(i);
  const [x0, y0] = polar(R_OUT, a0), [x1, y1] = polar(R_OUT, a1);
  const [x2, y2] = polar(R_IN, a1), [x3, y3] = polar(R_IN, a0);
  return `M${f(x0)},${f(y0)} A${R_OUT},${R_OUT} 0 0 1 ${f(x1)},${f(y1)} L${f(x2)},${f(y2)} A${R_IN},${R_IN} 0 0 0 ${f(x3)},${f(y3)} Z`;
}
function arcPath(i){
  const [a0, a1] = segAngles(i);
  const [x0, y0] = polar(R_ARC, a0 + 1), [x1, y1] = polar(R_ARC, a1 - 1);
  return `M${f(x0)},${f(y0)} A${R_ARC},${R_ARC} 0 0 1 ${f(x1)},${f(y1)}`;
}

function dialSvg(){
  const esc = ctx.escapeHtml;
  const segs = ASHTANGA_ANGAS.map((a, i) => {
    const [, , mid] = segAngles(i);
    const [lx, ly] = polar(R_LABEL, mid);
    const [dx, dy] = polar(7, mid).map((v) => v - C);
    return `
      <g class="ash-seg" id="ashSeg-${i}" data-ash="seg" data-i="${i}" role="radio" tabindex="-1"
         style="--dx:${f(dx)}px; --dy:${f(dy)}px">
        <path class="ash-wedge" d="${wedgePath(i)}"/>
        <path class="ash-track" d="${arcPath(i)}"/>
        <path class="ash-arc" id="ashArc-${i}" d="${arcPath(i)}" pathLength="100" stroke-dasharray="0 100"/>
        <text class="ash-seg-num" x="${f(lx)}" y="${f(ly - 25)}">${i + 1}</text>
        <text class="ash-seg-name" x="${f(lx)}" y="${f(ly - 8)}">${esc(a.iast)}</text>
        <text class="ash-seg-en" x="${f(lx)}" y="${f(ly + 7)}">${esc(a.english)}</text>
        <text class="ash-seg-pct" id="ashSegPct-${i}" x="${f(lx)}" y="${f(ly + 23)}">0%</text>
      </g>`;
  }).join('');
  return `
    <svg class="ash-dial" viewBox="0 0 400 400" role="radiogroup" aria-label="The eight limbs — choose one to see its practices">
      ${segs}
      <g class="ash-center" aria-hidden="true">
        <circle cx="${C}" cy="${C}" r="${R_IN - 8}"/>
        <text class="ash-center-pct" id="ashCenterPct" x="${C}" y="${C + 4}">0%</text>
        <text class="ash-center-label" x="${C}" y="${C - 30}">overall</text>
        <text class="ash-center-date" id="ashCenterDate" x="${C}" y="${C + 26}"></text>
        <text class="ash-center-streak" id="ashCenterStreak" x="${C}" y="${C + 44}"></text>
      </g>
    </svg>`;
}

// Updates the dial in place (no re-render), so the arcs animate.
function updateDial(){
  ASHTANGA_ANGAS.forEach((a, i) => {
    const pct = angaPct(viewDate, a);
    const g = document.getElementById('ashSeg-' + i);
    if(!g) return;
    g.classList.remove('st-none', 'st-partial', 'st-done');
    g.classList.add('st-' + statusOf(pct));
    g.classList.toggle('on', i === selected);
    g.setAttribute('aria-checked', String(i === selected));
    g.setAttribute('tabindex', i === selected ? '0' : '-1');
    g.setAttribute('aria-label', `${i + 1}. ${a.iast}, ${a.english}: ${pct}% done`);
    document.getElementById('ashArc-' + i).setAttribute('stroke-dasharray', `${pct} 100`);
    document.getElementById('ashSegPct-' + i).textContent = pct + '%';
  });
  const overall = overallPct(viewDate);
  const center = document.getElementById('ashCenterPct');
  if(center){
    center.textContent = overall + '%';
    center.setAttribute('class', 'ash-center-pct st-' + statusOf(overall));
  }
  const dateEl = document.getElementById('ashCenterDate');
  if(dateEl) dateEl.textContent = viewDate === today() ? 'Today · ' + fmtShortDate(viewDate) : fmtShortDate(viewDate);
  const streakEl = document.getElementById('ashCenterStreak');
  if(streakEl){ const s = currentStreak(); streakEl.textContent = `Streak ${s} day${s === 1 ? '' : 's'}`; }
}

function selectAnga(i, { focus = false, scroll = false } = {}){
  selected = (i + ASHTANGA_ANGAS.length) % ASHTANGA_ANGAS.length;
  updateDial();
  renderDetail(true);
  if(focus) document.getElementById('ashSeg-' + selected)?.focus();
  if(scroll && window.innerWidth < 760) document.getElementById('ashDetail')?.scrollIntoView({ behavior:'smooth', block:'start' });
}

/* ---------- detail ---------- */
function renderDetail(animate){
  const host = document.getElementById('ashDetail');
  if(!host) return;
  const esc = ctx.escapeHtml;
  const a = ASHTANGA_ANGAS[selected];
  const done = a.params.filter(p => isDone(viewDate, p.id)).length;
  host.innerHTML = `
    <div class="ash-detail${animate ? ' ash-enter' : ''}">
      <div class="ash-detail-head">
        <div class="ash-deva" lang="sa">${esc(a.deva)}</div>
        <div class="ash-detail-titles">
          <h3>${esc(a.iast)} <span>· ${esc(a.english)}</span></h3>
          <div class="ash-detail-sub">${esc(a.meaning)} · <b>${esc(a.sutra)}</b></div>
        </div>
        <div class="ash-detail-pct st-${statusOf(Math.round(done / a.params.length * 100))}" id="ashDetailPct">
          <b>${Math.round(done / a.params.length * 100)}%</b><span>${done} of ${a.params.length}</span>
        </div>
      </div>
      <div class="ash-detail-bar${done === a.params.length ? ' done' : ''}"><i id="ashDetailBar" style="width:${done / a.params.length * 100}%"></i></div>
      <p class="ash-expl">${esc(a.explanation)}</p>
      <div class="ash-cards">${a.params.map(p => cardHtml(p)).join('')}</div>
    </div>`;
}

function cardHtml(p){
  const esc = ctx.escapeHtml;
  const done = isDone(viewDate, p.id);
  return `
    <div class="ash-card${done ? ' done' : ''}" id="ashCard-${esc(p.id)}">
      <div class="ash-card-head">
        <div class="ash-card-name">${esc(p.iast)} <span class="ash-card-deva" lang="sa">${esc(p.deva)}</span></div>
        <div class="ash-card-en">${esc(p.english)}</div>
      </div>
      <p class="ash-card-meaning">${esc(p.meaning)}</p>
      <div class="field-label">How to practise today</div>
      <ul class="ash-examples">${p.examples.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      <button type="button" class="ash-toggle" data-ash="toggle" data-pid="${esc(p.id)}" aria-pressed="${done}">
        ${done ? '<span class="ash-check">✓</span> Done — tap to undo' : 'Mark as done'}
      </button>
      <input type="text" class="ash-note" data-pid="${esc(p.id)}" maxlength="${NOTE_MAX}"
        placeholder="One-line reflection (optional)" value="${esc(noteOf(viewDate, p.id))}"
        aria-label="Reflection for ${esc(p.english)}">
    </div>`;
}

function toggleParam(pid){
  const done = !isDone(viewDate, pid);
  writeEntry(viewDate, pid, { done });
  const card = document.getElementById('ashCard-' + pid);
  if(card){
    card.classList.toggle('done', done);
    card.classList.remove('ash-pop');
    void card.offsetWidth; // restart the pop animation on every toggle
    if(done) card.classList.add('ash-pop');
    const btn = card.querySelector('.ash-toggle');
    btn.setAttribute('aria-pressed', String(done));
    btn.innerHTML = done ? '<span class="ash-check">✓</span> Done — tap to undo' : 'Mark as done';
  }
  const a = ASHTANGA_ANGAS[selected];
  const n = a.params.filter(p => isDone(viewDate, p.id)).length;
  const pct = Math.round(n / a.params.length * 100);
  const pctEl = document.getElementById('ashDetailPct');
  if(pctEl){
    pctEl.className = 'ash-detail-pct st-' + statusOf(pct);
    pctEl.innerHTML = `<b>${pct}%</b><span>${n} of ${a.params.length}</span>`;
  }
  const bar = document.getElementById('ashDetailBar');
  if(bar){
    bar.style.width = (n / a.params.length * 100) + '%';
    bar.parentElement.classList.toggle('done', n === a.params.length);
  }
  updateDial();
}

/* ---------- progress ---------- */
function rangeDays(n){ return [...Array(n)].map((_, i) => addDays(today(), i - (n - 1))); }

function heatColor(pct){
  if(!pct) return '';
  return `background:color-mix(in srgb, var(--sage) ${Math.round(18 + pct * 0.72)}%, var(--bg-raised));`;
}
function heatCell(dateStr, label){
  const esc = ctx.escapeHtml;
  const future = dateStr > today();
  const pct = future ? 0 : overallPct(dateStr);
  const cls = ['ash-heat-cell'];
  if(future) cls.push('future');
  else if(pct === 0) cls.push('zero');
  if(pct >= 60) cls.push('hi');
  if(dateStr === today()) cls.push('today');
  const tip = future ? fmtLong(dateStr) : `${fmtLong(dateStr)} · ${pct}%`;
  return `<button type="button" class="${cls.join(' ')}" style="${future ? '' : heatColor(pct)}" ${future ? 'disabled' : `data-ash="goto-day" data-d="${esc(dateStr)}"`} title="${esc(tip)}" aria-label="${esc(tip)}">
    <span class="ash-heat-label">${esc(label)}</span>${future ? '' : `<span class="ash-heat-pct">${pct}%</span>`}</button>`;
}

function heatmapHtml(){
  if(heatMode === 'week'){
    return `<div class="ash-heat-week">${rangeDays(7).map(d => {
      const dt = parseDate(d);
      return heatCell(d, dt.toLocaleDateString(undefined, { weekday:'short' }) + ' ' + dt.getDate());
    }).join('')}</div>`;
  }
  if(!monthCursor){ const t = parseDate(today()); monthCursor = new Date(t.getFullYear(), t.getMonth(), 1); }
  const y = monthCursor.getFullYear(), m = monthCursor.getMonth();
  const days = new Date(y, m + 1, 0).getDate();
  const lead = (new Date(y, m, 1).getDay() + 6) % 7; // Monday-first
  const dow = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<div class="ash-heat-dow">${d}</div>`).join('');
  let cells = '';
  for(let i = 0; i < lead; i++) cells += '<div></div>';
  for(let d = 1; d <= days; d++) cells += heatCell(ctx.todayStr(new Date(y, m, d)), String(d));
  const atCurrent = y === parseDate(today()).getFullYear() && m === parseDate(today()).getMonth();
  return `
    <div class="ash-month-nav">
      <button class="icon-btn" data-ash="month-prev" aria-label="Previous month">‹</button>
      <b>${monthCursor.toLocaleDateString(undefined, { month:'long', year:'numeric' })}</b>
      <button class="icon-btn" data-ash="month-next" aria-label="Next month" ${atCurrent ? 'disabled' : ''}>›</button>
    </div>
    <div class="ash-heat-month">${dow}${cells}</div>`;
}

function sparkline(values){
  const W = 140, H = 30;
  const step = values.length > 1 ? W / (values.length - 1) : 0;
  const pts = values.map((v, i) => `${f(i * step)},${f(H - 3 - v / 100 * (H - 6))}`).join(' ');
  const last = values[values.length - 1];
  const [lx, ly] = [(values.length - 1) * step, H - 3 - last / 100 * (H - 6)];
  return `<svg class="ash-spark" viewBox="-4 0 ${W + 8} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <line x1="0" y1="${H - 3}" x2="${W}" y2="${H - 3}" class="ash-spark-base"/>
    <polyline points="${pts}"/><circle cx="${f(lx)}" cy="${f(ly)}" r="3"/></svg>`;
}

function renderProgress(){
  const host = document.getElementById('ashProgress');
  if(!host) return;
  const esc = ctx.escapeHtml;
  const days = rangeDays(trendDays);
  const rows = ASHTANGA_ANGAS.map((a, i) => {
    const vals = days.map(d => angaPct(d, a));
    return { a, i, vals, avg: Math.round(vals.reduce((x, y) => x + y, 0) / vals.length) };
  });
  const anyData = rows.some(r => r.avg > 0);
  const least = rows.reduce((lo, r) => r.avg < lo.avg ? r : lo, rows[0]);
  const periodAvg = Math.round(rows.reduce((n, r) => n + r.avg, 0) / rows.length);
  const streak = currentStreak();
  host.innerHTML = `
    <div class="cal-summary">
      <div class="stat"><div class="num">${overallPct(today())}%</div><div class="lbl">Today overall</div></div>
      <div class="stat"><div class="num">${streak}</div><div class="lbl">Day streak (≥ ${STREAK_THRESHOLD}%)</div></div>
      <div class="stat"><div class="num">${periodAvg}%</div><div class="lbl">${trendDays}-day average</div></div>
    </div>

    <div class="journal-section">
      <div class="ash-row-between">
        <div class="journal-section-title">Calendar</div>
        <div class="cal-tabbar">
          <button class="cal-tab${heatMode==='week'?' on':''}" data-ash="heat" data-v="week">Week</button>
          <button class="cal-tab${heatMode==='month'?' on':''}" data-ash="heat" data-v="month">Month</button>
        </div>
      </div>
      ${heatmapHtml()}
      <div class="ash-heat-legend" aria-hidden="true"><span>0%</span>${[0, 25, 50, 75, 100].map(p => `<i style="${p ? heatColor(p) : ''}" class="${p ? '' : 'zero'}"></i>`).join('')}<span>100%</span></div>
      <div class="cal-tip">Tap a day to open it and fill it in.</div>
    </div>

    <div class="journal-section">
      <div class="ash-row-between">
        <div class="journal-section-title">Trends by limb</div>
        <div class="cal-tabbar">
          <button class="cal-tab${trendDays===7?' on':''}" data-ash="trend" data-v="7">7 days</button>
          <button class="cal-tab${trendDays===30?' on':''}" data-ash="trend" data-v="30">30 days</button>
        </div>
      </div>
      ${anyData ? `
      <div class="ash-least">
        <div><span class="ash-least-tag">Practised least</span>
          <b>${esc(least.a.iast)}</b> · ${esc(least.a.english)} — ${least.avg}% average over ${trendDays} days</div>
        <button class="pill ghost" data-ash="open-anga" data-i="${least.i}">Open ${esc(least.a.iast)}</button>
      </div>` : `<div class="empty-note">No practice logged in the last ${trendDays} days yet — tick a few items in Practice to see trends.</div>`}
      <div class="ash-trends">
        ${rows.map(r => `
          <button type="button" class="ash-trend-row${anyData && r === least ? ' least' : ''}" data-ash="open-anga" data-i="${r.i}"
            title="${esc(r.a.iast)}: ${r.avg}% average over ${trendDays} days">
            <span class="ash-trend-name"><b>${esc(r.a.iast)}</b><span>${esc(r.a.english)}</span></span>
            ${sparkline(r.vals)}
            <span class="ash-trend-avg">${r.avg}%</span>
          </button>`).join('')}
      </div>
    </div>`;
}

/* ---------- events ---------- */
function setViewDate(d){
  if(!d || d > today()) d = today();
  viewDate = d;
  render();
}

function onClick(ev){
  const el = ev.target.closest('[data-ash]');
  if(!el || el.disabled) return;
  switch(el.dataset.ash){
    case 'view': view = el.dataset.v; render(); break;
    case 'seg': selectAnga(+el.dataset.i, { scroll:true }); break;
    case 'toggle': toggleParam(el.dataset.pid); break;
    case 'day-prev': setViewDate(addDays(viewDate, -1)); break;
    case 'day-next': setViewDate(addDays(viewDate, 1)); break;
    case 'day-today': setViewDate(today()); break;
    case 'heat': heatMode = el.dataset.v; renderProgress(); break;
    case 'trend': trendDays = +el.dataset.v; renderProgress(); break;
    case 'month-prev': monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1); renderProgress(); break;
    case 'month-next': monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1); renderProgress(); break;
    case 'goto-day': view = 'practice'; setViewDate(el.dataset.d); break;
    case 'open-anga': view = 'practice'; selected = +el.dataset.i; setViewDate(today()); break;
  }
}

function onKeydown(ev){
  const seg = ev.target.closest('.ash-seg');
  if(!seg) return;
  const i = +seg.dataset.i;
  const moves = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  if(ev.key in moves){ ev.preventDefault(); selectAnga(i + moves[ev.key], { focus:true }); }
  else if(ev.key === 'Home'){ ev.preventDefault(); selectAnga(0, { focus:true }); }
  else if(ev.key === 'End'){ ev.preventDefault(); selectAnga(ASHTANGA_ANGAS.length - 1, { focus:true }); }
  else if(ev.key === 'Enter' || ev.key === ' '){
    ev.preventDefault();
    selectAnga(i, { focus:true });
    document.getElementById('ashDetail')?.querySelector('.ash-toggle')?.focus();
  }
}

function onInput(ev){
  if(ev.target.classList.contains('ash-note')){
    writeEntry(viewDate, ev.target.dataset.pid, { note: ev.target.value.slice(0, NOTE_MAX) });
  }
}

function onChange(ev){
  if(ev.target.id === 'ashDate') setViewDate(ev.target.value);
}
