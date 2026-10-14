"use client";

import {
  useEffect,
  createContext,
  useContext,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  FileCheck2,
  FileSearch,
  FileText,
  FolderOpen,
  Layers3,
  Loader2,
  RotateCcw,
  MapPin,
  Menu,
  MessageSquareText,
  Plus,
  PlayCircle,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  TriangleAlert,
  UploadCloud,
  X,
} from "lucide-react";
import { AccessibilityControls } from "@/components/accessibility-controls";
import { ThemeSelector } from "@/components/theme-selector";
import { LearningCenter } from "@/components/learning-center";
import { AssistantAnswerContent, CitationSnapshot } from "@/components/assistant-answer";
import { api as requestApi, download as requestDownload, resetDemoWorkspace, exportWorkspaceBackup, importWorkspaceBackup } from "@/lib/client";
import { ClientSessionRequests } from "@/lib/client-session";
import { BIHAR } from "@/lib/states";
import { demoTemplates } from "@/lib/demo";
import {
  DOCUMENT_LABELS,
  FIELD_LABELS,
  type AssistantSource,
  type DocumentKind,
  type ExtractedFields,
  type FieldName,
  type Finding,
  type PropertyCase,
  type PropertyDocument,
  type RuntimeConfig,
} from "@/lib/types";

type View = "cases" | "services" | "guide" | "settings";
const ErrorContext = createContext('');
type Tab = "overview" | "documents" | "timeline" | "next";
type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  mode?: string;
  sources?: AssistantSource[];
};
const when = (date: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
const severityLabel = {
  attention: "Needs attention",
  review: "Review needed",
  unknown: "Not established",
  consistent: "Fields align",
};
function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span className={`badge ${tone}`}>
      <span className="badge-dot" />
      {children}
    </span>
  );
}
function Empty({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Modal({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const modalError = useContext(ErrorContext);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const controls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter((element) => element.tabIndex >= 0 && element.getClientRects().length);
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first?.focus();
        }
      }}
      aria-labelledby={titleId}
      aria-describedby={subtitle ? descriptionId : undefined}
    >
      <div className="modal-head">
        <div>
          <h2 id={titleId}>{title}</h2>
          {subtitle && <p id={descriptionId}>{subtitle}</p>}
        </div>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {modalError && <div className="alert error modal-error" role="alert"><TriangleAlert size={17}/><span>{modalError}</span></div>}
      {children}
    </dialog>
  );
}

export default function Workspace() {
  const sessionRequests = useRef(new ClientSessionRequests());
  const api = <T,>(path: string, options: RequestInit = {}) =>
    sessionRequests.current.run(signal => requestApi<T>(path, { ...options, signal }));
  const download = (path: string, filename: string) =>
    sessionRequests.current.run(signal => requestDownload(path, filename, signal));
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [bootAttempt, setBootAttempt] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const [assistantConsent, setAssistantConsent] = useState(false);
  const [view, setView] = useState<View>("cases"),
    [cases, setCases] = useState<PropertyCase[]>([]),
    [active, setActive] = useState<PropertyCase | null>(null),
    [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all");
  const [newOpen, setNewOpen] = useState(false),
    [editCaseOpen, setEditCaseOpen] = useState(false),
    [documentDeleting, setDocumentDeleting] = useState<PropertyDocument|null>(null),
    [uploadOpen, setUploadOpen] = useState(false),
    [editing, setEditing] = useState<PropertyDocument | null>(null),
    [deleting, setDeleting] = useState(false),
    [mobileNav, setMobileNav] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]),
    [question, setQuestion] = useState("");
  const [citation, setCitation] = useState<{ caseId: string; source: AssistantSource } | null>(null);
  const conversationScope = useRef({ caseId: active?.id });
  if (conversationScope.current.caseId !== active?.id) conversationScope.current = { caseId: active?.id };
  useEffect(() => { setCitation(null); setAssistantConsent(false); }, [active?.id]);
  const [mobileView, setMobileView] = useState(false);
  const navigationRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const navigationChanged = useRef(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 960px)");
    const update = () => {
      setMobileView(media.matches);
      if (!media.matches) setMobileNav(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!mobileNav) return;
    const menu = navigationRef.current;
    const opener = document.getElementById("open-navigation");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    menu?.querySelector<HTMLButtonElement>(".mobile-nav-close")?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileNav(false);
      }
      if (event.key !== "Tab" || !menu) return;
      const items = Array.from(menu.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')).filter((item) => item.getClientRects().length);
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      opener?.focus();
    };
  }, [mobileNav]);
  useEffect(() => {
    if (!navigationChanged.current) return;
    navigationChanged.current = false;
    const frame = requestAnimationFrame(() => {
      const heading = mainRef.current?.querySelector("h1");
      if (heading) { heading.tabIndex = -1; heading.focus(); }
    });
    return () => cancelAnimationFrame(frame);
  }, [view, active?.id]);
  useEffect(() => {
    const title = view === "guide" ? "How to use BhuVerify" : view === "services" ? "Bihar services" : view === "settings" ? "About this demo" : active ? "Property case" : "Your property workspace";
    document.title = `${title} — BhuVerify`;
  }, [view, active?.id]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    setError("");
    const identity = sessionRequests.current.identity;
    const current = () => !cancelled && identity === sessionRequests.current.identity;
    (async () => {
      const value = await api<RuntimeConfig>("/api/config");
      if (!current()) return;
      setConfig(value);
      const result = await api<{ cases: PropertyCase[] }>("/api/cases");
      if (current()) setCases(result.cases);
    })()
      .catch((e) => { if (current()) { setError(e instanceof Error ? e.message : "Could not open browser storage. Please try again."); setLoadFailed(true); } })
      .finally(() => { if (!cancelled && identity === sessionRequests.current.identity) setLoading(false); });
    return () => { cancelled = true; };
  }, [bootAttempt]);
  useEffect(() => {
    if (!config || loading || loadFailed || busy) return;
    let cancelled = false;
    const identity = sessionRequests.current.identity;
    const refreshList = () => {
      if (document.visibilityState !== "visible") return;
      api<{ cases: PropertyCase[] }>("/api/cases")
        .then((result) => { if (!cancelled && identity === sessionRequests.current.identity) setCases(result.cases); })
        .catch((e) => { if (!cancelled && identity === sessionRequests.current.identity) setError(e instanceof Error ? e.message : "Could not refresh your saved cases."); });
    };
    // Refresh the list only. Never replace an open case or an unsaved field editor.
    window.addEventListener("focus", refreshList);
    document.addEventListener("visibilitychange", refreshList);
    return () => { cancelled = true; window.removeEventListener("focus", refreshList); document.removeEventListener("visibilitychange", refreshList); };
  }, [config, loading, loadFailed, busy]);
  useEffect(() => () => sessionRequests.current.invalidate(), []);
  const resetWorkspace = async () => {
    setBusy("reset");
    setError("");
    try {
      // Do not report success or discard UI state until IndexedDB commits.
      await resetDemoWorkspace();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not clear saved cases. Please try again.");
      setBusy("");
      return;
    }
    sessionRequests.current.invalidate();
    conversationScope.current = { caseId: undefined };
    navigationChanged.current = true;
    setCases([]);
    setActive(null);
    setMessages([]);
    setQuestion("");
    setCitation(null);
    setEditing(null);
    setDocumentDeleting(null);
    setNewOpen(false);
    setEditCaseOpen(false);
    setUploadOpen(false);
    setDeleting(false);
    setResetOpen(false);
    setMobileNav(false);
    setQuery("");
    setFilter("all");
    setError("");
    setBusy("");
    setLoading(false);
    setTab("overview");
    setView("cases");
    setNotice("Saved cases and evidence cleared from this browser for this app. Downloaded backups, reports, and your own original files are unchanged.");
  };
  const run = async (label: string, action: (isCurrent: () => boolean) => Promise<void>) => {
    const identity = sessionRequests.current.identity;
    setBusy(label);
    setError("");
    try {
      await action(() => identity === sessionRequests.current.identity);
    } catch (e) {
      if (identity !== sessionRequests.current.identity) return;
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      if (identity === sessionRequests.current.identity) setBusy("");
    }
  };
  const adopt = (c: PropertyCase) => {
    setCases((old) => [c, ...old.filter((x) => x.id !== c.id)]);
    setActive(c);
  };
  const openCase = (c: PropertyCase) => {
    // Opening even the same case starts a new conversation. A response from
    // the previous conversation must not reappear after it was cleared.
    conversationScope.current = { caseId: c.id };
    navigationChanged.current = true;
    setActive(c);
    setView("cases");
    setTab("overview");
    setMessages([]);
    setQuestion("");
    setAssistantConsent(false);
    setError("");
    setNotice("");
  };
  const navigate = (v: View) => {
    navigationChanged.current = true;
    setView(v);
    setActive(null);
    setMobileNav(false);
    setError("");
    setNotice("");
  };
  const demo = (id: string) =>
    run("demo", async (isCurrent) => {
      const r = await api<{ case: PropertyCase }>("/api/cases", {
        method: "POST",
        body: JSON.stringify({ demoId: id }),
      });
      if (!isCurrent()) return;
      navigationChanged.current = true;
      setView("cases");
      adopt(r.case);
      setTab("overview");
      setMessages([]);
      setNotice("Synthetic sample loaded. No real property records are used.");
    });
  const analyze = () =>
    active &&
    run("analyze", async (isCurrent) => {
      const r = await api<{ case: PropertyCase }>(
        `/api/cases/${active.id}/analyze`,
        { method: "POST" },
      );
      if (!isCurrent()) return;
      adopt(r.case);
      setTab("overview");
      setNotice(
        "Document checks completed. Official verification remains separate.",
      );
    });
  const exportReport = () =>
    active &&
    run("export", () =>
      download(`/api/cases/${active.id}/report`, `bhuverify-${active.id}.json`),
    );
  const deleteCase = () =>
    active &&
    run("delete", async (isCurrent) => {
      await api(`/api/cases/${active.id}`, { method: "DELETE" });
      if (!isCurrent()) return;
      navigationChanged.current = true;
      setCases(cases.filter((c) => c.id !== active.id));
      setActive(null);
      setDeleting(false);
      setNotice("Case and its evidence removed from this browser’s saved workspace. Your original copies and downloaded backups are unchanged.");
    });
  const ask = async (e?: FormEvent, quick?: string) => {
    e?.preventDefault();
    if (!active) return;
    if (!config?.aiEnabled || !assistantConsent) {
      setError(config?.aiEnabled ? "Please consent to Google processing this case before asking Gemini." : "Gemini is not configured on this deployment. You can still review fields and run document checks.");
      return;
    }
    const q = (quick || question).trim();
    if (!q) return;
    const requestScope = conversationScope.current;
    setQuestion("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    await run("chat", async () => {
      try {
        const r = await api<{
          answer: string;
          sources: ChatMessage["sources"];
          mode: string;
        }>(`/api/cases/${active.id}/assistant`, {
          method: "POST",
          body: JSON.stringify({ question: q, consent: true }),
        });
        if (conversationScope.current !== requestScope) return;
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text: r.answer,
            sources: r.sources,
            mode: r.mode,
          },
        ]);
      } catch (e) {
        if (conversationScope.current !== requestScope) return;
        // The API supplies a safe, operation-specific message and diagnostic
        // reference. Keep it visible beside the question as well as the banner.
        const message = e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.";
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text: `Assistant request failed. ${message}`,
          },
        ]);
        throw e;
      }
    });
  };
  const matching = cases
    .filter((c) =>
      `${c.title} ${c.district} ${c.mauza} ${c.khata} ${c.khesra}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .filter(
      (c) =>
        filter === "all" ||
        (filter === "demo" && c.demo) ||
        (filter === "attention" &&
          c.analysis?.findings.some((f) => f.severity === "attention")) ||
        (filter === "unreviewed" && !c.analysis),
    );
  const totalAttention = cases.filter((c) =>
    c.analysis?.findings.some((f) => f.severity === "attention"),
  ).length;
  const totalDocs = cases.reduce((n, c) => n + c.documents.length, 0);

  return (
    <ErrorContext.Provider value={error}><div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside ref={navigationRef} id="workspace-navigation" className={`sidebar ${mobileNav ? "open" : ""}`} inert={mobileView && !mobileNav} role={mobileNav ? "dialog" : undefined} aria-modal={mobileNav ? true : undefined} aria-label="Workspace navigation">
        <button className="icon-button mobile-nav-close" aria-label="Close navigation menu" onClick={() => setMobileNav(false)}><X size={22} /></button>
        <button
          className="brand"
          onClick={() => navigate("cases")}
          aria-label="BhuVerify home"
        >
          <span className="brand-mark">
            <Layers3 size={23} />
          </span>
          <span>
            Bhu<span className="brand-light">Verify</span>
            <small>LAND. UNDERSTOOD.</small>
          </span>
        </button>
        <div className="state-box">
          <span className="state-monogram">BR</span>
          <div>
            <strong>Bihar workspace</strong>
            <span>State edition · 01</span>
          </div>
          <MapPin size={16} />
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="Main navigation">
          <button
            className={view === "cases" ? "selected" : ""}
            aria-current={view === "cases" ? "page" : undefined}
            onClick={() => navigate("cases")}
          >
            <FolderOpen size={19} />
            Property cases<span className="nav-count">{cases.length}</span>
          </button>
          <button
            className={view === "services" ? "selected" : ""}
            aria-current={view === "services" ? "page" : undefined}
            onClick={() => navigate("services")}
          >
            <BookOpen size={19} />
            Bihar services
            <ArrowUpRight size={14} />
          </button>
          <button
            className={view === "guide" ? "selected" : ""}
            aria-current={view === "guide" ? "page" : undefined}
            onClick={() => navigate("guide")}
          >
            <CircleHelp size={19} />
            How it works
          </button>
          <button
            className={view === "settings" ? "selected" : ""}
            aria-current={view === "settings" ? "page" : undefined}
            onClick={() => navigate("settings")}
          >
            <Settings2 size={19} />
            About this demo
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <ShieldCheck size={22} />
            <strong>Clarity before commitment.</strong>
            <p>Understand the paperwork before you take the next step.</p>
            <span>Independent review assistant</span>
          </div>
          <div className="profile">
            <div className="avatar">B</div>
            <div>
              <strong>Browser-saved workspace</strong>
              <span>No account needed</span>
            </div>
          </div>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <div className="main-shell" inert={mobileNav}>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button menu-button"
              id="open-navigation"
              aria-label="Open navigation"
              aria-expanded={mobileNav}
              aria-controls="workspace-navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={22} />
            </button>
            <span>Workspace</span>
            <span className="slash">/</span>
            <strong>
              {view === "cases"
                ? active
                  ? active.title
                  : "Property cases"
                : view === "services"
                  ? "Bihar services"
                  : view === "guide"
                    ? "How it works"
                    : "About this demo"}
            </strong>
          </div>
          <div className="topbar-meta">
            <ThemeSelector />
            <AccessibilityControls />
            <button className="help-shortcut" onClick={() => navigate("guide")}><CircleHelp size={18} aria-hidden="true" /><span>Help</span></button>
            <span className="connection-status">
            <span className="connection-dot" />
            <span>{!config ? "Checking configuration" : config.aiEnabled ? "Gemini configured" : "Manual review mode"}</span>
            <span className="version">BETA</span>
            </span>
          </div>
        </header>
        <main id="main" ref={mainRef} tabIndex={-1}>
          <p className="sr-only" role="status" aria-live="polite">{busy ? "Working. Please wait." : ""}</p>
            <div className="alert info browser-demo-banner">
              <ShieldCheck size={19} aria-hidden="true" />
              <span><strong>Saved on this browser · No login.</strong> Use fictional documents only. Cases stay on this browser and device; they do not sync or have a cloud backup. {!config ? "Checking whether Gemini is configured on this deployment." : config.aiEnabled ? "With your consent, Gemini processes document uploads and current-case questions through our server." : "Gemini is not configured; manual review and document checks remain available."} Original files are not retained by this app.</span>
            </div>
            <div className="workspace-data-controls" aria-label="Saved workspace controls">
              <p>Keep a backup. Clearing browser data removes saved cases; anyone using this browser profile can access them.</p>
              <div className="button-row">
                <button type="button" className="button secondary" disabled={!!busy || loading || loadFailed || !cases.length} onClick={() => void run("backup", async (isCurrent) => { await exportWorkspaceBackup(); if (isCurrent()) setNotice("Workspace backup downloaded. Keep it private; it contains case fields and source quotes, not original files."); })}><ArrowDownToLine size={16} aria-hidden="true" />Export backup</button>
                <button type="button" className="button secondary" disabled={!!busy || loading || loadFailed} onClick={() => importInput.current?.click()}><UploadCloud size={16} aria-hidden="true" />Import backup</button>
                <button type="button" className="button secondary" onClick={() => { setError(""); setResetOpen(true); }} disabled={!!busy || loading || loadFailed}><RotateCcw size={16} aria-hidden="true" />Clear saved cases</button>
              </div>
              <input ref={importInput} type="file" accept=".json,application/json" className="sr-only" tabIndex={-1} aria-label="Workspace backup file" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) { setError(""); setImportFile(file); } }} />
            </div>
          {error && (
            <div className="alert error" role="alert">
              <TriangleAlert size={19} />
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={17} />
              </button>
            </div>
          )}
          {notice && (
            <div className="toast" role="status">
              <CheckCircle2 size={18} />
              <span>{notice}</span>
              <button className="icon-button" aria-label="Dismiss notification" onClick={() => {
                setNotice("");
                mainRef.current?.focus();
              }}><X size={18} /></button>
            </div>
          )}
          {loading ? (
            <div className="loading" role="status">
              <Loader2 className="spin" />
              <p>Opening your workspace…</p>
            </div>
          ) : loadFailed ? (
            <section className="panel" aria-labelledby="workspace-unavailable"><h1 id="workspace-unavailable">Your workspace could not be opened</h1><p>Check that this browser allows site storage and that the app server is reachable. Your saved cases have not been intentionally cleared.</p><button className="button primary" onClick={() => setBootAttempt((value) => value + 1)}>Retry loading workspace</button></section>
          ) : (
            <>
              {view === "cases" && !active && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">THE BIHAR EDITION</div>
                      <h1>Your property workspace</h1>
                      <p>
                        Bring the papers together. Make your next step clearer.
                      </p>
                    </div>
                    <button
                      className="button primary"
                      disabled={!!busy}
                      onClick={() => setNewOpen(true)}
                    >
                      <Plus size={18} />
                      New property case
                    </button>
                  </div>
                  <section className="hero">
                    <div className="hero-copy">
                      <span className="hero-label">
                        <span /> BUILT FOR BIHAR’S LAND RECORDS
                      </span>
                      <h2>
                        Land papers, made clearer.
                        <br />
                        One step at a time.
                      </h2>
                      <p>
                        Compare your sale deed, Jamabandi, and mutation papers.
                        Find gaps, understand differences, and know what to
                        check next.
                      </p>
                      <div className="hero-actions"><button
                        className="button light"
                        disabled={!!busy}
                        onClick={() => demo(demoTemplates[0].id)}
                      >
                        {busy === "demo" ? (
                          <Loader2 size={17} className="spin" />
                        ) : (
                          <FileSearch size={18} />
                        )}
                        Explore a sample case
                        <ArrowRight size={17} />
                      </button>
                      <button className="button hero-guide-button" onClick={() => navigate("guide")}><PlayCircle size={19} aria-hidden="true" />Watch the quick guide</button></div>
                      <small>Start with fictional sample records. No account or personal API key needed.</small>
                    </div>
                    <div className="hero-art" aria-hidden="true">
                      <div className="map-grid" />
                      <div className="plot plot-one">124/2</div>
                      <div className="plot plot-two">124/3</div>
                      <div className="plot plot-three">125/1</div>
                      <div className="map-label">
                        <MapPin size={14} />
                        Bihar · India
                      </div>
                      <div className="floating-document">
                        <div className="document-icon">
                          <FileCheck2 size={22} />
                        </div>
                        <div>
                          <strong>Every finding, with evidence.</strong>
                          <span>Source document → clear next step</span>
                        </div>
                      </div>
                      <div className="coordinate">
                        25.5941° N &nbsp; 85.1376° E<br />
                        <span>ILLUSTRATIVE PARCELS</span>
                      </div>
                    </div>
                  </section>
                  <section className="getting-started" aria-labelledby="getting-started-title">
                    <div className="getting-started-heading"><div><span className="eyebrow">A SIMPLE PLACE TO START</span><h2 id="getting-started-title">You don’t need to know every land term.</h2><p>Follow three steps. We’ll keep the evidence and the gaps visible.</p></div><button className="text-button" onClick={() => navigate("guide")}>Read the guide <ArrowRight size={18} /></button></div>
                    <ol className="workflow-steps" role="list">
                      <li><span className="workflow-number">1</span><div><h3>Collect your papers</h3><p>Create a case and add the records you have permission to use.</p></div></li>
                      <li><span className="workflow-number">2</span><div><h3>Review the details</h3><p>Check names, plot numbers and source quotes against your papers.</p></div></li>
                      <li><span className="workflow-number">3</span><div><h3>Understand the next step</h3><p>Compare the records, then confirm important facts through official channels.</p></div></li>
                    </ol>
                  </section>
                  <div className="stats">
                    <div>
                      <span>Property cases</span>
                      <strong>{String(cases.length).padStart(2, "0")}</strong>
                      <FolderOpen />
                    </div>
                    <div>
                      <span>Documents collected</span>
                      <strong>{String(totalDocs).padStart(2, "0")}</strong>
                      <FileText />
                    </div>
                    <div>
                      <span>Cases needing attention</span>
                      <strong>{String(totalAttention).padStart(2, "0")}</strong>
                      <TriangleAlert />
                    </div>
                    <div>
                      <span>State supported</span>
                      <strong className="stat-state">
                        Bihar <span>BR</span>
                      </strong>
                      <MapPin />
                    </div>
                  </div>
                  <section className="case-section">
                    <div className="section-heading">
                      <h2>
                        Property cases <span>{cases.length}</span>
                      </h2>
                      <div className="list-controls">
                        <label className="search-box">
                          <Search size={17} />
                          <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search name, village, or plot…"
                            aria-label="Search property cases"
                          />
                        </label>
                        <label className="select-wrap">
                          <select
                            aria-label="Filter property cases"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                          >
                            <option value="all">All cases</option>
                            <option value="attention">Needs attention</option>
                            <option value="unreviewed">Not checked yet</option>
                            <option value="demo">Demo cases</option>
                          </select>
                          <ChevronDown size={14} />
                        </label>
                      </div>
                    </div>
                    {matching.length ? (
                      <div className="case-grid">
                        {matching.map((c) => {
                          const f = c.analysis?.findings;
                          const attention =
                            f?.filter((x) => x.severity === "attention")
                              .length || 0;
                          return (
                            <button
                              key={c.id}
                              className="case-card"
                              onClick={() => openCase(c)}
                            >
                              <div className="case-card-top">
                                <span className="case-icon">
                                  <Layers3 size={22} />
                                </span>
                                <Badge
                                  tone={
                                    attention
                                      ? "attention"
                                      : c.analysis
                                        ? "review"
                                        : "neutral"
                                  }
                                >
                                  {attention
                                    ? `${attention} need attention`
                                    : c.analysis
                                      ? "Review available"
                                      : "Ready for documents"}
                                </Badge>
                              </div>
                              <h3>{c.title}</h3>
                              <p>
                                <MapPin size={14} />
                                {[c.mauza, c.district]
                                  .filter(Boolean)
                                  .join(", ") || "Bihar"}
                                {c.demo && (
                                  <span className="sample-pill">SAMPLE</span>
                                )}
                              </p>
                              <div className="parcel-meta">
                                <div>
                                  <span>KHATA</span>
                                  <strong>{c.khata || "—"}</strong>
                                </div>
                                <div>
                                  <span>KHESRA / PLOT</span>
                                  <strong>{c.khesra || "—"}</strong>
                                </div>
                              </div>
                              <div className="case-card-footer">
                                <span>
                                  <FileText size={14} />
                                  {c.documents.length} documents
                                </span>
                                <span>
                                  {when(c.updatedAt)}
                                  <ArrowUpRight size={17} />
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="empty-cases">
                        <Empty
                          icon={<FolderOpen size={28} />}
                          title={
                            cases.length
                              ? "No matching cases"
                              : "Your first case starts here"
                          }
                        >
                          {cases.length
                            ? "Try a different search or filter."
                            : "Create a case with your property details, or explore a ready-to-use sample below."}
                        </Empty>
                        {!cases.length && (
                          <button
                            className="button secondary"
                            onClick={() => setNewOpen(true)}
                          >
                            <Plus size={17} />
                            Create a property case
                          </button>
                        )}
                      </div>
                    )}
                  </section>
                  <section className="sample-section">
                    <div className="section-heading">
                      <div>
                        <h2>See the checks in action</h2>
                        <p>
                          Three synthetic scenarios. Real document-comparison
                          logic.
                        </p>
                      </div>
                      <span className="tiny-label">DEMO LIBRARY</span>
                    </div>
                    <div className="sample-grid">
                      {demoTemplates.map((d, i) => (
                        <button
                          className="sample-card"
                          key={d.id}
                          onClick={() => demo(d.id)}
                          disabled={!!busy}
                        >
                          <span className={`sample-number number-${i}`}>
                            0{i + 1}
                          </span>
                          <div>
                            <h3>{d.title}</h3>
                            <p>{d.description}</p>
                          </div>
                          <ArrowUpRight size={19} />
                        </button>
                      ))}
                    </div>
                  </section>
                  <div className="bottom-note">
                    <ShieldCheck size={17} />
                    <span>
                      BhuVerify checks document consistency. Ownership,
                      authenticity, and live official status require independent
                      verification.
                    </span>
                  </div>
                </>
              )}
              {view === "cases" && active && (
                <>
                  <button
                    className="text-button back"
                    onClick={() => { navigationChanged.current = true; setActive(null); }}
                  >
                    <ArrowLeft size={16} />
                    All property cases
                  </button>
                  <div className="page-heading detail-heading">
                    <div>
                      <div className="eyebrow">
                        {active.demo ? "SYNTHETIC DEMO CASE" : "PROPERTY CASE"}{" "}
                        · BIHAR
                      </div>
                      <h1>{active.title}</h1>
                      <p>
                        <MapPin size={16} />
                        {[active.mauza, active.circle, active.district]
                          .filter(Boolean)
                          .join(" / ") || "Location not yet entered"}
                        <span className="separator">·</span>Updated{" "}
                        {when(active.updatedAt)}
                      </p>
                    </div>
                    <div className="button-row">
                      <button
                        className="button secondary"
                        disabled={!!busy || active.demo}
                        title={active.demo ? 'Create your own case to upload documents.' : 'Upload a document'}
                        onClick={() => setUploadOpen(true)}
                      >
                        <UploadCloud size={17} />
                        Add document
                      </button>
                      <button
                        className="button primary"
                        onClick={analyze}
                        disabled={!!busy || !active.documents.length}
                      >
                        {busy === "analyze" ? (
                          <Loader2 className="spin" size={17} />
                        ) : (
                          <FileSearch size={17} />
                        )}
                        Run document checks
                      </button>
                      <button
                        className="icon-button delete-button"
                        aria-label="Edit case details"
                        disabled={!!busy}
                        onClick={() => {setError('');setEditCaseOpen(true);}}
                      ><Settings2 size={18}/></button>
                      <button
                        className="icon-button delete-button"
                        aria-label="Delete this case"
                        onClick={() => setDeleting(true)}
                        disabled={!!busy}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                  {active.demo && (
                    <div className="alert info">
                      <Sparkles size={18} />
                      <span>
                        This case uses invented names and records for
                        demonstration. To add another fictional document, create a new property case.
                      </span>
                    </div>
                  )}
                  <div className="property-strip">
                    <div>
                      <span>STATE</span>
                      <strong>Bihar</strong>
                    </div>
                    <div>
                      <span>KHATA</span>
                      <strong>{active.khata || "Not entered"}</strong>
                    </div>
                    <div>
                      <span>KHESRA / PLOT</span>
                      <strong>{active.khesra || "Not entered"}</strong>
                    </div>
                    <div>
                      <span>REVIEW PURPOSE</span>
                      <strong>
                        {active.purpose === "purchase"
                          ? "Pre-purchase review"
                          : active.purpose === "mutation"
                            ? "Mutation assistance"
                            : "Record collection"}
                      </strong>
                    </div>
                    <div>
                      <span>OFFICIAL STATUS</span>
                      <Badge tone="unknown">Not checked live</Badge>
                    </div>
                  </div>
                  <div className="detail-layout">
                    <div className="detail-main">
                      <div
                        className="tabs"
                        role="tablist"
                        aria-label="Case views"
                      >
                        {(
                          [
                            ["overview", "Review overview"],
                            [
                              "documents",
                              `Documents (${active.documents.length})`,
                            ],
                            ["timeline", "Record timeline"],
                            ["next", "Next steps"],
                          ] as [Tab, string][]
                        ).map(([id, label]) => (
                          <button
                            role="tab"
                            id={`tab-${id}`}
                            aria-controls="case-panel"
                            aria-selected={tab === id}
                            tabIndex={tab === id ? 0 : -1}
                            key={id}
                            className={tab === id ? "active" : ""}
                            onClick={() => setTab(id)}
                            onKeyDown={(e) => {
                              if (
                                e.key === "ArrowRight" ||
                                e.key === "ArrowLeft" || e.key === "Home" || e.key === "End"
                              ) {
                                e.preventDefault();
                                const tabs: Tab[] = [
                                  "overview",
                                  "documents",
                                  "timeline",
                                  "next",
                                ];
                                const next =
                                  tabs[
                                    e.key === "Home" ? 0 : e.key === "End" ? 3 : (tabs.indexOf(tab) +
                                      (e.key === "ArrowRight" ? 1 : 3)) %
                                      4
                                  ];
                                setTab(next);
                                document.getElementById(`tab-${next}`)?.focus();
                              }
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <div
                        id="case-panel"
                        role="tabpanel"
                        aria-labelledby={`tab-${tab}`}
                        tabIndex={0}
                      >
                        {tab === "overview" &&
                          (active.analysis ? (
                            <>
                              <div className="review-summary">
                                <div className="review-summary-icon">
                                  <FileSearch size={25} />
                                </div>
                                <div>
                                  <span className="eyebrow">
                                    DOCUMENT REVIEW · {active.analysis.version}
                                  </span>
                                  <h2>
                                    {active.analysis.findings.some(
                                      (f) => f.severity === "attention",
                                    )
                                      ? "A few things need a closer look."
                                      : "Your document review is ready."}
                                  </h2>
                                  <p>{active.analysis.summary}</p>
                                </div>
                              </div>
                              <div className="review-counters">
                                {(
                                  ["attention", "review", "unknown"] as const
                                ).map((s) => (
                                  <div key={s}>
                                    <strong>
                                      {
                                        active.analysis!.findings.filter(
                                          (f) => f.severity === s,
                                        ).length
                                      }
                                    </strong>
                                    <span>{severityLabel[s]}</span>
                                  </div>
                                ))}
                                <div>
                                  <strong>
                                    {active.analysis.coverage.present}
                                    <small>
                                      /{active.analysis.coverage.expected}
                                    </small>
                                  </strong>
                                  <span>Core document types</span>
                                </div>
                              </div>
                              <div className="section-heading compact">
                                <h2>Evidence & findings</h2>
                                <span className="tiny-label">
                                  TRACEABLE TO YOUR DOCUMENTS
                                </span>
                              </div>
                              <div className="findings">
                                {active.analysis.findings.map((f) => (
                                  <FindingCard
                                    key={f.id}
                                    finding={f}
                                    docs={active.documents}
                                    onDocument={setEditing}
                                  />
                                ))}
                              </div>
                              <div className="report-actions">
                                <div>
                                  <h3>Take the review with you</h3>
                                  <p>
                                    Share the evidence with a lawyer or the
                                    relevant revenue office.
                                  </p>
                                </div>
                                <button
                                  className="button secondary"
                                  disabled={!!busy}
                                  onClick={exportReport}
                                >
                                  <ArrowDownToLine size={16} />
                                  JSON report
                                </button>
                                <button
                                  className="button secondary"
                                  onClick={() => window.print()}
                                >
                                  <FileText size={16} />
                                  Print / PDF
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className="panel">
                              <Empty
                                icon={<FileSearch size={30} />}
                                title="Ready when your documents are"
                              >
                                Add your records, review the extracted fields,
                                then run document checks. Missing information
                                will be marked as unknown.
                              </Empty>
                              <div className="center-actions">
                                <button
                                  className="button primary"
                                  onClick={() =>
                                    active.documents.length
                                      ? analyze()
                                      : setUploadOpen(true)
                                  }
                                  disabled={!!busy}
                                >
                                  {active.documents.length
                                    ? "Run document checks"
                                    : "Add your first document"}
                                  <ArrowRight size={17} />
                                </button>
                              </div>
                            </div>
                          ))}
                        {tab === "documents" && (
                          <div className="documents-panel">
                            <div className="section-heading compact">
                              <div>
                                <h2>Your evidence folder</h2>
                                <p>
                                  Review extracted or entered values against the fictional source
                                  before relying on a check.
                                </p>
                              </div>
                              <button
                                className="button secondary"
                                disabled={active.demo || !!busy}
                                title={active.demo ? 'Create your own case to upload documents.' : 'Upload a document'}
                                onClick={() => setUploadOpen(true)}
                              >
                                <Plus size={16} />
                                Add
                              </button>
                            </div>
                            {active.documents.length ? (
                              active.documents.map((d) => (
                                <div key={d.id} className="document-row">
                                  <span className="doc-icon">
                                    <FileText size={22} />
                                  </span>
                                  <div className="document-info">
                                    <h3>{d.name}</h3>
                                    <p>
                                      {DOCUMENT_LABELS[d.kind]} ·{" "}
                                      {Object.keys(d.fields).length} evidence
                                      fields
                                    </p>
                                    <span className="extraction-label">
                                      {d.extraction === "demo"
                                        ? "Synthetic sample"
                                        : d.extraction === "gemini"
                                          ? "Gemini-extracted"
                                          : d.extraction === "failed"
                                            ? "AI extraction unavailable · manual review needed"
                                            : d.extraction === "pending"
                                              ? "Extraction incomplete · review manually if interrupted"
                                              : Object.keys(d.fields).length
                                          ? "Manually entered"
                                          : "Awaiting manual entry"}
                                      {d.reviewed
                                        ? " · marked reviewed"
                                        : " · review required"}
                                    </span>
                                    {d.error && (
                                      <p className="inline-error">{d.error}</p>
                                    )}
                                    {d.originalAvailability === "not_retained" && <p className="form-note">Original file not retained. Enter and review fields using your fictional copy.</p>}
                                  </div>
                                  <button
                                    className="button secondary small"
                                    onClick={() => setEditing(d)}
                                  >
                                  Review fields
                                  <ArrowUpRight size={14} />
                                </button>
                                <button className="icon-button" aria-label={`Delete ${d.name}`} disabled={!!busy} onClick={()=>setDocumentDeleting(d)}><Trash2 size={16}/></button>
                                </div>
                              ))
                            ) : (
                              <Empty
                                icon={<FileText size={28} />}
                                title="No documents yet"
                              >
                                Start with a sale deed or Jamabandi. PDF, JPG,
                                PNG, and text files are supported, up to 10 MB
                                each.
                              </Empty>
                            )}
                            <div className="alert info">
                              <CircleHelp size={18} />
                              <span>
                                An uploaded document is user-provided evidence.
                                BhuVerify has not authenticated it against
                                government records.
                              </span>
                            </div>
                          </div>
                        )}
                        {tab === "timeline" && (
                          <div className="panel timeline-panel">
                            <h2>The story in your documents</h2>
                            <p className="muted">
                              Dates below come from extracted fields. This is
                              not a verified ownership chain.
                            </p>
                            {active.documents.length ? (
                              <ol className="timeline">
                                {[...active.documents]
                                  .sort((a, b) =>
                                    (
                                      a.fields.date?.value || "9999"
                                    ).localeCompare(
                                      b.fields.date?.value || "9999",
                                    ),
                                  )
                                  .map((d) => (
                                    <li key={d.id}>
                                      <span className="timeline-dot" />
                                      <time>
                                        {d.fields.date?.value ||
                                          "Date not established"}
                                      </time>
                                      <h3>{DOCUMENT_LABELS[d.kind]}</h3>
                                      <p>
                                        {d.fields.buyer?.value
                                          ? `Buyer: ${d.fields.buyer.value}`
                                          : d.fields.owner?.value
                                            ? `Recorded owner: ${d.fields.owner.value}`
                                            : "Owner / buyer not extracted"}
                                      </p>
                                      <button
                                        className="text-button"
                                        onClick={() => setEditing(d)}
                                      >
                                        {d.name}
                                        <ArrowUpRight size={14} />
                                      </button>
                                      {d.fields.mutationStatus && (
                                        <Badge tone="review">
                                          {d.fields.mutationStatus.value}
                                        </Badge>
                                      )}
                                    </li>
                                  ))}
                              </ol>
                            ) : (
                              <Empty
                                icon={<Clock3 size={25} />}
                                title="A timeline needs documents"
                              >
                                Upload your records to see the dated entries
                                together.
                              </Empty>
                            )}
                          </div>
                        )}
                        {tab === "next" && (
                          <div className="next-panel">
                            <div className="section-heading compact">
                              <div>
                                <h2>Make your next step an informed one</h2>
                                <p>
                                  Use the official channel for your situation.
                                  Procedures depend on your case.
                                </p>
                              </div>
                            </div>
                            {BIHAR.guidance.map((g, i) => (
                              <div className="guidance-card" key={g.title}>
                                <span className="step-number">0{i + 1}</span>
                                <div>
                                  <h3>{g.title}</h3>
                                  <ul>
                                    {g.steps.map((s) => (
                                      <li key={s}>{s}</li>
                                    ))}
                                  </ul>
                                  {BIHAR.services.find(
                                    (s) => s.id === g.serviceId,
                                  ) && (
                                    <a
                                      className="text-button"
                                      href={
                                        BIHAR.services.find(
                                          (s) => s.id === g.serviceId,
                                        )!.url
                                      }
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      Open official service
                                      <ArrowUpRight size={15} />
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                            <div className="alert warning">
                              <TriangleAlert size={18} />
                              <span>
                                Mutation updates revenue records; it does not by
                                itself establish ownership. A revenue receipt is
                                not a title certificate.
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <aside className="case-aside">
                      <section className="assistant-panel">
                        <div className="assistant-header">
                          <div className="spark-icon">
                            <Sparkles size={20} />
                          </div>
                          <div>
                            <h3>Ask BhuVerify</h3>
                            <span>{config?.aiEnabled ? "Gemini · current-case evidence" : "Gemini not configured"}</span>
                          </div>
                        </div>
                        <p className="assistant-intro">
                          {config?.aiEnabled ? "Ask about this case’s supplied evidence. Gemini can make mistakes: follow citations and check the original. It does not fetch live government records or verify legal title." : "Case questions require the deployment’s server-side Gemini configuration. Manual review and rule-based checks still work; no scripted answer is substituted for AI."}
                        </p>
                        {config?.aiEnabled && <label className="consent assistant-consent"><input type="checkbox" checked={assistantConsent} disabled={!!busy} onChange={(e) => setAssistantConsent(e.target.checked)} /><span>I consent to sending this case’s details, document fields, source quotes, and my question through the app server to Google Gemini. Google’s applicable terms govern processing. I am using fictional records only.</span></label>}
                        <div className="chat-messages" role="log" aria-label="Case conversation" aria-live="polite" aria-relevant="additions text">
                          {messages.map((m, i) => (
                            <div key={i} className={`chat-message ${m.role}`}>
                              <span>
                                {m.role === "user"
                                  ? "YOU"
                                  : m.mode === "gemini"
                                    ? "GEMINI"
                                    : "BHUVERIFY"}
                              </span>
                              {m.role === "assistant" ? (
                                <AssistantAnswerContent answer={m.text} sources={m.sources} onCitation={source => setCitation({ caseId: active.id, source })} />
                              ) : <p>{m.text}</p>}
                            </div>
                          ))}
                          {busy === "chat" && (
                            <div className="chat-thinking">
                              <Loader2 size={15} className="spin" />
                              Reading the evidence…
                            </div>
                          )}
                        </div>
                        {!messages.length && (
                          <div className="quick-questions">
                            {[
                              "What needs my attention?",
                              "Why do the owner names differ?",
                              "What should I do next?",
                            ].map((q) => (
                              <button
                                disabled={!!busy || !config?.aiEnabled || !assistantConsent}
                                key={q}
                                onClick={() => ask(undefined, q)}
                              >
                                {q}
                                <ArrowUpRight size={14} />
                              </button>
                            ))}
                          </div>
                        )}
                        <form className="chat-input" onSubmit={ask}>
                          <input
                            value={question}
                            maxLength={1000}
                            onChange={(e) => setQuestion(e.target.value)}
                            placeholder="Ask about this case…"
                            aria-label="Question about this case"
                            disabled={!config?.aiEnabled || !!busy}
                          />
                          <button
                            aria-label="Send question"
                            disabled={question.trim().length < 3 || !!busy || !config?.aiEnabled || !assistantConsent}
                          >
                            <ArrowRight size={18} />
                          </button>
                        </form>
                        <small>
                          Only the current case is included. Conversations are not saved in backups. Check every cited source.
                        </small>
                      </section>
                      <section className="verification-panel">
                        <div className="section-heading compact">
                          <h3>Verification boundaries</h3>
                          <ShieldCheck size={18} />
                        </div>
                        <div>
                          <Check size={16} />
                          <span>Compare uploaded document fields</span>
                        </div>
                        <div>
                          <Check size={16} />
                          <span>Point to missing evidence</span>
                        </div>
                        <div className="not-checked">
                          <CircleHelp size={16} />
                          <span>
                            Live records, title, and authenticity are not
                            verified
                          </span>
                        </div>
                        <a
                          className="text-button"
                          href="https://biharbhumi.bihar.gov.in/Biharbhumi/default/"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Visit Bihar Bhumi
                          <ArrowUpRight size={14} />
                        </a>
                      </section>
                    </aside>
                  </div>
                  <section className="print-only">
                    <h2>BhuVerify prototype report</h2>
                    <p>Fictional records only. Rule-based checks compare supplied evidence, which may include Gemini-extracted fields needing human review. No live government or legal-title verification is performed.</p>
                    <p>
                      {active.title} · Bihar · Khata {active.khata} · Khesra{" "}
                      {active.khesra}
                    </p>
                    <p>
                      {active.analysis?.summary ||
                        "Checks have not yet been run."}
                    </p>
                    {active.analysis?.findings.map((f) => (
                      <div key={f.id}>
                        <h3>
                          {severityLabel[f.severity]}: {f.title}
                        </h3>
                        <p>{f.detail}</p>
                        <p>Next step: {f.action}</p>
                        {f.documentIds.map((id) => {
                          const d = active.documents.find((x) => x.id === id);
                          return (
                            <p key={id}>
                              Source: {d?.name}
                              {d && evidenceForFinding(f,d)
                                ? ` — page ${evidenceForFinding(f,d)?.page || "unknown"}: “${evidenceForFinding(f,d)?.quote}”`
                                : ""}
                            </p>
                          );
                        })}
                      </div>
                    ))}
                    <p>
                      Official verification not performed. This report is not a
                      title certificate or legal opinion.{" "}
                      {active.demo ? "Synthetic demo data." : ""}
                    </p>
                  </section>
                </>
              )}
              {view === "services" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">OFFICIAL CHANNELS</div>
                      <h1>Your Bihar service directory</h1>
                      <p>
                        The right starting point for records, corrections, and
                        mutation.
                      </p>
                    </div>
                    <Badge tone="consistent">Bihar · supported</Badge>
                  </div>
                  <div className="alert info">
                    <BookOpen size={19} />
                    <span>
                      These links open government portals. Login, CAPTCHA, fees,
                      and availability are controlled by the relevant
                      department. No live records are fetched here.
                    </span>
                  </div>
                  <div className="service-grid">
                    {BIHAR.services.map((s) => (
                      <a
                        key={s.id}
                        href={s.url}
                        className="service-card"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <div>
                          <span className="service-icon">
                            {s.category === "maps" ? (
                              <MapPin />
                            ) : s.category === "mutation" ? (
                              <FileCheck2 />
                            ) : (
                              <BookOpen />
                            )}
                          </span>
                          <ArrowUpRight size={19} />
                        </div>
                        <span className="tiny-label">
                          {s.category.toUpperCase()}
                        </span>
                        <h2>{s.title}</h2>
                        <p>{s.description}</p>
                        {s.note && <small>{s.note}</small>}
                        <span className="service-host">
                          {new URL(s.url).hostname}
                        </span>
                        <span className="sr-only">Opens in a new tab</span>
                      </a>
                    ))}
                  </div>
                  <p className="muted sources-date">
                    Links checked {BIHAR.lastChecked}. If a deep link changes,
                    start from the Bihar Bhumi homepage.
                  </p>
                </>
              )}
              {view === "guide" && (
                <LearningCenter onStartSample={() => { void demo(demoTemplates[0].id); }} busy={!!busy} />
              )}
              {view === "settings" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">A SEPARATE WORKFLOW PROTOTYPE</div>
                      <h1>About this demo</h1>
                      <p>Gemini-assisted review, browser-saved cases, and no sign-in.</p>
                    </div>
                  </div>
                  <div className="settings-grid">
                    <section className="panel">
                      <div className="settings-icon">
                        <Sparkles />
                      </div>
                      <h2>Gemini, grounded in your case</h2>
                      <Badge tone={config?.aiEnabled ? "review" : "neutral"}>{config?.aiEnabled ? "Server key configured · not a connection test" : "Not configured · manual mode"}</Badge>
                      <p>
                        {config?.aiEnabled ? `This deployment is configured to use ${config.model} for document extraction and current-case questions. The API key stays on the server; visitors do not supply a key. A successful AI response is needed to verify live access.` : "The deployment owner must configure Gemini on the server to enable extraction and current-case answers. Until then, sample cases, manual field review, and rule-based document checks remain available."}
                      </p>
                      <p>
                        With consent, document files or current-case evidence and your question
                        pass through this app’s server to Google Gemini. Google’s applicable
                        terms govern processing. This app does not retain original files.
                        Review AI-extracted fields and quotes before relying on them.
                      </p>
                      <small>
                        Document comparison uses fixed rules, not an AI verdict. This version
                        has no Firebase or login integration. Nothing verifies legal title,
                        authenticates documents, or fetches live government land records.
                      </small>
                    </section>
                    <section className="panel">
                      <div className="settings-icon">
                        <ShieldCheck />
                      </div>
                      <h2>Saved on this browser</h2>
                      <Badge tone="neutral">IndexedDB · no cloud sync</Badge>
                      <p>
                        Case details, reviewed fields, source quotes, and file metadata
                        stay in IndexedDB on this browser profile and this app’s address.
                        They survive ordinary refreshes and reopening the browser, but do
                        not automatically move to another device, browser, or deployment address.
                      </p>
                      <p>
                        Export a workspace backup regularly and import it to add restored
                        copies without replacing existing cases. Browser data can be cleared
                        or evicted; private browsing is not durable storage. Anyone using
                        this browser profile can access these cases. Use fictional records
                        only, especially on shared devices. Backups contain evidence, not original files.
                      </p>
                      <button className="text-button" disabled={!!busy} onClick={() => { setError(""); setResetOpen(true); }}><RotateCcw size={15} />Clear saved cases</button>
                    </section>
                  </div>
                  <section className="panel state-roadmap">
                    <div>
                      <span className="eyebrow">
                        BUILT TO GROW, STATE BY STATE
                      </span>
                      <h2>Bihar first. More states, thoughtfully.</h2>
                      <p>
                        Each new state needs its own official links, field
                        terminology, document rules, and locally reviewed
                        guidance.
                      </p>
                    </div>
                    <Badge tone="consistent">Bihar available</Badge>
                    <Badge>Other states planned</Badge>
                  </section>
                </>
              )}
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>
            BhuVerify <span>·</span> Built for more informed land decisions.
          </span>
          <span>No-login prototype · Browser-saved cases · {config?.aiEnabled ? "Gemini configured" : "Manual mode"}</span>
        </footer>
      </div>
      {(newOpen || editCaseOpen) && (
        <NewCase
          initial={editCaseOpen ? active || undefined : undefined}
          onClose={() => {setNewOpen(false);setEditCaseOpen(false);setError('');}}
          busy={!!busy}
          onSubmit={(values) =>
            run("create", async (isCurrent) => {
              const r = await api<{ case: PropertyCase }>(editCaseOpen && active ? `/api/cases/${active.id}` : "/api/cases", {
                method: editCaseOpen ? "PATCH" : "POST",
                body: JSON.stringify(values),
              });
              if (!isCurrent()) return;
              if (!editCaseOpen) navigationChanged.current = true;
              adopt(r.case);
              setNewOpen(false);
              setEditCaseOpen(false);
              setView("cases");
              setTab("documents");
              conversationScope.current = { caseId: r.case.id };
              setMessages([]);
              setNotice(editCaseOpen ? 'Case details saved. Run checks again to update the review.' : "Property case created. Add your first document.");
            })
          }
        />
      )}
      {uploadOpen && active && !active.demo && (
        <UploadModal
          busy={!!busy}
          aiEnabled={!!config?.aiEnabled}
          onClose={() => !busy && setUploadOpen(false)}
          onSubmit={(data) =>
            run("upload", async (isCurrent) => {
              const r = await api<{ case: PropertyCase }>(
                `/api/cases/${active.id}/documents`,
                { method: "POST", body: data },
              );
              if (!isCurrent()) return;
              adopt(r.case);
              setUploadOpen(false);
              setTab("documents");
              const added = r.case.documents.find((document) => !active.documents.some((previous) => previous.id === document.id));
              if (added?.extraction === "failed") {
                setError(added.error || "Gemini extraction was unavailable. Document metadata was saved; review fields manually or try another upload later.");
                setNotice("");
              } else {
                setNotice(added?.extraction === "gemini" ? "Gemini extracted document fields. Review every value and source quote against your fictional original before running checks." : "Document metadata saved in this browser. Choose Review fields to enter values manually. Original files are not retained.");
              }
            })
          }
        />
      )}
      {citation && active && citation.caseId === active.id && (
        <Modal title={`Citation ${citation.source.id}`} subtitle="Read-only evidence for this answer" onClose={() => setCitation(null)}>
          <CitationSnapshot source={citation.source} documents={active.documents} />
          {active.documents.find(d => d.id === citation.source.documentId)?.originalAvailability === "not_retained" && <p className="citation-snapshot-boundary">BhuVerify saved this extracted quote, not the original file. Compare it with the original copy you kept.</p>}
          <div className="modal-actions"><button type="button" className="button secondary" onClick={() => setCitation(null)}>Close citation</button></div>
        </Modal>
      )}
      {editing && active && (
        <EvidenceModal
          doc={editing}
          busy={!!busy}
          onClose={() => !busy && setEditing(null)}
          onDownload={() =>
            run("download", () =>
              download(
                `/api/cases/${active.id}/documents/${editing.id}`,
                editing.name,
              ),
            )
          }
          onSave={(fields) =>
            run("review", async (isCurrent) => {
              const r = await api<{ case: PropertyCase }>(
                `/api/cases/${active.id}`,
                {
                  method: "PATCH",
                  body: JSON.stringify({
                    documentId: editing.id,
                    fields,
                    reviewed: true,
                  }),
                },
              );
              if (!isCurrent()) return;
              adopt(r.case);
              setEditing(null);
              setNotice(
                "Fields saved. Run document checks again to refresh the report.",
              );
            })
          }
        />
      )}
      {documentDeleting && active && <Modal title="Delete this document?" subtitle={documentDeleting.originalAvailability === "not_retained" ? `The saved fields and metadata for ${documentDeleting.name} will be removed. No original file is retained by BhuVerify. Your own copy is unchanged, and the current review will be cleared.` : `The stored original and fields for ${documentDeleting.name} will be removed. The current review will be cleared.`} onClose={()=>!busy&&setDocumentDeleting(null)}><div className="modal-actions"><button className="button secondary" disabled={!!busy} onClick={()=>setDocumentDeleting(null)}>Keep document</button><button className="button danger" disabled={!!busy} onClick={()=>run('delete-document',async(isCurrent)=>{const r=await api<{case:PropertyCase}>(`/api/cases/${active.id}/documents/${documentDeleting.id}`,{method:'DELETE'});if(!isCurrent())return;adopt(r.case);setDocumentDeleting(null);setNotice('Document deleted. Run checks again to update the review.');})}>Delete document</button></div></Modal>}
      {deleting && (
        <Modal
          title="Delete this property case?"
          subtitle="Its fields, source quotes, document metadata, and report will be deleted from this browser’s saved workspace. Your original copies and downloaded backups are unchanged. This cannot be undone."
          onClose={() => !busy && setDeleting(false)}
        >
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={!!busy}
              onClick={() => setDeleting(false)}
            >
              Keep case
            </button>
            <button
              className="button danger"
              disabled={!!busy}
              onClick={deleteCase}
            >
              {busy === "delete" ? (
                <Loader2 className="spin" size={16} />
              ) : (
                <Trash2 size={16} />
              )}
              Delete case
            </button>
          </div>
        </Modal>
      )}
      {resetOpen && (
        <Modal title="Clear all saved cases?" subtitle="Every case, field, source quote, and report saved by this app in this browser profile will be deleted, including cases open in other tabs. Export a workspace backup first. Downloaded files and your original copies are unchanged. This cannot be undone." onClose={() => !busy && setResetOpen(false)}>
          <div className="modal-actions">
            <button type="button" className="button secondary" disabled={!!busy} onClick={() => setResetOpen(false)}>Keep saved cases</button>
            <button type="button" className="button danger" disabled={!!busy} onClick={() => void resetWorkspace()}><RotateCcw size={17} aria-hidden="true" />{busy === "reset" ? "Clearing…" : "Delete all saved cases"}</button>
          </div>
        </Modal>
      )}
      {importFile && <Modal title="Import a workspace backup?" subtitle={`Import ${importFile.name} into this browser. Valid cases are added as new copies; existing cases are not overwritten. The file stays in this browser and is not sent to Gemini. Import only a backup you trust and have permission to use.`} onClose={() => !busy && setImportFile(null)}><div className="modal-actions"><button type="button" className="button secondary" disabled={!!busy} onClick={() => setImportFile(null)}>Cancel import</button><button type="button" className="button primary" disabled={!!busy} onClick={() => void run("import", async (isCurrent) => { const result = await importWorkspaceBackup(importFile); const saved = await api<{cases: PropertyCase[]}>("/api/cases"); if (!isCurrent()) return; setCases(saved.cases); setImportFile(null); setNotice(`${result.count} case${result.count === 1 ? "" : "s"} imported as new copies. Existing cases are unchanged.`); })}>{busy === "import" ? "Importing…" : "Import as new cases"}</button></div></Modal>}
    </div></ErrorContext.Provider>
  );
}

function evidenceForFinding(f:Finding,d:PropertyDocument){return f.field==='owner' && d.kind==='sale_deed' ? d.fields.buyer : f.field ? d.fields[f.field] : undefined;}
function FindingCard({
  finding: f,
  docs,
  onDocument,
}: {
  finding: Finding;
  docs: PropertyDocument[];
  onDocument: (d: PropertyDocument) => void;
}) {
  const Icon =
    f.severity === "attention"
      ? TriangleAlert
      : f.severity === "consistent"
        ? CheckCircle2
        : f.severity === "unknown"
          ? CircleHelp
          : FileSearch;
  return (
    <article className={`finding ${f.severity}`}>
      <div className="finding-icon">
        <Icon size={19} />
      </div>
      <div className="finding-content">
        <div className="finding-heading">
          <h3>{f.title}</h3>
          <Badge tone={f.severity}>{severityLabel[f.severity]}</Badge>
        </div>
        <p>{f.detail}</p>
        {f.documentIds.length > 0 && (
          <div className="evidence-chips">
            {f.documentIds.map((id) => {
              const d = docs.find((x) => x.id === id);
              if (!d) return null;
              const field = evidenceForFinding(f,d);
              return (
                <button
                  key={id}
                  onClick={() => onDocument(d)}
                  title={field ? field.quote : "Review source fields"}
                >
                  <FileText size={13} />
                  {d.name}
                  {field?.page ? ` · p.${field.page}` : ""}
                  <ArrowUpRight size={12} />
                </button>
              );
            })}
          </div>
        )}
        <div className="next-action">
          <ArrowRight size={15} />
          <span>{f.action}</span>
        </div>
      </div>
    </article>
  );
}

function NewCase({
  onClose,
  onSubmit,
  busy,
  initial,
}: {
  onClose: () => void;
  onSubmit: (v: Record<string, string>) => void;
  busy: boolean;
  initial?: PropertyCase;
}) {
  return (
    <Modal
      title={initial ? 'Edit case details' : "Start a property case"}
      subtitle="The local identifiers help keep similarly numbered plots separate."
      onClose={() => !busy && onClose()}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const values = Object.fromEntries(
            new FormData(e.currentTarget),
          ) as Record<string, string>;
          onSubmit({ ...values, state: "BR" });
        }}
      >
        <div className="form-body">
          <label className="field">
            Case name
            <input
              name="title"
              defaultValue={initial?.title}
              placeholder="e.g. Family plot in Danapur"
              required
              maxLength={100}
              autoFocus
            />
          </label>
          <div className="form-grid">
            <label className="field">
              State
              <input value="Bihar" disabled />
            </label>
            <label className="field">
              District
              <select aria-label="District" name="district" required defaultValue={initial?.district || ''}>
                <option value="" disabled>
                  Select district
                </option>
                {BIHAR.districts.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Anchal / circle
              <input name="circle" defaultValue={initial?.circle} placeholder="e.g. Danapur" maxLength={100} />
            </label>
            <label className="field">
              Mauza / village
              <input
                name="mauza"
                defaultValue={initial?.mauza}
                placeholder="Village in the record"
                maxLength={100}
              />
            </label>
            <label className="field">
              Khata number
              <input name="khata" defaultValue={initial?.khata} placeholder="e.g. 42" maxLength={60} />
            </label>
            <label className="field">
              Khesra / plot number
              <input name="khesra" defaultValue={initial?.khesra} placeholder="e.g. 124/2" maxLength={60} />
            </label>
          </div>
          <label className="field">
            Seller name <span className="optional">optional</span>
            <input
              name="seller"
              defaultValue={initial?.seller}
              placeholder="As shown in the papers"
              maxLength={120}
            />
          </label>
          <label className="field">
            What are you working on?
            <select aria-label="What are you working on?" name="purpose" defaultValue={initial?.purpose || 'purchase'}>
              <option value="purchase">Review before a purchase</option>
              <option value="mutation">
                Understand mutation / update records
              </option>
              <option value="records">
                Collect and understand property records
              </option>
            </select>
          </label>
          <p className="form-note">
            <CircleHelp size={16} />
            You can leave identifiers blank if you don’t know them. The review
            will mark missing context.
          </p>
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? <Loader2 className="spin" size={17} /> : <Plus size={17} />}
            {initial ? 'Save case details' : 'Create case'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function UploadModal({
  onClose,
  onSubmit,
  busy,
  aiEnabled,
}: {
  onClose: () => void;
  onSubmit: (d: FormData) => void;
  busy: boolean;
  aiEnabled: boolean;
}) {
  const [file, setFile] = useState<File | null>(null),
    [consent, setConsent] = useState(false),
    [consentedToAi, setConsentedToAi] = useState(false),
    [fileError, setFileError] = useState(""),
    [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { setConsent(false); setConsentedToAi(false); }, [aiEnabled]);
  function pick(f: File | undefined) {
    if (!f) return;
    setConsent(false);
    setConsentedToAi(false);
    setFileError("");
    if (f.size > 10 * 1024 * 1024) {
      setFileError("Please choose a file smaller than 10 MB.");
      setFile(null);
      return;
    }
    if (
      !["application/pdf", "image/png", "image/jpeg", "text/plain"].includes(
        f.type,
      )
    ) {
      setFileError("Choose a PDF, JPG, PNG, or plain-text file.");
      setFile(null);
      return;
    }
    setFile(f);
  }
  return (
    <Modal
      title="Add a property document"
      subtitle={aiEnabled ? "Choose a fictional document. With your consent, the file is sent through our server to Google Gemini for extraction. Review the resulting fields against your original copy." : "Gemini is not configured. Choose a fictional file to save its metadata, then enter fields manually. In this mode, its contents are not sent for AI extraction."}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!file || !consent) return;
          const data = new FormData(e.currentTarget);
          data.set("file", file);
          data.set("consent", "true");
          // Capture the disclosure actually accepted, not a later server config.
          data.set("aiConsent", consentedToAi ? "true" : "false");
          onSubmit(data);
        }}
      >
        <div className="form-body">
          <p className="form-note">
            Need a safe practice file? <a href="/demo-files/fictional-sale-deed.txt" download="fictional-sale-deed.txt">Download a fictional sale deed</a> or <a href="/demo-files/fictional-jamabandi.txt" download="fictional-jamabandi.txt">a fictional Jamabandi</a>, then choose the downloaded file below.
          </p>
          <label className="field">
            Document type
            <select aria-label="Document type" name="kind" defaultValue="sale_deed">
              {Object.entries(DOCUMENT_LABELS).map(([k, l]) => (
                <option value={k} key={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <button
            className={`upload-zone ${drag ? "dragging" : ""}`}
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              pick(e.dataTransfer.files[0]);
            }}
          >
            <UploadCloud size={34} />
            <strong>{file ? file.name : "Drop your document here"}</strong>
            <span>
              {file
                ? `${(file.size / 1024).toFixed(1)} KB · click to replace`
                : "or click to choose a file"}
            </span>
            <small>PDF, JPG, PNG, or TXT · up to 10 MB</small>
          </button>
          <input
            ref={input}
            className="sr-only"
            type="file"
            accept="application/pdf,image/png,image/jpeg,text/plain"
            onChange={(e) => pick(e.target.files?.[0])}
            tabIndex={-1}
            aria-label="Document file"
          />
          {fileError && (
            <p className="inline-error" role="alert">
              {fileError}
            </p>
          )}
          <label className="consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => { setConsent(e.target.checked); setConsentedToAi(e.target.checked && aiEnabled); }}
              required
            />
            <span>
              {aiEnabled ? "I have permission to use this fictional document and consent to sending it through the app server to Google Gemini. Google’s applicable terms govern processing. This app saves metadata, extracted fields, and quotes in my browser, not the original file." : "I am using a fictional document. I understand its metadata and the fields I enter will be saved in this browser. No original file is retained, and no AI extraction is performed in manual mode."}
            </span>
          </label>
          <p className="form-note">
            Keep your own copy: original files cannot be downloaded from this workspace.
            AI extraction may fail or make mistakes; manual review remains available.
            Do not use real property records, Aadhaar numbers, bank details, or personal information.
          </p>
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="button primary"
            disabled={busy || !file || !consent}
          >
            {busy ? (
              <Loader2 className="spin" size={17} />
            ) : (
              <UploadCloud size={17} />
            )}{" "}
            {busy ? (aiEnabled ? "Extracting with Gemini…" : "Saving metadata…") : (aiEnabled ? "Upload and extract" : "Add document for manual review")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EvidenceModal({
  doc,
  onClose,
  onSave,
  onDownload,
  busy,
}: {
  doc: PropertyDocument;
  onClose: () => void;
  onSave: (f: ExtractedFields) => void;
  onDownload: () => void;
  busy: boolean;
}) {
  const [fields, setFields] = useState<ExtractedFields>(
    structuredClone(doc.fields),
  );
  const [added, setAdded] = useState<FieldName | " ">(" ");
  const [confirmed, setConfirmed] = useState(false);
  const update = (
    key: FieldName,
    prop: "value" | "quote" | "page",
    value: string,
  ) => {
    setConfirmed(false);
    setFields((old) => ({
      ...old,
      [key]: {
        value: "",
        quote: "",
        page: null,
        confidence: "low",
        ...old[key],
        [prop]: prop === "page" ? (value ? Number(value) : null) : value,
      },
    }));
  };
  return (
    <Modal
      title="Review the document fields"
      subtitle={`${doc.name} · ${DOCUMENT_LABELS[doc.kind]}`}
      onClose={onClose}
    >
      <div className="evidence-toolbar">
        <Badge tone={doc.reviewed ? "consistent" : "review"}>
          {doc.reviewed ? "Marked reviewed" : "Human review needed"}
        </Badge>
        {doc.extraction === "demo" && <button className="text-button" onClick={onDownload} disabled={busy}>
          <ArrowDownToLine size={15} />
          Download sample evidence
        </button>}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (confirmed) onSave(Object.fromEntries(Object.entries(fields).filter(([, field]) => field?.value.trim())) as ExtractedFields);
        }}
      >
        <div className="evidence-editor">
          {doc.originalAvailability === "not_retained" && <p className="form-note">The original file is not retained. Open your own fictional copy and compare each value, page number, and quote with it. {doc.extraction === "gemini" ? "Gemini extraction can be incomplete or wrong; correct it before marking reviewed." : "Add or correct fields manually and leave unsupported values blank."} Save a workspace backup regularly.</p>}
          {doc.notes.map((n, i) => (
            <p className="form-note" key={i}>
              {n}
            </p>
          ))}
          {!Object.keys(fields).length && (
            <div className="alert info">
              <CircleHelp size={18} />
              <span>
                No fields entered yet. Add values from your fictional document
                below. Leave anything you cannot establish blank.
              </span>
            </div>
          )}
          {(
            Object.entries(fields) as [
              FieldName,
              NonNullable<ExtractedFields[FieldName]>,
            ][]
          ).map(([key, f]) => (
            <div className="evidence-field" key={key}>
              <div className="evidence-field-heading">
                <label htmlFor={`value-${key}`}>{FIELD_LABELS[key]}</label>
                <span className={`confidence ${f.confidence}`}>
                  {f.confidence} confidence
                </span>
              </div>
              <input
                id={`value-${key}`}
                value={f.value}
                maxLength={500}
                onChange={(e) => update(key, "value", e.target.value)}
              />
              <div className="source-edit">
                <label>
                  Source quote
                  <textarea
                    value={f.quote}
                    placeholder="Copy the supporting words from the document"
                    maxLength={1500}
                    onChange={(e) => update(key, "quote", e.target.value)}
                  />
                </label>
                <label>
                  Page
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={f.page ?? ""}
                    placeholder="—"
                    onChange={(e) => update(key, "page", e.target.value)}
                  />
                </label>
              </div>
            </div>
          ))}
          <div className="add-field">
            <select
              aria-label="Choose a field to add"
              value={added}
              onChange={(e) => setAdded(e.target.value as FieldName)}
            >
              <option value=" ">Add a missing field…</option>
              {Object.entries(FIELD_LABELS)
                .filter(([key]) => !fields[key as FieldName])
                .map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
            </select>
            <button
              type="button"
              className="button secondary small"
              disabled={added === " "}
              onClick={() => {
                if (added === " ") return;
                setFields({
                  ...fields,
                  [added]: {
                    value: "",
                    quote: "",
                    page: null,
                    confidence: "low",
                  },
                });
                setAdded(" ");
                setConfirmed(false);
              }}
            >
              <Plus size={16} />
              Add
            </button>
          </div>
          <label className="consent">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              required
            />
            <span>
              I compared these values with the source. Marking them reviewed
              does not authenticate the document or verify ownership.
            </span>
          </label>
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Close
          </button>
          <button className="button primary" disabled={busy || !confirmed}>
            {busy ? (
              <Loader2 className="spin" size={17} />
            ) : (
              <Check size={17} />
            )}
            Save reviewed fields
          </button>
        </div>
      </form>
    </Modal>
  );
}
