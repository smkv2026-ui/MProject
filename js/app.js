import { CHAKRA_HTML_B64 } from "./chakra-data.js";
import { cloudGet, cloudSet, subscribeKey } from "./cloud-store.js";

  const SANDHYAS = ['morning','afternoon','evening'];
  const SANDHYA_LABEL = { morning:'Morning sandhyā', afternoon:'Afternoon sandhyā', evening:'Evening sandhyā', any:'Daily (no sandhyā)' };
  const USERS_KEY = 'sadhana-users';
  function userStorageKey(id){ return 'sadhana-data-'+id; }

  function defaultData(){
    return { settings:{ theme:'light' }, japa:[], practice:[], books:[], learning:[], logs:{} };
  }
  let data = defaultData();
  let users = [];
  let currentUser = null;

  function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
  function todayStr(d){ d = d||new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function fmtTime(sec){ sec = Math.floor(sec); const m=Math.floor(sec/60), s=sec%60; return m+':'+String(s).padStart(2,'0'); }
  function fmtShort(sec){
    sec = Math.round(sec);
    const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60);
    if(h>0) return h+'h'+String(m).padStart(2,'0')+'m';
    if(m>0) return m+'m';
    return sec+'s';
  }

  function ensureDay(dateStr){
    if(!data.logs[dateStr]) data.logs[dateStr] = { japa:{}, practice:{}, reading:{} };
    return data.logs[dateStr];
  }
  function ensureJapaEntry(dateStr, counterId, sandhya){
    const day = ensureDay(dateStr);
    if(!day.japa[counterId]) day.japa[counterId] = {};
    if(!day.japa[counterId][sandhya]) day.japa[counterId][sandhya] = {count:0, seconds:0};
    return day.japa[counterId][sandhya];
  }
  function ensurePracticeEntry(dateStr, practiceId, sandhya){
    const day = ensureDay(dateStr);
    if(!day.practice[practiceId]) day.practice[practiceId] = {};
    if(!day.practice[practiceId][sandhya]) day.practice[practiceId][sandhya] = {seconds:0, log:[]};
    if(!day.practice[practiceId][sandhya].log) day.practice[practiceId][sandhya].log = [];
    return day.practice[practiceId][sandhya];
  }

  let saveTimer = null;
  function save(){
    if(!currentUser) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async ()=>{
      try{ await cloudSet(userStorageKey(currentUser.id), JSON.stringify(data)); }
      catch(e){ console.error('save failed', e); }
    }, 250);
  }

  /* ---------- Users ---------- */
  async function saveUsersNow(list){
    try{ await cloudSet(USERS_KEY, JSON.stringify(list)); }
    catch(e){ console.error('save users failed', e); }
  }
  async function loadUsers(){
    try{
      const res = await cloudGet(USERS_KEY);
      if(res && res.value){
        const arr = JSON.parse(res.value);
        if(Array.isArray(arr) && arr.length) return arr;
      }
    }catch(e){ /* none yet */ }
    // A brand-new shared space starts with no profiles — the "Add user"
    // card is how the first household member creates one.
    return [];
  }

  /* ---------- Guru's Teachings (shared across all users) ---------- */
  const GURUS_KEY = 'sadhana-gurus';
  let gurus = [];              // [{id, name, image, teachings:[{id,text,date}]}]
  let activeGuruId = null;     // currently selected sub-tab
  let gurusQuery = '';

  async function loadGurus(){
    try{
      const res = await cloudGet(GURUS_KEY);
      if(res && res.value){
        const arr = JSON.parse(res.value);
        if(Array.isArray(arr)) return arr;
      }
    }catch(e){ /* none yet */ }
    return [];
  }
  async function saveGurus(){
    try{ await cloudSet(GURUS_KEY, JSON.stringify(gurus)); }
    catch(e){ console.error('save gurus failed', e); }
  }
  function findOrCreateGuru(name){
    const key = name.trim().toLowerCase();
    let g = gurus.find(g=>g.name.trim().toLowerCase()===key);
    if(!g){ g = {id:uid(), name:name.trim(), image:null, teachings:[]}; gurus.push(g); }
    return g;
  }

  function renderGuruTabbar(){
    const bar = document.getElementById('guruTabbar');
    if(gurus.length===0){ bar.innerHTML = '<span class="empty-note">No gurus added yet — add a teaching below to begin.</span>'; return; }
    if(!activeGuruId || !gurus.find(g=>g.id===activeGuruId)) activeGuruId = gurus[0].id;
    bar.innerHTML = gurus.map(g=>`<button class="guru-tab ${g.id===activeGuruId?'active':''}" data-guru="${g.id}">${escapeHtml(g.name)}</button>`).join('');
    bar.querySelectorAll('.guru-tab').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        activeGuruId = btn.dataset.guru;
        renderGuruTabbar();
        renderGuruTeachingsList();
        renderGurusBackground();
      });
    });
  }

  function renderGuruTeachingsList(){
    const el = document.getElementById('guruTeachingsList');
    const guru = gurus.find(g=>g.id===activeGuruId);
    if(!guru){ el.innerHTML = ''; return; }
    const q = gurusQuery.trim().toLowerCase();
    const items = guru.teachings.filter(t=>!q || t.text.toLowerCase().includes(q));
    if(items.length===0){
      el.innerHTML = '<div class="empty-note">'+(q ? 'No teachings match that search.' : 'No teachings from '+escapeHtml(guru.name)+' yet.')+'</div>';
      return;
    }
    el.innerHTML = items.map(t=>`
      <div class="quote-entry">
        <div class="qtext">${escapeHtml(t.text)}</div>
        <div class="qmeta">— ${escapeHtml(guru.name)}${t.date ? ' · '+t.date : ''}</div>
      </div>`).join('');
  }

  function renderGurusBackground(){
    const bgEl = document.getElementById('gurusBg');
    const tabEl = document.getElementById('tab-gurus');
    const guru = gurus.find(g=>g.id===activeGuruId);
    if(guru && guru.image){
      bgEl.style.backgroundImage = 'url("'+guru.image+'")';
      bgEl.classList.add('show');
      tabEl.classList.add('has-bg');
    } else {
      bgEl.classList.remove('show');
      tabEl.classList.remove('has-bg');
    }
  }

  function renderGurusTab(){
    renderGuruTabbar();
    renderGuruTeachingsList();
    renderGurusBackground();
  }

  document.getElementById('gurusSearch').addEventListener('input', (e)=>{
    gurusQuery = e.target.value;
    renderGuruTeachingsList();
  });

  document.getElementById('guruAddSave').addEventListener('click', async ()=>{
    const name = document.getElementById('guruNameInput').value.trim();
    const text = document.getElementById('guruTeachingInput').value.trim();
    if(!name || !text) return;
    const guru = findOrCreateGuru(name);
    guru.teachings.push({id:uid(), text, date:todayStr()});
    activeGuruId = guru.id;
    document.getElementById('guruTeachingInput').value = '';
    await saveGurus();
    renderGurusTab();
  });

  document.getElementById('guruImageBtn').addEventListener('click', ()=>{
    const name = document.getElementById('guruNameInput').value.trim() || (gurus.find(g=>g.id===activeGuruId)||{}).name;
    if(!name){ alert("Type the Guru's name first (or select a sub-tab)."); return; }
    document.getElementById('guruImageInput').dataset.forName = name;
    document.getElementById('guruImageInput').click();
  });
  document.getElementById('guruImageInput').addEventListener('change', async (ev)=>{
    const file = ev.target.files[0];
    const forName = ev.target.dataset.forName;
    ev.target.value = '';
    if(!file || !forName) return;
    try{
      const dataUrl = await resizeImageFile(file, 1600, 0.82);
      const guru = findOrCreateGuru(forName);
      guru.image = dataUrl;
      activeGuruId = guru.id;
      await saveGurus();
      renderGurusTab();
    }catch(e){ console.error('guru image attach failed', e); }
  });

  function splitCsvRow(line){
    // Splits a CSV line into fields, respecting double-quoted fields that may contain commas.
    const fields = [];
    let cur = '', inQuotes = false;
    for(let i=0;i<line.length;i++){
      const ch = line[i];
      if(inQuotes){
        if(ch === '"'){
          if(line[i+1] === '"'){ cur += '"'; i++; }
          else inQuotes = false;
        } else cur += ch;
      } else {
        if(ch === '"') inQuotes = true;
        else if(ch === ','){ fields.push(cur); cur = ''; }
        else cur += ch;
      }
    }
    fields.push(cur);
    return fields.map(f=>f.trim());
  }
  function parseGuruCsv(text){
    const lines = text.split(/\r?\n/).filter(l=>l.trim().length>0);
    if(lines.length===0) return [];
    let start = 0;
    if(/guru/i.test(lines[0]) && /teach/i.test(lines[0])) start = 1; // skip header row
    const rows = [];
    for(let i=start;i<lines.length;i++){
      const fields = splitCsvRow(lines[i]);
      const name = (fields[0]||'').trim();
      const teaching = fields.slice(1).join(',').trim();
      if(name && teaching) rows.push({name, teaching});
    }
    return rows;
  }

  document.getElementById('gurusTemplateBtn').addEventListener('click', ()=>{
    const csv = "Guru's Name,Teaching\nSri Guru Ji,\"Example teaching text goes here.\"\n";
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'gurus-teachings-template.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });
  document.getElementById('gurusCsvBtn').addEventListener('click', ()=>{
    document.getElementById('gurusCsvInput').click();
  });
  document.getElementById('gurusCsvInput').addEventListener('change', async (ev)=>{
    const file = ev.target.files[0];
    ev.target.value = '';
    if(!file) return;
    try{
      const text = await file.text();
      const rows = parseGuruCsv(text);
      if(rows.length===0){ alert("No rows found — make sure the file has Guru's Name, Teaching columns."); return; }
      rows.forEach(r=>{
        const guru = findOrCreateGuru(r.name);
        guru.teachings.push({id:uid(), text:r.teaching, date:todayStr()});
        activeGuruId = guru.id;
      });
      await saveGurus();
      renderGurusTab();
    }catch(e){ console.error('csv upload failed', e); alert('Could not read that file.'); }
  });

  /* ---------- Daily random teaching on the user-select screen ---------- */
  function dailySeed(str){
    let h = 0;
    for(let i=0;i<str.length;i++){ h = (h*31 + str.charCodeAt(i)) >>> 0; }
    return h;
  }
  function renderDailyQuote(){
    const flat = [];
    gurus.forEach(g=>{ g.teachings.forEach(t=> flat.push({guru:g, teaching:t})); });
    const screen = document.getElementById('userSelectScreen');
    if(flat.length===0){ screen.classList.remove('has-quote-bg'); return; }
    const idx = dailySeed(todayStr()) % flat.length;
    const pick = flat[idx];
    document.getElementById('dailyQuoteText').textContent = pick.teaching.text;
    document.getElementById('dailyQuoteAttrib').textContent = '— ' + pick.guru.name;
    const bg = document.getElementById('userQuoteBg');
    if(pick.guru.image){
      bg.style.backgroundImage = 'url("'+pick.guru.image+'")';
      bg.classList.add('show');
      screen.classList.add('has-quote-bg');
    } else {
      bg.classList.remove('show');
      screen.classList.remove('has-quote-bg');
    }
  }

  function renderUserGrid(){
    const grid = document.getElementById('userGrid');
    grid.innerHTML = users.map(u=>`
      <button class="user-card" data-user="${u.id}">
        <span class="user-avatar">${escapeHtml((u.name||'?').trim().charAt(0).toUpperCase()||'?')}</span>
        <span class="user-name">${escapeHtml(u.name)}</span>
      </button>
    `).join('') + `
      <button class="user-card add-user-card" id="addUserCard">
        <span class="user-avatar add">+</span>
        <span class="user-name">Add user</span>
      </button>
    `;
    grid.querySelectorAll('.user-card[data-user]').forEach(btn=>{
      btn.addEventListener('click', ()=> selectUser(btn.dataset.user));
    });
    document.getElementById('addUserCard').addEventListener('click', ()=>{
      document.getElementById('addUserForm').classList.add('open');
      document.getElementById('newUserName').focus();
    });
  }

  document.getElementById('addUserSave').addEventListener('click', async ()=>{
    const name = document.getElementById('newUserName').value.trim();
    if(!name) return;
    const newUser = {id:uid(), name};
    users.push(newUser);
    await saveUsersNow(users);
    document.getElementById('newUserName').value='';
    document.getElementById('addUserForm').classList.remove('open');
    renderUserGrid();
    selectUser(newUser.id);
  });
  document.getElementById('addUserCancel').addEventListener('click', ()=>{
    document.getElementById('addUserForm').classList.remove('open');
    document.getElementById('newUserName').value='';
  });

  function finalizeAllRunning(){
    Object.keys(runningTimers).forEach(key=>{
      const idx = key.indexOf('|');
      stopPractice(key.slice(0,idx), key.slice(idx+1));
    });
    if(fsState) closeJapaFullscreen();
  }

  async function selectUser(id){
    const user = users.find(u=>u.id===id);
    if(!user) return;
    currentUser = user;
    data = defaultData();
    try{
      const res = await cloudGet(userStorageKey(id));
      if(res && res.value) data = JSON.parse(res.value);
    }catch(e){ /* first time for this user */ }
    applyTheme();
    document.getElementById('userSelectScreen').style.display = 'none';
    document.getElementById('appScreen').style.display = '';
    document.getElementById('userSubtitle').textContent = 'daily practice tracker · '+user.name;
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelector('.tab-btn[data-tab="today"]').classList.add('active');
    document.getElementById('tab-today').style.display='';
    document.getElementById('tab-calendar').style.display='none';
    selectedDate = null;
    renderAll();
  }

  document.getElementById('switchUserBtn').addEventListener('click', ()=>{
    finalizeAllRunning();
    document.getElementById('appScreen').style.display='none';
    document.getElementById('userSelectScreen').style.display='';
    renderUserGrid();
  });

  let unsubUsers = null, unsubGurus = null;

  async function initApp(){
    users = await loadUsers();
    renderUserGrid();
    gurus = await loadGurus();
    renderDailyQuote();

    // Live cross-device sync: if another signed-in device on this shared
    // space adds/renames a profile, or adds a Guru's teaching, reflect it
    // here without needing a manual refresh.
    if(unsubUsers) unsubUsers();
    unsubUsers = subscribeKey(USERS_KEY, raw=>{
      if(!raw) return;
      try{
        const arr = JSON.parse(raw);
        if(Array.isArray(arr)){
          users = arr;
          if(document.getElementById('userSelectScreen').style.display !== 'none') renderUserGrid();
        }
      }catch(e){ /* ignore malformed remote value */ }
    });
    if(unsubGurus) unsubGurus();
    unsubGurus = subscribeKey(GURUS_KEY, raw=>{
      try{
        const arr = raw ? JSON.parse(raw) : [];
        if(Array.isArray(arr)){
          gurus = arr;
          if(document.getElementById('tab-gurus').style.display !== 'none') renderGurusTab();
        }
      }catch(e){ /* ignore malformed remote value */ }
    });
  }

  function resetAppState(){
    if(unsubUsers){ unsubUsers(); unsubUsers = null; }
    if(unsubGurus){ unsubGurus(); unsubGurus = null; }
    finalizeAllRunning();
    users = [];
    gurus = [];
    currentUser = null;
    data = defaultData();
  }

  document.addEventListener('sadhana-auth-ready', ()=>{ initApp(); });
  document.addEventListener('sadhana-workspace-changed', ()=>{
    document.getElementById('appScreen').style.display = 'none';
    document.getElementById('userSelectScreen').style.display = '';
    resetAppState();
    initApp();
  });
  document.addEventListener('sadhana-before-signout', resetAppState);
  document.addEventListener('sadhana-signed-out', ()=>{
    document.getElementById('userGrid').innerHTML = '';
  });

  function applyTheme(){
    document.documentElement.setAttribute('data-theme', data.settings.theme === 'dark' ? 'dark' : 'light');
  }

  /* ---------- Tabs ---------- */
  document.querySelectorAll('.tab-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const tab = btn.dataset.tab;
      if(tab==='chakra'){
        openChakraFullscreen();
        return;
      }
      document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-today').style.display = tab==='today' ? '' : 'none';
      document.getElementById('tab-calendar').style.display = tab==='calendar' ? '' : 'none';
      document.getElementById('tab-gurus').style.display = tab==='gurus' ? '' : 'none';
      if(tab==='calendar') renderCalendar();
      if(tab==='gurus') renderGurusTab();
    });
  });

  /* ---------- Chakra Dharana ---------- */
  function openChakraFullscreen(){
    const frame = document.getElementById('chakraFrame');
    if(!frame.src){ frame.src = 'data:text/html;base64,' + CHAKRA_HTML_B64; }
    document.getElementById('chakraFullscreen').classList.add('open');
  }
  document.getElementById('chakraClose').addEventListener('click', ()=>{
    document.getElementById('chakraFullscreen').classList.remove('open');
  });

  document.getElementById('themeToggle').addEventListener('click', ()=>{
    data.settings.theme = data.settings.theme==='dark' ? 'light' : 'dark';
    applyTheme(); save();
  });

  /* ---------- Export / Import (all data: every user + Guru's Teachings) ---------- */
  async function gatherFullExport(){
    if(currentUser){
      try{ await cloudSet(userStorageKey(currentUser.id), JSON.stringify(data)); }
      catch(e){ /* ignore */ }
    }
    const usersData = {};
    for(const u of users){
      try{
        const res = await cloudGet(userStorageKey(u.id));
        usersData[u.id] = (res && res.value) ? JSON.parse(res.value) : defaultData();
      }catch(e){ usersData[u.id] = defaultData(); }
    }
    return {
      format: 'sadhana-full-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      users,
      usersData,
      gurus
    };
  }

  document.getElementById('exportBtn').addEventListener('click', async ()=>{
    const full = await gatherFullExport();
    const blob = new Blob([JSON.stringify(full,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'sadhana-full-export-'+todayStr()+'.json';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });

  document.getElementById('importBtn').addEventListener('click', ()=>{
    document.getElementById('importFileInput').click();
  });
  document.getElementById('importFileInput').addEventListener('change', async (ev)=>{
    const file = ev.target.files[0];
    ev.target.value = '';
    if(!file) return;
    let parsed;
    try{ parsed = JSON.parse(await file.text()); }
    catch(e){ alert('That file is not valid JSON.'); return; }
    if(!parsed || !Array.isArray(parsed.users) || typeof parsed.usersData !== 'object'){
      alert('That file does not look like a Sadhana export.');
      return;
    }
    if(!confirm('Importing will replace all users, their tracker data, and Guru\'s Teachings on this device with the contents of this file. Continue?')) return;

    finalizeAllRunning();

    try{
      users = parsed.users;
      await saveUsersNow(users);

      for(const u of users){
        const uData = parsed.usersData[u.id] || defaultData();
        await cloudSet(userStorageKey(u.id), JSON.stringify(uData));
      }

      gurus = Array.isArray(parsed.gurus) ? parsed.gurus : [];
      await saveGurus();
    }catch(e){
      console.error('import failed', e);
      alert('Import failed partway through — some data may be inconsistent.');
    }

    currentUser = null;
    data = defaultData();
    document.getElementById('appScreen').style.display = 'none';
    document.getElementById('userSelectScreen').style.display = '';
    renderUserGrid();
    renderDailyQuote();
    alert('Import complete.');
  });

  /* ---------- Add-form toggles ---------- */
  document.querySelectorAll('[data-open]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const formEl = document.getElementById(btn.dataset.open);
      const willOpen = !formEl.classList.contains('open');
      if(willOpen && btn.dataset.open==='japaForm') resetJapaForm();
      if(willOpen && btn.dataset.open==='practiceForm') resetPracticeForm();
      formEl.classList.toggle('open');
    });
  });
  document.querySelectorAll('[data-close]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.getElementById(btn.dataset.close).classList.remove('open');
    });
  });

  /* ---------- Japa: create / edit ---------- */
  document.getElementById('japaSandhyaApplicable').addEventListener('change', (e)=>{
    document.getElementById('japaSandhyaRow').style.display = e.target.checked ? '' : 'none';
  });
  function resetJapaForm(){
    document.getElementById('japaEditId').value = '';
    document.getElementById('japaName').value = '';
    document.getElementById('japaSandhyaApplicable').checked = true;
    document.getElementById('japaSandhyaRow').style.display = '';
    document.querySelectorAll('#japaForm .check-row input').forEach(b=>b.checked=false);
    document.getElementById('japaSave').textContent = 'Save';
  }
  function openJapaEditForm(counterId){
    const counter = data.japa.find(c=>c.id===counterId);
    if(!counter) return;
    document.getElementById('japaEditId').value = counterId;
    document.getElementById('japaName').value = counter.name;
    const isAny = counter.sandhyas.length===1 && counter.sandhyas[0]==='any';
    document.getElementById('japaSandhyaApplicable').checked = !isAny;
    document.getElementById('japaSandhyaRow').style.display = isAny ? 'none' : '';
    document.querySelectorAll('#japaForm .check-row input').forEach(b=>{ b.checked = counter.sandhyas.includes(b.value); });
    document.getElementById('japaSave').textContent = 'Update';
    document.getElementById('japaForm').classList.add('open');
  }
  document.getElementById('japaSave').addEventListener('click', ()=>{
    const name = document.getElementById('japaName').value.trim();
    const applicable = document.getElementById('japaSandhyaApplicable').checked;
    const boxes = document.querySelectorAll('#japaForm .check-row input:checked');
    let sandhyas = Array.from(boxes).map(b=>b.value);
    if(!applicable) sandhyas = ['any'];
    if(!name || sandhyas.length===0) return;
    const editId = document.getElementById('japaEditId').value;
    if(editId){
      const counter = data.japa.find(c=>c.id===editId);
      if(counter){ counter.name = name; counter.sandhyas = sandhyas; }
    } else {
      data.japa.push({id:uid(), name, sandhyas, image:null});
    }
    resetJapaForm();
    document.getElementById('japaForm').classList.remove('open');
    save(); renderJapa();
  });

  function renderJapa(){
    const el = document.getElementById('japaList');
    const t = todayStr();
    if(data.japa.length===0){ el.innerHTML = '<div class="card-list"><div class="item-row"><span class="empty-note">No japa counters yet.</span></div></div>'; return; }
    el.innerHTML = '<div class="card-list">' + data.japa.map(counter=>{
      const tasks = counter.sandhyas.map(s=>{
        const entry = (data.logs[t] && data.logs[t].japa[counter.id] && data.logs[t].japa[counter.id][s]) || {count:0,seconds:0};
        const done = entry.count > 0;
        return `<div class="task-item ${done?'done':''}" data-counter="${counter.id}" data-sandhya="${s}">
          <div class="t-left"><span class="dot"></span><span class="t-label">${SANDHYA_LABEL[s]}</span></div>
          <span class="t-meta">${done ? entry.count+' japas · '+fmtTime(entry.seconds) : 'tap to count'}</span>
        </div>`;
      }).join('');
      return `<div class="item-row">
        <div class="row-flex">
          <span class="item-title">${escapeHtml(counter.name)}</span>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            <button class="edit-icon-btn japa-edit-btn" data-counter="${counter.id}" title="Edit counter">✎</button>
            <button class="icon-btn japa-img-btn" data-counter="${counter.id}" title="${counter.image ? 'Change background image' : 'Attach background image'}" style="width:28px;height:28px;font-size:13px;flex-shrink:0;">${counter.image ? '🖼️' : '📷'}</button>
          </div>
        </div>
        <div class="task-list">${tasks}</div>
      </div>`;
    }).join('') + '</div>';

    el.querySelectorAll('.task-item').forEach(item=>{
      item.addEventListener('click', ()=>{
        openJapaFullscreen(item.dataset.counter, item.dataset.sandhya);
      });
    });
    el.querySelectorAll('.japa-img-btn').forEach(btn=>{
      btn.addEventListener('click', (ev)=>{
        ev.stopPropagation();
        pendingImageCounterId = btn.dataset.counter;
        document.getElementById('japaImageInput').click();
      });
    });
    el.querySelectorAll('.japa-edit-btn').forEach(btn=>{
      btn.addEventListener('click', (ev)=>{
        ev.stopPropagation();
        openJapaEditForm(btn.dataset.counter);
      });
    });
  }

  /* ---------- Japa fullscreen ---------- */
  let fsState = null; // {counterId, sandhya, startTime, baseCount, baseSeconds, tickHandle}
  let pendingImageCounterId = null;

  function applyFsBackground(counter){
    const bg = document.getElementById('fsBg');
    const fsEl = document.getElementById('japaFullscreen');
    const removeBtn = document.getElementById('fsImageRemove');
    if(counter && counter.image){
      bg.style.backgroundImage = 'url("'+counter.image+'")';
      fsEl.classList.add('has-image');
      removeBtn.style.display = '';
    } else {
      bg.style.backgroundImage = 'none';
      fsEl.classList.remove('has-image');
      removeBtn.style.display = 'none';
    }
  }

  function resizeImageFile(file, maxDim, quality){
    return new Promise((resolve, reject)=>{
      const reader = new FileReader();
      reader.onload = ()=>{
        const img = new Image();
        img.onload = ()=>{
          let w = img.width, h = img.height;
          if(w > maxDim || h > maxDim){
            if(w >= h){ h = Math.round(h * maxDim / w); w = maxDim; }
            else { w = Math.round(w * maxDim / h); h = maxDim; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  document.getElementById('japaImageInput').addEventListener('change', async (ev)=>{
    const file = ev.target.files[0];
    ev.target.value = '';
    if(!file || !pendingImageCounterId) return;
    const counterId = pendingImageCounterId;
    pendingImageCounterId = null;
    try{
      const dataUrl = await resizeImageFile(file, 1600, 0.82);
      const counter = data.japa.find(c=>c.id===counterId);
      if(!counter) return;
      counter.image = dataUrl;
      save();
      renderJapa();
      if(fsState && fsState.counterId===counterId) applyFsBackground(counter);
    }catch(e){ console.error('image attach failed', e); }
  });

  document.getElementById('fsImageBtn').addEventListener('click', (ev)=>{
    ev.stopPropagation();
    if(!fsState) return;
    pendingImageCounterId = fsState.counterId;
    document.getElementById('japaImageInput').click();
  });
  document.getElementById('fsImageRemove').addEventListener('click', (ev)=>{
    ev.stopPropagation();
    if(!fsState) return;
    const counter = data.japa.find(c=>c.id===fsState.counterId);
    if(!counter) return;
    counter.image = null;
    save();
    applyFsBackground(counter);
  });

  function openJapaFullscreen(counterId, sandhya){
    const counter = data.japa.find(c=>c.id===counterId);
    if(!counter) return;
    const t = todayStr();
    const entry = ensureJapaEntry(t, counterId, sandhya);
    fsState = { counterId, sandhya, startTime: Date.now(), baseCount: entry.count, baseSeconds: entry.seconds, liveCount: entry.count };
    document.getElementById('fsName').textContent = counter.name + ' · ' + SANDHYA_LABEL[sandhya];
    document.getElementById('fsCount').textContent = fsState.liveCount;
    document.getElementById('fsTimer').textContent = fmtTime(entry.seconds);
    applyFsBackground(counter);
    document.getElementById('japaFullscreen').classList.add('open');
    fsState.tickHandle = setInterval(()=>{
      const elapsed = (Date.now()-fsState.startTime)/1000;
      document.getElementById('fsTimer').textContent = fmtTime(fsState.baseSeconds + elapsed);
      tickLiveCalendarCell();
    }, 1000);
  }
  function closeJapaFullscreen(){
    if(!fsState) return;
    clearInterval(fsState.tickHandle);
    const elapsed = (Date.now()-fsState.startTime)/1000;
    const t = todayStr();
    const entry = ensureJapaEntry(t, fsState.counterId, fsState.sandhya);
    entry.count = fsState.liveCount;
    entry.seconds = fsState.baseSeconds + elapsed;
    document.getElementById('japaFullscreen').classList.remove('open');
    fsState = null;
    save(); renderJapa();
  }
  document.getElementById('fsTapArea').addEventListener('click', ()=>{
    if(!fsState) return;
    fsState.liveCount++;
    document.getElementById('fsCount').textContent = fsState.liveCount;
  });
  document.getElementById('fsMinus').addEventListener('click', (e)=>{
    e.stopPropagation();
    if(!fsState) return;
    fsState.liveCount = Math.max(0, fsState.liveCount-1);
    document.getElementById('fsCount').textContent = fsState.liveCount;
  });
  document.getElementById('fsReset').addEventListener('click', (e)=>{
    e.stopPropagation();
    if(!fsState) return;
    fsState.liveCount = 0;
    document.getElementById('fsCount').textContent = 0;
  });
  document.getElementById('fsClose').addEventListener('click', closeJapaFullscreen);

  /* ---------- Practice ---------- */
  document.getElementById('practiceSandhyaApplicable').addEventListener('change', (e)=>{
    document.getElementById('practiceSandhyaRow').style.display = e.target.checked ? '' : 'none';
  });
  function resetPracticeForm(){
    document.getElementById('practiceEditId').value = '';
    document.getElementById('practiceName').value = '';
    document.getElementById('practiceSandhyaApplicable').checked = true;
    document.getElementById('practiceSandhyaRow').style.display = '';
    document.querySelectorAll('#practiceForm .check-row input').forEach(b=>b.checked=false);
    document.getElementById('practiceSave').textContent = 'Save';
  }
  function openPracticeEditForm(practiceId){
    const pr = data.practice.find(p=>p.id===practiceId);
    if(!pr) return;
    document.getElementById('practiceEditId').value = practiceId;
    document.getElementById('practiceName').value = pr.name;
    const isAny = pr.sandhyas.length===1 && pr.sandhyas[0]==='any';
    document.getElementById('practiceSandhyaApplicable').checked = !isAny;
    document.getElementById('practiceSandhyaRow').style.display = isAny ? 'none' : '';
    document.querySelectorAll('#practiceForm .check-row input').forEach(b=>{ b.checked = pr.sandhyas.includes(b.value); });
    document.getElementById('practiceSave').textContent = 'Update';
    document.getElementById('practiceForm').classList.add('open');
  }
  document.getElementById('practiceSave').addEventListener('click', ()=>{
    const name = document.getElementById('practiceName').value.trim();
    const applicable = document.getElementById('practiceSandhyaApplicable').checked;
    const boxes = document.querySelectorAll('#practiceForm .check-row input:checked');
    let sandhyas = Array.from(boxes).map(b=>b.value);
    if(!applicable) sandhyas = ['any'];
    if(!name || sandhyas.length===0) return;
    const editId = document.getElementById('practiceEditId').value;
    if(editId){
      const pr = data.practice.find(p=>p.id===editId);
      if(pr){ pr.name = name; pr.sandhyas = sandhyas; }
    } else {
      data.practice.push({id:uid(), name, sandhyas});
    }
    resetPracticeForm();
    document.getElementById('practiceForm').classList.remove('open');
    save(); renderPractice();
  });

  let runningTimers = {}; // key `${practiceId}|${sandhya}` -> {startTime, interval}

  function renderPractice(){
    const el = document.getElementById('practiceList');
    const t = todayStr();
    if(data.practice.length===0){ el.innerHTML = '<div class="card-list"><div class="item-row"><span class="empty-note">No practices yet.</span></div></div>'; return; }
    el.innerHTML = '<div class="card-list">' + data.practice.map(pr=>{
      const tasks = pr.sandhyas.map(s=>{
        const key = pr.id+'|'+s;
        const entry = (data.logs[t] && data.logs[t].practice[pr.id] && data.logs[t].practice[pr.id][s]) || {seconds:0,log:[]};
        const running = !!runningTimers[key];
        const done = entry.seconds > 0 && !running;
        let metaHtml, btnHtml;
        if(running){
          const subLabel = entry.seconds>0 ? `<div class="t-submeta">${fmtTime(entry.seconds)} logged earlier</div>` : '';
          metaHtml = `<div class="t-meta-stack"><span class="t-meta live" id="run-${key}">${fmtTime(0)}</span>${subLabel}</div>`;
          btnHtml = `<button class="pill done-btn" data-action="done" data-practice="${pr.id}" data-sandhya="${s}">Done</button>`;
        } else {
          const sessionCount = (entry.log||[]).length;
          metaHtml = `<span class="t-meta">${entry.seconds>0 ? fmtTime(entry.seconds)+(sessionCount>1?' · '+sessionCount+' sessions':' logged') : 'not started'}</span>`;
          btnHtml = `<button class="pill" data-action="start" data-practice="${pr.id}" data-sandhya="${s}">Start</button>`;
        }
        return `<div class="task-item ${done?'done':''}" data-static="1">
          <div class="t-left"><span class="dot"></span><span class="t-label">${SANDHYA_LABEL[s]}</span></div>
          <div style="display:flex;align-items:center;gap:10px;">${metaHtml}${btnHtml}</div>
        </div>`;
      }).join('');
      return `<div class="item-row">
        <div class="row-flex">
          <span class="item-title">${escapeHtml(pr.name)}</span>
          <button class="edit-icon-btn practice-edit-btn" data-practice="${pr.id}" title="Edit practice">✎</button>
        </div>
        <div class="task-list">${tasks}</div>
      </div>`;
    }).join('') + '</div>';

    el.querySelectorAll('[data-action="start"]').forEach(btn=>{
      btn.addEventListener('click', ()=>startPractice(btn.dataset.practice, btn.dataset.sandhya));
    });
    el.querySelectorAll('[data-action="done"]').forEach(btn=>{
      btn.addEventListener('click', ()=>stopPractice(btn.dataset.practice, btn.dataset.sandhya));
    });
    el.querySelectorAll('.practice-edit-btn').forEach(btn=>{
      btn.addEventListener('click', (ev)=>{
        ev.stopPropagation();
        openPracticeEditForm(btn.dataset.practice);
      });
    });
  }

  function startPractice(practiceId, sandhya){
    const key = practiceId+'|'+sandhya;
    if(runningTimers[key]) return;
    ensurePracticeEntry(todayStr(), practiceId, sandhya);
    runningTimers[key] = { startTime: Date.now() };
    renderPractice();
    runningTimers[key].interval = setInterval(()=>{
      const el = document.getElementById('run-'+key);
      if(el){
        const elapsed = (Date.now()-runningTimers[key].startTime)/1000;
        el.textContent = fmtTime(elapsed);
      }
      tickLiveCalendarCell();
    }, 1000);
  }
  function stopPractice(practiceId, sandhya){
    const key = practiceId+'|'+sandhya;
    const rt = runningTimers[key];
    if(!rt) return;
    clearInterval(rt.interval);
    const elapsed = (Date.now()-rt.startTime)/1000;
    const t = todayStr();
    const entry = ensurePracticeEntry(t, practiceId, sandhya);
    entry.log = entry.log || [];
    entry.log.push({ seconds: elapsed, endedAt: Date.now() });
    entry.seconds += elapsed;
    delete runningTimers[key];
    save(); renderPractice(); renderCalSummary();
    if(document.getElementById('tab-calendar').style.display !== 'none') renderCalendar();
  }

  /* ---------- Reading ---------- */
  document.getElementById('bookSave').addEventListener('click', ()=>{
    const title = document.getElementById('bookTitle').value.trim();
    const pages = parseInt(document.getElementById('bookPages').value, 10);
    if(!title || !pages || pages<=0) return;
    data.books.push({id:uid(), title, pages});
    document.getElementById('bookTitle').value='';
    document.getElementById('bookPages').value='';
    document.getElementById('bookForm').classList.remove('open');
    save(); renderReading();
  });

  function totalPagesRead(bookId){
    let total = 0;
    for(const d in data.logs){
      const v = data.logs[d].reading && data.logs[d].reading[bookId];
      if(v) total += v;
    }
    return total;
  }

  function renderReading(){
    const el = document.getElementById('readingList');
    const t = todayStr();
    if(data.books.length===0){ el.innerHTML = '<div class="card-list"><div class="item-row"><span class="empty-note">No books yet.</span></div></div>'; return; }
    el.innerHTML = '<div class="card-list">' + data.books.map(book=>{
      const read = totalPagesRead(book.id);
      const pct = Math.min(100, Math.round((read/book.pages)*100));
      const todayVal = (data.logs[t] && data.logs[t].reading && data.logs[t].reading[book.id]) || '';
      return `<div class="item-row">
        <div class="row-flex">
          <span class="item-title">${escapeHtml(book.title)}</span>
          <span class="item-sub">${read} / ${book.pages} pages · ${pct}%</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="reading-log">
          <input type="number" min="0" placeholder="pages today" data-book="${book.id}" value="${todayVal||''}">
          <button class="pill" data-log-book="${book.id}">Log</button>
        </div>
      </div>`;
    }).join('') + '</div>';

    el.querySelectorAll('[data-log-book]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const bookId = btn.dataset.logBook;
        const input = el.querySelector(`input[data-book="${bookId}"]`);
        const val = parseInt(input.value,10);
        if(isNaN(val) || val<0) return;
        const t = todayStr();
        const day = ensureDay(t);
        day.reading[bookId] = val;
        save(); renderReading();
      });
    });
  }

  /* ---------- Learning ---------- */
  document.getElementById('learnSave').addEventListener('click', ()=>{
    const title = document.getElementById('learnTitle').value.trim();
    if(!title) return;
    data.learning.push({id:uid(), title, milestones:[], notes:[], expanded:true});
    document.getElementById('learnTitle').value='';
    document.getElementById('learnForm').classList.remove('open');
    save(); renderLearning();
  });

  function renderLearning(){
    const el = document.getElementById('learningList');
    if(data.learning.length===0){ el.innerHTML = '<div class="card-list"><div class="item-row"><span class="empty-note">No learning tracks yet.</span></div></div>'; return; }
    el.innerHTML = '<div class="card-list">' + data.learning.map(track=>{
      const doneCount = track.milestones.filter(m=>m.done).length;
      const milestonesHtml = track.milestones.map((m,i)=>`
        <div class="milestone ${m.done?'done':''}">
          <input type="checkbox" ${m.done?'checked':''} data-toggle-milestone="${track.id}|${m.id}">
          <span class="m-text">${i+1}. ${escapeHtml(m.text)}</span>
        </div>`).join('');
      const notesHtml = track.notes.slice().reverse().map(n=>`
        <div class="note-entry"><span class="note-date">${n.date}</span>${escapeHtml(n.text)}</div>`).join('');
      const body = track.expanded ? `
        <div class="milestone-list">${milestonesHtml || '<span class="empty-note">No milestones yet.</span>'}</div>
        <div class="mini-input-row">
          <input type="text" placeholder="add milestone" data-milestone-input="${track.id}">
          <button class="pill ghost" data-add-milestone="${track.id}">Add</button>
        </div>
        <div class="notes-list">${notesHtml || '<span class="empty-note">No notes yet.</span>'}</div>
        <div class="mini-input-row">
          <input type="text" placeholder="add a note or to-do" data-note-input="${track.id}">
          <button class="pill ghost" data-add-note="${track.id}">Add</button>
        </div>
      ` : '';
      return `<div class="item-row">
        <div class="row-flex">
          <span class="item-title">${escapeHtml(track.title)}</span>
          <span class="item-sub">${doneCount}/${track.milestones.length} milestones</span>
        </div>
        <button class="expand-toggle" data-toggle-expand="${track.id}">${track.expanded?'hide details':'show details'}</button>
        ${body}
      </div>`;
    }).join('') + '</div>';

    el.querySelectorAll('[data-toggle-expand]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const track = data.learning.find(t=>t.id===btn.dataset.toggleExpand);
        track.expanded = !track.expanded;
        renderLearning();
      });
    });
    el.querySelectorAll('[data-toggle-milestone]').forEach(cb=>{
      cb.addEventListener('change', ()=>{
        const [trackId, mId] = cb.dataset.toggleMilestone.split('|');
        const track = data.learning.find(t=>t.id===trackId);
        const m = track.milestones.find(m=>m.id===mId);
        m.done = cb.checked;
        save(); renderLearning();
      });
    });
    el.querySelectorAll('[data-add-milestone]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const trackId = btn.dataset.addMilestone;
        const input = el.querySelector(`[data-milestone-input="${trackId}"]`);
        const text = input.value.trim();
        if(!text) return;
        const track = data.learning.find(t=>t.id===trackId);
        track.milestones.push({id:uid(), text, done:false});
        save(); renderLearning();
      });
    });
    el.querySelectorAll('[data-add-note]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const trackId = btn.dataset.addNote;
        const input = el.querySelector(`[data-note-input="${trackId}"]`);
        const text = input.value.trim();
        if(!text) return;
        const track = data.learning.find(t=>t.id===trackId);
        track.notes.push({id:uid(), text, date:todayStr()});
        save(); renderLearning();
      });
    });
  }

  /* ---------- Calendar (execution-calendar style: filterable blocks, ported from NSQF interactive calendar) ---------- */
  let calYear, calMonth; // 0-indexed month
  let calFilter = 'all';   // 'all' | 'japa' | 'practice' | 'reading' | 'learning'
  let calQuery = '';       // lowercase search text
  let calFocus = null;     // 'type|id' of a block currently traced across the month
  function initCalendarCursor(){
    const now = new Date();
    calYear = now.getFullYear(); calMonth = now.getMonth();
  }

  function dayHasActivity(dateStr, type){
    const day = data.logs[dateStr];
    if(!day) return false;
    if(type==='japa'){
      return Object.values(day.japa||{}).some(sMap=>Object.values(sMap).some(e=>e.count>0));
    }
    if(type==='practice'){
      return Object.values(day.practice||{}).some(sMap=>Object.values(sMap).some(e=>e.seconds>0));
    }
    if(type==='reading'){
      return Object.values(day.reading||{}).some(p=>p>0);
    }
    if(type==='learning'){
      return data.learning.some(t=>t.notes.some(n=>n.date===dateStr));
    }
    if(type==='any'){
      return dayHasActivity(dateStr,'japa') || dayHasActivity(dateStr,'practice') || dayHasActivity(dateStr,'reading') || dayHasActivity(dateStr,'learning');
    }
    return false;
  }

  /* Builds one "block" per logged item for a day — the calendar-cell / day-panel unit,
     mirroring the session chips in the NSQF execution calendar. */
  function getDayBlocks(dateStr){
    const day = data.logs[dateStr];
    const blocks = [];
    data.japa.forEach(c=>{
      c.sandhyas.forEach(s=>{
        const e = day && day.japa[c.id] && day.japa[c.id][s];
        if(e && e.count>0){
          blocks.push({type:'japa', id:c.id, key:'japa|'+c.id, name:c.name, meta:SANDHYA_LABEL[s]+' · '+e.count+' japas · '+fmtTime(e.seconds)});
        }
      });
    });
    data.practice.forEach(p=>{
      p.sandhyas.forEach(s=>{
        const e = day && day.practice[p.id] && day.practice[p.id][s];
        if(e && e.seconds>0){
          blocks.push({type:'practice', id:p.id, key:'practice|'+p.id, name:p.name, meta:SANDHYA_LABEL[s]+' · '+fmtTime(e.seconds)});
        }
      });
    });
    data.books.forEach(b=>{
      const v = day && day.reading[b.id];
      if(v>0){
        blocks.push({type:'reading', id:b.id, key:'reading|'+b.id, name:b.title, meta:v+' pages'});
      }
    });
    data.learning.forEach(t=>{
      t.notes.filter(n=>n.date===dateStr).forEach(n=>{
        blocks.push({type:'learning', id:t.id, key:'learning|'+t.id, name:t.title, meta:n.text});
      });
    });
    return blocks;
  }

  function blockMatchesFilters(b){
    const typeOk = calFilter==='all' || b.type===calFilter;
    const qOk = !calQuery || b.name.toLowerCase().indexOf(calQuery)>-1 || (b.meta||'').toLowerCase().indexOf(calQuery)>-1;
    return typeOk && qOk;
  }

  function dayStats(dateStr){
    const stats = {japa:false, practice:false, reading:false, learning:false, totalSeconds:0};
    const day = data.logs[dateStr];
    if(!day) return stats;
    stats.japa = dayHasActivity(dateStr,'japa');
    stats.practice = dayHasActivity(dateStr,'practice');
    stats.reading = dayHasActivity(dateStr,'reading');
    stats.learning = dayHasActivity(dateStr,'learning');
    Object.values(day.japa||{}).forEach(sMap=>Object.values(sMap).forEach(e=>stats.totalSeconds += (e.seconds||0)));
    Object.values(day.practice||{}).forEach(sMap=>Object.values(sMap).forEach(e=>stats.totalSeconds += (e.seconds||0)));
    return stats;
  }

  function tickLiveCalendarCell(){
    const el = document.getElementById('liveCellTime');
    if(!el) return;
    const stats = dayStats(todayStr());
    let total = stats.totalSeconds;
    Object.keys(runningTimers).forEach(key=>{ total += (Date.now()-runningTimers[key].startTime)/1000; });
    if(fsState) total += (Date.now()-fsState.startTime)/1000;
    el.textContent = fmtShort(total);
  }

  function computeConsistency(type){
    const now = new Date();
    const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
    const isCurrentMonth = (calYear===now.getFullYear() && calMonth===now.getMonth());
    const lastDay = isCurrentMonth ? now.getDate() : daysInMonth;
    let active = 0;
    for(let d=1; d<=lastDay; d++){
      const ds = calYear+'-'+String(calMonth+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
      if(dayHasActivity(ds, type)) active++;
    }
    return {active, lastDay, pct: lastDay>0 ? Math.round((active/lastDay)*100) : 0};
  }

  function renderCalSummary(){
    const el = document.getElementById('calSummary');
    const types = [['any','Overall'],['japa','Japa'],['practice','Practice'],['reading','Reading']];
    el.innerHTML = types.map(([type,label])=>`
      <div class="stat"><div class="num">${computeConsistency(type).pct}%</div><div class="lbl">${label} consistency</div></div>
    `).join('');
  }

  function renderCalProgress(){
    const type = calFilter==='all' ? 'any' : calFilter;
    const {active, lastDay, pct} = computeConsistency(type);
    document.getElementById('calProgressCount').textContent = active+' / '+lastDay+' active days';
    document.getElementById('calProgressFill').style.width = pct+'%';
  }

  let selectedDate = null;
  function renderCalendar(){
    if(calYear===undefined) initCalendarCursor();
    renderCalSummary();
    renderCalProgress();
    const label = new Date(calYear,calMonth,1).toLocaleString('en-US',{month:'long',year:'numeric'});
    document.getElementById('calMonthLabel').textContent = label;

    const grid = document.getElementById('calGrid');
    const dows = ['S','M','T','W','T','F','S'];
    let html = dows.map(d=>`<div class="cal-dow">${d}</div>`).join('');
    const firstDow = new Date(calYear,calMonth,1).getDay();
    const daysInMonth = new Date(calYear,calMonth+1,0).getDate();
    const todayS = todayStr();
    for(let i=0;i<firstDow;i++) html += '<div class="cal-cell empty"></div>';
    const MAX_VISIBLE_BLOCKS = 2;
    for(let d=1; d<=daysInMonth; d++){
      const ds = calYear+'-'+String(calMonth+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
      const stats = dayStats(ds);
      const allBlocks = getDayBlocks(ds);
      const visibleBlocks = allBlocks.filter(blockMatchesFilters);
      const activeFilters = calFilter!=='all' || !!calQuery;
      const heatCount = activeFilters ? visibleBlocks.length : allBlocks.length;
      const heatOpacity = heatCount ? Math.min(0.15 + 0.16*heatCount, 0.62) : 0;
      const isToday = ds===todayS;
      const isSelected = ds===selectedDate;
      const isLive = isToday && (Object.keys(runningTimers).length>0 || !!fsState);
      const timeId = isLive ? ' id="liveCellTime"' : '';
      const timeLabel = stats.totalSeconds>0 ? fmtShort(stats.totalSeconds) : (isLive ? '0m' : '');
      const shown = visibleBlocks.slice(0, MAX_VISIBLE_BLOCKS);
      const overflow = visibleBlocks.length - shown.length;
      const blockHtml = shown.map((b,i)=>{
        const cls = ['cal-block', b.type];
        if(calFocus){ cls.push(b.key===calFocus ? 'foc' : 'dim'); }
        return `<div class="${cls.join(' ')}" data-key="${b.key}" style="animation-delay:${Math.min(i,4)*45}ms" title="${escapeHtml(b.name+' — '+b.meta)}">
          <span class="bn">${escapeHtml(b.name)}</span><span class="bm">${escapeHtml(b.meta)}</span>
        </div>`;
      }).join('') + (overflow>0 ? `<div class="cal-more" data-date="${ds}">+${overflow} more</div>` : '');
      html += `<div class="cal-cell ${isToday?'today':''} ${isSelected?'selected':''} ${isLive?'live':''}" data-date="${ds}" style="animation-delay:${Math.min(d,20)*8}ms" title="${visibleBlocks.length ? visibleBlocks.length+' item(s) logged' : 'No activity'}">
        ${heatCount ? `<div class="heat" style="background:var(--gold);opacity:${heatOpacity}"></div>` : ''}
        <div class="cal-cell-top">
          <span class="dnum">${d}</span>
          ${timeLabel ? `<span class="cal-time"${timeId}>${timeLabel}</span>` : ''}
        </div>
        <div class="cal-dots">
          ${stats.japa?'<span class="cdot japa" title="Japa"></span>':''}
          ${stats.practice?'<span class="cdot practice" title="Practice"></span>':''}
          ${stats.reading?'<span class="cdot reading" title="Reading"></span>':''}
          ${stats.learning?'<span class="cdot learning" title="Learning"></span>':''}
        </div>
        <div class="cal-blocks">${blockHtml}</div>
      </div>`;
    }
    grid.innerHTML = html;
    grid.querySelectorAll('.cal-cell[data-date]').forEach(cell=>{
      cell.addEventListener('click', (ev)=>{
        if(ev.target.closest('.cal-block') || ev.target.closest('.cal-more')) return;
        selectedDate = cell.dataset.date;
        renderCalendar();
        renderDayPanel(selectedDate);
      });
    });
    grid.querySelectorAll('.cal-more').forEach(btn=>{
      btn.addEventListener('click', (ev)=>{
        ev.stopPropagation();
        selectedDate = btn.dataset.date;
        renderCalendar();
        renderDayPanel(selectedDate);
      });
    });
    grid.querySelectorAll('.cal-block').forEach(el=>{
      el.addEventListener('click', (ev)=>{
        ev.stopPropagation();
        const key = el.dataset.key;
        calFocus = (calFocus===key) ? null : key;
        renderCalendar();
        if(selectedDate) renderDayPanel(selectedDate);
      });
    });
    if(selectedDate) renderDayPanel(selectedDate);
  }

  function renderDayPanel(dateStr){
    const panel = document.getElementById('dayPanel');
    panel.style.display = '';
    const dateLabel = new Date(dateStr+'T00:00:00').toLocaleDateString('en-US',{weekday:'long', month:'long', day:'numeric'});
    const blocks = getDayBlocks(dateStr);
    const groups = [
      ['japa','Japa', data.japa.length],
      ['practice','Practice', data.practice.length],
      ['reading','Reading', data.books.length],
      ['learning','Learning notes', data.learning.length],
    ];

    function blockRow(b){
      const cls = ['day-block', b.type];
      if(calFocus){ cls.push(b.key===calFocus ? 'foc' : 'dim'); }
      return `<div class="${cls.join(' ')}" data-key="${b.key}">
        <span class="db-name">${escapeHtml(b.name)}</span><span class="db-meta">${escapeHtml(b.meta)}</span>
      </div>`;
    }

    const groupsHtml = groups.map(([type,label,defined])=>{
      const rows = blocks.filter(b=>b.type===type);
      const body = rows.length ? rows.map(blockRow).join('') : `<span class="empty-note">${defined ? 'Nothing logged.' : 'None set up.'}</span>`;
      return `<div class="day-group"><div class="g-title">${label}</div>${body}</div>`;
    }).join('');

    panel.innerHTML = `<h4>${dateLabel} Summary</h4>${groupsHtml}`;
    panel.querySelectorAll('.day-block[data-key]').forEach(el=>{
      el.addEventListener('click', ()=>{
        const key = el.dataset.key;
        calFocus = (calFocus===key) ? null : key;
        renderCalendar();
        renderDayPanel(dateStr);
      });
    });
  }

  document.getElementById('calTypeTabs').addEventListener('click', (ev)=>{
    const btn = ev.target.closest('.cal-tab'); if(!btn) return;
    document.querySelectorAll('#calTypeTabs .cal-tab').forEach(t=>t.classList.remove('on'));
    btn.classList.add('on');
    calFilter = btn.dataset.type;
    renderCalendar();
  });
  document.getElementById('calSearch').addEventListener('input', (ev)=>{
    calQuery = ev.target.value.trim().toLowerCase();
    renderCalendar();
  });
  document.getElementById('calReset').addEventListener('click', ()=>{
    calFilter = 'all'; calQuery = ''; calFocus = null;
    document.getElementById('calSearch').value = '';
    document.querySelectorAll('#calTypeTabs .cal-tab').forEach((t,i)=>t.classList.toggle('on', i===0));
    renderCalendar();
  });

  document.getElementById('calPrev').addEventListener('click', ()=>{
    calMonth--; if(calMonth<0){calMonth=11; calYear--;}
    selectedDate = null;
    document.getElementById('dayPanel').style.display='none';
    renderCalendar();
  });
  document.getElementById('calNext').addEventListener('click', ()=>{
    calMonth++; if(calMonth>11){calMonth=0; calYear++;}
    selectedDate = null;
    document.getElementById('dayPanel').style.display='none';
    renderCalendar();
  });

  function escapeHtml(str){
    return String(str).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function renderAll(){
    renderJapa();
    renderPractice();
    renderReading();
    renderLearning();
  }

