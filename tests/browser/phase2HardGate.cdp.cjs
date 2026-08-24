const assert = require("node:assert/strict");
const http = require("node:http");
const WebSocket = require("ws");
const cdpPort = Number(process.env.CDP_PORT || 9237);
const baseUrl = process.env.KPI_BASE || "http://127.0.0.1:18182";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const getJson = url => new Promise((resolve, reject) => http.get(url, response => { let body=""; response.on("data", chunk => body+=chunk); response.on("end",()=>{ try { resolve(JSON.parse(body)); } catch(error){ reject(error); } }); }).on("error",reject));
const encodeBody = value => Buffer.from(JSON.stringify(value)).toString("base64");
class Cdp {
  constructor(url){ this.nextId=1; this.pending=new Map(); this.handlers=new Map(); this.socket=new WebSocket(url); }
  async open(){ await new Promise((resolve,reject)=>{this.socket.once("open",resolve);this.socket.once("error",reject);}); this.socket.on("message", raw=>{ const message=JSON.parse(raw); if(message.id){const pending=this.pending.get(message.id); if(!pending)return; this.pending.delete(message.id); message.error?pending.reject(new Error(JSON.stringify(message.error))):pending.resolve(message.result); return;} for(const handler of this.handlers.get(message.method)||[]) handler(message.params); }); }
  send(method,params={}){ const id=this.nextId++; this.socket.send(JSON.stringify({id,method,params})); return new Promise((resolve,reject)=>this.pending.set(id,{resolve,reject})); }
  on(method,handler){ if(!this.handlers.has(method))this.handlers.set(method,[]); this.handlers.get(method).push(handler); }
  close(){this.socket.close();}
}
const accountRow={id:"41",commitmentId:41,versionNo:3,sourceRowNumber:10,planNumber:"UCM 1",account:"Fixture Account",workloadName:"Fixture Workload",opptyNo:"D100",startDate:"2026-08-01",endDate:"2027-08-01",arrUsd:100,arrKrw:140000,acrUsd:80,acrKrw:112000,target:"FY27 Q2",winProbability:50,latestUpdate:"Fixture update",notes:"Fixture note",isImportant:true,isDeleted:false,deletedAt:null,deletedBy:null};
const deletedAccountRows=[42,43].map(id=>({...accountRow,id:String(id),commitmentId:id,sourceRowNumber:id-30,account:`Deleted Fixture ${id}`,workloadName:`Deleted Workload ${id}`,isImportant:false,isDeleted:true,deletedAt:"2026-08-20T00:00:00Z",deletedBy:"fixture"}));
const fx={fxRateId:9,fiscalYear:"FY27",fromCurrency:"USD",toCurrency:"KRW",rateValue:1400,sourceReference:"Fixture",versionNo:5};
const kpiRows=[0,1,2].map(index=>({id:270000+index,versionNo:1,manageTimeReflected:index===0,fiscalYear:"FY27",kpiCode:"A",quarter:["Q1","Q2","Q3"][index],activityMonth:`2026-0${index+1}`,rawWorkload:null,workloadId:null,mappingStatus:"NOT_REQUIRED",srNumber:`SR000765432${index}`,description:`Fixture KPI ${index}`,salesStage:null,acrK:null,targetQuarter:null,deliveryDate:`2026-0${index+1}-0${index+1}`}));
const kpiCodes=["A","B","C1","C2","D1","F","H"];
const kpiSummary={fiscalYear:"FY27",quarterCounts:Object.fromEntries(kpiCodes.map(code=>[code,{Q1:0,Q2:0,Q3:0,Q4:0}])),c1C2Monthly:Object.fromEntries(["Q1","Q2","Q3","Q4"].map(q=>[q,{C1:{},C2:{}}])),d1QuarterByStage:Object.fromEntries(["Q1","Q2","Q3","Q4"].map(q=>[q,{IDENTIFIED:{count:0,acrK:0},VALIDATED:{count:0,acrK:0},ONBOARDED:{count:0,acrK:0}}])),targets:{countPerQuarter:{A:1,B:1,F:1,H:1},c1C2CombinedPerQuarter:6,d1AcrKPerQuarter:{IDENTIFIED:2000,VALIDATED:1000,ONBOARDED:500},labels:Object.fromEntries(kpiCodes.map(code=>[code,`${code} fixture target`]))}};
(async()=>{
  const targets=await getJson(`http://127.0.0.1:${cdpPort}/json/list`); const page=targets.find(t=>t.type==="page"&&!t.url.startsWith("devtools://")); if(!page)throw new Error("No CDP page");
  const cdp=new Cdp(page.webSocketDebuggerUrl); await cdp.open();
  const exceptions=[]; const requests=[]; let saveMode="success"; let createdId=9000; let accountRows=[accountRow,...deletedAccountRows];
  cdp.on("Runtime.exceptionThrown",({exceptionDetails})=>exceptions.push(exceptionDetails.exception?.description||exceptionDetails.text));
  cdp.on("Fetch.requestPaused",async({requestId,request})=>{
    const fulfill=(status,payload)=>cdp.send("Fetch.fulfillRequest",{requestId,responseCode:status,responseHeaders:[{name:"Content-Type",value:"application/json"}],body:encodeBody(payload)});
    const url=new URL(request.url); const path=url.pathname; requests.push({method:request.method,path,body:request.postData||null});
    if(path.endsWith("/api/v1/accounts-workloads/save")&&request.method==="POST"){
      if(saveMode==="network") return cdp.send("Fetch.failRequest",{requestId,errorReason:"ConnectionRefused"});
      if(saveMode==="validation") return fulfill(400,{code:"VALIDATION_ERROR",message:"Request is invalid"});
      if(saveMode==="conflict") return fulfill(409,{code:"VERSION_CONFLICT",message:"reload"});
      if(saveMode==="persistence") return fulfill(500,{code:"PERSISTENCE_ERROR",message:"Database operation failed"});
      const submitted=JSON.parse(request.postData||"{}");
      const permanentCommitmentIds=new Set((submitted.permanentDeletes||[]).map(item=>Number(item.commitmentId)));
      accountRows=accountRows.filter(row=>!permanentCommitmentIds.has(Number(row.commitmentId))).map(row=>{
        const update=(submitted.updates||[]).find(item=>String(item.id)===String(row.id));
        return update?{...row,...update,versionNo:row.versionNo+1}:row;
      });
      const added=(submitted.creates||[]).map(item=>({...accountRow,...item,id:String(createdId),commitmentId:createdId++,sourceRowNumber:11,versionNo:1}));
      accountRows=[...accountRows,...added];
      return fulfill(200,{items:accountRows,total:accountRows.length,fxRate:fx});
    }
    if(path.endsWith("/api/v1/accounts-workloads")) return fulfill(200,{items:accountRows,total:accountRows.length});
    if(path.endsWith("/api/v1/fx-rates")) return fulfill(200,fx);
    if(path.endsWith("/api/v1/kpi-guides")) return fulfill(200,{items:[]});
    if(path.includes("/api/v1/kpi-activities")){
      if(path.endsWith("/summary")) return fulfill(200,kpiSummary);
      if(path.endsWith("/overview")) return fulfill(200,{fiscalYear:"FY27",asOf:"2026-08-21",items:[{code:"A",rows:3,target:"Fixture",status:"In Progress",explanation:"Fixture"}]});
      if(path.endsWith("/workload-options")) return fulfill(200,{items:[],total:0,hasMore:false});
      if(request.method==="GET") return fulfill(200,{items:kpiRows});
      return fulfill(200,{items:kpiRows});
    }
    return cdp.send("Fetch.continueRequest",{requestId});
  });
  await cdp.send("Page.enable"); await cdp.send("Runtime.enable"); await cdp.send("Network.enable"); await cdp.send("Network.setCacheDisabled",{cacheDisabled:true});
  const runtimeConfigResult=await cdp.send("Runtime.evaluate",{expression:"globalThis.KAP_AUTH_CONFIG",returnByValue:true});
  const runtimeConfig=runtimeConfigResult.result.value;
  if(!runtimeConfig) throw new Error("Runtime auth config unavailable before test navigation");
  await cdp.send("Fetch.enable",{patterns:[{urlPattern:"*api/v1/*",requestStage:"Request"}]});
  await cdp.send("Page.addScriptToEvaluateOnNewDocument",{source:`Object.defineProperty(globalThis,'KAP_AUTH_CONFIG',{value:${JSON.stringify(runtimeConfig)},writable:false,configurable:false});window.__phase2={errors:[],rejections:[]};addEventListener('error',e=>window.__phase2.errors.push(String(e.error?.stack||e.message)));addEventListener('unhandledrejection',e=>window.__phase2.rejections.push(String(e.reason?.stack||e.reason)));`});
  const evaluate=async expression=>{const out=await cdp.send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(out.exceptionDetails)throw new Error(out.exceptionDetails.exception?.description||out.exceptionDetails.text);return out.result.value;};
  const waitPage=async(expression,label,timeout=18000)=>{const start=Date.now();while(Date.now()-start<timeout){const value=await evaluate(expression);if(value)return value;await delay(40);}throw new Error(`wait timeout: ${label}`);};
  const navigate=async(path)=>{await cdp.send("Page.navigate",{url:`${baseUrl}${path}${path.includes("?")?"&":"?"}gate=${Date.now()}`});await waitPage(`document.readyState==='complete'&&document.querySelector('.kpi-footer')&&document.querySelector('.kpi-content')`,path);await evaluate(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);};

  await navigate("/accounts-workloads");
  await waitPage(`document.querySelector('#accountsWorkloadsTitle')`,`accounts loaded`);
  const accountEscContract=await evaluate(`(async()=>{
    const wait=async(fn,label)=>{for(let i=0;i<200;i+=1){const value=fn();if(value)return value;await new Promise(r=>setTimeout(r,30));}throw new Error(label);};
    const cell=document.querySelector('tr[data-account-row-id="41"] [data-account-field="account"]');
    const original=cell.textContent.trim();
    cell.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,composed:true,detail:2,view:window}));
    const input=await wait(()=>cell.querySelector('input.accounts-workloads-edit-field'),'account editor');
    const nativeCaret=!(input.selectionStart===0&&input.selectionEnd===input.value.length);
    input.value='Esc must discard this value';
    input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:input.value}));
    input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,composed:true}));
    await wait(()=>!cell.querySelector('.accounts-workloads-edit-field'),'account editor close');
    return {nativeCaret,restored:cell.textContent.trim()===original,normalMode:!cell.classList.contains('is-unsaved-cell')};
  })()`);
  assert.deepEqual(accountEscContract,{nativeCaret:true,restored:true,normalMode:true});
  const addContract=await evaluate(`(()=>{const b=document.querySelector('oj-button.accounts-workloads-jet-button');const inner=b?.shadowRoot?.querySelector('button');return {text:b?.textContent.trim(),aria:b?.getAttribute('aria-label')||inner?.getAttribute('aria-label')||inner?.getAttribute('aria-labelledby')||inner?.textContent.trim()||b?.textContent.trim(),title:b?.getAttribute('title')};})()`);
  assert.deepEqual(addContract,{text:"Add Account",aria:"Add Account",title:"Add Account"});
  const accountToolbarLabels=()=>evaluate(`[...new Set([...document.querySelectorAll('.accounts-workloads-actions button, .accounts-workloads-actions oj-button')].map(button=>button.textContent.trim()).filter(Boolean))]`);
  assert.deepEqual((await accountToolbarLabels()).filter(label=>['Save','Cancel','Highlight','Delete'].includes(label)),[]);
  await evaluate(`(()=>{const b=document.querySelector('oj-button.accounts-workloads-jet-button');b.dispatchEvent(new CustomEvent('ojAction',{bubbles:true,composed:true}));return true;})()`);
  await waitPage(`document.querySelector('tr.is-adding-row')`,`Esc add row`);
  const addEscContract=await evaluate(`(async()=>{
    const input=document.querySelector('tr.is-adding-row input[placeholder="Account *"]');
    input.value='Must be discarded';
    input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:input.value}));
    input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',keyCode:229,isComposing:true,bubbles:true,composed:true}));
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const retainedDuringIme=Boolean(document.querySelector('tr.is-adding-row'));
    input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,composed:true}));
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    return {retainedDuringIme,cancelled:!document.querySelector('tr.is-adding-row')};
  })()`);
  assert.deepEqual(addEscContract,{retainedDuringIme:true,cancelled:true});
  assert.deepEqual((await accountToolbarLabels()).filter(label=>['Save','Cancel'].includes(label)),[]);
  const draftDeleteRequestsBefore=requests.filter(r=>r.path.endsWith('/accounts-workloads/save')).length;
  await evaluate(`(()=>{const b=document.querySelector('oj-button.accounts-workloads-jet-button');b.dispatchEvent(new CustomEvent('ojAction',{bubbles:true,composed:true}));return true;})()`);
  await waitPage(`document.querySelector('tr.is-adding-row')`,`draft delete row`);
  assert.deepEqual((await accountToolbarLabels()).filter(label=>['Save','Cancel','Highlight','Delete'].includes(label)),['Save','Cancel']);
  await evaluate(`document.querySelector('tr.is-adding-row input[aria-label="Select unsaved Draft account"]').click();true`);
  await waitPage(`[...document.querySelectorAll('.accounts-workloads-actions oj-button')].some(button=>button.textContent.trim()==='Delete')`,`draft delete action`);
  assert.deepEqual((await accountToolbarLabels()).filter(label=>['Save','Cancel','Highlight','Delete'].includes(label)),['Save','Cancel','Highlight','Delete']);
  await evaluate(`(()=>{const b=[...document.querySelectorAll('.accounts-workloads-actions oj-button')].find(button=>button.textContent.trim()==='Delete');b.dispatchEvent(new CustomEvent('ojAction',{bubbles:true,composed:true}));return true;})()`);
  await waitPage(`!document.querySelector('tr.is-adding-row')`,`draft deleted`);
  assert.equal(await evaluate(`Boolean(document.querySelector('oj-dialog.accounts-workloads-delete-dialog')?.isOpen?.())`),false,'draft-only Delete must not open a dialog');
  assert.equal(requests.filter(r=>r.path.endsWith('/accounts-workloads/save')).length,draftDeleteRequestsBefore,'unsaved Draft Delete must not call API');
  assert.deepEqual((await accountToolbarLabels()).filter(label=>['Save','Cancel','Highlight','Delete'].includes(label)),[]);

  await evaluate(`(()=>{const b=document.querySelector('oj-button.accounts-workloads-jet-button');b.dispatchEvent(new CustomEvent('ojAction',{bubbles:true,composed:true}));return true;})()`);
  await waitPage(`document.querySelector('tr.is-adding-row')`,`mixed draft row`);
  await evaluate(`document.querySelector('tr.is-adding-row input[aria-label="Select unsaved Draft account"]').click();document.querySelector('tr[data-account-row-id="41"] input[type="checkbox"]').click();true`);
  await waitPage(`[...document.querySelectorAll('.accounts-workloads-actions oj-button')].some(button=>button.textContent.trim()==='Delete')`,`mixed delete action`);
  await evaluate(`(()=>{const b=[...document.querySelectorAll('.accounts-workloads-actions oj-button')].find(button=>button.textContent.trim()==='Delete');b.dispatchEvent(new CustomEvent('ojAction',{bubbles:true,composed:true}));return true;})()`);
  const mixedDialog=await waitPage(`(()=>{const d=document.querySelector('oj-dialog.accounts-workloads-delete-dialog');return d?.isOpen?.()&&d.textContent.includes('already removed locally')?d.textContent:false;})()`,`mixed saved delete dialog`);
  assert.match(mixedDialog,/will not be restored if you cancel/); assert.equal(await evaluate(`Boolean(document.querySelector('tr.is-adding-row'))`),false);
  assert.equal(requests.filter(r=>r.path.endsWith('/accounts-workloads/save')).length,draftDeleteRequestsBefore,'mixed Draft removal before saved confirmation must not call API');
  await evaluate(`(()=>{const d=document.querySelector('oj-dialog.accounts-workloads-delete-dialog');const b=[...d.querySelectorAll('oj-button')].find(button=>button.textContent.trim()==='Cancel');b.dispatchEvent(new CustomEvent('ojAction',{bubbles:true,composed:true}));return true;})()`);
  await waitPage(`!document.querySelector('oj-dialog.accounts-workloads-delete-dialog')?.isOpen?.()`,`mixed cancel`);
  assert.equal(await evaluate(`Boolean(document.querySelector('tr.is-adding-row'))`),false,'mixed cancel must not restore Draft');
  await evaluate(`document.querySelector('tr[data-account-row-id="41"] input[type="checkbox"]').click();true`);
  const runAccountFailure=async(mode,expected)=>{
    saveMode=mode;
    await evaluate(`(()=>{const b=document.querySelector('oj-button.accounts-workloads-jet-button');b.dispatchEvent(new CustomEvent('ojAction',{bubbles:true,composed:true}));return true;})()`);
    await waitPage(`document.querySelector('tr.is-adding-row')`,`${mode} add row`);
    await evaluate(`(()=>{for(const [placeholder,value] of [['Account *','${mode} Account'],['Workload *','${mode} Workload']]){const input=document.querySelector('tr.is-adding-row input[placeholder="'+placeholder+'"]');input.value=value;input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));}return true;})()`);
    await evaluate(`[...document.querySelectorAll('.accounts-workloads-actions button')].find(button=>button.textContent.trim()==='Save').click();true`);
    const alert=await waitPage(`(()=>{const a=document.querySelector('.accounts-workloads-save-error');return a?.textContent||false;})()`,`${mode} alert`,25000);
    assert.match(alert,expected); assert.equal(await evaluate(`Boolean(document.querySelector('tr.is-adding-row'))`),true,`${mode} preserves draft`);
    await evaluate(`[...document.querySelectorAll('.accounts-workloads-actions button')].find(button=>button.textContent.trim()==='Cancel').click();true`);
    await waitPage(`!document.querySelector('tr.is-adding-row')`,`${mode} cancel`);
  };
  await runAccountFailure("validation",/Validation failed \(VALIDATION_ERROR\)/);
  await runAccountFailure("network",/API could not be reached/);
  await runAccountFailure("conflict",/Another user changed this data/);
  await runAccountFailure("persistence",/database rejected the save \(PERSISTENCE_ERROR\)/);
  saveMode="success";
  await evaluate(`(()=>{const b=document.querySelector('oj-button.accounts-workloads-jet-button');b.dispatchEvent(new CustomEvent('ojAction',{bubbles:true,composed:true}));return true;})()`);
  await waitPage(`document.querySelector('tr.is-adding-row')`,`success add`);
  await evaluate(`(()=>{for(const [placeholder,value] of [['Account *','Success Account'],['Workload *','Success Workload']]){const input=document.querySelector('tr.is-adding-row input[placeholder="'+placeholder+'"]');input.value=value;input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));}return true;})()`);
  await evaluate(`[...document.querySelectorAll('.accounts-workloads-actions button')].find(button=>button.textContent.trim()==='Save').click();true`);
  await waitPage(`!document.querySelector('tr.is-adding-row')&&document.body.textContent.includes('Success Account')`,`success persisted`,25000);
  const saveBodies=requests.filter(r=>r.path.endsWith('/accounts-workloads/save')&&r.body).map(r=>JSON.parse(r.body));
  assert.ok(saveBodies.every(body=>body.creates?.[0]?.fiscalYear==="FY27"),"every Add Account payload carries fiscalYear");
  assert.equal(saveBodies.at(-1).creates.length,1,"successful retry creates one row");

  await evaluate(`(()=>{const s=document.querySelector('oj-switch');s.value=true;s.dispatchEvent(new CustomEvent('valueChanged',{detail:{value:true},bubbles:true,composed:true}));return true;})()`);
  await waitPage(`document.querySelector('tr[data-account-row-id="42"]')`,`deleted rows loaded`);
  const selectAccountRow=id=>evaluate(`document.querySelector('tr[data-account-row-id="${id}"] input[type="checkbox"]').click();true`);
  const clickAccountAction=label=>evaluate(`(()=>{const b=[...document.querySelectorAll('.accounts-workloads-actions oj-button')].find(button=>button.textContent.trim()===${JSON.stringify(label)});b.dispatchEvent(new CustomEvent('ojAction',{bubbles:true,composed:true}));return true;})()`);
  const confirmAccountDelete=()=>evaluate(`(()=>{const d=document.querySelector('oj-dialog.accounts-workloads-delete-dialog');const b=[...d.querySelectorAll('oj-button')].find(button=>button.textContent.trim()==='Delete');b.dispatchEvent(new CustomEvent('ojAction',{bubbles:true,composed:true}));return true;})()`);

  await selectAccountRow('42'); await clickAccountAction('Delete');
  const permanentDialog=await waitPage(`(()=>{const d=document.querySelector('oj-dialog.accounts-workloads-delete-dialog');return d?.isOpen?.()&&d.textContent.includes('cannot be undone')?d.textContent:false;})()`,`permanent delete dialog`);
  assert.match(permanentDialog,/saved row/); saveMode='persistence'; await confirmAccountDelete();
  await waitPage(`document.querySelector('.accounts-workloads-save-error')?.textContent.includes('PERSISTENCE_ERROR')`,`permanent failure`);
  assert.equal(await evaluate(`Boolean(document.querySelector('tr[data-account-row-id="42"]'))`),true);
  assert.deepEqual((await accountToolbarLabels()).filter(label=>['Save','Cancel'].includes(label)),[],`permanent failure must not create edit dirty actions`);
  saveMode='success'; await confirmAccountDelete();
  await waitPage(`!document.querySelector('tr[data-account-row-id="42"]')`,`permanent success`);
  await waitPage(`document.activeElement?.textContent?.trim()==='Add Account'`,`delete focus restore`);
  assert.deepEqual((await accountToolbarLabels()).filter(label=>['Save','Cancel'].includes(label)),[],`permanent success must not create edit dirty actions`);

  await evaluate(`(()=>{const cell=document.querySelector('tr[data-account-row-id="41"] [data-account-field="notes"]');cell.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,composed:true,detail:2}));return true;})()`);
  await waitPage(`document.querySelector('tr[data-account-row-id="41"] [data-account-field="notes"] textarea')`,`account notes editor`);
  await evaluate(`(()=>{const input=document.querySelector('tr[data-account-row-id="41"] [data-account-field="notes"] textarea');input.value='Unsaved notes kept across delete';input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:'Unsaved notes kept across delete'}));input.dispatchEvent(new Event('blur',{bubbles:true}));return true;})()`);
  await waitPage(`[...document.querySelectorAll('.accounts-workloads-actions button')].some(button=>button.textContent.trim()==='Save')`,`dirty Save visible`);
  await selectAccountRow('43'); await clickAccountAction('Delete'); await waitPage(`document.querySelector('oj-dialog.accounts-workloads-delete-dialog')?.isOpen?.()`,`second permanent dialog`); await confirmAccountDelete();
  await waitPage(`!document.querySelector('tr[data-account-row-id="43"]')`,`second permanent success`);
  assert.deepEqual((await accountToolbarLabels()).filter(label=>['Save','Cancel'].includes(label)),['Save','Cancel'],`unrelated editable draft survives permanent delete`);
  await waitPage(`(()=>{const b=[...document.querySelectorAll('.accounts-workloads-actions button')].find(button=>button.textContent.trim()==='Cancel');if(!b||b.disabled)return false;b.click();return true;})()`,`dirty Cancel enabled`);
  await waitPage(`![...document.querySelectorAll('.accounts-workloads-actions button')].some(button=>button.textContent.trim()==='Save')`,`dirty cancel`);

  await navigate("/accounts-workloads");
  const accountEditorFocus=[];
  for(const [field,selector] of [['account','input'],['notes','textarea'],['target','select'],['startDate','oj-input-date']]){
    await evaluate(`(()=>{const cell=document.querySelector('tr[data-account-row-id="41"] [data-account-field="${field}"]');cell.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,composed:true,detail:2}));return true;})()`);
    const focused=await waitPage(`(()=>{const editor=document.querySelector('tr[data-account-row-id="41"] [data-account-field="${field}"] ${selector}.accounts-workloads-edit-field');return editor&&(document.activeElement===editor||editor.contains(document.activeElement))?{field:${JSON.stringify(field)},tag:editor.tagName}:false;})()`,`${field} double-click focus`);
    accountEditorFocus.push(focused);
    await evaluate(`(()=>{const editor=document.querySelector('tr[data-account-row-id="41"] [data-account-field="${field}"] ${selector}.accounts-workloads-edit-field');editor.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,composed:true}));return true;})()`);
    await waitPage(`!document.querySelector('tr[data-account-row-id="41"] [data-account-field="${field}"] .accounts-workloads-edit-field')`,`${field} editor close`);
  }
  const accountStyles=await waitPage(`(()=>{try{const root=getComputedStyle(document.documentElement);const header=document.querySelector('.accounts-workloads-grid th');const cell=document.querySelector('.accounts-workloads-grid tbody td');const toolbarElement=document.querySelector('.accounts-workloads-toolbar');if(!header||!cell||!toolbarElement)return false;const h=getComputedStyle(header);const c=getComputedStyle(cell);const important=document.querySelector('.accounts-workloads-grid tbody tr.is-important');const toolbar=getComputedStyle(toolbarElement);return {tokens:['--kap-grid-header-bg','--kap-grid-cell-bg','--kap-grid-border','--kap-grid-hover-bg','--kap-grid-selected-bg','--kap-grid-draft-bg','--kap-grid-draft-line','--kap-grid-reflected-bg','--kap-grid-highlight-bg'].map(k=>[k,root.getPropertyValue(k).trim()]),header:{background:h.backgroundColor,border:h.borderBottomColor},cell:{background:c.backgroundColor,border:c.borderBottomColor},highlight:important?getComputedStyle(important).backgroundColor:null,toolbarGap:toolbar.gap,checkboxHeader:Boolean(document.querySelector('.accounts-workloads-grid thead input[type=checkbox]'))};}catch{return false;}})()`,`accounts styles ready`);
  await navigate("/activity-a");
  const kpiStyles=await waitPage(`(()=>{const header=document.querySelector('.kpi-activities-table th');const cell=document.querySelector('.kpi-activities-table tr:not(.kpi-manage-time-reflected-row) td');const reflectedRow=document.querySelector('.kpi-manage-time-reflected-row');const toolbarElement=document.querySelector('.kpi-activity-toolbar');const icon=document.querySelector('.kpi-reflected-status-badge');const titleButton=document.querySelector('.kpi-grid-sort-button');if(!header||!cell||!reflectedRow||!toolbarElement||!icon||!titleButton)return false;const h=getComputedStyle(header);const c=getComputedStyle(cell);const reflected=getComputedStyle(reflectedRow);const toolbar=getComputedStyle(toolbarElement);const title=getComputedStyle(titleButton);return {header:{background:h.backgroundColor,border:h.borderBottomColor,title:title.color},cell:{background:c.backgroundColor,border:c.borderBottomColor},reflected:reflected.backgroundColor,toolbarGap:toolbar.gap,checkboxHeader:Boolean(document.querySelector('.kpi-activities-table thead input[type=checkbox]')),icon:{aria:icon.getAttribute('aria-label'),title:icon.getAttribute('title'),role:icon.getAttribute('role')}};})()`,`kpi styles ready`);
  assert.equal(accountStyles.header.background,kpiStyles.header.background); assert.equal(accountStyles.header.border,kpiStyles.header.border); assert.equal(accountStyles.cell.border,kpiStyles.cell.border); assert.equal(kpiStyles.cell.background,"rgb(255, 255, 255)"); assert.equal(accountStyles.checkboxHeader,true); assert.equal(kpiStyles.checkboxHeader,true); assert.deepEqual(kpiStyles.icon,{aria:"Reflected in internal system",title:"Reflected in internal system",role:"img"}); assert.equal(kpiStyles.header.title,"rgb(51, 65, 85)");

  const routes=["/","/kpis-overview","/activity-a","/activity-b","/activity-c1","/activity-c2","/activity-d1","/activity-f","/activity-h","/customers-overview","/accounts-workloads","/weekly-activities","/consumption"];
  const footerMatrix=[];
  for(const viewport of [{width:1280,height:900},{width:1920,height:1080}]){
    await cdp.send("Emulation.setDeviceMetricsOverride",{...viewport,deviceScaleFactor:1,mobile:false});
    for(const path of routes){await navigate(path);const result=await evaluate(`(async()=>{const content=document.querySelector('.kpi-content'),footer=document.querySelector('.kpi-footer');const children=[...content.children],display=children.map(x=>x.style.display);children.forEach(x=>x.style.display='none');const probe=document.createElement('div');probe.style.cssText='height:40px;width:100%';content.appendChild(probe);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));let p=probe.getBoundingClientRect(),f=footer.getBoundingClientRect();const short={bottom:Math.abs(f.bottom-innerHeight),left:Math.abs(f.left-p.left),right:Math.abs(f.right-p.right),x:document.documentElement.scrollWidth-document.documentElement.clientWidth,y:document.documentElement.scrollHeight-document.documentElement.clientHeight,overlay:Math.max(0,p.bottom-f.top)};probe.style.height='1600px';await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));p=probe.getBoundingClientRect();f=footer.getBoundingClientRect();const long={after:f.top>=p.bottom-1,left:Math.abs(f.left-p.left),right:Math.abs(f.right-p.right),x:document.documentElement.scrollWidth-document.documentElement.clientWidth,scroll:document.documentElement.scrollHeight>innerHeight+1,overlay:Math.max(0,p.bottom-f.top)};probe.remove();children.forEach((x,i)=>x.style.display=display[i]);return{short,long,runtime:window.__phase2};})()`);footerMatrix.push({width:viewport.width,path,...result});}
  }
  for(const item of footerMatrix){assert.ok(item.short.bottom<=1&&item.short.left<=1&&item.short.right<=1&&item.short.x<=1&&item.short.y<=1&&item.short.overlay===0,`short footer ${item.width} ${item.path}`);assert.ok(item.long.after&&item.long.left<=1&&item.long.right<=1&&item.long.x<=1&&item.long.scroll&&item.long.overlay===0,`long footer ${item.width} ${item.path}`);assert.deepEqual(item.runtime.errors,[]);assert.deepEqual(item.runtime.rejections,[]);}
  assert.equal(footerMatrix.length,52/2); // 13 routes x 2 viewports
  assert.deepEqual(exceptions,[]);
  const evidence={addContract,accountSaveRequests:saveBodies.map(b=>({fiscalYear:b.creates?.[0]?.fiscalYear,creates:b.creates?.length})),accountEditorFocus,accountStyles,kpiStyles,footerMatrixCount:footerMatrix.length,exceptions,errors:[],rejections:[]};
  console.log(JSON.stringify(evidence,null,2)); cdp.close();
})().catch(error=>{console.error(error.stack||error);process.exit(1);});
