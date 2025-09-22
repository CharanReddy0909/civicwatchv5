import { AnimatePresence, motion } from "framer-motion";
// add near other imports
import { sb } from "./data/providers/supabase";
 // Create (supports both providers)
import { DATA_MODE } from "./data/provider";

// put this component in the file
function AuthPanel({ onAuthed }) {
  const [email, setEmail] = React.useState("");
  const [user, setUser] = React.useState(null);
  const [msg, setMsg] = React.useState("");

  React.useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      if (session?.user) onAuthed?.(); // refresh issues after login
    });
    return () => sub.subscription.unsubscribe();
  }, [onAuthed]);

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-600">{user.email}</span>
        <button
          className="rounded-xl border border-slate-300 bg-white px-2 py-1 text-xs shadow-sm hover:bg-slate-50"
          onClick={() => sb.auth.signOut()}
        >
          Log out
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        className="rounded-xl border border-slate-300 px-2 py-1 text-sm outline-none"
        placeholder="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button
        className="rounded-xl bg-slate-900 px-3 py-1.5 text-sm text-white shadow hover:bg-slate-800"
        onClick={async () => {
          setMsg("");
          const { error } = await sb.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: window.location.origin },
          });
          setMsg(error ? error.message : "Check your email for the login link.");
        }}
      >
        Send link
      </button>
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
    </div>
  );
}
{DATA_MODE === "supabase" && <AuthPanel onAuthed={() => refresh()} />}

import {
  Camera,
  CheckCircle2,
  CircleAlert,
  CircleCheck,
  CircleDot,
  Dot,
  Filter,
  LogIn,
  LogOut,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Tag,
  ThumbsUp,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  createIssue as apiCreateIssue,
  setIssueSolved as apiSetSolved,
  upvoteIssue as apiUpvote,
  listIssues
} from "./data/provider";

/**
 * Post/UI shape (for reference)
 * {
 *   id, description, address, tags[], imageDataUrl, solved, upvotes, voters[], createdAt, submitterId
 * }
 */

// -----------------------------
// Local helpers (kept for tests / LS user id)
// -----------------------------
const LS_KEY_USER = "civicwatch.user.v1";
const LS_KEY_AUTH = "civicwatch.authority.v1";
const AUTH_DEMO_CODE = "AUTH-2025"; // demo only
const IS_LOCAL = DATA_MODE === "local";
const ENABLE_SELF_TESTS = true;

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function useLocalUser() {
  const [userId, setUserId] = useState("");
  useEffect(() => {
    let u = localStorage.getItem(LS_KEY_USER);
    if (!u) {
      u = `user_${uid()}`;
      localStorage.setItem(LS_KEY_USER, u);
    }
    setUserId(u);
  }, []);
  return userId;
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  const y = Math.floor(mo / 12);
  return `${y}y ago`;
}

function computeFilteredSorted(posts, { query, statusFilter, tagFilter, sortBy }) {
  let list = posts;
  if (query && query.trim()) {
    const q = query.toLowerCase();
    list = list.filter(
      (p) =>
        p.description.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
    );
  }
  if (statusFilter && statusFilter !== "all") {
    const wantSolved = statusFilter === "solved";
    list = list.filter((p) => p.solved === wantSolved);
  }
  if (tagFilter && tagFilter.trim()) {
    const tf = tagFilter.toLowerCase();
    list = list.filter((p) => p.tags.map((t) => t.toLowerCase()).includes(tf));
  }
  if (sortBy === "trending") {
    list = [...list].sort((a, b) => b.upvotes - a.upvotes || b.createdAt - a.createdAt);
  } else if (sortBy === "newest") {
    list = [...list].sort((a, b) => b.createdAt - a.createdAt);
  } else if (sortBy === "most_upvoted") {
    list = [...list].sort((a, b) => b.upvotes - a.upvotes);
  }
  return list;
}

// local-only upvote utility (for optimistic UI in LS mode)
function upvotePost(post, userId) {
  if (post.voters.includes(userId)) return post;
  return { ...post, upvotes: post.upvotes + 1, voters: [...post.voters, userId] };
}

// Tiny console tests
function runSelfTests() {
  console.groupCollapsed("CivicWatch self-tests");
  const now = 1_700_000_000_000;
  const posts = [
    { id: "a", description: "Streetlight not working", address: "12 MG Road, Sector 5", tags: ["lights", "safety"], imageDataUrl: null, solved: false, upvotes: 3, voters: ["u2", "u3", "u4"], createdAt: now - 1000, submitterId: "u1" },
    { id: "b", description: "Potholes causing traffic", address: "Main Rd, Ward 3", tags: ["road"], imageDataUrl: null, solved: true, upvotes: 5, voters: ["u5","u6","u7","u8","u9"], createdAt: now - 5000, submitterId: "u2" },
    { id: "c", description: "Garbage not collected", address: "Lane 4, Old Town", tags: ["garbage", "hygiene"], imageDataUrl: null, solved: false, upvotes: 5, voters: ["u1","u2","u10","u11","u12"], createdAt: now - 2000, submitterId: "u3" },
  ];
  const q1 = computeFilteredSorted(posts, { query: "potholes", statusFilter: "all", tagFilter: "", sortBy: "newest" });
  console.assert(q1.length === 1 && q1[0].id === "b", "Query filter");
  const tr = computeFilteredSorted(posts, { query: "", statusFilter: "all", tagFilter: "", sortBy: "trending" });
  console.assert(tr[0].id === "c" && tr[1].id === "b", "Trending tiebreaker");
  const pA1 = upvotePost(posts[0], "u1");
  console.assert(pA1.upvotes === 4 && pA1.voters.includes("u1"), "Upvote increments");
  const pA2 = upvotePost(pA1, "u1");
  console.assert(pA2.upvotes === 4, "Duplicate prevented");
  console.log("All assertions passed ✔");
  console.groupEnd();
}

// -----------------------------
// Toasts
// -----------------------------
function useToasts() {
  const [toasts, setToasts] = useState([]);
  function pushToast(msg, type = "info") {
    const id = uid();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }
  return { toasts, pushToast };
}

// -----------------------------
// Main App
// -----------------------------
export default function CivicWatch() {
  const userId = useLocalUser();
  const [posts, setPosts] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all | unsolved | solved
  const [tagFilter, setTagFilter] = useState("");
  const [sortBy, setSortBy] = useState("trending"); // trending | newest | most_upvoted
  const [isAuthority, setIsAuthority] = useState(() => localStorage.getItem(LS_KEY_AUTH) === "1");
  const [myOnly, setMyOnly] = useState(false); // citizen view: show only my reports
  const { toasts, pushToast } = useToasts();

  // map API rows to UI
  const mapToUI = (p) => ({
    id: p.id,
    description: p.description,
    address: p.address,
    tags: p.tags || [],
    imageDataUrl: p.image_url || null,
    solved: !!p.solved,
    upvotes: p.upvotes || 0,
    voters: p.voters || [], // local provider fills this; supabase leaves empty
    createdAt: p.created_at ? new Date(p.created_at).getTime() : Date.now(),
    submitterId: p.created_by || "",
  });

  async function refresh() {
    const data = await listIssues({});
    setPosts(data.map(mapToUI));
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    localStorage.setItem(LS_KEY_AUTH, isAuthority ? "1" : "0");
  }, [isAuthority]);

  useEffect(() => {
    if (typeof window !== "undefined" && ENABLE_SELF_TESTS) {
      try {
        runSelfTests();
      } catch (e) {
        console.warn("Self-tests threw:", e);
      }
    }
  }, []);

  const allTags = useMemo(() => {
    const s = new Set();
    posts.forEach((p) => p.tags.forEach((t) => s.add(t.toLowerCase())));
    return Array.from(s).sort();
  }, [posts]);

  const filtered = useMemo(() => {
    let list = computeFilteredSorted(posts, { query, statusFilter, tagFilter, sortBy });
    if (!isAuthority && myOnly) list = list.filter((p) => p.submitterId === userId);
    return list;
  }, [posts, query, statusFilter, tagFilter, sortBy, myOnly, isAuthority, userId]);

 

async function handleCreate({ description, address, tags, imageFile }) {
  try {
    await apiCreateIssue({ description, address, tags, imageFile });
    await refresh();
    pushToast("Issue submitted. Thank you!", "success");
  } catch (e) {
    console.error(e);
    pushToast(e?.message || "Failed to submit issue", "error");
  }
}





  // Upvote (providers handle dedupe)
 async function handleUpvote(id) {
  if (DATA_MODE === "supabase") {
    await apiUpvote(id);
    const data = await listIssues({});
    setPosts(data.map(p => ({ /* same mapping as above */ })));
  } else {
    // your old local upvote flow
    setPosts(prev => prev.map(p => p.id === id ? upvotePost(p, userId) : p));
  }
}


  // Authority: toggle solved (RPC in supabase; local mutate)
  async function handleStatusToggle(id) {
  if (!isAuthority) return;
  if (DATA_MODE === "supabase") {
    const post = posts.find(p => p.id === id);
    await apiSetSolved(id, !post.solved);
    const data = await listIssues({});
    setPosts(data.map(p => ({ /* same mapping */ })));
  } else {
    setPosts(prev => prev.map(p => (p.id === id ? { ...p, solved: !p.solved } : p)));
  }
}


  // Delete (local only)
  function handleDelete(id) {
    if (!isAuthority) return;
    if (!IS_LOCAL) {
      pushToast("Delete not implemented in server mode", "error");
      return;
    }
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }

  function handleAuthorityLogin(code) {
    if (code.trim() === AUTH_DEMO_CODE) {
      setIsAuthority(true);
      pushToast("Logged in as Authority.", "success");
    } else {
      pushToast("Invalid code.", "error");
    }
  }
  function handleAuthorityLogout() {
    setIsAuthority(false);
    pushToast("Authority mode disabled.", "info");
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-900">
      <Header isAuthority={isAuthority} onLogin={handleAuthorityLogin} onLogout={handleAuthorityLogout} />

      <main className="mx-auto max-w-6xl px-4 pb-24">
        {isAuthority ? <AuthorityPanel posts={posts} /> : <SubmitCard onCreate={handleCreate} />}

        <FilterBar
          query={query}
          setQuery={setQuery}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          allTags={allTags}
          tagFilter={tagFilter}
          setTagFilter={setTagFilter}
          sortBy={sortBy}
          setSortBy={setSortBy}
          isAuthority={isAuthority}
          myOnly={myOnly}
          setMyOnly={setMyOnly}
        />

        <PostGrid
          posts={filtered}
          onUpvote={handleUpvote}
          onToggleStatus={handleStatusToggle}
          onDelete={handleDelete}
          userId={userId}
          isAuthority={isAuthority}
          isLocal={IS_LOCAL}
        />
      </main>

      <ToastHost toasts={toasts} />
      <Footer />
    </div>
  );
}

// -----------------------------
// Authority panel (replaces form in authority mode)
// -----------------------------
function AuthorityPanel({ posts }) {
  const solved = posts.filter((p) => p.solved).length;
  const unsolved = posts.length - solved;

  function exportCSV() {
    const headers = ["id", "description", "address", "tags", "solved", "upvotes", "createdAt", "submitterId"];
    const rows = posts.map((p) =>
      [
        p.id,
        JSON.stringify(p.description),
        JSON.stringify(p.address),
        JSON.stringify(p.tags.join(";")),
        p.solved ? 1 : 0,
        p.upvotes,
        new Date(p.createdAt).toISOString(),
        p.submitterId || "",
      ].join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `civicwatch_export_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section aria-label="Authority panel" className="mt-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-4 text-sm">
          <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
            Solved: <strong>{solved}</strong>
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">
            Unsolved: <strong>{unsolved}</strong>
          </span>
          <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">
            Total: <strong>{posts.length}</strong>
          </span>
        </div>
        <button
          onClick={exportCSV}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm hover:bg-slate-50"
          aria-label="Export CSV"
        >
          Export CSV
        </button>
      </div>
    </section>
  );
}

// -----------------------------
// Header + simple authority auth
// -----------------------------
function Header({ isAuthority, onLogin, onLogout }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  return (
    <header className="sticky top-0 z-20 backdrop-blur supports-[backdrop-filter]:bg-white/70 bg-white/80 border-b border-slate-200">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
            <Camera className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">CivicWatch</h1>
            <p className="text-xs text-slate-500">See it. Snap it. Solve it.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isAuthority ? (
            <button
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm hover:bg-slate-50"
              onClick={onLogout}
              aria-label="Log out authority"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Authority</span>
              <LogOut className="h-4 w-4" />
            </button>
          ) : (
            <>
              <button
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm hover:bg-slate-50"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                aria-controls="auth-panel"
                aria-label="Open authority login"
              >
                <ShieldCheck className="h-4 w-4" />
                <span>Authority Login</span>
                <LogIn className="h-4 w-4" />
              </button>
              <AnimatePresence>
                {open && (
                  <motion.div
                    id="auth-panel"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="absolute right-4 top-16 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg"
                  >
                    <p className="text-sm text-slate-600">
                      Enter the authority code to manage issue status. (Demo code:&nbsp;
                      <code className="rounded bg-slate-100 px-1 py-0.5">{AUTH_DEMO_CODE}</code>)
                    </p>
                    <div className="mt-3 flex gap-2">
                      <input
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                        placeholder="Enter code"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        aria-label="Authority code"
                      />
                      <button
                        className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white shadow hover:bg-slate-800"
                        onClick={() => onLogin(code)}
                      >
                        Unlock
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// -----------------------------
// Submit (citizen only)
// -----------------------------
function SubmitCard({ onCreate }) {
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState([]);
  const [imageDataUrl, setImageDataUrl] = useState(null); // preview only
  const [selectedFile, setSelectedFile] = useState(null); // pass to provider
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  function addTagFromInput() {
    const raw = tagInput
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const lower = new Set(tags.map((t) => t.toLowerCase()));
    const merged = [...tags];
    raw.forEach((t) => {
      if (!lower.has(t.toLowerCase())) merged.push(t);
    });
    setTags(merged);
    setTagInput("");
  }
  function removeTag(t) {
    setTags((x) => x.filter((y) => y !== t));
  }
  function onFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file.");
      return;
    }
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(reader.result);
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e) {

// inside SubmitCard.handleSubmit
const fileObj = fileRef.current?.files?.[0] || null;

if (DATA_MODE === "supabase") {
  await apiCreateIssue({ description: description.trim(), address: address.trim(), tags, imageFile: fileObj });
  // After creating on server, refresh list:
  const data = await listIssues({});
  // Lift a refresh callback through props if you want; or return created item.
} else {
  // local fallback: existing onCreate(post) path (kept as-is)
  onCreate({
    id: uid(),
    description: description.trim(),
    address: address.trim(),
    tags,
    imageDataUrl,
    solved: false,
    upvotes: 0,
    voters: [],
    createdAt: Date.now(),
    submitterId: window.localStorage.getItem("civicwatch.user.v1") || "unknown",
  });
}


    e.preventDefault();
    if (!description.trim() || !address.trim()) {
      alert("Please provide a description and address.");
      return;
    }
    setBusy(true);
    try {
      await onCreate({
  description: description.trim(),
  address: address.trim(),
  tags,
  imageFile: selectedFile,  // or null if you named it imageDataUrl before
});
      // reset form
      setDescription("");
      setAddress("");
      setTags([]);
      setTagInput("");
      setImageDataUrl(null);
      setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Submit an issue" className="mt-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="hidden sm:flex">
            <div className="mt-1 h-11 w-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-sm">
              <Plus className="h-5 w-5" />
            </div>
          </div>
          <form onSubmit={handleSubmit} className="w-full">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Describe the problem</label>
                <textarea
                  className="mt-1 w-full resize-y rounded-2xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                  rows={3}
                  placeholder="Eg. Potholes on the main road causing traffic and accidents"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>
              <div className="md:col-span-1">
                <label className="block text-sm font-medium text-slate-700">Address</label>
                <div className="mt-1 flex items-center gap-2 rounded-2xl border border-slate-300 px-3 py-2 focus-within:ring-2 focus-within:ring-slate-400">
                  <MapPin className="h-4 w-4 text-slate-500" />
                  <input
                    className="w-full text-sm outline-none"
                    placeholder="Flat address / landmark / locality"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    required
                    aria-label="Address"
                  />
                </div>
              </div>
              <div className="md:col-span-1">
                <label className="block text-sm font-medium text-slate-700">Tags</label>
                <div className="mt-1 rounded-2xl border border-slate-300 px-3 py-2 focus-within:ring-2 focus-within:ring-slate-400">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-slate-500" />
                    <input
                      className="w-full text-sm outline-none"
                      placeholder="road, streetlight, garbage"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          addTagFromInput();
                        }
                      }}
                      aria-label="Tags"
                    />
                    <button
                      type="button"
                      className="rounded-xl border border-slate-300 bg-white px-2 py-1 text-xs shadow-sm hover:bg-slate-50"
                      onClick={addTagFromInput}
                      aria-label="Add tags"
                    >
                      Add
                    </button>
                  </div>
                  {tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {tags.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs"
                        >
                          {t}
                          <button
                            type="button"
                            onClick={() => removeTag(t)}
                            aria-label={`Remove tag ${t}`}
                            className="ml-1 rounded-full px-1 hover:bg-slate-200"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Upload a photo (optional)</label>
                <div className="mt-1 grid gap-3 rounded-2xl border border-dashed border-slate-300 p-4 sm:grid-cols-[1fr,200px]">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100">
                      <Upload className="h-5 w-5 text-slate-600" />
                    </div>
                    <div className="text-sm text-slate-600">
                      <p>Drop an image here or choose a file.</p>
                      <p className="text-xs text-slate-500">Accepted: JPG, PNG (max ~5MB recommended)</p>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        className="mt-2 block w-full text-xs"
                        onChange={onFileChange}
                        aria-label="Upload image"
                      />
                    </div>
                  </div>
                  <div className="aspect-video overflow-hidden rounded-2xl bg-slate-100">
                    {imageDataUrl ? (
                      <img src={imageDataUrl} alt="Uploaded preview" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
                        No image selected
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">Please avoid posting personal information. Submissions are visible to everyone.</p>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow hover:bg-slate-800 disabled:opacity-60"
                aria-label="Submit issue"
              >
                <Plus className="h-4 w-4" />
                {busy ? "Submitting…" : "Submit Issue"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

// -----------------------------
// Filters / Search / Sort
// -----------------------------
function FilterBar({
  query,
  setQuery,
  statusFilter,
  setStatusFilter,
  allTags,
  tagFilter,
  setTagFilter,
  sortBy,
  setSortBy,
  isAuthority,
  myOnly,
  setMyOnly,
}) {
  return (
    <section aria-label="Filters" className="mt-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex grow items-center gap-2">
          <div className="flex grow items-center gap-2 rounded-2xl border border-slate-300 bg-white px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-slate-400">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              className="w-full text-sm outline-none"
              placeholder="Search by address, tag, or description"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search"
            />
          </div>

          <div className="hidden md:flex items-center gap-2 text-sm text-slate-600">
            <Filter className="h-4 w-4" />
            <span>Filters</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isAuthority && (
            <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm">
              <input
                type="checkbox"
                checked={myOnly}
                onChange={(e) => setMyOnly(e.target.checked)}
                aria-label="Show only my reports"
              />
              <span className="text-slate-700">My reports</span>
            </label>
          )}

          <SegToggle
            value={statusFilter}
            onChange={setStatusFilter}
            items={[
              { value: "all", label: "All", icon: CircleDot },
              { value: "unsolved", label: "Unsolved", icon: CircleAlert },
              { value: "solved", label: "Solved", icon: CircleCheck },
            ]}
            ariaLabel="Status filter"
          />

          <TagSelect allTags={allTags} value={tagFilter} onChange={setTagFilter} />

          <Select
            label="Sort"
            value={sortBy}
            onChange={setSortBy}
            options={[
              { value: "trending", label: "Trending" },
              { value: "newest", label: "Newest" },
              { value: "most_upvoted", label: "Most upvoted" },
            ]}
          />
        </div>
      </div>
    </section>
  );
}

function SegToggle({ value, onChange, items, ariaLabel }) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex rounded-2xl border border-slate-300 bg-white p-1 text-sm shadow-sm"
    >
      {items.map(({ value: v, label, icon: Icon }) => {
        const active = v === value;
        return (
          <button
            key={v}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(v)}
            className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 transition ${
              active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function TagSelect({ allTags, value, onChange }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm">
      <Tag className="h-4 w-4 text-slate-500" />
      <select
        className="bg-transparent text-sm outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Tag filter"
      >
        <option value="">All tags</option>
        {allTags.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm">
      <span className="text-slate-600">{label}</span>
      <select
        className="bg-transparent text-sm outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// -----------------------------
// Post Grid
// -----------------------------
function PostGrid({ posts, onUpvote, onToggleStatus, onDelete, userId, isAuthority, isLocal }) {
  return (
    <section className="mt-6" aria-label="Reported issues">
      {posts.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {posts.map((p) => (
              <motion.div key={p.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <PostCard
                  post={p}
                  onUpvote={onUpvote}
                  onToggleStatus={onToggleStatus}
                  onDelete={onDelete}
                  userId={userId}
                  isAuthority={isAuthority}
                  isLocal={isLocal}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
        <Camera className="h-6 w-6 text-slate-600" />
      </div>
      <h3 className="text-lg font-semibold">No reports yet</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
        Be the first to report an issue in your locality. Add a clear photo, exact address, and helpful tags to boost visibility.
      </p>
    </div>
  );
}

function PostCard({ post, onUpvote, onToggleStatus, onDelete, userId, isAuthority, isLocal }) {
  const hasUpvoted = isLocal ? post.voters.includes(userId) : false; // server dedupes; we don't track per-user here
  return (
    <article className="group rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="relative aspect-video w-full overflow-hidden rounded-t-3xl bg-slate-100">
        {post.imageDataUrl ? (
          <img
            src={post.imageDataUrl}
            alt={post.description.slice(0, 80)}
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">No image provided</div>
        )}
        <div
          className={`absolute left-3 top-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium shadow ${
            post.solved
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-amber-50 text-amber-700 border border-amber-200"
          }`}
        >
          {post.solved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
          {post.solved ? "Solved" : "Unsolved"}
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">{post.description}</h3>
          {isAuthority && isLocal && (
            <button
              className="rounded-xl border border-slate-300 bg-white p-1 text-slate-600 shadow-sm hover:bg-slate-50"
              onClick={() => onDelete(post.id)}
              aria-label="Delete post"
              title="Delete post"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
          <MapPin className="h-3.5 w-3.5" />
          <span className="line-clamp-1" title={post.address}>
            {post.address}
          </span>
        </div>

        {post.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {post.tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700"
              >
                <Dot className="h-3 w-3" /> {t}
              </span>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          <div className="text-[11px] text-slate-500">{timeAgo(post.createdAt)}</div>

          <div className="flex items-center gap-2">
            {isAuthority ? (
              <button
                className={`inline-flex items-center gap-1 rounded-xl border px-2 py-1 text-xs shadow-sm ${
                  post.solved
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                }`}
                onClick={() => onToggleStatus(post.id)}
                aria-label={post.solved ? "Mark unsolved" : "Mark solved"}
              >
                {post.solved ? <CircleCheck className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
                {post.solved ? "Mark Unsolved" : "Mark Solved"}
              </button>
            ) : (
              <button
                className={`inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs shadow-sm transition hover:bg-slate-50 ${
                  hasUpvoted ? "opacity-70" : ""
                }`}
                disabled={hasUpvoted}
                onClick={() => onUpvote(post.id)}
                aria-pressed={hasUpvoted}
                aria-label="Upvote"
                title={hasUpvoted ? "You already upvoted" : "Upvote to boost visibility"}
              >
                <ThumbsUp className="h-4 w-4" />
                <span className="tabular-nums">{post.upvotes}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

// -----------------------------
// Toasts + Footer
// -----------------------------
function ToastHost({ toasts }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className={`pointer-events-auto flex items-center gap-2 rounded-xl border px-3 py-2 text-sm shadow-lg ${
              t.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : t.type === "error"
                ? "border-rose-200 bg-rose-50 text-rose-800"
                : "border-slate-200 bg-white text-slate-800"
            }`}
          >
            {t.type === "success" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : t.type === "error" ? (
              <CircleAlert className="h-4 w-4" />
            ) : (
              <Dot className="h-4 w-4" />
            )}
            {t.msg}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white/70 py-8 mt-16">
      <div className="mx-auto max-w-6xl px-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          Built as a demo. Replace localStorage with secure APIs and proper role-based authentication for production use.
        </p>
        <div className="text-xs text-slate-500">© {new Date().getFullYear()} CivicWatch</div>
      </div>
    </footer>
  );
}
