import { createClient } from "@supabase/supabase-js";

const url  = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

function isValidHttpUrl(s) {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// Only create the client when both vars exist AND the URL is valid
export const sb =
  url && anon && isValidHttpUrl(url) ? createClient(url, anon) : null;

if (!sb) {
  console.error(
    "[CivicWatch] Supabase not configured correctly. " +
      "Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local " +
      "(and restart the dev server)."
  );
}

export async function getCurrentUser() {
  if (!sb) return null;
  const { data: { user } } = await sb.auth.getUser();
  return user ?? null;
}

export async function listIssues(params = {}) {
  if (!sb) throw new Error("Supabase not configured");
  let qy = sb.from("issues").select("*");
  if (params.status && params.status !== "all") qy = qy.eq("solved", params.status === "solved");
  const sort = params.sort || "trending";
  if (sort === "newest") qy = qy.order("created_at", { ascending: false });
  else qy = qy.order("upvotes", { ascending: false }).order("created_at", { ascending: false });
  const { data, error } = await qy;
  if (error) throw error;

  const q = (params.q || "").toLowerCase();
  const tag = (params.tag || "").toLowerCase();
  return data.filter(p => {
    const okQ = !q || p.description.toLowerCase().includes(q) ||
      p.address.toLowerCase().includes(q) || (p.tags || []).some(t => t.toLowerCase().includes(q));
    const okTag = !tag || (p.tags || []).map(t => t.toLowerCase()).includes(tag);
    return okQ && okTag;
  });
}

export async function createIssue({ description, address, tags = [], imageFile }) {
  if (!sb) throw new Error("Supabase not configured");

  // Require login so RLS passes
  const { data: { user }, error: uErr } = await sb.auth.getUser();
  if (uErr) throw uErr;
  if (!user) throw new Error("Sign-in required");

  let image_url = null;

  // Best-effort image upload: warn but DON'T block the DB insert
  if (imageFile instanceof File) {
    try {
      const ext = (imageFile.name?.split(".").pop() || "jpg").toLowerCase();
      const path = `issues/${crypto.randomUUID()}.${ext}`;
      const up = await sb.storage.from("issues").upload(path, imageFile, { upsert: false });
      if (up.error) throw up.error;
      image_url = sb.storage.from("issues").getPublicUrl(up.data.path).data.publicUrl;
    } catch (e) {
      console.warn("[CivicWatch] Image upload failed; inserting row without image:", e?.message || e);
      // continue with image_url = null
    }
  }

  // Insert row (explicitly set created_by to satisfy policy)
  const { data, error } = await sb
    .from("issues")
    .insert({ description, address, tags, image_url, created_by: user.id })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}



export async function upvoteIssue(issueId) {
  if (!sb) throw new Error("Supabase not configured");
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) throw new Error("Sign-in required");
  const { error } = await sb.from("issue_upvotes").insert({ issue_id: issueId, user_id: u.user.id });
  if (error && !`${error.message}`.toLowerCase().includes("duplicate")) throw error;
  return { ok: true };
}

export async function setIssueSolved(issueId, solved) {
  if (!sb) throw new Error("Supabase not configured");
  const { data, error } = await sb.rpc("set_issue_solved", { p_issue_id: issueId, p_solved: !!solved });
  if (error) throw error;
  return data;
}

export async function signIn() { /* optional */ }
export async function signOut() { /* optional */ }
