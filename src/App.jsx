import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  createIssue as apiCreateIssue,
  setIssueSolved as apiSetSolved,
  upvoteIssue as apiUpvote,
  listIssues
} from "./data/provider";

import {
  Camera,
  CheckCircle2,
  CircleAlert,
  CircleCheck,
  CircleDot,
  Dot,
  Filter,
  LogOut,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Tag,
  ThumbsUp,
  Upload,
} from "lucide-react";

/**
 * NOTE: Prevents duplicate submissions by:
 * - guarding the form (busy + submittingRef)
 * - passing a clientNonce to the provider (DB upsert on UNIQUE constraint)
 * - reloading from API after insert (no optimistic local add)
 */

// -----------------------------
// Tiny helpers
// -----------------------------
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
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
  let list = posts || [];
  if (query && query.trim()) {
    const q = query.toLowerCase();
    list = list.filter(
      (p) =>
        p.description?.toLowerCase().includes(q) ||
        p.address?.toLowerCase().includes(q) ||
        (p.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  }
  if (statusFilter && statusFilter !== "all") {
    const wantSolved = statusFilter === "solved";
    list = list.filter((p) => !!p.solved === wantSolved);
  }
  if (tagFilter && tagFilter.trim()) {
    const tf = tagFilter.toLowerCase();
    list = list.filter((p) => (p.tags || []).map((t) => t.toLowerCase()).includes(tf));
  }
  if (sortBy === "trending") {
    list = [...list].sort(
      (a, b) =>
        (b.upvotes || 0) - (a.upvotes || 0) ||
        (b.created_at || b.createdAt || 0) - (a.created_at || a.createdAt || 0)
    );
  } else if (sortBy === "newest") {
    list = [...list].sort(
      (a, b) => (b.created_at || b.createdAt || 0) - (a.created_at || a.createdAt || 0)
    );
  } else if (sortBy === "most_upvoted") {
    list = [...list].sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0));
  }
  return list;
}

// -----------------------------
// Toasts
// -----------------------------
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const pushToast = (msg, type = "info") => {
    const id = uid();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  };
  return { toasts, pushToast };
}

// -----------------------------
// Auth panel
// -----------------------------
function AuthPanel({ me, onLoggedOut, toast }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("signin"); // 'signin' | 'signup'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSignin() {
    try {
      setBusy(true);
      const { signInWithPassword } = await import("./data/provider");
      await signInWithPassword({ email: email.trim(), password });
      toast?.("Signed in!", "success");
      setOpen(false);
    } catch (e) {
      toast?.(e?.message || "Sign in failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignup() {
    if (!username.trim()) return toast?.("Please enter a username", "error");
    if (password.length < 6) return toast?.("Password must be at least 6 characters", "error");
    if (password !== confirm) return toast?.("Passwords do not match", "error");
    try {
      setBusy(true);
      const { signUpWithPassword } = await import("./data/provider");
      await signUpWithPassword({ email: email.trim(), password, username: username.trim() });
      toast?.("Account created! You are now signed in.", "success");
      setOpen(false);
    } catch (e) {
      toast?.(e?.message || "Sign up failed", "error");
    } finally {
      setBusy(false);
    }
  }

 



// async function doLogout() {
//   try {
//     const { signOut, getCurrentUser } = await import("./data/provider");
//     await signOut();

//     // Clean any auth params/hash from the URL
//     if (window.location.hash || window.location.search) {
//       window.history.replaceState({}, "", window.location.pathname);
//     }

//     // Force-check current user and update UI
//     const u = await getCurrentUser();
//     if (u) {
//       // Fallback: hard reload if session still appears (rare)
//       window.location.reload();
//     } else {
//       onLoggedOut?.(); // e.g., your onLoggedOut calls window.location.reload() or setMe(null)
//     }
//   } catch (e) {
//     toast?.(e?.message || "Sign out failed", "error");
//   }
// }





async function doLogout() {
  try {
    const { signOut } = await import("./data/provider");
    await signOut();                  // clears session
    setOpen(false);                   // close the menu
    // optional: clean hash/query without a full reload
    if (window.location.hash || window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    // No manual reload needed — the onAuthState listener will set me=null
    toast?.("Signed out", "success");
  } catch (e) {
    toast?.(e?.message || "Sign out failed", "error");
  }
}








  return (
    <div className="relative">
      {me?.email ? (
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline text-xs text-slate-600">
            {me.profile?.username ? `${me.profile.username} · ` : ""}{me.email}
          </span>
          <button
            onClick={doLogout}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={() => setOpen(v => !v)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm hover:bg-slate-50"
          >
            <ShieldCheck className="h-4 w-4" /> Sign in / up
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-[22rem] rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
              <div className="mb-3 flex gap-2 text-sm">
                <button
                  className={`rounded-lg px-3 py-1 ${mode === "signin" ? "bg-slate-900 text-white" : "bg-slate-100"}`}
                  onClick={() => setMode("signin")}
                >
                  Sign in
                </button>
                <button
                  className={`rounded-lg px-3 py-1 ${mode === "signup" ? "bg-slate-900 text-white" : "bg-slate-100"}`}
                  onClick={() => setMode("signup")}
                >
                  Sign up
                </button>
              </div>

              {mode === "signup" && (
                <div className="mb-2">
                  <label className="block text-xs text-slate-600">Username</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                    placeholder="yourname"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
              )}

              <div className="mb-2">
                <label className="block text-xs text-slate-600">Email</label>
                <input
                  type="email"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="mb-2">
                <label className="block text-xs text-slate-600">Password</label>
                <input
                  type="password"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {mode === "signup" && (
                <div className="mb-3">
                  <label className="block text-xs text-slate-600">Confirm Password</label>
                  <input
                    type="password"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                    placeholder="••••••••"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
              )}

              <div className="mt-3 flex justify-end gap-2">
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
                {mode === "signin" ? (
                  <button
                    onClick={handleSignin}
                    disabled={busy}
                    className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white shadow hover:bg-slate-800 disabled:opacity-60"
                  >
                    {busy ? "Signing in…" : "Sign in"}
                  </button>
                ) : (
                  <button
                    onClick={handleSignup}
                    disabled={busy}
                    className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white shadow hover:bg-slate-800 disabled:opacity-60"
                  >
                    {busy ? "Creating…" : "Create account"}
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}


// -----------------------------
// Main App
// -----------------------------
export default function CivicWatch() {
  const [posts, setPosts] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("");
  const [sortBy, setSortBy] = useState("trending");
  const [isAuthority, setIsAuthority] = useState(false);
  const [myOnly, setMyOnly] = useState(false);
  const [me, setMe] = useState(null);
  const { toasts, pushToast } = useToasts();

  async function refresh() {
    try {
      const list = await listIssues({
        q: query,
        status: statusFilter,
        tag: tagFilter,
        sort: sortBy,
      });
      setPosts(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error(e);
      pushToast(e?.message || "Failed to load issues", "error");
    }
  }



// useEffect(() => {
//   let off = () => {};
//   (async () => {
//     const { onAuthState, getCurrentUser } = await import("./data/provider");
//     off = onAuthState(async () => {
//       const u = await getCurrentUser();
//       setMe(u || null);
//       // Optional: also refresh the list after sign-in/out
//       await refresh();
//     });
//   })();
//   return () => off();
// }, []);






useEffect(() => {
  let off = () => {};
  (async () => {
    const { getCurrentUser, onAuthState } = await import("./data/provider");

    const u = await getCurrentUser();
    setMe(u || null);
    await refresh();

    off = onAuthState(async () => {
      const u2 = await getCurrentUser();
      setMe(u2 || null);
      await refresh();
    });
  })();

  return () => off();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);










 

  const allTags = useMemo(() => {
    const s = new Set();
    posts.forEach((p) => (p.tags || []).forEach((t) => s.add((t || "").toLowerCase())));
    return Array.from(s).sort();
  }, [posts]);

  const filtered = useMemo(() => {
    let list = computeFilteredSorted(posts, { query, statusFilter, tagFilter, sortBy });
    if (myOnly && me?.id) list = list.filter((p) => (p.created_by || p.submitterId) === me.id);
    return list;
  }, [posts, query, statusFilter, tagFilter, sortBy, myOnly, me]);

  async function handleCreate({ description, address, tags, imageFile, clientNonce }) {
    try {
      await apiCreateIssue({ description, address, tags, imageFile, clientNonce });
      await refresh();
      pushToast("Issue submitted. Thank you!", "success");
    } catch (e) {
      console.error(e);
      pushToast(e?.message || "Failed to submit issue", "error");
    }
  }

  async function handleUpvote(id) {
    try {
      await apiUpvote(id);
      await refresh();
    } catch (e) {
      console.error(e);
      pushToast(e?.message || "Failed to upvote", "error");
    }
  }

  async function handleStatusToggle(id, newVal) {
    try {
      await apiSetSolved(id, newVal);
      await refresh();
    } catch (e) {
      console.error(e);
      pushToast(e?.message || "Failed to change status", "error");
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-900">
      <Header me={me} toast={pushToast} />

      <main className="mx-auto max-w-6xl px-4 pb-24">
        <SubmitCard onCreate={handleCreate} />

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
          onToggleStatus={(id, val) => handleStatusToggle(id, val)}
          userId={me?.id || ""}
          isAuthority={isAuthority}
        />
      </main>

      <ToastHost toasts={toasts} />
      <Footer />
    </div>
  );
}

// -----------------------------
// Header
// -----------------------------
function Header({ me, toast }) {
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

        <AuthPanel
          me={me}
          toast={toast}
          onLoggedOut={() => window.location.reload()}
        />
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
  const [imageDataUrl, setImageDataUrl] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const submittingRef = useRef(false);
  const nonceRef = useRef(null);

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
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    if (!file) {
      setImageDataUrl(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(reader.result);
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submittingRef.current) return; // hard guard
    submittingRef.current = true;

    if (!nonceRef.current) nonceRef.current = crypto.randomUUID();

    if (!description.trim() || !address.trim()) {
      alert("Please provide a description and address.");
      submittingRef.current = false;
      return;
    }

    setBusy(true);
    try {
      await onCreate({
        description: description.trim(),
        address: address.trim(),
        tags,
        imageFile: selectedFile,
        clientNonce: nonceRef.current,
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
      nonceRef.current = null; // new nonce for next submit
      submittingRef.current = false;
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
                      <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">No image selected</div>
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
          <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm">
            <input
              type="checkbox"
              checked={myOnly}
              onChange={(e) => setMyOnly(e.target.checked)}
              aria-label="Show only my reports"
            />
            <span className="text-slate-700">My reports</span>
          </label>

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
    <div role="tablist" aria-label={ariaLabel} className="inline-flex rounded-2xl border border-slate-300 bg-white p-1 text-sm shadow-sm">
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
function PostGrid({ posts, onUpvote, onToggleStatus, userId, isAuthority }) {
  return (
    <section className="mt-6" aria-label="Reported issues">
      {posts.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {posts.map((p) => (
              <motion.div
                key={p.id || p.client_nonce || uid()}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <PostCard
                  post={p}
                  onUpvote={onUpvote}
                  onToggleStatus={onToggleStatus}
                  userId={userId}
                  isAuthority={isAuthority}
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

function PostCard({ post, onUpvote, onToggleStatus, userId, isAuthority }) {
  const hasUpvoteCount = typeof post.upvotes === "number";
  return (
    <article className="group rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="relative aspect-video w-full overflow-hidden rounded-t-3xl bg-slate-100">
        {post.image_url || post.imageDataUrl ? (
          <img
            src={post.image_url || post.imageDataUrl}
            alt={post.description?.slice(0, 80) || "Issue image"}
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
          {isAuthority && (
            <button
              className={`inline-flex items-center gap-1 rounded-xl border px-2 py-1 text-xs shadow-sm ${
                post.solved
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
              }`}
              onClick={() => onToggleStatus(post.id, !post.solved)}
              aria-label={post.solved ? "Mark unsolved" : "Mark solved"}
            >
              {post.solved ? <CircleCheck className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
              {post.solved ? "Mark Unsolved" : "Mark Solved"}
            </button>
          )}
        </div>

        <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
          <MapPin className="h-3.5 w-3.5" />
          <span className="line-clamp-1" title={post.address}>
            {post.address}
          </span>
        </div>

        {(post.tags || []).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {(post.tags || []).map((t) => (
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
          <div className="text-[11px] text-slate-500">
            {post.created_at
              ? timeAgo(new Date(post.created_at).getTime())
              : post.createdAt
              ? timeAgo(post.createdAt)
              : ""}
          </div>

          <button
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs shadow-sm transition hover:bg-slate-50"
            onClick={() => onUpvote(post.id)}
            aria-label="Upvote"
            title="Upvote to boost visibility"
          >
            <ThumbsUp className="h-4 w-4" />
            <span className="tabular-nums">{hasUpvoteCount ? post.upvotes : ""}</span>
          </button>
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
          Built by Charan Reddy
        </p>
        <div className="text-xs text-slate-500">© {new Date().getFullYear()} CivicWatch</div>
      </div>
    </footer>
  );
}
