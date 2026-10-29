import { accountProxy } from "@/lib/server/account-proxy";
import { usesGoProfiles } from "@/lib/profile-mode";
export async function GET(request: Request) {
 if(!usesGoProfiles())return Response.json({error:"Endpoint not enabled"},{status:404});
 return accountProxy("/api/account/username"+new URL(request.url).search,request);
}
