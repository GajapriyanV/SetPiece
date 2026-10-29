import type { SupabaseClient } from "@supabase/supabase-js";
import { usesGoProfiles } from "./profile-mode";
export interface OwnProfile { id: string; username: string | null; name: string | null; country: string | null; club: string | null; avatar_url: string | null; username_changed_at: string | null; is_admin: boolean; registration_complete: boolean }
export async function readOwnProfile(supabase: SupabaseClient, userId: string): Promise<OwnProfile | null> {
 if(!usesGoProfiles()){const {data}=await supabase.from("profiles").select("id,username,name,country,club,avatar_url,username_changed_at,is_admin,registration_complete").eq("id",userId).single();return data;}
 try{const res=await fetch("/api/account/self",{cache:"no-store"});if(!res.ok)return null;const data:OwnProfile=await res.json();return data.id===userId?data:null;}catch{return null;}
}
export async function saveGoProfile(input: { name: string; username: string; country: string | null; club: string | null; avatar_url?: string | null }, onboarding=false): Promise<OwnProfile> {
 const res=await fetch(onboarding?"/api/account/onboarding":"/api/profile/me",{method:onboarding?"POST":"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)});
 const data=await res.json();if(!res.ok)throw new Error(data.error ?? "Profile save failed");return data;
}
export async function usernameAvailable(supabase: SupabaseClient, username: string): Promise<boolean> {
 if(!usesGoProfiles()){const {data,error}=await supabase.from("profiles").select("id").eq("username",username).maybeSingle();if(error)throw new Error("Could not check username");return !data;}
 const res=await fetch("/api/account/username?"+new URLSearchParams({username}),{cache:"no-store"});
 if(!res.ok)throw new Error("Could not check username");return (await res.json()).available === true;
}
