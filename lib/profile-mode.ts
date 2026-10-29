// One build-time switch keeps browser writes and Next.js reads on the same backend.
export function usesGoProfiles(): boolean { return process.env.NEXT_PUBLIC_PROFILE_BACKEND === "go" || process.env.NEXT_PUBLIC_COMMUNITY_BACKEND === "go"; }
