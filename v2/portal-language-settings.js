/* Admin settings entry in the existing event dialog. Pilot is deliberately Demo-only. */
(function(){
 'use strict';
 var trigger=document.createElement('button');trigger.type='button';trigger.className='btn';trigger.textContent='Portal settings · שפה';trigger.hidden=true;
 var eventForm=document.getElementById('form-ev');if(!eventForm)return;eventForm.insertBefore(trigger,eventForm.querySelector('.act'));
 var dialog=document.createElement('dialog');dialog.className='kl-settings';dialog.dir='rtl';dialog.lang='he';dialog.setAttribute('aria-labelledby','kl-title');
 dialog.innerHTML='<form><header><button type="button" class="kl-close" aria-label="סגירה">×</button><div><small>Demo Wedding · הגדרות פורטל</small><h2 id="kl-title">הגדרות שפה</h2></div></header><div class="kl-body"><p>ההגדרה חלה על כל המשתמשים בפורטל הזה.</p><section><label for="kl-default">שפת הפורטל</label><select id="kl-default" name="default"><option value="he">עברית</option><option value="en">English</option></select><small>ברירת המחדל לכל המודולים</small></section><h3>שפה לפי מודול</h3><section id="kl-modules"></section><p>ניתן לשינוי על ידי מנהל בלבד.</p><p>שינוי השפה אינו מתרגם תוכן שכבר הוזן.</p></div><footer><p class="kl-error" role="alert"></p><button class="btn primary" type="submit">שמירת הגדרות</button></footer></form>';
 document.body.appendChild(dialog);
 var snapshot=null,busy=false,dirty=false,request=0;
 var modules={guests:'אורחים',sched:'לו״ז',brief:'שאלות / בריף טקס',budget:'תקציב',tasks:'משימות'};
 function close(){if(busy)return;if(dirty&&!window.confirm('לצאת בלי לשמור את הגדרות השפה?'))return;dialog.close();trigger.focus();}
 dialog.querySelector('.kl-close').onclick=close;dialog.addEventListener('cancel',function(e){e.preventDefault();close();});
 // The existing Edit event flow sets the event fields/title before exposing the dialog.
 // Resolve by slug from the actual clicked event action rather than its displayed name.
 document.addEventListener('click',function(e){var b=e.target.closest('[data-editev]');if(b)trigger.hidden=b.dataset.editev!=='demo-wedding';});
 trigger.onclick=async function(){var ticket=++request;trigger.disabled=true;try{
  var r=await KaiLocale.rpc('demo-wedding');if(ticket!==request)return;if(!r.enabled||!r.admin)throw Error('אין הרשאה לשינוי השפה.');snapshot=r.config;dirty=false;
  document.getElementById('kl-default').value=snapshot.default;var container=document.getElementById('kl-modules');container.replaceChildren();
  Object.keys(modules).forEach(function(k){if(r.modules[k]!==true)return;var row=document.createElement('label');row.className='kl-row';var name=document.createElement('span');name.textContent=modules[k];var wrap=document.createElement('span'),sel=document.createElement('select');sel.name=k;sel.setAttribute('aria-label',modules[k]);
   [['inherit','לפי שפת הפורטל'],['he','עברית'],['en','English']].forEach(function(v){var o=document.createElement('option');o.value=v[0];o.textContent=v[1];sel.appendChild(o);});sel.value=snapshot.modules[k]||'inherit';var hint=document.createElement('small');hint.dataset.inherited=k;wrap.append(sel,hint);row.append(name,wrap);container.appendChild(row);
  });hints();dialog.querySelector('.kl-error').textContent='';dialog.showModal();document.getElementById('kl-default').focus();
 }catch(e){window.alert(e.message||'לא ניתן לטעון את הגדרות השפה. נסה שוב.');}finally{trigger.disabled=false;}};
 function hints(){dialog.querySelectorAll('[data-inherited]').forEach(function(el){var sel=dialog.querySelector('select[name="'+el.dataset.inherited+'"]');el.textContent=sel.value==='inherit'?(document.getElementById('kl-default').value==='he'?'עברית':'English'):'';});}
 dialog.addEventListener('change',function(){dirty=true;hints();});
 dialog.querySelector('form').onsubmit=async function(e){e.preventDefault();if(busy||!snapshot)return;var vals={default:document.getElementById('kl-default').value,modules:Object.assign({},snapshot.modules)};dialog.querySelectorAll('#kl-modules select').forEach(function(s){vals.modules[s.name]=s.value;});busy=true;var buttons=dialog.querySelectorAll('button,select');buttons.forEach(function(b){b.disabled=true;});var err=dialog.querySelector('.kl-error');err.textContent='';
  try{var r=await KaiLocale.rpc('demo-wedding',vals,snapshot.revision);snapshot=r.config;dirty=false;dialog.close();trigger.focus();}
  catch(ex){err.textContent=String(ex.message).includes('LANGUAGE_CONFLICT')?'ההגדרות עודכנו ממכשיר אחר. הבחירה שלך נשארה כאן; סגור ופתח שוב לפני שמירה.':'לא ניתן לשמור. הבחירה שלך נשארה כאן. בדוק חיבור ונסה שוב.';}
  finally{busy=false;buttons.forEach(function(b){b.disabled=false;});}
 };
})();
