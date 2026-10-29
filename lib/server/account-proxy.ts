import { createClient } from "@/utils/supabase/server";
import { forwardAccountRequest } from "./profile-backend";
export async function accountProxy(path: string, request?: Request, authenticated: boolean | "optional" = true): Promise<Response> {
 let token: string | undefined;
 if (authenticated) {
  const supabase=await createClient();
  const {data:{user},error}=await supabase.auth.getUser();
  if((error || !user) && authenticated !== "optional") return Response.json({error:"Not authenticated"},{status:401});
  if(user && !error) {
  const {data:{session},error:sessionError}=await supabase.auth.getSession();
  if(sessionError || !session || session.user.id!==user.id) return Response.json({error:"Not authenticated"},{status:401});
  token=session.access_token;
  }
 }
 const method=request?.method ?? "GET";
 let body: string | undefined;
 if(method!=="GET"){
  const origin=request!.headers.get("origin");
  if(origin && origin!==new URL(request!.url).origin) return Response.json({error:"Origin not allowed"},{status:403});
  const reader=request!.body?.getReader();if(!reader) return forwardAccountRequest(path,token,method);
  const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384)return Response.json({error:"Request too large"},{status:413});chunks.push(value);}}
  finally{await reader.cancel();reader.releaseLock();}
  const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}body=new TextDecoder().decode(bytes);
 }
 return forwardAccountRequest(path,token,method,body);
}
