// Synthetic local media rehearsal only. No .env files or production URLs are loaded.
const cp=require("node:child_process"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),net=require("node:net"),crypto=require("node:crypto");
const root=path.resolve(__dirname,"..");
const pg=name=>process.env.PG_BIN?path.join(process.env.PG_BIN,name+(process.platform==="win32"?".exe":"")):name;
const go=process.env.GO_BIN||"go";
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"setpiece-media-rehearsal-"));
const data=path.join(dir,"data"),database="setpiece_m2_test_"+crypto.randomUUID().replaceAll("-","");
const env={...process.env,GOMAXPROCS:process.env.GOMAXPROCS||"2",GOMEMLIMIT:process.env.GOMEMLIMIT||"256MiB",APP_ENV:"development"};
// Deliberately remove all ambient production/application database and fixture URLs.
for(const key of Object.keys(env)){if(key.endsWith("DATABASE_URL")||key.startsWith("PG")||key.startsWith("LOCAL_LIVEKIT_")||key.startsWith("DEVELOPMENT_")||key==="SETPIECE_LIVEKIT_TEST_URL")delete env[key];}
env.SUPABASE_URL="http://127.0.0.1:9999";env.ALLOWED_ORIGINS="http://localhost:3000";
function run(exe,args,quiet=false){
 const r=cp.spawnSync(exe,args,{cwd:root,env,encoding:"utf8",stdio:quiet?"pipe":"inherit",windowsHide:true});
 if(r.error||r.status!==0)throw Error(path.basename(exe)+" failed"+(quiet?": "+(r.stderr||"").slice(0,1000):""));
 return r.stdout;
}
(async()=>{
 const server=net.createServer();await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
 const port=server.address().port;await new Promise(resolve=>server.close(resolve));
 const args=["-h","127.0.0.1","-p",String(port),"-U","setpiece_rehearsal"];
 let started=false;
 try{
  run(pg("initdb"),["-D",data,"-U","setpiece_rehearsal","--auth=trust","--encoding=UTF8","--no-locale"],true);
  run(pg("pg_ctl"),["-D",data,"-l",path.join(dir,"postgres.log"),"-o","-h 127.0.0.1 -p "+port,"-w","start"]);started=true;
  run(pg("createdb"),[...args,database]);
  const uri="postgresql://setpiece_rehearsal@127.0.0.1:"+port+"/"+database+"?sslmode=disable";
  env.SETPIECE_REALTIME_TEST_DATABASE_URL=uri;
  env.SETPIECE_LIVEKIT_TEST_URL="ws://127.0.0.1:7880";
  const race=process.argv.includes("--race")?["-race"]:[];
  run(go,["test","-p","1",...race,"./internal/livekit","-run","TestLocalLiveKitThreeParticipants","-count=1","-v","-timeout","120s"]);
  run(go,["test","-p","1",...race,"./internal/realtime","-run","TestPostgresSocketLifecycle","-count=1","-v","-timeout","180s"]);
  console.log("Local three-participant RTP and combined PostgreSQL/WebSocket/media lifecycle passed.");
 }finally{
  if(started)run(pg("pg_ctl"),["-D",data,"-m","fast","-w","stop"]);
  console.log("Disposable fixture artifacts retained at "+dir);
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
