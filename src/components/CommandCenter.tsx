"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AudioVisualizer } from "@/components/AudioVisualizer";
import { DebugPanel } from "@/components/DebugPanel"; // ADDED
import { cn } from "@/lib/utils";
import type { RAGResponse } from "@/lib/types";
import {
  FileUp,
  Phone,
  Search,
  Trash2,
  Clock,
  Activity,
  Database,
  Sparkles,
  Zap,
  X,
  RotateCcw,
} from "lucide-react";

type Doc = {
  name: string;
  size: number;
  status: "ready" | "ingesting" | "error" | "ingested";
  chunks?: number;
  docId?: string;
  error?: string;
};

type Msg = {
  role: "user" | "assistant";
  content: string;
  latency_ms?: number;
  sources?: string[];
  requestId?: string; // ADDED
  debug?: any; // ADDED
};

function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB"] as const;
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

async function fileToBase64(file: File) {
  const buf = await file.arrayBuffer();
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

type Mode = "text" | "call";

export function CommandCenter() {
  const [mode, setMode] = useState<Mode>("text");
  const [isCallActive, setIsCallActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const [docs, setDocs] = useState<Doc[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [proof, setProof] = useState<{ p50?: number; p95?: number; p99?: number } | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Observability state (ADDED)
  const [lastRequestId, setLastRequestId] = useState<string>("");
  const [lastDebugStats, setLastDebugStats] = useState<any>(null);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [isResultOpen, setIsResultOpen] = useState(false);

  // Load persisted state
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("reviewpulse_state_v1");
      if (!raw) return;
      const parsed = JSON.parse(raw) as { docs?: Doc[]; messages?: Msg[] };
      if (parsed?.docs) setDocs(parsed.docs);
      if (parsed?.messages) setMessages(parsed.messages);
    } catch {
      // ignore
    }
  }, []);

  // Persist state
  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload = JSON.stringify({ docs, messages });
    window.localStorage.setItem("reviewpulse_state_v1", payload);
  }, [docs, messages]);

  // Auto-scroll transcript
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  async function loadProof() {
    try {
      const res = await fetch("/api/proof/metrics");
      if (!res.ok) return;
      const json = await res.json();
      const s = json?.summary;
      setProof({
        p50: s?.latency_ms?.p50 ?? undefined,
        p95: s?.latency_ms?.p95 ?? undefined,
        p99: s?.latency_ms?.p99 ?? undefined,
      });
    } catch {
      // ignore
    }
  }

  async function ingestDemo() {
    if (demoLoading) return;
    setDemoLoading(true);
    try {
      const res = await fetch("/api/demo/ingest", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `Demo ingest failed (${res.status})`);

      const results = (json?.results || []) as Array<{
        filename: string;
        chunks: number;
        status: string;
        error?: string;
      }>;
      const nextDocs: Doc[] = results.map((r) => ({
        name: r.filename,
        size: 0,
        status: r.status === "success" ? "ingested" : "error",
        chunks: r.chunks,
        docId: r.filename,
        error: r.error,
      }));
      setDocs((prev) => {
        const byName = new Map(prev.map((d) => [d.name, d] as const));
        for (const d of nextDocs) byName.set(d.name, d);
        return Array.from(byName.values());
      });

      await loadProof();
    } finally {
      setDemoLoading(false);
    }
  }

  const lastLatency = useMemo(() => {
    const m = [...messages].reverse().find((x) => x.role === "assistant" && typeof x.latency_ms === "number");
    return m?.latency_ms ?? undefined;
  }, [messages]);

  const ingestedCount = useMemo(() => docs.filter((d) => d.status === "ingested").length, [docs]);

  const lastAssistant = useMemo(() => {
    return [...messages].reverse().find((m) => m.role === "assistant") ?? null;
  }, [messages]);

  async function ingestFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    const next: Doc[] = Array.from(files).map((f) => ({
      name: f.name,
      size: f.size,
      status: "ingesting",
    }));

    setDocs((prev) => {
      const existing = new Set(prev.map((d) => d.name));
      const merged = [...prev, ...next.filter((d) => !existing.has(d.name))];
      return merged;
    });

    for (const f of Array.from(files)) {
      try {
        setDocs((prev) => prev.map((d) => (d.name === f.name ? { ...d, status: "ingesting" } : d)));
        const content = await fileToBase64(f);
        const res = await fetch("/api/ingest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ filename: f.name, content }),
        });
        const json = (await res.json()) as { chunks?: number; docId?: string; status?: string; message?: string };
        if (!res.ok) throw new Error(json?.message || `Ingest failed (${res.status})`);
        setDocs((prev) =>
          prev.map((d) =>
            d.name === f.name ? { ...d, status: "ingested", chunks: json.chunks, docId: json.docId } : d,
          ),
        );
      } catch (e) {
        setDocs((prev) => prev.map((d) => (d.name === f.name ? { ...d, status: "error", error: String(e) } : d)));
      }
    }
  }

  async function runQuery() {
    const q = query.trim();
    if (loading) return;
    if (!q) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Please enter a question to run a query." }]);
      return;
    }

    setLoading(true);
    setIsCallActive(true);
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setQuery("");

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      // Correctly type the response to include debug info
      const json = (await res.json()) as RAGResponse & { error?: string, requestId?: string, debug?: any };
      if (!res.ok) throw new Error(json?.error || `Query failed (${res.status})`);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: json.answer,
          latency_ms: json.latency_ms,
          sources: json.sources,
          requestId: json.requestId,
          debug: json.debug,
        },
      ]);
      setIsResultOpen(true);

      // Observability updates (ADDED)
      if (json.requestId) {
        setLastRequestId(json.requestId);
        setLastDebugStats(json.debug);
        setIsDebugOpen(true); // Pop open the debug panel on first success
      }

    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Query error: ${String(e)}` }]);
      setIsResultOpen(true);
    } finally {
      setLoading(false);
      setTimeout(() => setIsCallActive(false), 900);
    }
  }

  function startCall() {
    setMode("call");
    setIsCallActive(true);
  }

  function endCall() {
    setIsCallActive(false);
    setIsMuted(false);
  }

  function resetSession() {
    setDocs([]);
    setMessages([]);
    setQuery("");
    setLastRequestId("");
    setLastDebugStats(null);
    setIsResultOpen(false);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("reviewpulse_state_v1");
    }
  }

  const headerStatus = useMemo(() => {
    if (docs.length === 0) return "No docs";
    if (ingestedCount === docs.length) return `${ingestedCount} ready`;
    return `${ingestedCount}/${docs.length} ingested`;
  }, [docs.length, ingestedCount]);

  return (
    <div className="h-screen bg-background text-foreground overflow-hidden flex flex-col relative font-sans selection:bg-white/20">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-48 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(239,68,68,0.14),transparent_65%)] blur-2xl" />
        <div className="absolute -bottom-56 right-[-140px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.12),transparent_70%)] blur-2xl" />
        <div className="absolute inset-0 opacity-[0.06] [background-image:radial-gradient(rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:28px_28px]" />
      </div>

      <header className="sticky top-0 w-full z-50 border-b border-white/5 bg-background/50 backdrop-blur-md">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          {/* Left: brand lockup (text-only for now) */}
          <div className="flex items-center gap-3">
            <div className={cn("w-2.5 h-2.5 rounded-full", isCallActive ? "bg-red-400/70" : "bg-white/20")} />

            <div className="flex flex-col">
              <span className="text-[15px] font-semibold tracking-tight [font-family:var(--font-brand)] text-white/90">
                Review<span className="text-violet-300/90">Pulse</span>
              </span>
              <span className="mt-0.5 text-[10px] text-white/45 font-mono">
                precision RAG command center
              </span>
            </div>
          </div>

          {/* Right: status pill + reset */}
          <div className="flex items-center gap-2">
            <button
              onClick={resetSession}
              className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/60 hover:text-white/80 hover:bg-white/10 transition-colors"
              title="Reset session"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
            <div className="text-[11px] font-mono bg-white/5 border border-white/10 px-2.5 py-1 rounded-full text-white/60">
              {headerStatus}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 px-6 2xl:px-10 overflow-hidden py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
          {/* Left Column: Docs (4 cols) */}
          <section className="lg:col-span-4 grid grid-rows-[auto_minmax(0,1fr)_auto] h-full gap-4">
            {/* Header / Actions */}
            <div className="flex items-center justify-between px-1">
              <h2 className="text-base font-medium text-white/90">Documents</h2>
              <div className="flex items-center gap-2">
                 <button
                    onClick={ingestDemo}
                    disabled={demoLoading}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] uppercase tracking-wider font-mono border transition-colors",
                      demoLoading
                        ? "border-white/5 bg-white/[0.03] text-white/30"
                        : "border-white/10 bg-white/5 hover:bg-white/10 text-white/70",
                    )}
                  >
                    <Sparkles className="w-3 h-3" /> Demo
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] uppercase tracking-wider font-mono border border-white/10 bg-white/5 hover:bg-white/10 text-white/70 transition-colors"
                  >
                    <FileUp className="w-3 h-3" /> Upload
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => void ingestFiles(e.target.files)}
                  />
              </div>
            </div>

            {/* Upload/List Card */}
            <div
              onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                void ingestFiles(e.dataTransfer.files);
              }}
              className={cn(
                "flex-1 rounded-3xl border bg-white/[0.02] backdrop-blur-sm overflow-hidden flex flex-col relative transition-colors",
                isDragging ? "border-white/20 bg-white/[0.05]" : "border-white/5",
              )}
            >
              <div className="p-4 flex-1 overflow-y-auto min-h-0 space-y-2">
                {docs.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-center opacity-60 px-4">
                    <div className="p-4 rounded-full bg-white/5 mb-4">
                      <FileUp className="w-6 h-6 text-white/40" />
                    </div>
                    <div className="text-sm text-white/80 leading-relaxed">
                      Drag & drop PDFs here
                    </div>
                  </div>
                ) : (
                  docs.map((d) => (
                    <div key={d.name} className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 hover:bg-white/[0.04] transition-colors group">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium tracking-tight truncate text-white/90">{d.name}</div>
                          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                            {formatBytes(d.size)}
                            {typeof d.chunks === "number" ? ` · ${d.chunks} chunks` : ""}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "text-[9px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded-full border",
                              d.status === "ingested" && "border-emerald-500/20 text-emerald-300 bg-emerald-500/10",
                              d.status === "ingesting" && "border-white/10 text-white/60 bg-white/5 animate-pulse",
                              d.status === "error" && "border-red-500/20 text-red-300 bg-red-500/10",
                            )}
                          >
                            {d.status}
                          </span>
                          <button
                            onClick={() => setDocs((prev) => prev.filter((x) => x.name !== d.name))}
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-full hover:bg-white/10 transition-all"
                          >
                            <Trash2 className="w-3 h-3 text-white/60" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Bottom Strip: Ingest/Activity + Proof (compact) */}
            <div className="shrink-0 rounded-3xl border border-white/5 bg-white/[0.02] backdrop-blur-sm px-5 py-4 flex flex-col justify-center gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider">System</span>
                <span className="text-[10px] font-mono text-white/60">{loading ? "processing" : "ready"}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-xl bg-white/5 border border-white/5">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500/80" />
                    <span className="text-[10px] text-white/70 font-mono">Ingest</span>
                  </div>
                  <span className="text-[10px] font-mono text-white/70">ready</span>
                </div>

                <div className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-xl bg-white/5 border border-white/5">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500/80" />
                    <span className="text-[10px] text-white/70 font-mono">Vector</span>
                  </div>
                  <span className="text-[10px] font-mono text-white/70">ok</span>
                </div>

                <div className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-xl bg-white/5 border border-white/5">
                  <div className="flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-white/35" />
                    <span className="text-[10px] text-white/70 font-mono">Activity</span>
                  </div>
                  <span className="text-[10px] font-mono text-white/70">idle</span>
                </div>

                <div className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-xl bg-white/5 border border-white/5">
                  <div className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-white/35" />
                    <span className="text-[10px] text-white/70 font-mono">Mode</span>
                  </div>
                  <span className="text-[10px] font-mono text-white/70">{mode}</span>
                </div>
              </div>
            </div>
          </section>

          {/* Right Column: Core (8 cols) */}
          <section className="lg:col-span-8 grid grid-rows-[auto_minmax(0,1fr)_auto_minmax(0,0.85fr)] h-full gap-4">
            {/* Top: Header + Actions */}
            <div className="flex items-center justify-between px-1">
               <div className="flex items-center gap-4">
                  <h2 className="text-base font-medium text-white/90">Visualizer</h2>
                  <div className="hidden md:flex items-center gap-1">
                     <div className="h-1 w-1 rounded-full bg-white/20" />
                     <span className="text-[11px] font-mono text-white/40">RAG Integrated</span>
                  </div>
               </div>
               
               <div className="flex items-center gap-3">
                <div className="flex items-center rounded-full border border-white/10 bg-white/5 p-1">
                  <button
                    onClick={() => setMode("text")}
                    className={cn(
                      "px-3 py-1 text-[10px] font-mono uppercase tracking-wider rounded-full transition-colors",
                      mode === "text" ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/70",
                    )}
                  >
                    Text
                  </button>
                  <button
                    onClick={() => setMode("call")}
                    className={cn(
                      "px-3 py-1 text-[10px] font-mono uppercase tracking-wider rounded-full transition-colors",
                      mode === "call" ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/70",
                    )}
                  >
                    Voice
                  </button>
                </div>
                <button
                  onClick={() => isCallActive ? endCall() : startCall()}
                  className={cn(
                    "group flex items-center gap-2 px-4 py-1.5 rounded-full transition-all border text-[10px] uppercase tracking-wider font-mono",
                    isCallActive
                      ? "bg-red-500/10 text-red-300 border-red-500/20 hover:bg-red-500/20"
                      : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/20",
                  )}
                >
                  <Phone className={cn("w-3 h-3", isCallActive ? "rotate-[135deg]" : "")} />
                  {isCallActive ? "End Session" : "Start Session"}
                </button>
              </div>
            </div>

            {/* Center: Visualizer (Hero) */}
            <div className="relative min-h-0 rounded-3xl bg-black/40 border border-white/5 overflow-hidden flex items-center justify-center">
              {/* Center brand lockup (simple) */}
              {!loading && !(mode === "call" && isCallActive) && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="text-center -mt-2">
                    <div className="mt-3 text-[28px] tracking-tight font-semibold text-white/90 [font-family:var(--font-brand)]">
                      Review<span className="text-violet-300/90">Pulse</span>
                    </div>
                    <div className="mt-1 text-[10px] font-mono uppercase tracking-[0.28em] text-white/35">
                      RAG command center
                    </div>
                  </div>
                </div>
              )}
               <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03),transparent_70%)] pointer-events-none" />
               {/* Sphere Component */}
               <AudioVisualizer speaking={(mode === "call" && isCallActive && !isMuted) || loading} />
            </div>

            {/* Query Input */}
            <div className="shrink-0 rounded-3xl border border-white/5 bg-white/[0.02] backdrop-blur-sm px-4 py-3 flex items-center gap-3 focus-within:border-white/20 transition-colors">
              <Search className="w-4 h-4 text-white/40 ml-2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void runQuery();
                  }
                }}
                placeholder={mode === "call" ? "Listening to voice input..." : "Ask a question about your documents..."}
                className="flex-1 bg-transparent outline-none text-sm placeholder:text-white/30 font-medium h-full py-1"
                disabled={mode === "call" && isCallActive}
              />
              <button
                onClick={() => void runQuery()}
                disabled={loading || (mode === "call" && isCallActive)}
                className={cn(
                  "rounded-full px-5 py-2.5 border text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-2",
                  loading
                    ? "border-white/5 bg-white/[0.03] text-white/30"
                    : "border-white/10 bg-white/5 text-white hover:bg-white/10",
                )}
              >
                {loading ? <span className="animate-pulse">Thinking...</span> : <>Run Query <Zap className="w-3 h-3" /></>}
              </button>
            </div>

            {/* Bottom: Result Launcher + Stats */}
            <div className="min-h-0 rounded-3xl border border-white/5 bg-white/[0.02] backdrop-blur-sm flex flex-col overflow-hidden">
              <div className="shrink-0 border-b border-white/5 px-5 py-2.5 flex items-center justify-between bg-white/[0.01]">
                <div className="flex items-center gap-5">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-white/40" />
                    <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider">Latency</span>
                    <span className="text-xs font-mono text-white/80">{lastLatency ? `${lastLatency}ms` : "—"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-white/40" />
                    <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider">P95 Proof</span>
                    <span className="text-xs font-mono text-white/80">{proof?.p95 ? `${Math.round(proof.p95)}ms` : "—"}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Database className="w-3.5 h-3.5 text-white/40" />
                  <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider">Context</span>
                  <span className="text-xs font-mono text-white/80">{ingestedCount} docs</span>
                </div>
              </div>

              <div className="flex-1 p-6 flex items-center justify-between gap-6">
                <div className="space-y-2">
                  <div className="text-sm text-white/80">Results open in fullscreen after each query.</div>
                  <div className="text-[11px] text-white/40 font-mono">No scrolling on the main page.</div>
                </div>
                <button
                  onClick={() => setIsResultOpen(true)}
                  disabled={!lastAssistant}
                  className={cn(
                    "rounded-full px-5 py-2.5 border text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-2",
                    lastAssistant
                      ? "border-white/10 bg-white/5 text-white hover:bg-white/10"
                      : "border-white/5 bg-white/[0.03] text-white/30",
                  )}
                >
                  Open Results <Zap className="w-3 h-3" />
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Fullscreen Results Modal */}
      {isResultOpen && lastAssistant && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative w-full max-w-6xl h-[84vh] rounded-3xl border border-white/10 bg-black/60 overflow-hidden grid grid-cols-1 lg:grid-cols-2">
            {/* Left: Text */}
            <div className="p-6 lg:p-8 flex flex-col gap-4 border-b lg:border-b-0 lg:border-r border-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-white/80">
                  <Sparkles className="w-4 h-4 text-violet-300/80" />
                  <span className="text-sm font-medium">Result</span>
                </div>
                <button
                  onClick={() => setIsResultOpen(false)}
                  className="p-2 rounded-full hover:bg-white/10 text-white/60 hover:text-white"
                  aria-label="Close results"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 rounded-2xl border border-white/10 bg-white/[0.02] p-5 overflow-y-auto">
                <div className="text-sm leading-relaxed whitespace-pre-wrap text-white/85">
                  {lastAssistant.content}
                </div>
              </div>

              <div className="flex items-center gap-4 text-[10px] font-mono text-white/50">
                <div className="flex items-center gap-1">
                  <Database className="w-3 h-3" />
                  <span>{lastAssistant.sources?.length ?? 0} sources</span>
                </div>
                {lastAssistant.latency_ms && (
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{lastAssistant.latency_ms}ms</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Orb */}
            <div className="relative flex flex-col">
              <div className="absolute top-4 right-4 flex items-center gap-2 opacity-80">
                <Image
                  src="/brand/logo-mark.png"
                  alt="ReviewPulse"
                  width={22}
                  height={22}
                  className="rounded"
                />
                <div className="h-6 w-6 rounded-full border border-white/15 flex items-center justify-center bg-white/[0.04]">
                  <Sparkles className="w-3.5 h-3.5 text-violet-300/80" />
                </div>
              </div>

              <div className="flex-1 min-h-0 rounded-3xl border border-white/10 m-4 overflow-hidden bg-black/40">
                <AudioVisualizer speaking={loading || (mode === "call" && isCallActive && !isMuted)} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Debug Panel (Observability Phase 4) */}
      <DebugPanel
        requestId={lastRequestId}
        stats={lastDebugStats}
        latency={lastLatency ?? undefined}
        isOpen={isDebugOpen}
        onToggle={() => setIsDebugOpen(!isDebugOpen)}
      />
    </div>
  );
}
