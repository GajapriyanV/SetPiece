import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const VALID_FLAIRS = [
  "General", "Player", "Transfer Window",
  "Premier League", "La Liga", "Serie A", "Bundesliga", "Ligue 1",
  "UCL", "Europa League", "International",
];

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);

  const flair = searchParams.get("flair");
  const sort = searchParams.get("sort") ?? "newest"; // newest | top
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = 20;
  const offset = (page - 1) * limit;

  // Top thread of the week (most upvoted, last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: topThread } = await supabase
    .from("forum_threads")
    .select("id, title, flair, upvotes_count, reply_count, created_at, is_closed, author:profiles!author_id(username, name, avatar_url)")
    .gte("created_at", sevenDaysAgo)
    .order("upvotes_count", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Main thread list
  let query = supabase
    .from("forum_threads")
    .select(
      "id, title, flair, is_featured, is_closed, upvotes_count, reply_count, created_at, closes_at, author:profiles!author_id(username, name, avatar_url)",
      { count: "exact" }
    );

  if (flair && VALID_FLAIRS.includes(flair)) {
    query = query.eq("flair", flair);
  }

  if (sort === "top") {
    query = query.order("upvotes_count", { ascending: false }).order("created_at", { ascending: false });
  } else {
    // Featured first, then newest
    query = query.order("is_featured", { ascending: false }).order("created_at", { ascending: false });
  }

  const { data: threads, count } = await query.range(offset, offset + limit - 1);

  return NextResponse.json({
    threads: threads ?? [],
    topThread: topThread ?? null,
    total: count ?? 0,
    page,
    limit,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json();
  const { title, body: threadBody, flair, is_featured: requestedFeatured } = body;

  if (!title?.trim() || !threadBody?.trim() || !flair) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!VALID_FLAIRS.includes(flair)) {
    return NextResponse.json({ error: "Invalid flair" }, { status: 400 });
  }
  if (title.trim().length > 200) {
    return NextResponse.json({ error: "Title too long" }, { status: 400 });
  }

  // Admin check for featured
  let is_featured = false;
  if (requestedFeatured) {
    const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
    is_featured = profile?.is_admin === true;
  }

  const { data: thread, error } = await supabase
    .from("forum_threads")
    .insert({ author_id: user.id, title: title.trim(), body: threadBody.trim(), flair, is_featured })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: "Failed to create thread" }, { status: 500 });
  return NextResponse.json({ id: thread.id }, { status: 201 });
}
