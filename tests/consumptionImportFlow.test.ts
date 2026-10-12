import assert from "node:assert/strict";
import { runConsumptionImportFlow } from "../src/data/consumptionImportFlow";

void (async () => {
  let applyCalls=0;let reconcileCalls=0;let refreshCalls=0;
  const normal=await runConsumptionImportFlow({
    apply:async()=>{applyCalls++;return {receipt:true};},
    reconcile:async()=>{reconcileCalls++;return false;},
    refresh:async()=>{refreshCalls++;},
    isConfirmedStorageFailure:()=>false
  });
  assert.equal(normal.state,"COMPLETE");assert.equal(applyCalls,1);assert.equal(reconcileCalls,0);assert.equal(refreshCalls,1);

  applyCalls=0;reconcileCalls=0;refreshCalls=0;
  const responseLost=await runConsumptionImportFlow({
    apply:async()=>{applyCalls++;throw new TypeError("network response lost");},
    reconcile:async()=>{reconcileCalls++;return true;},
    refresh:async()=>{refreshCalls++;},
    isConfirmedStorageFailure:()=>false
  });
  assert.equal(responseLost.state,"COMPLETE");assert.equal(responseLost.reconciled,true);
  assert.equal(applyCalls,1);assert.equal(reconcileCalls,1);assert.equal(refreshCalls,1);

  const refreshFailed=await runConsumptionImportFlow({
    apply:async()=>({receipt:true}),reconcile:async()=>false,
    refresh:async()=>{throw new Error("records unavailable");},isConfirmedStorageFailure:()=>false
  });
  assert.equal(refreshFailed.state,"REFRESH_FAILED");

  applyCalls=0;
  const unconfirmed=await runConsumptionImportFlow({
    apply:async()=>{applyCalls++;throw new TypeError("network response lost");},
    reconcile:async()=>{throw new Error("status unavailable");},
    refresh:async()=>{throw new Error("must not refresh");},isConfirmedStorageFailure:()=>false
  });
  assert.equal(unconfirmed.state,"UNCONFIRMED");assert.equal(applyCalls,1);

  const storageFailed=await runConsumptionImportFlow({
    apply:async()=>{throw Object.assign(new Error("validation"),{status:422});},
    reconcile:async()=>{throw new Error("must not reconcile");},refresh:async()=>{},
    isConfirmedStorageFailure:(error)=>typeof error==="object"&&error!==null&&(error as {status?:number}).status===422
  });
  assert.equal(storageFailed.state,"STORAGE_FAILED");
  console.log("consumptionImportFlow tests passed");
})();
