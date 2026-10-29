// Synthetic local rehearsal only. No .env files or production URLs are loaded.
const cp=require("node:child_process"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),net=require("node:net"),crypto=require("node:crypto");
const root=path.resolve(__dirname,"..");
const pg=name=>process.env.PG_BIN?path.join(process.env.PG_BIN,name+(process.platform==="win32"?".exe":"")):name;
const go=process.env.GO_BIN||"go";
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"setpiece-m5-rehearsal-"));
const data=path.join(dir,"data"),database="setpiece_m5_test_"+crypto.randomUUID().replaceAll("-","");
const env={...process.env,GOMAXPROCS:process.env.GOMAXPROCS||"2",GOMEMLIMIT:process.env.GOMEMLIMIT||"256MiB",APP_ENV:"development"};
// Deliberately remove all ambient production/application database and fixture URLs.
for(const key of Object.keys(env)){if(key.endsWith("DATABASE_URL")||key.startsWith("PG")||key.startsWith("LOCAL_LIVEKIT_"))delete env[key];}
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
  env.SETPIECE_REHEARSAL_TEST_DATABASE_URL=uri;
  const race=process.argv.includes("--race")?["-race"]:[];
  const ownershipDB=database+"_ownership";
  run(pg("createdb"),[...args,ownershipDB]);
  env.SETPIECE_OWNERSHIP_TEST_DATABASE_URL="postgresql://setpiece_rehearsal@127.0.0.1:"+port+"/"+ownershipDB+"?sslmode=disable";
  run(go,["test","-p","1",...race,"./internal/ownership","-count=1","-v","-timeout","60s"]);
  delete env.SETPIECE_OWNERSHIP_TEST_DATABASE_URL;
  run(go,["test","-p","1",...race,"./cmd/server","-run","TestIntegratedRehearsal","-count=1","-v","-timeout","180s"]);
  env.REHEARSAL_DATABASE_URL=uri;
  run(go,["run","./cmd/migrate","-env-file="]);
  const backup=path.join(dir,"fixture.dump"),restored=database+"_restored";
  run(pg("pg_dump"),[...args,"-Fc","-f",backup,database]);
  run(pg("createdb"),[...args,restored]);
  run(pg("pg_restore"),[...args,"--exit-on-error","--no-owner","--no-privileges","-d",restored,backup]);
  const result=run(pg("psql"),[...args,"-d",restored,"-At","-v","ON_ERROR_STOP=1","-c","SELECT (SELECT count(*) FROM setpiece_migrations.applied),(SELECT count(*) FROM setpiece_runtime.results),(SELECT sum(wins) FROM public.profiles),(SELECT sum(mvp_count) FROM public.profiles)"],true).trim();
  if(result!=="4|1|1|1")throw Error("Restored fixture invariants differ");
  console.log("Rehearsal, controlled migration rerun and PostgreSQL backup/restore passed.");
 }finally{
  if(started)run(pg("pg_ctl"),["-D",data,"-m","fast","-w","stop"]);
  console.log("Disposable fixture artifacts retained at "+dir);
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
