export const DATA_MODE = import.meta.env.VITE_DATA_MODE ?? "local";
// Switch implementations without touching the UI
import * as local from "./providers/local";
import * as sb from "./providers/supabase";

const impl = DATA_MODE === "supabase" ? sb : local;

export const listIssues   = impl.listIssues;
export const createIssue  = impl.createIssue;
export const upvoteIssue  = impl.upvoteIssue;
export const setIssueSolved = impl.setIssueSolved; // authority only
export const getCurrentUser = impl.getCurrentUser;
export const signIn = impl.signIn;
export const signOut = impl.signOut;
