// src/data/providers/local.js
// Very simple local-only fallback. No real auth.

let _issues = [];

export async function getCurrentUser() {
  // Simulate anonymous user
  return { id: "local-user", email: null, profile: { username: "local" } };
}

export function onAuthState() {
  return () => {};
}

export async function listIssues() {
  return _issues.slice().sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0));
}

export async function createIssue({ description, address, tags = [], imageFile, clientNonce }) {
  const rec = {
    id: crypto.randomUUID(),
    description, address, tags,
    image_url: null,
    created_at: new Date().toISOString(),
    upvotes: 0,
    solved: false,
    client_nonce: clientNonce,
  };
  _issues.push(rec);
  return rec;
}

export async function upvoteIssue(issueId) {
  const it = _issues.find(i => i.id === issueId);
  if (it) it.upvotes = (it.upvotes || 0) + 1;
  return { ok: true };
}

export async function setIssueSolved(issueId, solved) {
  const it = _issues.find(i => i.id === issueId);
  if (it) it.solved = !!solved;
  return it;
}

export async function signOut() {
  // nothing in local mode
}
