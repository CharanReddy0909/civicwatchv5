const LS_KEY = "civicwatch.posts.v1";

const load = () => JSON.parse(localStorage.getItem(LS_KEY) || "[]");
const save = (arr) => localStorage.setItem(LS_KEY, JSON.stringify(arr));

export async function getCurrentUser() { return { id: localStorage.getItem("civicwatch.user.v1") || "anon" }; }
export async function signIn()  { return getCurrentUser(); }
export async function signOut() { return true; }

export async function listIssues() {
  // Adapt local keys to API-ish shape
  return load().map(p => ({
    id: p.id,
    description: p.description,
    address: p.address,
    tags: p.tags || [],
    image_url: p.imageDataUrl || null,
    solved: !!p.solved,
    upvotes: p.upvotes || 0,
    created_by: p.submitterId || "anon",
    created_at: new Date(p.createdAt || Date.now()).toISOString(),
    updated_at: new Date(p.createdAt || Date.now()).toISOString(),
    voters: p.voters || [],
  }));
}

export async function createIssue({ description, address, tags = [], imageFile }) {
  const all = load();
  const now = Date.now();
  const id  = Math.random().toString(36).slice(2);
  let imageDataUrl = null;

  if (imageFile && imageFile instanceof File) {
    imageDataUrl = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(imageFile);
    });
  }
  const submitterId = localStorage.getItem("civicwatch.user.v1") || "anon";
  const post = {
    id, description, address, tags, imageDataUrl,
    solved: false, upvotes: 0, voters: [],
    createdAt: now, submitterId
  };
  all.unshift(post);
  save(all);
  return { ...post, image_url: imageDataUrl, created_by: submitterId, created_at: new Date(now).toISOString() };
}

export async function upvoteIssue(issueId, userId) {
  const all = load();
  const i = all.findIndex(p => p.id === issueId);
  if (i < 0) throw new Error("Not found");
  const p = all[i];
  p.voters = p.voters || [];
  if (!p.voters.includes(userId)) {
    p.voters.push(userId);
    p.upvotes = (p.upvotes || 0) + 1;
  }
  save(all);
  return { ok: true };
}

export async function setIssueSolved(issueId, solved) {
  const all = load();
  const i = all.findIndex(p => p.id === issueId);
  if (i < 0) throw new Error("Not found");
  all[i].solved = !!solved;
  save(all);
  return { ok: true };
}
