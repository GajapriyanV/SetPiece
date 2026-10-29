import assert from "node:assert/strict";
import {test} from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function load(path,imports={},globals={}){
 const code=ts.transpileModule(fs.readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};vm.runInNewContext(code,{module:m,exports:m.exports,process,Response,Request,URL,URLSearchParams,AbortSignal,Uint8Array,TextDecoder,fetch,...globals,require:n=>{if(!(n in imports))throw Error("Unexpected import "+n);return imports[n];}},{filename:path});return m.exports;
}
test("account proxy refreshes and verifies the same user's session; no fallback writes",async()=>{
 let calls=0;
 const client={auth:{getUser:async()=>({data:{user:{id:"one"}}}),getSession:async()=>({data:{session:{user:{id:"one"},access_token:"fixture"}}})}};
 const proxy=load("lib/server/account-proxy.ts",{"@/utils/supabase/server":{createClient:async()=>client},"./profile-backend":{forwardAccountRequest:async(path,token,method,body)=>{calls++;assert.equal(token,"fixture");assert.equal(method,"PATCH");assert.equal(JSON.parse(body).name,"Player");return Response.json({name:"Player"});}}});
 const request=()=>new Request("http://localhost/api/profile/me",{method:"PATCH",body:'{"name":"Player"}'});
 assert.equal((await proxy.accountProxy("/api/account/profile",request())).status,200);
 client.auth.getSession=async()=>({data:{session:{user:{id:"other"},access_token:"bad"}}});
 assert.equal((await proxy.accountProxy("/api/account/profile",request())).status,401);assert.equal(calls,1);
});
test("mutation proxy rejects cross-origin requests and oversized bodies",async()=>{
 let forwarded=0;const client={auth:{getUser:async()=>({data:{user:{id:"one"}}}),getSession:async()=>({data:{session:{user:{id:"one"},access_token:"fixture"}}})}};
 const proxy=load("lib/server/account-proxy.ts",{"@/utils/supabase/server":{createClient:async()=>client},"./profile-backend":{forwardAccountRequest:async()=>{forwarded++;}}});
 for(const [body,origin,status] of [["{}","https://evil.example",403],["x".repeat(16385),"http://localhost",413]]){
 const response=await proxy.accountProxy("/api/account/profile",new Request("http://localhost/api/profile/me",{method:"PATCH",headers:{origin},body}));assert.equal(response.status,status);
 }
 assert.equal(forwarded,0);
});
test("forwarding preserves conflict status and sanitizes upstream details",async()=>{
 process.env.GO_API_URL="http://127.0.0.1:3002";process.env.NODE_ENV="test";
 const helper=load("lib/server/profile-backend.ts");
 for(const status of [400,401,404,409,503]){
 const res=await helper.forwardAccountRequest("/api/account/profile","fixture","PATCH","{}",async(url,options)=>{
 assert.equal(String(url),"http://127.0.0.1:3002/api/account/profile");assert.equal(options.redirect,"error");assert.equal(options.cache,"no-store");return Response.json({error:"private details"},{status});});
 assert.equal(res.status,status);assert.ok(!(await res.text()).includes("private details"));
 }
 const invalid=await helper.forwardAccountRequest("/api/account/self","fixture","GET",undefined,async()=>new Response(""));assert.equal(invalid.status,503);
});
test("Go profile saves return canonical data and never issue a Supabase row write",async()=>{
 let calls=0;const client=load("lib/profile-client.ts",{"./profile-mode":{usesGoProfiles:()=>true}},{fetch:async(path,options)=>{calls++;assert.equal(path,"/api/account/onboarding");assert.equal(options.method,"POST");return Response.json({name:"Canonical",username:"canonical",registration_complete:true});}});
 const saved=await client.saveGoProfile({name:"Input",username:"input",country:null,club:null},true);assert.equal(saved.name,"Canonical");assert.equal(calls,1);
});
test("legacy cache refresh reads canonical profile instead of trusting payload",async()=>{
 let cached;const client={auth:{getUser:async()=>({data:{user:{id:"one"}}})},from:()=>({select(){return this;},eq(){return this;},single:async()=>({data:{username:"canonical",avatar_url:null}})})};
 const handler=load("app/api/profile/me/route.ts",{"next/server":{NextResponse:Response},"@/utils/supabase/server":{createClient:async()=>client},"@/lib/profile-mode":{usesGoProfiles:()=>false},"@/lib/server/account-proxy":{},"@/lib/server/profile-backend":{},"@/lib/redis":{cacheUserProfile:async(...v)=>{cached=v;}}});
 const res=await handler.PATCH(new Request("http://localhost/api/profile/me",{method:"PATCH",body:'{"username":"forged","avatar_url":"forged"}'}));
 assert.equal(res.status,200);assert.deepEqual(Array.from(cached),["one","canonical",null]);
});
