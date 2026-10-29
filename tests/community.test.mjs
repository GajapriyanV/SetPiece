import assert from "node:assert/strict";
import {test} from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function load(path,imports={},globals={}){
 const code=ts.transpileModule(fs.readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const m={exports:{}};vm.runInNewContext(code,{module:m,exports:m.exports,process,Response,Request,URL,AbortSignal,Uint8Array,TextDecoder,fetch,...globals,require:n=>{if(!(n in imports))throw Error("Unexpected import "+n);return imports[n];}},{filename:path});return m.exports;
}
const tree=load("lib/forum-state.ts");
const node=(id,parent_reply_id=null)=>({id,parent_reply_id,body:id,children:[]});
test("reply pagination attaches later children, deduplicates retries and bounds malformed cycles",()=>{
 let value=tree.mergeReplyPage([], [node("root"),node("child","root")]);
 value=tree.mergeReplyPage(value,[node("child","root"),node("grandchild","child")]);
 assert.equal(value.length,1);assert.equal(value[0].children.length,1);assert.equal(value[0].children[0].children[0].id,"grandchild");
 value=tree.mergeReplyPage([], [node("a","b"),node("b","a")]);assert.equal(value.length,2);assert.doesNotThrow(()=>JSON.stringify(value));
 let late=tree.mergeReplyPage([],[node("child","root")]);late=tree.mergeReplyPage(late,[node("root")]);assert.equal(late[0].id,"root");assert.equal(late[0].children[0].id,"child");
});
test("public forum forwarding keeps a verified viewer but allows anonymous reads",async()=>{
 let user=null;let calls=[];
 const client={auth:{getUser:async()=>({data:{user}}),getSession:async()=>({data:{session:{user,access_token:"fixture-token"}}})}};
 const proxy=load("lib/server/account-proxy.ts",{"@/utils/supabase/server":{createClient:async()=>client},"./profile-backend":{forwardAccountRequest:async(...args)=>{calls.push(args);return Response.json({});}}});
 await proxy.accountProxy("/api/forum/id",new Request("http://localhost/api/forum/id"),"optional");assert.equal(calls[0][1],undefined);
 user={id:"viewer"};await proxy.accountProxy("/api/forum/id",new Request("http://localhost/api/forum/id"),"optional");assert.equal(calls[1][1],"fixture-token");
 await proxy.accountProxy("/api/notifications",new Request("http://localhost/api/notifications",{method:"PATCH"}));assert.equal(calls[2][2],"PATCH");assert.equal(calls[2][3],undefined);
});
test("community proxy preserves created status and sanitizes errors",async()=>{
 let response=Response.json({id:"new"},{status:201});
 const proxy=load("lib/server/community-proxy.ts",{"./account-proxy":{accountProxy:async()=>response}});
 assert.equal((await proxy.communityProxy(new Request("http://localhost/api/forum"))).status,201);
 response=Response.json({error:"private database string"},{status:503});
 const result=await proxy.communityProxy(new Request("http://localhost/api/forum"));assert.equal(result.status,503);assert.ok(!(await result.text()).includes("private"));
});
test("community routes use the opt-in path before any legacy query or lazy closure RPC",async()=>{
 let forwarded=false;
 const route=load("app/api/forum/[id]/route.ts",{"next/server":{NextResponse:Response},"@/utils/supabase/server":{createClient:()=>{throw Error("Must not access legacy DB");}},"@/lib/server/community-proxy":{usesGoCommunity:()=>true,communityProxy:async(_r,mode)=>{assert.equal(mode,"optional");forwarded=true;return Response.json({thread:{id:"fixture"}});}}});
 assert.equal((await route.GET(new Request("http://localhost/api/forum/fixture"),{params:Promise.resolve({id:"fixture"})})).status,200);assert.ok(forwarded);
});
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function bell(){
 const effects=[],values=[],channels=[],pending=[];let authCallback,resolveUser,unsubscribed=false;
 const client={auth:{getUser:()=>new Promise(resolve=>{resolveUser=resolve;}),onAuthStateChange(fn){authCallback=fn;return {data:{subscription:{unsubscribe(){unsubscribed=true;}}}};}},channel(){
 const channel={events:[],closed:false,on(_kind,filter,callback){this.events.push({filter,callback});return this;},subscribe(){return this;},unsubscribe(){this.closed=true;}};channels.push(channel);return channel;
 }};
 const hooks={useState(initial){const index=values.length;values.push(initial);return [initial,v=>{values[index]=typeof v==="function"?v(values[index]):v;}];},useRef:v=>({current:v}),useEffect:fn=>effects.push(fn),useCallback:fn=>fn};
 const component=load("components/layout/NotificationBell.tsx",{react:hooks,"react/jsx-runtime":{jsx:()=>null,jsxs:()=>null},"next/navigation":{useRouter:()=>({push(){}})},"@/utils/supabase/client":{createClient:()=>client}},{document:{addEventListener(){},removeEventListener(){}},fetch:()=>new Promise(resolve=>pending.push(resolve))});
 component.default();const cleanup=effects.map(fn=>fn()).filter(Boolean);
 return {values,channels,pending,resolveUser:id=>resolveUser({data:{user:id?{id}:null}}),auth:id=>authCallback("AUTH_CHANGED",id?{user:{id}}:null),close:()=>cleanup.forEach(fn=>fn()),unsubscribed:()=>unsubscribed};
}
test("notification subscription cannot outlive unmount during initial identity lookup",async()=>{
 const b=bell();b.close();b.resolveUser("one");await flush();assert.equal(b.channels.length,0);assert.ok(b.unsubscribed());
});
test("notification user switch removes old channel and rejects a late prior-user response",async()=>{
 const b=bell();b.resolveUser("one");await flush();assert.equal(b.channels[0].events.length,2);
 assert.equal(b.channels[0].events[0].filter.filter,"user_id=eq.one");
 b.auth("two");assert.ok(b.channels[0].closed);assert.equal(b.channels[1].events[0].filter.filter,"user_id=eq.two");
 b.pending[0](Response.json({notifications:[{id:"private-old"}],unreadCount:1}));await flush();assert.equal(b.values[1].length,0);
 b.pending[1](Response.json({notifications:[{id:"current"}],unreadCount:1}));await flush();assert.equal(b.values[1][0].id,"current");
 b.auth(null);assert.equal(b.values[1].length,0);assert.equal(b.values[2],0);assert.ok(b.channels[1].closed);b.close();
});

test("initial notification failure leaves a visible retry path and later refresh recovers",async()=>{
 const b=bell();b.resolveUser("one");await flush();
 b.pending[0](Response.json({error:"unavailable"},{status:503}));await flush();
 assert.equal(b.values[3],true,"bell must remain available to open/retry");
 assert.match(b.values[4],/could not load notifications/i);
 b.channels[0].events[0].callback();
 b.pending[1](Response.json({notifications:[{id:"recovered"}],unreadCount:1}));await flush();
 assert.equal(b.values[1][0].id,"recovered");assert.equal(b.values[4],"");b.close();
});
test("late notification failure from a prior account cannot expose an error after sign-out",async()=>{
 const b=bell();b.resolveUser("one");await flush();b.auth(null);
 b.pending[0](Response.json({error:"unavailable"},{status:503}));await flush();
 assert.equal(b.values[3],false);assert.equal(b.values[4],"");b.close();
});
