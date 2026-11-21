/* Tasks pilot. This file runs only on Demo and uses its own API and DOM. */
(function () {
  'use strict';
  var host = window.KaiTaskHost;
  if (!host || host.slug !== 'demo-wedding') return;

  var weddingDate = null, myOwner = 'couple', view = 'all', opened = {};
  var periods = { early: '6 חודשים ומעלה לפני החתונה', months3to6: '3–6 חודשים לפני החתונה', months1to3: 'חודש עד 3 חודשים לפני החתונה', weeks2to4: 'שבוע עד חודש לפני החתונה', lastweek: 'בשבוע האחרון' };
  var progressText, progressBar, viewButtons;
  var revision = 0;
  var tasks = [], active = false, loading = false, writing = false, draft = null;
  var statusNames = { open: 'פתוח', progress: 'בטיפול', done: 'הושלם' };
  var ownerNames = { '': 'ללא אחראי', planner: 'נועם', couple: 'הזוג' };
  var root, list, error, search, ownerFilter, statusFilter, editor, lastFocus;

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(text, className, click) {
    var node = element('button', className, text);
    node.type = 'button'; if (click) node.addEventListener('click', click);
    return node;
  }
  function select(options, label) {
    var node = element('select'); node.setAttribute('aria-label', label);
    Object.keys(options).forEach(function (key) {
      var option = element('option', '', options[key]); option.value = key; node.appendChild(option);
    });
    return node;
  }
  async function api(action, task) {
    await KAI.ready();
    var result = await KAI.sb.rpc('kai_tasks', { p_slug: host.slug, p_action: action, p_task: task || {} });
    if (result.error) throw result.error;
    return result.data;
  }
  function message(err) {
    if (String(err.message).indexOf('TASK_CONFLICT') >= 0) return 'המשימה עודכנה ממכשיר אחר. הטיוטה שלך נשמרה כאן. סגור את העריכה ופתח שוב כדי לראות את העדכון.';
    return 'לא ניתן להשלים את הפעולה. בדוק את החיבור ונסה שוב. הפרטים שמילאת נשמרו כאן.';
  }
  function currentPeriod() {
    if (!weddingDate || !/^\d{4}-\d{2}-\d{2}$/.test(weddingDate)) return 'early';
    var today = new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Jerusalem'});
    var days = Math.ceil((Date.parse(weddingDate.slice(0,10)+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000);
    return days > 180 ? 'early' : days > 90 ? 'months3to6' : days > 28 ? 'months1to3' : days > 7 ? 'weeks2to4' : 'lastweek';
  }
  function setData(result) {
    tasks = result.tasks; weddingDate = result.wedding_date || weddingDate; myOwner = result.my_owner || myOwner;
  }
  function taskRow(task) {
    var row = element('div', 'kt-row' + (task.status === 'done' ? ' kt-done' : ''));
    var check = element('input'); check.type = 'checkbox'; check.checked = task.status === 'done'; check.disabled = writing;
    check.setAttribute('aria-label', (check.checked ? 'פתיחה מחדש של ' : 'סימון כהושלמה: ') + task.title);
    check.addEventListener('change', function () { saveStatus(task, check.checked ? 'done' : 'open'); });
    var title = button(task.title, 'kt-title', function () { openEditor(task); }); title.disabled = writing;
    var details = element('div','kt-info'); details.append(title,element('span','kt-meta',ownerNames[task.owner] + (task.status === 'progress' ? ' · בטיפול' : '')));
    var star = button(task.starred ? '★' : '☆', 'kt-star' + (task.starred ? ' kt-starred' : ''), function () { mutate(task,{starred:!task.starred}); });
    star.setAttribute('aria-label','סימון כחשובה: '+task.title); star.setAttribute('aria-pressed',String(!!task.starred)); star.disabled=writing;
    row.append(check,details,star); return row;
  }
  function render() {
    list.replaceChildren();
    var done = tasks.filter(function(t){return t.status==='done';}).length;
    progressText.textContent=done+' מתוך '+tasks.length+' הושלמו'; progressBar.value=done; progressBar.max=tasks.length || 1;
    var query=search.value.trim().toLocaleLowerCase(), current=currentPeriod();
    viewButtons.forEach(function(b){b.classList.toggle('on',b.dataset.view===view);b.setAttribute('aria-pressed',String(b.dataset.view===view));});
    var shown=tasks.filter(function(t){return (!query || (t.title+' '+t.description).toLocaleLowerCase().includes(query)) &&
      (!ownerFilter.value || t.owner===ownerFilter.value) && (view!=='mine' || t.owner===myOwner) && (view!=='starred' || t.starred) &&
      (statusFilter.value==='all' || statusFilter.value==='active' && t.status!=='done' || t.status===statusFilter.value);});
    if(!shown.length){list.appendChild(element('p','kt-empty',tasks.length?'אין משימות שמתאימות לסינון.':'עדיין אין משימות. אפשר להוסיף את המשימה הראשונה.'));return;}
    Object.keys(periods).forEach(function(key){
      var all=tasks.filter(function(t){return t.period===key;}), items=shown.filter(function(t){return t.period===key;});
      if(!items.length)return;
      var group=element('details','kt-group'); group.dataset.period=key;
      group.open=query || view!=='all' || ownerFilter.value || statusFilter.value!=='all' ? true : (key in opened ? opened[key] : key===current);
      var summary=element('summary','kt-period');summary.appendChild(element('span','kt-period-name',periods[key]));
      if(key===current)summary.appendChild(element('span','kt-current','התקופה הנוכחית'));
      summary.appendChild(element('span','kt-count',all.filter(function(t){return t.status==='done';}).length+'/'+all.length));
      var body=element('div','kt-period-rows');items.forEach(function(t){body.appendChild(taskRow(t));});group.append(summary,body);
      group.addEventListener('toggle',function(){if(group.isConnected)opened[key]=group.open;});list.appendChild(group);
    });
  }
  async function reload(silent) {
    if (loading || writing) return;
    loading = true; var requestedRevision = revision;
    try {
      var result = await api('list'); if (requestedRevision !== revision) return; setData(result); render();
      if (!silent) error.textContent = '';
    } catch (err) { error.textContent = 'לא ניתן לרענן את המשימות. נסה שוב באמצעות כפתור הרענון.'; }
    finally { loading = false; if (requestedRevision !== revision && !writing) reload(true); }
  }
  function lock(on) {
    writing = on; if (on) revision++;
    root.querySelectorAll('button,input,select,textarea').forEach(function (node) { node.disabled = on; });
  }
  async function mutate(task, changes) {
    lock(true); error.textContent = '';
    try { await api('save', Object.assign({}, task, changes)); }
    catch (err) { error.textContent = message(err); }
    finally { lock(false); await reload(true); }
  }
  function saveStatus(task,status) { return mutate(task,{status:status}); }
  function closeEditor() {
    if (writing) return;
    if (draft && dirty() && !window.confirm('לסגור בלי לשמור את השינויים?')) return;
    editor.hidden = true; draft = null;
    if (lastFocus && lastFocus.isConnected) lastFocus.focus();
  }
  function fields() {
    return {
      id: draft.id, version: draft.version,
      title: editor.querySelector('[name=title]').value.trim(),
      description: editor.querySelector('[name=description]').value,
      owner: editor.querySelector('[name=owner]').value,
      due: draft.due || null,
      period: editor.querySelector('[name=period]').value,
      starred: editor.querySelector('[name=starred]').checked,
      status: editor.querySelector('[name=status]').value
    };
  }
  function dirty() {
    if (!draft) return false;
    var current = fields();
    return ['title', 'description', 'owner', 'period', 'starred', 'status'].some(function (key) { return current[key] !== draft[key]; });
  }
  function field(label, node, name) {
    var wrapper = element('label', 'kt-field', label); node.name = name;
    wrapper.appendChild(node); return wrapper;
  }
  function openEditor(task) {
    if (writing) return;
    if (draft && dirty() && !window.confirm('לפתוח משימה אחרת בלי לשמור את השינויים?')) return;
    lastFocus = document.activeElement;
    draft = task ? Object.assign({}, task) : { id: crypto.randomUUID(), version: 0, title: '', description: '', owner: '', due: null, period: currentPeriod(), starred: false, status: 'open' };
    editor.replaceChildren(); editor.hidden = false;
    var heading = element('div', 'kt-editor-head');
    heading.append(element('h2', '', task ? 'עריכת משימה' : 'משימה חדשה'), button('×', 'kt-close', closeEditor));
    heading.lastChild.setAttribute('aria-label', 'סגירת עריכת משימה'); editor.appendChild(heading);
    var form = element('form', 'kt-form');
    var title = element('input'); title.required = true; title.maxLength = 200; title.value = draft.title;
    var owner = select(ownerNames, 'אחראי'); owner.value = draft.owner;
    var period = select(periods, 'תקופה'); period.value=draft.period;
    var starred=element('input');starred.type='checkbox';starred.checked=!!draft.starred;
    var status = select(statusNames, 'סטטוס'); status.value = draft.status;
    var description = element('textarea'); description.rows = 4; description.maxLength = 5000; description.value = draft.description;
    form.append(field('שם המשימה', title, 'title'), field('אחראי', owner, 'owner'), field('תקופה', period, 'period'),
      field('סטטוס', status, 'status'), field('משימה חשובה ★', starred, 'starred'), field('תיאור', description, 'description'));
    var errBox = element('p', 'kt-error'); errBox.setAttribute('role', 'alert'); form.appendChild(errBox);
    var actions = element('div', 'kt-editor-actions');
    var save = button('שמירה', 'btn primary'); save.type = 'submit'; actions.appendChild(save);
    if (task) actions.appendChild(button('מחיקת משימה', 'btn kt-delete', async function () {
      if (!window.confirm('למחוק את המשימה?')) return;
      await submit('delete');
    }));
    form.appendChild(actions); editor.appendChild(form);
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (!title.value.trim()) { title.setCustomValidity('יש למלא שם משימה.'); title.reportValidity(); return; }
      title.setCustomValidity(''); await submit('save');
    });
    title.addEventListener('input', function () { title.setCustomValidity(''); });
    async function submit(action) {
      var payload = fields(); lock(true); errBox.textContent = '';
      try {
        await api(action, payload);
        editor.hidden = true; draft = null; error.textContent = '';
      } catch (err) { errBox.textContent = message(err); }
      finally { lock(false); await reload(true); }
    }
    title.focus();
  }
  function mount() {
    var style = document.createElement('link'); style.rel = 'stylesheet'; style.href = '/v2/tasks.css'; document.head.appendChild(style);
    var nav = button('', '', function () { host.showSection('tasks'); }); nav.id = 's-tasks'; nav.title = 'משימות';
    nav.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="m7 9 2 2 4-4M7 16h10"/></svg><span>משימות</span>';
    document.getElementById('sect').insertBefore(nav, document.getElementById('sect-ev'));
    root = element('section', 'kt-root'); root.id = 'kai-tasks'; root.dir = 'rtl'; root.lang = 'he'; root.hidden = true;
    root.setAttribute('aria-label', 'משימות');
    var header = element('div', 'kt-header'); header.append(element('h1', '', 'משימות'), button('+ הוספת משימה', 'btn primary', function () { openEditor(); }));
    var progress=element('div','kt-progress-summary'); progressText=element('span');progressBar=element('progress');progressBar.setAttribute('aria-label','התקדמות המשימות');progress.append(progressText,progressBar);
    var views=element('div','kt-views');viewButtons=[];[['all','הכול'],['mine','שלי'],['starred','חשובות']].forEach(function(v){var b=button(v[1],'',function(){view=v[0];render();});b.dataset.view=v[0];viewButtons.push(b);views.appendChild(b);});
    var toolbar = element('div', 'kt-toolbar');
    search = element('input'); search.type = 'search'; search.placeholder = 'חיפוש משימה'; search.setAttribute('aria-label', 'חיפוש משימה');
    ownerFilter = select({ '': 'אחראי: הכול', planner: 'נועם', couple: 'הזוג' }, 'סינון לפי אחראי');
    statusFilter = select({ all: 'כל הסטטוסים', active: 'סטטוס: פתוחות', open: 'פתוח', progress: 'בטיפול', done: 'הושלם' }, 'סינון לפי סטטוס');
    toolbar.append(search, ownerFilter, statusFilter, button('רענון', 'btn', function () { reload(); }));
    search.addEventListener('input', render); ownerFilter.addEventListener('change', render); statusFilter.addEventListener('change', render);
    error = element('p', 'kt-error'); error.setAttribute('role', 'alert');
    var layout = element('div', 'kt-layout'); var table = element('div', 'kt-table');
    list = element('div', 'kt-list'); table.appendChild(list);
    editor = element('aside', 'kt-editor'); editor.hidden = true; editor.setAttribute('aria-label', 'עריכת משימה');
    layout.append(table, editor); root.append(header, progress, views, toolbar, error, layout); document.querySelector('main.wrap').appendChild(root);
    window.KaiTasks = {
      setSection: function (name) {
        active = name === 'tasks'; root.hidden = !active; nav.classList.toggle('on', active);
        if (active) { history.replaceState(null, '', '#tasks'); reload(); }
        else if (draft) { editor.hidden = true; draft = null; }
      },
      canLeave: function () { return !writing && (!draft || !dirty() || window.confirm('לצאת מהמשימות בלי לשמור את השינויים?')); }
    };
    document.getElementById('sect').hidden = false;
    render();
    if (location.hash === '#tasks') host.showSection('tasks');
    setInterval(function () { if (active && !document.hidden) reload(true); }, 15000);
    window.addEventListener('focus', function () { if (active) reload(true); });
    window.addEventListener('beforeunload', function (event) {
      if (writing || dirty()) { event.preventDefault(); event.returnValue = ''; }
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && active && !editor.hidden && !writing) { event.preventDefault(); closeEditor(); }
    });
  }
  async function start() {
    if (!host.isReady()) return;
    observer.disconnect();
    try { var result = await api('list'); setData(result); mount(); }
    catch (err) { console.warn('Tasks pilot unavailable', err.message); }
  }
  var observer = new MutationObserver(start);
  observer.observe(document.getElementById('app'), { attributes: true, attributeFilter: ['hidden'] });
  start();
})();
