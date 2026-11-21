const {JSDOM,VirtualConsole}=require('jsdom'),fs=require('fs'),assert=require('assert');const dir=require('path').resolve(__dirname,'..')+'/';const html=fs.readFileSync(dir+'manage.html','utf8');const sleep=t=>new Promise(r=>setTimeout(r,t||50));
const data={guests:[{no:1,first:'Dana',last:'Cohen',phone:'+972521112233',age:'Adult',status:'Confirmed',group:'Budget',notes:'Paid',deleted:false}],who:'QA',admin:true,wedding:{couple:'Demo Wedding',date:'2027-06-04'},views:[],schedule:[{id:'s1',day:'04/06/2027',time:'19:00',until:'',what:'Budget',where:'Paid',who:'Noam',notes:[],comments:[]}],brief:{lang:'he',times:{},sections:[{title:'תוכן מקורי',qs:[{id:'q1',label:'שאלה מקורית',type:'yesno',a:'כן',a2:'',extra:'פירוט'}]}]},budget:{source:'sheet',format:'kai',lines:[{row:1,item:'Photography',vendor:'Budget',total:4000,paid:1000,cur:''},{row:2,item:'Music',vendor:'Paid',total:5000,paid:2000,cur:'₪'}],vendors:[],payments:[]}};
async function setup(lang='he',mods={budget:'en',brief:'en',tasks:'en'},slug='demo-wedding'){
 const errs=[],calls=[],vc=new VirtualConsole();vc.on('jsdomError',e=>{if(!/Not implemented/.test(e.message))errs.push(e.message)});const d=new JSDOM(html,{url:'https://events.kaiwedd.com/'+slug+'/portal',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=d.window;w.innerWidth=393;w.matchMedia=()=>({matches:true,addEventListener(){}});w.fetch=async()=>({json:async()=>({})});w.confirm=()=>false;w.scrollTo=()=>{};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.KAI={ready:async()=>{},email:()=> 'qa@example.com',api:async(a,p)=>{calls.push([a,p]);if(a==='history')return{items:[]};if(a==='briefAnswer')return{};return structuredClone(data)},sb:{rpc:async(n,p)=>n==='kai_tasks'?{data:{tasks:[{id:'t1',title:'Budget',description:'Paid',owner:'couple',status:'open',period:'early',starred:false,version:1}]}}:{data:{enabled:true,config:{default:lang,modules:mods,revision:'0'},admin:false}},auth:{getSession:async()=>({data:{session:null}})},channel:()=>({on(){return this},subscribe(){return this}})}};
 for(const f of ['portal-locale.js','portal-translations.js'])w.eval(fs.readFileSync(dir+f,'utf8'));for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(m[1].trim())w.eval(m[1]);await sleep();if(w.KaiLocale.ready)await w.KaiLocale.ready;await sleep();return{w,d,q:s=>w.document.querySelector(s),calls,errs};
}

(async()=>{
 data.schedule[0].couple=true;
 data.schedule.push({...data.schedule[0],id:'s2',day:'05/06/2027',what:'Next day'});
 let t=await setup('en',{}),{q,w}=t;
 q('#s-sched').click();
 assert.equal(q('#sched').querySelectorAll('[role=tab]').length,2);
 assert.equal(q('.sc-phone-inactive').id,'sc-phone-day-1');
 q('#sc-phone-tab-1').click();
 assert.equal(q('#sc-phone-tab-1').getAttribute('aria-selected'),'true');
 assert(q('#sc-phone-day-0').classList.contains('sc-phone-inactive'));
 assert(!q('#sc-phone-day-1').classList.contains('sc-phone-inactive'));
 assert(!q('.sc-phone-tools').open,'tools initially closed');
 assert(!q('.sc-phone-rowmenu').open,'row actions initially closed');
 assert(q('[data-scred]') && q('[data-sceye]') && q('[data-scdel]'),'all row actions retained');
 assert(q('#sc-copy') && q('#sc-paste') && q('#sc-savetpl'),'admin actions retained');
 q('#sc-phone-day-1 [data-scred]').click();
 assert.equal(q('#sc-phone-tab-1').getAttribute('aria-selected'),'true','selected day retained after edit');
 assert(q('#sc-phone-day-1 .sc-row.red'),'red action still works');
 assert.equal(q('#sc-phone-day-1 [data-sck=what]').value,'Next day','content unchanged');
 const menu=q('.sc-phone-rowmenu');menu.open=true;
 q('.sc-phone-foot').dispatchEvent(new w.Event('pointerdown',{bubbles:true}));assert(!menu.open,'outside tap closes menu');
 menu.open=true;menu.querySelector('summary').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert(!menu.open,'Escape closes menu');
 assert.deepEqual(t.errs,[]);w.close();
 t=await setup('he',{});t.q('#s-sched').click();assert.equal(t.q('#sched').dir,'rtl');assert(t.q('#sc-phone-tab-0').textContent.includes('יוני'),'Hebrew day labels');
 t.q('#sc-phone-tab-0').dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));assert.equal(t.q('#sc-phone-tab-1').getAttribute('aria-selected'),'true','RTL keyboard navigation');t.w.close();
 console.log('PASS: day tabs, selection retained across render, inline fields, all existing row/admin actions, content preserved');
})().catch(e=>{console.error(e);process.exit(1)});
