import assert from "node:assert/strict";
import {test} from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function profileRoute(go,observed) {
 const source=fs.readFileSync("app/api/profile/me/route.ts","utf8");
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const client={auth:{getUser:async()=>({data:{user:{id:"fixture"}}})},from:()=>({select(){return this;},eq(){return this;},single:async()=>({data:{username:"canonical",avatar_url:null}})})};
 const imports={
 "next/server":{NextResponse:Response},"@/lib/profile-mode":{usesGoProfiles:()=>go},
 "@/lib/server/profile-backend":{},"@/utils/supabase/server":{createClient:async()=>{observed.supabase++;return client;}},
 "@/lib/server/account-proxy":{accountProxy:async()=>{observed.go++;return Response.json({username:"committed"});}}
 };
 const m={exports:{}};
 vm.runInNewContext(code,{module:m,exports:m.exports,Response,require(name){
  if(name==="@/lib/redis"){observed.redis++;throw Error("Redis is unavailable");}
  if(!(name in imports))throw Error("Unexpected import");return imports[name];
 }});
 return m.exports;
}
test("Go profile PATCH never loads Redis and legacy PATCH preserves successful save during cache outage",async()=>{
 for(const go of [false,true]){
  const observed={go:0,redis:0,supabase:0};const handler=profileRoute(go,observed);
  const res=await handler.PATCH(new Request("http://localhost/api/profile/me",{method:"PATCH",body:"{}"}));
  assert.equal(res.status,200);const data=await res.json();
  if(go){assert.equal(data.username,"committed");assert.deepEqual(observed,{go:1,redis:0,supabase:0});}
  else{assert.equal(data.cacheUpdated,false);assert.deepEqual(observed,{go:0,redis:1,supabase:1});}
 }
});
