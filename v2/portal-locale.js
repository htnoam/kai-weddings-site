/* Portal language pilot: display strings only. Canonical values and user content are never translated. */
(function () {
 'use strict';
 var cfg=null, active='guests', dict={}, reverse={}, enabled=false;
 var api={enabled:false,ready:null,config:null};
 api.lang=function(module){return cfg ? cfg.modules[module]||cfg.default : (module==='tasks'||module==='brief'?'he':'en');};
 api.t=function(text,module){if(!enabled)return text;var key=reverse[text]||text;return api.lang(module||active)==='he' ? (dict[key]||text) : key;};
 api.setDictionary=function(data){dict=data;Object.keys(data).forEach(function(k){reverse[data[k]]=k;});};
 api.rpc=async function(slug,values,revision){await KAI.ready();var r=await KAI.sb.rpc('kai_portal_language',{p_slug:slug,p_values:values||null,p_revision:revision==null?null:revision});if(r.error)throw r.error;return r.data;};
 api.load=async function(slug){if(!slug)return;var r=await api.rpc(slug);if(!r.enabled)return;cfg=r.config;api.config=cfg;enabled=api.enabled=true;api.permissions=r;api.section(active);return r;};
 api.section=function(module){active=module; if(!enabled)return;document.documentElement.lang=cfg.default;document.documentElement.dir=cfg.default==='he'?'rtl':'ltr';
  [['app','guests'],['sched','sched'],['brief','brief'],['budget','budget'],['kai-tasks','tasks'],['panel','guests'],['dlg','guests'],['bgk-sheet','budget'],['dlg-pay','budget']].forEach(function(pair){var el=document.getElementById(pair[0]);if(el){el.lang=api.lang(pair[1]);el.dir=el.lang==='he'?'rtl':'ltr';}});
 };
 // Only static markup, before any user data is rendered. Explicit option values prevent translated payloads.
 var staticRecords=null;
 api.static=function(){if(!enabled)return;
  if(!staticRecords){staticRecords=[];['body'].forEach(function(id){
   var el=id==='body'?document.body:document.getElementById(id)||document.querySelector('.'+id);if(!el)return;
   var module='guests',w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),n;
   while((n=w.nextNode())){var v=n.nodeValue,t=v.trim();if(!t)continue;if(n.parentElement.tagName==='OPTION'&&!n.parentElement.hasAttribute('value'))n.parentElement.value=t;if(!n.parentElement.closest('script,style,#couple,#who'))staticRecords.push({node:n,text:v,module:n.parentElement.closest('#s-budget')?'budget':n.parentElement.closest('#sect')?'shell':n.parentElement.closest('#dlg-pay,#bgk-sheet')?'budget':module});}
   el.querySelectorAll('[placeholder],[aria-label]').forEach(function(x){['placeholder','aria-label'].forEach(function(a){if(x.hasAttribute(a))staticRecords.push({node:x,attr:a,text:x.getAttribute(a),module:module});});});
  });}
  staticRecords.forEach(function(r){if(!r.node.isConnected)return;var t=r.text.trim(),v=r.text.replace(t,api.t(t,r.module));if(r.attr)r.node.setAttribute(r.attr,v);else r.node.nodeValue=v;});
 };
 api.apply=function(){api.section(active);document.dispatchEvent(new CustomEvent('kai-language-ready'));};
 window.KaiLocale=api;window.kl=function(t,m){return api.t(t,m);};
})();
