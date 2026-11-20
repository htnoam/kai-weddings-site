/* Tasks pilot. This file runs only on Demo and uses its own API and DOM. */
(function () {
  'use strict';
  var host = window.KaiTaskHost;
  if (!host || host.slug !== 'demo-wedding') return;

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
  function displayDate(value) {
    if (!value) return 'ללא תאריך יעד';
    var parts = value.split('-'); return parts[2] + '.' + parts[1] + '.' + parts[0];
  }
  function render() {
    list.replaceChildren();
    var query = search.value.trim().toLocaleLowerCase();
    var shown = tasks.filter(function (task) {
      return (!query || (task.title + ' ' + task.description).toLocaleLowerCase().includes(query)) &&
        (!ownerFilter.value || task.owner === ownerFilter.value) &&
        (statusFilter.value === 'all' || statusFilter.value === 'active' && task.status !== 'done' || task.status === statusFilter.value);
    });
    if (!shown.length) {
      list.appendChild(element('p', 'kt-empty', tasks.length ? 'אין משימות שמתאימות לסינון.' : 'עדיין אין משימות. אפשר להוסיף את המשימה הראשונה.'));
      return;
    }
    shown.forEach(function (task) {
      var row = element('div', 'kt-row' + (task.status === 'done' ? ' kt-done' : ''));
      var check = element('input'); check.type = 'checkbox'; check.checked = task.status === 'done'; check.disabled = writing;
      check.setAttribute('aria-label', (check.checked ? 'פתיחה מחדש של ' : 'סימון כהושלמה: ') + task.title);
      check.addEventListener('change', function () { saveStatus(task, check.checked ? 'done' : 'open'); });
      var title = button(task.title, 'kt-title', function () { openEditor(task); });
      title.disabled = writing;
      var details = element('div', 'kt-info'); details.appendChild(title);
      details.appendChild(element('span', 'kt-meta', ownerNames[task.owner] + ' · ' + displayDate(task.due)));
      var badge = element('span', 'kt-status kt-' + task.status, statusNames[task.status]);
      row.append(check, details, badge); list.appendChild(row);
    });
  }
  async function reload(silent) {
    if (loading || writing) return;
    loading = true;
    try {
      var result = await api('list'); tasks = result.tasks; render();
      if (!silent) error.textContent = '';
    } catch (err) { error.textContent = 'לא ניתן לרענן את המשימות. נסה שוב באמצעות כפתור הרענון.'; }
    finally { loading = false; }
  }
  function lock(on) {
    writing = on;
    root.querySelectorAll('button,input,select,textarea').forEach(function (node) { node.disabled = on; });
  }
  async function saveStatus(task, status) {
    lock(true); error.textContent = '';
    try { await api('save', Object.assign({}, task, { status: status })); }
    catch (err) { error.textContent = message(err); }
    finally { lock(false); await reload(true); }
  }
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
      due: editor.querySelector('[name=due]').value || null,
      status: editor.querySelector('[name=status]').value
    };
  }
  function dirty() {
    if (!draft) return false;
    var current = fields();
    return ['title', 'description', 'owner', 'due', 'status'].some(function (key) { return current[key] !== draft[key]; });
  }
  function field(label, node, name) {
    var wrapper = element('label', 'kt-field', label); node.name = name;
    wrapper.appendChild(node); return wrapper;
  }
  function openEditor(task) {
    if (writing) return;
    if (draft && dirty() && !window.confirm('לפתוח משימה אחרת בלי לשמור את השינויים?')) return;
    lastFocus = document.activeElement;
    draft = task ? Object.assign({}, task) : { id: crypto.randomUUID(), version: 0, title: '', description: '', owner: '', due: null, status: 'open' };
    editor.replaceChildren(); editor.hidden = false;
    var heading = element('div', 'kt-editor-head');
    heading.append(element('h2', '', task ? 'עריכת משימה' : 'משימה חדשה'), button('×', 'kt-close', closeEditor));
    heading.lastChild.setAttribute('aria-label', 'סגירת עריכת משימה'); editor.appendChild(heading);
    var form = element('form', 'kt-form');
    var title = element('input'); title.required = true; title.maxLength = 200; title.value = draft.title;
    var owner = select(ownerNames, 'אחראי'); owner.value = draft.owner;
    var due = element('input'); due.type = 'date'; due.value = draft.due || '';
    var status = select(statusNames, 'סטטוס'); status.value = draft.status;
    var description = element('textarea'); description.rows = 4; description.maxLength = 5000; description.value = draft.description;
    form.append(field('שם המשימה', title, 'title'), field('אחראי', owner, 'owner'), field('תאריך יעד', due, 'due'),
      field('סטטוס', status, 'status'), field('תיאור', description, 'description'));
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
    var toolbar = element('div', 'kt-toolbar');
    search = element('input'); search.type = 'search'; search.placeholder = 'חיפוש משימה'; search.setAttribute('aria-label', 'חיפוש משימה');
    ownerFilter = select({ '': 'אחראי: הכול', planner: 'נועם', couple: 'הזוג' }, 'סינון לפי אחראי');
    statusFilter = select({ active: 'סטטוס: פתוחות', all: 'כל הסטטוסים', open: 'פתוח', progress: 'בטיפול', done: 'הושלם' }, 'סינון לפי סטטוס');
    toolbar.append(search, ownerFilter, statusFilter, button('רענון', 'btn', function () { reload(); }));
    search.addEventListener('input', render); ownerFilter.addEventListener('change', render); statusFilter.addEventListener('change', render);
    error = element('p', 'kt-error'); error.setAttribute('role', 'alert');
    var layout = element('div', 'kt-layout'); var table = element('div', 'kt-table');
    var labels = element('div', 'kt-labels'); labels.append(element('span', '', 'משימה / אחראי / תאריך יעד'), element('span', '', 'סטטוס'));
    list = element('div', 'kt-list'); table.append(labels, list);
    editor = element('aside', 'kt-editor'); editor.hidden = true; editor.setAttribute('aria-label', 'עריכת משימה');
    layout.append(table, editor); root.append(header, toolbar, error, layout); document.querySelector('main.wrap').appendChild(root);
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
    try { var result = await api('list'); tasks = result.tasks; mount(); }
    catch (err) { console.warn('Tasks pilot unavailable', err.message); }
  }
  var observer = new MutationObserver(start);
  observer.observe(document.getElementById('app'), { attributes: true, attributeFilter: ['hidden'] });
  start();
})();
