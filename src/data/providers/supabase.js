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

export async function createIssue({ description, address, tags = [], imageFile, clientNonce }) {
  if (!sb) throw new Error("Supabase not configured");

  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Sign-in required");

  let image_url = null;
  if (imageFile instanceof File) {
    try {
      const ext = (imageFile.name?.split(".").pop() || "jpg").toLowerCase();
      const path = `issues/${crypto.randomUUID()}.${ext}`;
      const up = await sb.storage.from("issues").upload(path, imageFile, { upsert: false });
      if (up.error) throw up.error;
      image_url = sb.storage.from("issues").getPublicUrl(up.data.path).data.publicUrl;
    } catch (e) {
      console.warn("[CivicWatch] Image upload failed; inserting without image:", e?.message || e);
    }
  }

  const payload = {
    description,
    address,
    tags,
    image_url,
    created_by: user.id,
    client_nonce: clientNonce,           // <-- IMPORTANT
  };

  // Upsert against the UNIQUE CONSTRAINT on client_nonce
  // Note: with ignoreDuplicates=true, PostgREST returns [] (no row) on duplicate.
  const upsert = await sb
    .from("issues")
    .upsert(payload, { onConflict: "client_nonce", ignoreDuplicates: true })
    .select("*");

  if (upsert.error) throw upsert.error;

  if (upsert.data && upsert.data.length > 0) {
    // Freshly inserted row
    return upsert.data[0];
  }

  // It was a duplicate (same nonce). Fetch the existing row once.
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

// ADD these exports near the bottom of src/data/providers/supabase.js

// Start email magic-link sign-in. Opens user's email; they click link → back to your site.
export async function requestMagicLink(email) {
  if (!sb) throw new Error("Supabase not configured");
  const redirectTo = window.location.origin; // works local & prod
  const { data, error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo }
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  if (!sb) return;
  await sb.auth.signOut();
}

// OPTIONAL: keep UI in sync if session changes in another tab
export function onAuthState(cb) {
  if (!sb) return () => {};
  const { data: sub } = sb.auth.onAuthStateChange((_e, _session) => cb?.());
  return () => sub?.subscription?.unsubscribe();
}


export async function signIn() { /* optional */ }
export async function signOut() { /* optional */ }
