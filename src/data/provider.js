// src/data/provider.js
// Choose between Supabase and Local implementations based on VITE_DATA_MODE.

import * as localApi from "./providers/local.js";
import * as supabaseApi from "./providers/supabase.js";

// Decide which backend to use
const MODE = (import.meta.env.VITE_DATA_MODE || "local").toLowerCase();
const api  = MODE === "supabase" ? supabaseApi : localApi;

// ---- Core data methods (present in both backends) ----
export const listIssues     = api.listIssues;
export const createIssue    = api.createIssue;
export const upvoteIssue    = api.upvoteIssue;
export const setIssueSolved = api.setIssueSolved;

// ---- Auth methods (may be no-ops in local mode) ----
export const getCurrentUser = api.getCurrentUser ?? (async () => null);
export const onAuthState    = api.onAuthState    ?? (() => () => {});
export const signOut        = api.signOut        ?? (async () => {});

// Expose Supabase client when in supabase mode (null in local mode)
export const sb = MODE === "supabase" ? supabaseApi.sb : null;

// ---- Email/password auth (only in supabase mode) ----
const onlyInSupabase = (name) => async () => {
  throw new Error(`${name} is only available when VITE_DATA_MODE=supabase`);
};
export const signInWithPassword = api.signInWithPassword ?? onlyInSupabase("signInWithPassword");
export const signUpWithPassword = api.signUpWithPassword ?? onlyInSupabase("signUpWithPassword");

// ---- Legacy magic-link helper (disabled intentionally) ----
export const requestMagicLink = api.requestMagicLink ?? (async () => {
  throw new Error("Magic link disabled. Use email/password.");
});
