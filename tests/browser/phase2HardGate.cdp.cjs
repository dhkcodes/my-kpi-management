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
const fx={fxRateId:9,fiscalYear:"FY27",fromCurrency:"USD",toCurrency:"KRW",rateValue:1400,sourceReference:"Fixture",versionNo:5};
const kpiRows=[0,1,2].map(index=>({id:270000+index,versionNo:1,manageTimeReflected:index===0,fiscalYear:"FY27",kpiCode:"A",quarter:["Q1","Q2","Q3"][index],activityMonth:`2026-0${index+1}`,rawWorkload:null,workloadId:null,mappingStatus:"NOT_REQUIRED",srNumber:`SR000765432${index}`,description:`Fixture KPI ${index}`,salesStage:null,acrK:null,targetQuarter:null,deliveryDate:`2026-0${index+1}-0${index+1}`}));
(async()=>{
  const targets=await getJson(`http://127.0.0.1:${cdpPort}/json/list`); const page=targets.find(t=>t.type==="page"&&!t.url.startsWith("devtools://")); if(!page)throw new Error("No CDP page");
  const cdp=new Cdp(page.webSocketDebuggerUrl); await cdp.open();
  const exceptions=[]; const requests=[]; let saveMode="success"; let createdId=9000;
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
      const added=(submitted.creates||[]).map(item=>({...accountRow,...item,id:String(createdId),commitmentId:createdId++,sourceRowNumber:11,versionNo:1}));
      return fulfill(200,{items:[accountRow,...added],total:1+added.length,fxRate:fx});
    }
    if(path.endsWith("/api/v1/accounts-workloads")) return fulfill(200,{items:[accountRow],total:1});
    if(path.endsWith("/api/v1/fx-rates")) return fulfill(200,fx);
    if(path.endsWith("/api/v1/kpi-guides")) return fulfill(200,{items:[]});
    if(path.includes("/api/v1/kpi-activities")){
      if(path.endsWith("/overview")) return fulfill(200,{fiscalYear:"FY27",asOf:"2026-08-21",items:[{code:"A",rows:3,target:"Fixture",status:"In Progress",explanation:"Fixture"}]});
      if(path.endsWith("/workload-options")) return fulfill(200,{items:[],total:0,hasMore:false});
      if(request.method==="GET") return fulfill(200,{items:kpiRows});
      return fulfill(200,{items:kpiRows});
    }
    return cdp.send("Fetch.continueRequest",{requestId});
  });
  await cdp.send("Page.enable"); await cdp.send("Runtime.enable"); await cdp.send("Network.enable"); await cdp.send("Network.setCacheDisabled",{cacheDisabled:true});
  await cdp.send("Fetch.enable",{patterns:[{urlPattern:"*api/v1/*",requestStage:"Request"}]});
  await cdp.send("Page.addScriptToEvaluateOnNewDocument",{source:`window.__phase2={errors:[],rejections:[]};addEventListener('error',e=>window.__phase2.errors.push(String(e.error?.stack||e.message)));addEventListener('unhandledrejection',e=>window.__phase2.rejections.push(String(e.reason?.stack||e.reason)));`});
  const evaluate=async expression=>{const out=await cdp.send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(out.exceptionDetails)throw new Error(out.exceptionDetails.exception?.description||out.exceptionDetails.text);return out.result.value;};
  const waitPage=async(expression,label,timeout=18000)=>{const start=Date.now();while(Date.now()-start<timeout){const value=await evaluate(expression);if(value)return value;await delay(40);}throw new Error(`wait timeout: ${label}`);};
  const navigate=async(path)=>{await cdp.send("Page.navigate",{url:`${baseUrl}${path}${path.includes("?")?"&":"?"}gate=${Date.now()}`});await waitPage(`document.readyState==='complete'&&document.querySelector('.kpi-footer')&&document.querySelector('.kpi-content')`,path);await evaluate(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);};

  await navigate("/accounts-workloads");
  await waitPage(`document.querySelector('#accountsWorkloadsTitle')`,`accounts loaded`);
  const addContract=await evaluate(`(()=>{const b=document.querySelector('oj-button.accounts-workloads-jet-button');const inner=b?.shadowRoot?.querySelector('button');return {text:b?.textContent.trim(),aria:b?.getAttribute('aria-label')||inner?.getAttribute('aria-label')||inner?.getAttribute('aria-labelledby')||inner?.textContent.trim()||b?.textContent.trim(),title:b?.getAttribute('title')};})()`);
  assert.deepEqual(addContract,{text:"Add Account",aria:"Add Account",title:"Add Account"});
  const runAccountFailure=async(mode,expected)=>{
    saveMode=mode;
    await evaluate(`(()=>{const b=document.querySelector('oj-button.accounts-workloads-jet-button');b.dispatchEvent(new CustomEvent('ojAction',{bubbles:true,composed:true}));return true;})()`);
    await waitPage(`document.querySelector('tr.is-adding-row')`,`${mode} add row`);
    await evaluate(`(()=>{for(const [placeholder,value] of [['Account *','${mode} Account'],['Workload *','${mode} Workload']]){const input=document.querySelector('tr.is-adding-row input[placeholder="'+placeholder+'"]');input.value=value;input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));}return true;})()`);
    await evaluate(`document.querySelector('.accounts-workloads-footer-actions .accounts-workloads-button--primary').click();true`);
    const alert=await waitPage(`(()=>{const a=document.querySelector('.accounts-workloads-save-error');return a?.textContent||false;})()`,`${mode} alert`,25000);
    assert.match(alert,expected); assert.equal(await evaluate(`Boolean(document.querySelector('tr.is-adding-row'))`),true,`${mode} preserves draft`);
    await evaluate(`document.querySelector('.accounts-workloads-footer-actions .accounts-workloads-button:not(.accounts-workloads-button--primary)').click();true`);
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
  await evaluate(`document.querySelector('.accounts-workloads-footer-actions .accounts-workloads-button--primary').click();true`);
  await waitPage(`!document.querySelector('tr.is-adding-row')&&document.body.textContent.includes('Success Account')`,`success persisted`,25000);
  const saveBodies=requests.filter(r=>r.path.endsWith('/accounts-workloads/save')&&r.body).map(r=>JSON.parse(r.body));
  assert.ok(saveBodies.every(body=>body.creates?.[0]?.fiscalYear==="FY27"),"every Add Account payload carries fiscalYear");
  assert.equal(saveBodies.at(-1).creates.length,1,"successful retry creates one row");

  const accountStyles=await evaluate(`(()=>{const root=getComputedStyle(document.documentElement);const h=getComputedStyle(document.querySelector('.accounts-workloads-grid th'));const c=getComputedStyle(document.querySelector('.accounts-workloads-grid tbody td'));const important=getComputedStyle(document.querySelector('.accounts-workloads-grid tbody tr.is-important'));const toolbar=getComputedStyle(document.querySelector('.accounts-workloads-toolbar'));return {tokens:['--kap-grid-header-bg','--kap-grid-cell-bg','--kap-grid-border','--kap-grid-hover-bg','--kap-grid-selected-bg','--kap-grid-draft-bg','--kap-grid-draft-line','--kap-grid-reflected-bg','--kap-grid-highlight-bg'].map(k=>[k,root.getPropertyValue(k).trim()]),header:{background:h.backgroundColor,border:h.borderBottomColor},cell:{background:c.backgroundColor,border:c.borderBottomColor},highlight:important.backgroundColor,toolbarGap:toolbar.gap,checkboxHeader:Boolean(document.querySelector('.accounts-workloads-grid thead input[type=checkbox]'))};})()`);
  await navigate("/activity-a");
  const kpiStyles=await evaluate(`(()=>{const h=getComputedStyle(document.querySelector('.kpi-activities-table th'));const c=getComputedStyle(document.querySelector('.kpi-activities-table td'));const reflected=getComputedStyle(document.querySelector('.kpi-manage-time-reflected-row'));const toolbar=getComputedStyle(document.querySelector('.kpi-activity-toolbar'));const icon=document.querySelector('.kpi-managed-status-icon');return {header:{background:h.backgroundColor,border:h.borderBottomColor},cell:{background:c.backgroundColor,border:c.borderBottomColor},reflected:reflected.backgroundColor,toolbarGap:toolbar.gap,checkboxHeader:Boolean(document.querySelector('.kpi-activities-table thead input[type=checkbox]')),icon:{aria:icon.getAttribute('aria-label'),title:icon.getAttribute('title'),role:icon.getAttribute('role')}};})()`);
  assert.deepEqual(accountStyles.header,kpiStyles.header); assert.deepEqual(accountStyles.cell,kpiStyles.cell); assert.equal(accountStyles.checkboxHeader,true); assert.equal(kpiStyles.checkboxHeader,true); assert.deepEqual(kpiStyles.icon,{aria:"Managed",title:"Managed",role:"img"});

  const routes=["/","/kpis-overview","/activity-a","/activity-b","/activity-c1","/activity-c2","/activity-d1","/activity-f","/activity-h","/customers-overview","/accounts-workloads","/weekly-activities","/consumption"];
  const footerMatrix=[];
  for(const viewport of [{width:1280,height:900},{width:1920,height:1080}]){
    await cdp.send("Emulation.setDeviceMetricsOverride",{...viewport,deviceScaleFactor:1,mobile:false});
    for(const path of routes){await navigate(path);const result=await evaluate(`(async()=>{const content=document.querySelector('.kpi-content'),footer=document.querySelector('.kpi-footer');const children=[...content.children],display=children.map(x=>x.style.display);children.forEach(x=>x.style.display='none');const probe=document.createElement('div');probe.style.cssText='height:40px;width:100%';content.appendChild(probe);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));let p=probe.getBoundingClientRect(),f=footer.getBoundingClientRect();const short={bottom:Math.abs(f.bottom-innerHeight),left:Math.abs(f.left-p.left),right:Math.abs(f.right-p.right),x:document.documentElement.scrollWidth-document.documentElement.clientWidth,y:document.documentElement.scrollHeight-document.documentElement.clientHeight,overlay:Math.max(0,p.bottom-f.top)};probe.style.height='1600px';await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));p=probe.getBoundingClientRect();f=footer.getBoundingClientRect();const long={after:f.top>=p.bottom-1,left:Math.abs(f.left-p.left),right:Math.abs(f.right-p.right),x:document.documentElement.scrollWidth-document.documentElement.clientWidth,scroll:document.documentElement.scrollHeight>innerHeight+1,overlay:Math.max(0,p.bottom-f.top)};probe.remove();children.forEach((x,i)=>x.style.display=display[i]);return{short,long,runtime:window.__phase2};})()`);footerMatrix.push({width:viewport.width,path,...result});}
  }
  for(const item of footerMatrix){assert.ok(item.short.bottom<=1&&item.short.left<=1&&item.short.right<=1&&item.short.x<=1&&item.short.y<=1&&item.short.overlay===0,`short footer ${item.width} ${item.path}`);assert.ok(item.long.after&&item.long.left<=1&&item.long.right<=1&&item.long.x<=1&&item.long.scroll&&item.long.overlay===0,`long footer ${item.width} ${item.path}`);assert.deepEqual(item.runtime.errors,[]);assert.deepEqual(item.runtime.rejections,[]);}
  assert.equal(footerMatrix.length,52/2); // 13 routes x 2 viewports
  assert.deepEqual(exceptions,[]);
  const evidence={addContract,accountSaveRequests:saveBodies.map(b=>({fiscalYear:b.creates?.[0]?.fiscalYear,creates:b.creates?.length})),accountStyles,kpiStyles,footerMatrixCount:footerMatrix.length,exceptions,errors:[],rejections:[]};
  console.log(JSON.stringify(evidence,null,2)); cdp.close();
})().catch(error=>{console.error(error.stack||error);process.exit(1);});
