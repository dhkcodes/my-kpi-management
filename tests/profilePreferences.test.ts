import { strict as assert } from "node:assert";
import { fetchProfilePreferences, saveProfilePreferences, mergeProfilePreferences, readAvatarFile } from "../src/auth/profileApi";
import { getProfileInitials, type AuthSession } from "../src/auth/authSession";
const session: AuthSession={userKey:"self",displayName:"Old Name",loginId:"identity@example.invalid",access:"Admin",status:"ACTIVE",menuPermissions:{}};
const png="data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
async function main() {
 let called=""; let body: any;
 const mock:typeof fetch=async (input,init) => {called=String(input);body=init?.body?JSON.parse(String(init.body)):undefined;assert.equal(init?.credentials,"include");return new Response(JSON.stringify({userKey:"self",displayName:"New Name",languageCode:"ko",avatarDataUrl:png,loginId:"evil",access:"User"}),{status:200});};
 const preferences=await fetchProfilePreferences(mock);const fresh=mergeProfilePreferences(session,preferences);assert.equal(called,"/api/v1/profile");assert.equal(fresh.displayName,"New Name");assert.equal(fresh.languageCode,"ko");assert.equal(fresh.avatarDataUrl,png);assert.equal(fresh.loginId,session.loginId);assert.equal(fresh.access,session.access);
 const malicious=mergeProfilePreferences(session,{...preferences,access:"User",userKey:"other"} as any);assert.equal(malicious.access,"Admin");assert.equal(malicious.userKey,"self");
 await saveProfilePreferences({displayName:"New Name",languageCode:"ja",avatarDataUrl:null},mock);assert.deepEqual(body,{displayName:"New Name",languageCode:"ja",avatarDataUrl:null});
 await assert.rejects(()=>fetchProfilePreferences(async()=>new Response(JSON.stringify({displayName:"x",languageCode:"xx"}),{status:200})),/Invalid/);
 await assert.rejects(()=>fetchProfilePreferences(async()=>new Response(JSON.stringify({displayName:"x",languageCode:"en",avatarDataUrl:"data:image/svg+xml;base64,aaaa"}),{status:200})),/Invalid/);
 await assert.rejects(()=>saveProfilePreferences({displayName:"x",languageCode:"en",avatarDataUrl:null},async()=>new Response("",{status:400})),/image format/);
 await assert.rejects(()=>readAvatarFile({type:"image/svg+xml",size:1024} as File),/PNG or JPEG/);await assert.rejects(()=>readAvatarFile({type:"image/png",size:262145} as File),/256 KiB/);assert.equal(getProfileInitials("New Name"),"NN");
 console.log("Profile preferences API, auth identity preservation, raster client validation and initials passed");
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
