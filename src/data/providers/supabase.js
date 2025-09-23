// src/data/providers/supabase.js
import { createClient } from "@supabase/supabase-js";

/* ---------- client ---------- */
const url  = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

function isHttp(s) {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export const sb =
  url && anon && isHttp(url)
    ? createClient(url, anon, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // IMPORTANT: lets the client read #access_token from email links
          detectSessionInUrl: true,
        },
      })
    : null;

if (!sb) {
  console.error(
    "[CivicWatch] Supabase not configured (check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)."
  );
}

/* ---------- auth helpers ---------- */
export async function getCurrentUser() {
  if (!sb) return null;
  const { data: { user } = {} } = await sb.auth.getUser();
  if (!user) return null;

  const prof = await sb.from("profiles").select("*").eq("id", user.id).single();
  return { ...user, profile: prof.data || null };
}

export async function signUpWithPassword({ email, password, username }) {
  if (!sb) throw new Error("Supabase not configured");
  if (!email || !password || !username)
    throw new Error("Email, password and username are required.");

  const emailRedirectTo = `${window.location.origin}`; // works for dev & prod

  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { emailRedirectTo },
  });
  if (error) throw error;

  const user = data?.user || null;

  // If email confirmation is ON, there usually won't be a session yet.
  // We can still create the profile row idempotently if Supabase returned a user id.
  if (user?.id) {
    const ins = await sb
      .from("profiles")
      .upsert({ id: user.id, username }, { onConflict: "id" })
      .select("*")
      .single();
    if (ins.error) throw ins.error;
    return { user, profile: ins.data };
  }

  return { user: null, profile: null };
}

export async function signInWithPassword({ email, password }) {
  if (!sb) throw new Error("Supabase not configured");
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data?.user ?? null;
}

export async function signOut() {
  if (!sb) return;
  const { error } = await sb.auth.signOut();
  if (error) throw error;
}

export function onAuthState(cb) {
  if (!sb) return () => {};
  const { data } = sb.auth.onAuthStateChange((event, session) => cb?.(event, session));
  // v2 returns { data: { subscription } }
  return () => data?.subscription?.unsubscribe?.();
}

/* ---------- issues: list / create / upvote / set solved ---------- */
export async function listIssues({
  q = "",
  status = "all",
  tag = "",
  sort = "trending",
} = {}) {
  if (!sb) throw new Error("Supabase not configured");

  // Pull issues + relational aggregate count
  let qy = sb
    .from("issues")
    .select(
      `
      id, description, address, tags, image_url, created_at, solved, created_by,
      uv:issue_upvotes(count)
    `
    );

  if (status !== "all") qy = qy.eq("solved", status === "solved");

  const { data, error } = await qy;
  if (error) throw error;

  // derive upvote count
  let rows =
    (data || []).map((p) => ({
      ...p,
      upvotes: Array.isArray(p.uv) && p.uv[0]?.count ? p.uv[0].count : 0,
    })) ?? [];

  // client-side filters
  const qq = q.toLowerCase();
  const tg = tag.toLowerCase();
  rows = rows.filter((p) => {
    const okQ =
      !qq ||
      p.description?.toLowerCase().includes(qq) ||
      p.address?.toLowerCase().includes(qq) ||
      (p.tags || []).some((t) => t.toLowerCase().includes(qq));
    const okTag = !tg || (p.tags || []).map((t) => t.toLowerCase()).includes(tg);
    return okQ && okTag;
  });

  // sort with derived count
  if (sort === "newest") {
    rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } else if (sort === "most_upvoted" || sort === "trending") {
    rows.sort(
      (a, b) =>
        (b.upvotes || 0) - (a.upvotes || 0) ||
        new Date(b.created_at) - new Date(a.created_at)
    );
  }

  return rows;
}

export async function createIssue({
  description,
  address,
  tags = [],
  imageFile,
  clientNonce,
}) {
  if (!sb) throw new Error("Supabase not configured");

  const { data: { user } = {} } = await sb.auth.getUser();
  if (!user) throw new Error("Sign-in required");

  let image_url = null;
  if (imageFile instanceof File) {
    try {
      const ext = (imageFile.name?.split(".").pop() || "jpg").toLowerCase();
      const path = `issues/${crypto.randomUUID()}.${ext}`;
      const up = await sb.storage
        .from("issues")
        .upload(path, imageFile, { upsert: false });
      if (up.error) throw up.error;
      image_url = sb.storage.from("issues").getPublicUrl(up.data.path).data.publicUrl;
    } catch (e) {
      console.warn(
        "[CivicWatch] Image upload failed; inserting without image:",
        e?.message || e
      );
    }
  }

  const payload = {
    description,
    address,
    tags,
    image_url,
    created_by: user.id,
    client_nonce: clientNonce,
  };

  const up = await sb
    .from("issues")
    .upsert(payload, { onConflict: "client_nonce", ignoreDuplicates: true })
    .select("*");

  if (up.error) throw up.error;

  if (up.data && up.data.length > 0) return up.data[0];

  const existing = await sb
    .from("issues")
    .select("*")
    .eq("client_nonce", clientNonce)
    .single();
  if (existing.error) throw existing.error;
  return existing.data;
}

export async function upvoteIssue(issueId) {
  if (!sb) throw new Error("Supabase not configured");
  const { data: { user } = {} } = await sb.auth.getUser();
  if (!user) throw new Error("Sign-in required");

  const { error } = await sb
    .from("issue_upvotes")
    .insert({ issue_id: issueId, user_id: user.id });

  // ignore unique-violation "duplicate" errors (already upvoted)
  if (error && !`${error.message}`.toLowerCase().includes("duplicate")) throw error;

  return { ok: true };
}

export async function setIssueSolved(issueId, solved) {
  if (!sb) throw new Error("Supabase not configured");
  const { data, error } = await sb.rpc("set_issue_solved", {
    p_issue_id: issueId,
    p_solved: !!solved,
  });
  if (error) throw error;
  return data;
}

/* optional legacy export so old code doesn't crash */
export async function requestMagicLink() {
  throw new Error("Magic link disabled. Use email/password.");
}
