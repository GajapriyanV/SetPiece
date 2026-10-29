import { accountProxy } from "./account-proxy";
export function usesGoCommunity(): boolean {return process.env.NEXT_PUBLIC_COMMUNITY_BACKEND==="go";}
export async function communityProxy(request: Request, authenticated: boolean | "optional" = true): Promise<Response> {
 const url=new URL(request.url);
 const response=await accountProxy(url.pathname+url.search,request,authenticated);
 if(response.ok)return response;
 const messages:Record<number,string>={400:"Invalid request",401:"Not authenticated",403:"Forbidden",404:"Not found",409:"This thread is closed",413:"Request too large",503:"Service temporarily unavailable"};
 return Response.json({error:messages[response.status]??"Request failed"},{status:response.status,headers:{"Cache-Control":"no-store"}});
}
