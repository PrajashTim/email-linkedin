"use client";

import {
  ArrowUpRight,
  BarChart3,
  BadgeCheck,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Copy,
  ExternalLink,
  Filter,
  Mail,
  Menu,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Target,
  UserRoundCheck,
  Video,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Lead = {
  row: number;
  company: string;
  city: string;
  website: string;
  person: string;
  title: string;
  linkedIn: string;
  email: string;
  youtube: string;
  signal: string;
  message: string;
  day3Message: string;
  day7Message: string;
  matchScore: number;
  matchStatus: string;
  eligibility: string;
  channel: string;
  connectionStatus: string;
  emailStatus: string;
  enrichmentStatus: string;
  workflowStatus: string;
  workflowReason: string;
  emailSequenceStatus: string;
  emailNextActionAt: string;
  emailPausedStep: string;
};

type DashboardData = {
  leads: Lead[];
  stats: { total: number; verified: number; openProfile: number; ready: number };
  pipeline: { status: string; nextRow: number; endRow: number };
  pagination?: { offset: number; limit: number; returned: number; totalCandidates: number; hasMore: boolean };
};

type YouTubeVideo = {
  id: string;
  title: string;
  published: string;
  thumbnail: string;
  url: string;
};

type DashboardView = "queue" | "all" | "linkedin" | "linkedin-contacted" | "email" | "follow-ups" | "held" | "results";

const demo: DashboardData = {
  stats: { total: 8699, verified: 412, openProfile: 0, ready: 186 },
  pipeline: { status: "ready", nextRow: 698, endRow: 8700 },
  pagination: { offset: 0, limit: 80, returned: 3, totalCandidates: 3, hasMore: false },
  leads: [
    {
      row: 10,
      company: "Sandler Law Group",
      city: "Virginia Beach",
      website: "https://sandlerlaw.net/",
      person: "Greg Sandler",
      title: "Founder & Attorney",
      linkedIn: "https://www.linkedin.com/in/gregsandler",
      email: "gsandler@sandler.net",
      youtube: "https://www.youtube.com/channel/UCxqe9HplAE-_Dg646ppYIqw",
      signal: "Inactive on YouTube · 730 days",
      message: "Greg, your Pink Ride video has 313 views, while the rest are under 20. We mapped the exact Virginia Beach searches that signal someone is ready to hire a personal injury attorney. Worth sending the 90-second script concept?",
      day3Message: "Greg, just following up on the Virginia Beach search opportunity I mentioned. Want me to send the strongest 90-second video concept?",
      day7Message: "Greg, I will close the loop after this. If a short, search-led video idea would help Sandler Law Group, I am happy to send it over.",
      matchScore: 72,
      matchStatus: "Needs review",
      eligibility: "Review identity",
      channel: "Email first",
      connectionStatus: "Not sent",
      emailStatus: "Sent",
      enrichmentStatus: "review",
      workflowStatus: "Active",
      workflowReason: "",
      emailSequenceStatus: "Follow-up review",
      emailNextActionAt: "",
      emailPausedStep: "",
    },
    {
      row: 18,
      company: "Thompson Law Group",
      city: "Dallas",
      website: "https://1800lionlaw.com/",
      person: "Brett Thompson",
      title: "Founder",
      linkedIn: "https://www.linkedin.com/in/brett-thompson-80b62148/",
      email: "brett@1800lionlaw.com",
      youtube: "https://www.youtube.com/@1800lionlaw",
      signal: "Strong decision-maker match",
      message: "Brett, your injury guides already answer the questions people ask before calling. I found three high-intent searches that could turn into short videos with a direct consultation CTA. Want the strongest one?",
      day3Message: "Brett, circling back on those high-intent Dallas searches. Would seeing the strongest video angle be useful?",
      day7Message: "Brett, closing the loop here. If content around the searches people make right before hiring would be helpful, I can send a concise outline.",
      matchScore: 94,
      matchStatus: "Verified",
      eligibility: "Connect",
      channel: "LinkedIn",
      connectionStatus: "Ready",
      emailStatus: "Not sent",
      enrichmentStatus: "verified",
      workflowStatus: "Active",
      workflowReason: "",
      emailSequenceStatus: "Not started",
      emailNextActionAt: "",
      emailPausedStep: "",
    },
    {
      row: 24,
      company: "Davis Law Group",
      city: "Seattle",
      website: "https://www.injurytriallawyer.com/",
      person: "Chris Davis",
      title: "Founder & Principal",
      linkedIn: "https://www.linkedin.com/company/davis-law-group-p-c-/",
      email: "info@injurytriallawyer.com",
      youtube: "",
      signal: "Company profile only",
      message: "Chris, I noticed your site has strong case education but no recent video path for Seattle accident searches. We can turn one proven search into a concise script you record once. Worth a look?",
      day3Message: "Chris, following up on the Seattle video-search idea. Would a one-page concept be useful?",
      day7Message: "Chris, I will leave this here after today. If you want a concise search-led video concept for Davis Law Group, I can send it.",
      matchScore: 61,
      matchStatus: "Company only",
      eligibility: "Find person",
      channel: "Email first",
      connectionStatus: "Missing person",
      emailStatus: "Not sent",
      enrichmentStatus: "company_only",
      workflowStatus: "Active",
      workflowReason: "",
      emailSequenceStatus: "Not started",
      emailNextActionAt: "",
      emailPausedStep: "",
    },
  ],
};

const filters = ["Priority", "Verified", "Needs review", "Ready to connect", "Email first"];
const SPACEMAIL_WEB_URL = "https://www.spacemail.com/mail/?f=INBOX";
const HOLD_REASONS = [
  "Stale or inactive YouTube channel",
  "Contacted — not interested",
  "Wrong contact or decision maker",
  "Not a fit for this offer",
  "Do not contact / already has a provider",
];

function emailSubject(lead: Lead) {
  return `Quick idea for ${lead.company}`;
}

function normalizedWorkflowStatus(lead: Lead) {
  return lead.workflowStatus || "Active";
}

function normalizedSequenceStatus(lead: Lead) {
  return lead.emailSequenceStatus || (hasEmailOutreach(lead.emailStatus) ? "Follow-up review" : "Not started");
}

function isHeld(lead: Lead) {
  return normalizedWorkflowStatus(lead) !== "Active" || normalizedSequenceStatus(lead) === "Paused";
}

function currentSequenceStep(lead: Lead) {
  const status = normalizedSequenceStatus(lead).toLowerCase();
  if (status.includes("paused")) {
    const paused = lead.emailPausedStep.toLowerCase();
    if (paused.includes("day 7")) return "day7" as const;
    if (paused.includes("day 3")) return "day3" as const;
  }
  if (status.includes("day 7") || status.includes("awaiting") || status.includes("no reply")) return "day7" as const;
  if (status.includes("day 3") || status.includes("follow-up")) return "day3" as const;
  return "day1" as const;
}

function sequenceStepLabel(lead: Lead) {
  const step = currentSequenceStep(lead);
  return step === "day1" ? "Day 1" : step === "day3" ? "Day 3" : "Day 7";
}

function currentSequenceMessage(lead: Lead) {
  const step = currentSequenceStep(lead);
  if (step === "day3") return lead.day3Message || lead.message || "";
  if (step === "day7") return lead.day7Message || lead.day3Message || lead.message || "";
  return lead.message || "";
}

function readableNextAction(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function gmailDraftUrl(lead: Lead) {
  if (!lead.email) return undefined;
  const draft = new URL("https://mail.google.com/mail/");
  draft.searchParams.set("view", "cm");
  draft.searchParams.set("fs", "1");
  draft.searchParams.set("to", lead.email);
  draft.searchParams.set("su", emailSubject(lead));
  draft.searchParams.set("body", currentSequenceMessage(lead));
  return draft.toString();
}

function spaceMailDraftText(lead: Lead) {
  return `To: ${lead.email}\nSubject: ${emailSubject(lead)}\n\n${currentSequenceMessage(lead)}`.trim();
}

function requestedSheetAction() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const row = Number(params.get("row"));
  if (!Number.isInteger(row) || row < 2) return null;
  return { row, prepareSpaceMail: params.get("prepare") === "spacemail" };
}

function scoreTone(score: number) {
  if (score >= 90) return "score score-good";
  if (score >= 80) return "score score-warm";
  return "score score-review";
}

function hasLinkedInOutreach(status: string) {
  return /^(dm sent|message sent|connection request sent|sent|linkedin contacted)$/i.test(status.trim());
}

function hasEmailOutreach(status: string) {
  return /^(sent|email sent|day 1 sent|message sent|true|yes|complete|completed)$/i.test(status.trim());
}

export function LeadGenDashboard() {
  const [data, setData] = useState<DashboardData>(demo);
  const [selected, setSelected] = useState<Lead>(demo.leads[0]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Priority");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState<DashboardView>("queue");
  const [videosOpen, setVideosOpen] = useState(false);
  const [videoCache, setVideoCache] = useState<Record<string, YouTubeVideo[]>>({});
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [spaceMailDraftOpen, setSpaceMailDraftOpen] = useState(false);
  const [preparedSpaceMailRow, setPreparedSpaceMailRow] = useState<number | null>(null);
  const deepLinkHandled = useRef(false);

  const load = useCallback(async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/leadgen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "list", limit: 80 }),
      });
      if (response.ok) {
        const next = (await response.json()) as DashboardData;
        if (next.leads?.length) {
          setData(next);
          setHasMore(Boolean(next.pagination?.hasMore));
          const requested = !deepLinkHandled.current ? requestedSheetAction() : null;
          const alreadyLoaded = requested ? next.leads.find((lead) => lead.row === requested.row) : undefined;
          setSelected((current) => alreadyLoaded || next.leads.find((lead) => lead.row === current.row) || next.leads[0]);

          if (requested) {
            deepLinkHandled.current = true;
            const exactLead = alreadyLoaded || await fetch("/api/leadgen", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ action: "lead", row: requested.row }),
            }).then(async (result) => result.ok ? (await result.json() as { lead?: Lead }).lead : undefined).catch(() => undefined);
            if (exactLead) setSelected(exactLead);
            if (requested.prepareSpaceMail) setPreparedSpaceMailRow(exactLead?.row || requested.row);
          }
        }
      }
    } catch {
      setNotice("Live sheet is reconnecting — showing the latest preview.");
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const response = await fetch("/api/leadgen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "list", limit: 200, offset: data.leads.length }),
      });
      if (!response.ok) throw new Error("load failed");
      const next = (await response.json()) as DashboardData;
      setData((current) => ({ ...next, leads: [...current.leads, ...(next.leads || [])] }));
      setHasMore(Boolean(next.pagination?.hasMore));
    } catch {
      setNotice("Could not load the next leads yet.");
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  const viewCounts = useMemo(() => ({
    linkedin: data.leads.filter((lead) => !isHeld(lead) && Boolean(lead.linkedIn) && !hasLinkedInOutreach(lead.connectionStatus)).length,
    linkedinContacted: data.leads.filter((lead) => !isHeld(lead) && Boolean(lead.linkedIn) && hasLinkedInOutreach(lead.connectionStatus)).length,
    email: data.leads.filter((lead) => !isHeld(lead) && Boolean(lead.email) && !hasEmailOutreach(lead.emailStatus)).length,
    followUps: data.leads.filter((lead) => !isHeld(lead) && Boolean(lead.email) && hasEmailOutreach(lead.emailStatus)).length,
    held: data.leads.filter(isHeld).length,
    verified: data.leads.filter((lead) => lead.matchScore >= 90).length,
    review: data.leads.filter((lead) => lead.matchScore < 80).length,
  }), [data.leads]);

  const leads = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.leads.filter((lead) => {
      const contactedOnLinkedIn = hasLinkedInOutreach(lead.connectionStatus);
      const held = isHeld(lead);
      const matchesView =
        (activeView === "queue" && !held && !contactedOnLinkedIn && !hasEmailOutreach(lead.emailStatus)) ||
        activeView === "all" ||
        activeView === "results" ||
        (activeView === "linkedin" && !held && Boolean(lead.linkedIn) && !contactedOnLinkedIn) ||
        (activeView === "linkedin-contacted" && !held && Boolean(lead.linkedIn) && contactedOnLinkedIn) ||
        (activeView === "email" && !held && Boolean(lead.email) && !hasEmailOutreach(lead.emailStatus)) ||
        (activeView === "follow-ups" && !held && Boolean(lead.email) && hasEmailOutreach(lead.emailStatus)) ||
        (activeView === "held" && held);
      const matchesQuery = !needle || [lead.company, lead.person, lead.city, lead.email].join(" ").toLowerCase().includes(needle);
      const matchesFilter =
        filter === "Priority" ||
        (filter === "Verified" && lead.matchScore >= 90) ||
        (filter === "Needs review" && lead.matchScore < 80) ||
        (filter === "Ready to connect" && lead.eligibility.toLowerCase().includes("connect")) ||
        (filter === "Email first" && lead.channel.toLowerCase().includes("email"));
      return matchesView && matchesQuery && matchesFilter;
    });
  }, [activeView, data.leads, filter, query]);

  const totalCandidates = data.pagination?.totalCandidates || data.stats.total;
  const loadedSummary = leads.length === data.leads.length
    ? `${data.leads.length.toLocaleString()} loaded of ${totalCandidates.toLocaleString()} leads`
    : `${leads.length.toLocaleString()} shown · ${data.leads.length.toLocaleString()} loaded of ${totalCandidates.toLocaleString()}`;

  useEffect(() => {
    if (activeView !== "results" && leads.length && !leads.some((lead) => lead.row === selected.row)) {
      setSelected(leads[0]);
    }
  }, [activeView, leads, selected.row]);

  useEffect(() => {
    setVideosOpen(false);
    setVideoError("");
    setSpaceMailDraftOpen(false);
  }, [selected.row]);

  useEffect(() => {
    if (preparedSpaceMailRow === selected.row) {
      setSpaceMailDraftOpen(true);
      setPreparedSpaceMailRow(null);
    }
  }, [preparedSpaceMailRow, selected.row]);

  const viewCopy: Record<DashboardView, { eyebrow: string; title: string; description: string }> = {
    queue: { eyebrow: "Today", title: "Fresh leads", description: "Untouched email leads, sorted by fit and actionability" },
    all: { eyebrow: "Lead database", title: "All leads", description: "Search the complete Sheet3 lead inventory" },
    linkedin: { eyebrow: "LinkedIn channel", title: "LinkedIn outreach", description: "Profiles found and not yet contacted" },
    "linkedin-contacted": { eyebrow: "LinkedIn channel", title: "LinkedIn contacted", description: "DMs and connection requests recorded in Sheet3" },
    email: { eyebrow: "Email channel", title: "Email ready", description: "Contacts with an email that have not been marked as emailed" },
    "follow-ups": { eyebrow: "Email channel", title: "Follow-ups", description: "Day 1 is sent; Day 3 and Day 7 remain reviewable before sending" },
    held: { eyebrow: "Not now", title: "Held leads", description: "Skipped, paused, and no-response leads stay out of the active queue" },
    results: { eyebrow: "Coverage", title: "Enrichment results", description: "Current completion, verification, and channel coverage" },
  };

  function changeView(view: DashboardView) {
    setActiveView(view);
    setFilter("Priority");
    setQuery("");
    setSidebarOpen(false);
  }

  async function updateLead(row: number, field: string, value: string | boolean, optimisticPatch?: Partial<Lead>) {
    setNotice("Saving to Sheet3…");
    try {
      const response = await fetch("/api/leadgen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "update", row, field, value }),
      });
      if (!response.ok) throw new Error("save failed");
      if (optimisticPatch) {
        const updateStatus = (lead: Lead) => lead.row === row ? { ...lead, ...optimisticPatch } : lead;
        setData((current) => ({ ...current, leads: current.leads.map(updateStatus) }));
        setSelected((current) => current.row === row ? updateStatus(current) : current);
      }
      setNotice("Saved to Sheet3");
    } catch {
      setNotice("Could not save yet. Your sheet was not changed.");
    }
  }

  async function controlPipeline(action: "start" | "stop") {
    setNotice(action === "start" ? "Starting the safe enrichment queue…" : "Pausing after the current row…");
    const response = await fetch("/api/leadgen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: action === "start" ? "startPipeline" : "stopPipeline" }),
    });
    setNotice(response.ok ? (action === "start" ? "Enrichment queue is running" : "Queue paused") : "Pipeline control is temporarily unavailable");
    void load();
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied`);
    } catch {
      setNotice("Copy is unavailable in this browser right now.");
    }
  }

  async function copyMessage() {
    await copyText(currentSequenceMessage(selected), `${sequenceStepLabel(selected)} message`);
  }

  async function sequenceAction(action: "day1Sent" | "day3Sent" | "day7Sent" | "makeDay3Due" | "pause" | "resume" | "noReply") {
    setNotice("Saving email workflow to Sheet3…");
    try {
      const response = await fetch("/api/leadgen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "emailSequence", row: selected.row, sequenceAction: action }),
      });
      if (!response.ok) throw new Error("save failed");
      const next = await response.json() as { lead?: Partial<Lead> };
      const patch = next.lead || {};
      const updateStatus = (lead: Lead) => lead.row === selected.row ? { ...lead, ...patch } : lead;
      setData((current) => ({ ...current, leads: current.leads.map(updateStatus) }));
      setSelected((current) => updateStatus(current));
      setNotice(action === "pause" ? "Email follow-up paused" : action === "resume" ? "Email follow-up is ready for review" : action === "noReply" ? "Moved to No response" : "Sequence updated in Sheet3");
    } catch {
      setNotice("Could not update the email workflow yet.");
    }
  }

  async function setDisposition(status: "Active" | "Skipped" | "No response", reason = "") {
    setNotice("Updating lead status in Sheet3…");
    try {
      const response = await fetch("/api/leadgen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "setDisposition", row: selected.row, status, reason }),
      });
      if (!response.ok) throw new Error("save failed");
      const next = await response.json() as { lead?: Partial<Lead> };
      const patch = next.lead || { workflowStatus: status, workflowReason: reason };
      const updateStatus = (lead: Lead) => lead.row === selected.row ? { ...lead, ...patch } : lead;
      setData((current) => ({ ...current, leads: current.leads.map(updateStatus) }));
      setSelected((current) => updateStatus(current));
      setNotice(status === "Active" ? "Lead returned to the active queue" : "Lead moved to Not now");
    } catch {
      setNotice("Could not update this lead yet.");
    }
  }

  function prepareSpaceMailDraft() {
    setSpaceMailDraftOpen(true);
    window.open(SPACEMAIL_WEB_URL, "_blank", "noopener,noreferrer");
    setNotice("SpaceMail opened. Copy the prepared fields below, then review before sending.");
  }

  async function toggleVideos() {
    if (!selected.youtube) {
      setNotice("No YouTube channel is available for this lead yet.");
      return;
    }
    if (videosOpen) {
      setVideosOpen(false);
      return;
    }

    setVideosOpen(true);
    setVideoError("");
    if (videoCache[selected.youtube]) return;

    setVideoLoading(true);
    try {
      const response = await fetch(`/api/youtube?channel=${encodeURIComponent(selected.youtube)}`);
      const payload = (await response.json()) as { videos?: YouTubeVideo[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load videos");
      setVideoCache((current) => ({ ...current, [selected.youtube]: payload.videos || [] }));
      if (!payload.videos?.length) setVideoError("No recent public videos were found for this channel.");
    } catch (error) {
      setVideoError(error instanceof Error ? error.message : "Could not load recent videos.");
    } finally {
      setVideoLoading(false);
    }
  }

  const sequenceStatus = normalizedSequenceStatus(selected);
  const sequenceStep = currentSequenceStep(selected);
  const sequencePaused = sequenceStatus === "Paused";
  const workflowHeld = normalizedWorkflowStatus(selected) !== "Active";
  const awaitingReply = /awaiting reply/i.test(sequenceStatus);
  const legacyFollowUp = /follow-up review/i.test(sequenceStatus);
  const nextAction = readableNextAction(selected.emailNextActionAt);
  const sequenceSendAction = sequenceStep === "day1" ? "day1Sent" : sequenceStep === "day3" ? "day3Sent" : "day7Sent";
  const sequenceProgress = sequenceStep === "day1" ? 0 : sequenceStep === "day3" ? 1 : 2;
  const sequenceSummary = sequencePaused
    ? `Paused at ${selected.emailPausedStep || sequenceStepLabel(selected)}`
    : awaitingReply
      ? "All planned emails were sent — waiting for a reply"
      : legacyFollowUp
        ? "Historic Day 1 send — choose when to begin Day 3 review"
        : nextAction
          ? `${sequenceStepLabel(selected)} review opens ${nextAction}`
          : sequenceStatus;

  return (
    <div className="app-shell">
      <aside className={sidebarOpen ? "sidebar sidebar-open" : "sidebar"}>
        <div className="brand">
          <div className="brand-mark"><Target size={20} /></div>
          <div><strong>LeadGen</strong><span>Command Center</span></div>
        </div>
        <nav>
          <button className={activeView === "queue" ? "nav-item active" : "nav-item"} onClick={() => changeView("queue")} aria-current={activeView === "queue" ? "page" : undefined}><Sparkles size={18} /> Today&apos;s queue <span>{data.stats.ready}</span></button>
          <button className={activeView === "all" ? "nav-item active" : "nav-item"} onClick={() => changeView("all")} aria-current={activeView === "all" ? "page" : undefined}><UserRoundCheck size={18} /> All leads</button>
          <button className={activeView === "linkedin" ? "nav-item active" : "nav-item"} onClick={() => changeView("linkedin")} aria-current={activeView === "linkedin" ? "page" : undefined}><BadgeCheck size={18} /> LinkedIn <span>{viewCounts.linkedin}</span></button>
          <button className={activeView === "linkedin-contacted" ? "nav-item active" : "nav-item"} onClick={() => changeView("linkedin-contacted")} aria-current={activeView === "linkedin-contacted" ? "page" : undefined}><Send size={18} /> Contacted <span>{viewCounts.linkedinContacted}</span></button>
          <button className={activeView === "email" ? "nav-item active" : "nav-item"} onClick={() => changeView("email")} aria-current={activeView === "email" ? "page" : undefined}><Mail size={18} /> Email <span>{viewCounts.email}</span></button>
          <button className={activeView === "follow-ups" ? "nav-item active" : "nav-item"} onClick={() => changeView("follow-ups")} aria-current={activeView === "follow-ups" ? "page" : undefined}><Check size={18} /> Follow-ups <span>{viewCounts.followUps}</span></button>
          <button className={activeView === "held" ? "nav-item active" : "nav-item"} onClick={() => changeView("held")} aria-current={activeView === "held" ? "page" : undefined}><Pause size={18} /> Not now <span>{viewCounts.held}</span></button>
          <button className={activeView === "results" ? "nav-item active" : "nav-item"} onClick={() => changeView("results")} aria-current={activeView === "results" ? "page" : undefined}><BarChart3 size={18} /> Results</button>
        </nav>
        <div className="sidebar-foot">
          <div className="usage-row"><span>Apify guardrail</span><strong>$4.00 max</strong></div>
          <div className="usage-bar"><span style={{ width: "1%" }} /></div>
          <small>Paid checks only run after identity verification.</small>
        </div>
      </aside>

      <main className="main-column">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setSidebarOpen((value) => !value)} aria-label="Toggle menu"><Menu size={20} /></button>
          <div>
            <p className="eyebrow">{viewCopy[activeView].eyebrow}</p>
            <h1>{viewCopy[activeView].title}</h1>
          </div>
          <div className="top-actions">
            <button className="ghost-button" onClick={load} disabled={syncing}><RefreshCw size={16} className={syncing ? "spin" : ""} /> Sync sheet</button>
            {data.pipeline.status === "running" ? (
              <button className="primary-button pause" onClick={() => controlPipeline("stop")}><Pause size={16} /> Pause enrichment</button>
            ) : (
              <button className="primary-button" onClick={() => controlPipeline("start")}><Play size={16} /> Run enrichment</button>
            )}
          </div>
        </header>

        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}

        <section className="stats-grid" aria-label="Pipeline summary">
          <article><span>Total leads</span><strong>{data.stats.total.toLocaleString()}</strong><small>Live Sheet3 mirror</small></article>
          <article><span>Verified people</span><strong>{data.stats.verified.toLocaleString()}</strong><small>90+ identity score</small></article>
          <article><span>Open Profile</span><strong>{data.stats.openProfile.toLocaleString()}</strong><small>Paid check required</small></article>
          <article className="stat-accent"><span>Ready for action</span><strong>{data.stats.ready.toLocaleString()}</strong><small>Human-reviewed next steps</small></article>
        </section>

        {activeView === "results" ? (
          <section className="results-view" aria-label="Enrichment results">
            <div className="results-summary">
              <article><BadgeCheck size={20} /><span>LinkedIn coverage</span><strong>{viewCounts.linkedin}</strong><small>Profiles in the currently loaded working set</small></article>
              <article><Mail size={20} /><span>Email ready</span><strong>{viewCounts.email}</strong><small>Contacts not yet marked as emailed</small></article>
              <article><Check size={20} /><span>Follow-ups</span><strong>{viewCounts.followUps}</strong><small>Day 3 and Day 7 stays reviewable</small></article>
              <article><Pause size={20} /><span>Not now</span><strong>{viewCounts.held}</strong><small>Skipped, paused, or no-response leads</small></article>
              <article><UserRoundCheck size={20} /><span>Verified people</span><strong>{viewCounts.verified}</strong><small>Identity match score of 90 or higher</small></article>
              <article><CircleAlert size={20} /><span>Needs review</span><strong>{viewCounts.review}</strong><small>Manual identity review recommended</small></article>
            </div>
            <div className="coverage-card">
              <div className="section-title"><span>Pipeline coverage</span><small>{data.pipeline.status}</small></div>
              <div className="coverage-row"><span>LinkedIn candidates</span><div><i style={{ width: `${data.leads.length ? Math.round((viewCounts.linkedin / data.leads.length) * 100) : 0}%` }} /></div><strong>{data.leads.length ? Math.round((viewCounts.linkedin / data.leads.length) * 100) : 0}%</strong></div>
              <div className="coverage-row"><span>Email ready</span><div><i style={{ width: `${data.leads.length ? Math.round((viewCounts.email / data.leads.length) * 100) : 0}%` }} /></div><strong>{data.leads.length ? Math.round((viewCounts.email / data.leads.length) * 100) : 0}%</strong></div>
              <div className="coverage-row"><span>Follow-ups</span><div><i style={{ width: `${data.leads.length ? Math.round((viewCounts.followUps / data.leads.length) * 100) : 0}%` }} /></div><strong>{data.leads.length ? Math.round((viewCounts.followUps / data.leads.length) * 100) : 0}%</strong></div>
              <div className="coverage-row"><span>Not now</span><div><i style={{ width: `${data.leads.length ? Math.round((viewCounts.held / data.leads.length) * 100) : 0}%` }} /></div><strong>{data.leads.length ? Math.round((viewCounts.held / data.leads.length) * 100) : 0}%</strong></div>
              <div className="coverage-row"><span>Verified decision makers</span><div><i style={{ width: `${data.leads.length ? Math.round((viewCounts.verified / data.leads.length) * 100) : 0}%` }} /></div><strong>{data.leads.length ? Math.round((viewCounts.verified / data.leads.length) * 100) : 0}%</strong></div>
              <p>Coverage percentages use the leads returned by the current Sheet3 sync. The total cards above remain the authoritative full-list totals.</p>
            </div>
          </section>
        ) : (
        <section className="workspace">
          <div className="queue-panel">
            <div className="queue-toolbar">
              <label className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search company, person, or city" /></label>
              <div className="filter-menu"><Filter size={16} /><select value={filter} onChange={(event) => setFilter(event.target.value)}>{filters.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={15} /></div>
            </div>
            <div className="queue-heading"><span>{loadedSummary}</span><small>{viewCopy[activeView].description}</small></div>
            <div className="lead-list">
              {loading ? <div className="empty-state">Loading Sheet3…</div> : leads.map((lead, index) => (
                <button key={lead.row} className={selected.row === lead.row ? "lead-row selected" : "lead-row"} onClick={() => setSelected(lead)}>
                  <div className="avatar">{lead.company.split(/\s+/).slice(0, 2).map((word) => word[0]).join("")}</div>
                  <div className="lead-main"><strong>{lead.company}</strong><span>{lead.person || "Person not verified"} · {lead.city}</span><small>{lead.signal}</small></div>
                  <div className="lead-meta"><small className="lead-position">#{index + 1} · Row {lead.row}</small><span className={scoreTone(lead.matchScore)}>{lead.matchScore}</span><small>{lead.channel}</small></div>
                </button>
              ))}
              {!loading && !leads.length && <div className="empty-state">No leads match this view.</div>}
              {!loading && hasMore ? <button className="load-more" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading more leads…" : `Load 200 more · ${data.leads.length.toLocaleString()} of ${totalCandidates.toLocaleString()} loaded`}</button> : null}
            </div>
          </div>

          <aside className="detail-panel">
            <div className="detail-head">
              <div><p className="eyebrow">ROW {selected.row}</p><h2>{selected.company}</h2><span>{selected.city}</span></div>
              <button className="icon-button" aria-label="More lead options"><MoreHorizontal size={20} /></button>
            </div>

            <button className="identity-card identity-button" onClick={toggleVideos} aria-expanded={videosOpen} aria-controls="recent-youtube-videos" title={selected.youtube ? "Preview recent YouTube videos" : "No YouTube channel available"}>
              <div className="person-avatar">{selected.person ? selected.person.split(/\s+/).map((part) => part[0]).slice(0, 2).join("") : "?"}</div>
              <div><strong>{selected.person || "Decision maker needed"}</strong><span>{selected.title || "Unverified role"}</span><div className="badges"><span className={scoreTone(selected.matchScore)}>{selected.matchScore}% match</span><span className="soft-badge">{selected.matchStatus}</span></div></div>
              <span className={videosOpen ? "video-chevron video-chevron-open" : "video-chevron"}><Video size={15} /><ChevronDown size={15} /></span>
            </button>

            {videosOpen && (
              <div className="video-drawer" id="recent-youtube-videos">
                <div className="video-drawer-head"><div><strong>Recent YouTube videos</strong><span>Play without leaving this lead</span></div><a href={selected.youtube} target="_blank" rel="noreferrer">Full channel <ArrowUpRight size={14} /></a></div>
                {videoLoading ? <div className="video-loading"><RefreshCw size={17} className="spin" /> Loading recent videos…</div> : null}
                {videoError ? <div className="video-error">{videoError}</div> : null}
                {!videoLoading && !videoError && videoCache[selected.youtube]?.length ? (
                  <div className="video-grid">
                    {videoCache[selected.youtube].map((video) => (
                      <article className="video-card" key={video.id}>
                        <div className="video-frame"><iframe src={`https://www.youtube-nocookie.com/embed/${video.id}`} title={video.title} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div>
                        <div><strong>{video.title}</strong><a href={video.url} target="_blank" rel="noreferrer">Open on YouTube <ArrowUpRight size={12} /></a></div>
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            {selected.matchScore < 80 && <div className="warning-card"><CircleAlert size={18} /><div><strong>Review before contacting</strong><span>The website/company evidence is not strong enough for frictionless outreach yet.</span></div></div>}

            <section className="sequence-card" aria-label="Email sequence">
              <div className="section-title"><span>Email sequence</span><small>{sequenceStatus}</small></div>
              <div className="sequence-progress" aria-label={`Current stage: ${sequenceStepLabel(selected)}`}>
                {["Day 1", "Day 3", "Day 7"].map((step, index) => <div key={step} className={index < sequenceProgress ? "sequence-step done" : index === sequenceProgress ? "sequence-step current" : "sequence-step"}><i>{index < sequenceProgress ? <Check size={11} /> : index + 1}</i><span>{step}</span></div>)}
              </div>
              <p>{sequenceSummary}. Nothing is sent automatically.</p>
              <div className="sequence-actions">
                {workflowHeld ? (
                  <span className="sequence-locked">Email is closed for this lead: {normalizedWorkflowStatus(selected)}.</span>
                ) : awaitingReply ? (
                  <button className="sequence-button primary" onClick={() => void sequenceAction("noReply")}><Check size={15} /> Mark no reply</button>
                ) : legacyFollowUp ? (
                  <button className="sequence-button primary" onClick={() => void sequenceAction("makeDay3Due")}><Play size={15} /> Start Day 3 review</button>
                ) : (
                  <>
                    <a className={selected.email && !sequencePaused ? "sequence-button primary" : "sequence-button disabled"} href={selected.email && !sequencePaused ? gmailDraftUrl(selected) : undefined} target="_blank" rel="noreferrer" aria-disabled={!selected.email || sequencePaused}><Mail size={15} /> Compose {sequenceStepLabel(selected)}</a>
                    <button className="sequence-button" onClick={() => void sequenceAction(sequenceSendAction)} disabled={!selected.email || sequencePaused}><Check size={15} /> Mark {sequenceStepLabel(selected)} sent</button>
                  </>
                )}
                {!workflowHeld && <button className="sequence-button" onClick={() => sequencePaused ? void sequenceAction("resume") : void sequenceAction("pause")} disabled={awaitingReply}><Pause size={15} /> {sequencePaused ? "Resume" : "Pause email"}</button>}
                {!workflowHeld && <button className="sequence-button" onClick={prepareSpaceMailDraft} disabled={!selected.email || sequencePaused || awaitingReply}><Copy size={15} /> SpaceMail</button>}
              </div>
            </section>

            <div className="section-title"><span>LinkedIn action</span><small>{selected.eligibility}</small></div>
            <div className="action-grid">
              <a className="action primary-action" href={selected.linkedIn || undefined} target="_blank" rel="noreferrer"><BadgeCheck size={18} /><span><strong>Open LinkedIn</strong><small>{selected.connectionStatus}</small></span><ArrowUpRight size={16} /></a>
              {hasLinkedInOutreach(selected.connectionStatus) ? (
                <button className="action" onClick={() => updateLead(selected.row, "LinkedIn Connection Status", "Ready", { connectionStatus: "Ready" })}><Check size={18} /><span><strong>Undo LinkedIn contact</strong><small>Return this lead to the active queue</small></span></button>
              ) : (
                <button className="action" onClick={() => updateLead(selected.row, "LinkedIn Connection Status", "DM sent", { connectionStatus: "DM sent" })}><Send size={18} /><span><strong>Mark LinkedIn DM sent</strong><small>Moves this lead to Contacted</small></span></button>
              )}
              {!hasLinkedInOutreach(selected.connectionStatus) && <button className="action" onClick={() => updateLead(selected.row, "Connection Request Sent", true, { connectionStatus: "Sent" })}><UserRoundCheck size={18} /><span><strong>Mark connection request sent</strong><small>Writes a timestamp to Sheet3</small></span></button>}
              {normalizedWorkflowStatus(selected) === "Active" ? (
                <label className="action hold-action"><Pause size={18} /><span><strong>Move to Not now</strong><small>Choose a reason — it saves immediately</small></span><select aria-label="Reason to move lead to Not now" defaultValue="" onChange={(event) => { const reason = event.currentTarget.value; if (reason) { event.currentTarget.value = ""; void setDisposition("Skipped", reason); } }}><option value="" disabled>Choose a reason…</option>{HOLD_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}</select></label>
              ) : (
                <button className="action" onClick={() => void setDisposition("Active")}><Play size={18} /><span><strong>Restore lead</strong><small>{selected.workflowReason || "Return it to the active queue"}</small></span></button>
              )}
            </div>

            {spaceMailDraftOpen && <div className="spacemail-card" aria-label="SpaceMail draft">
              <div className="section-title"><span>SpaceMail draft</span><a href={SPACEMAIL_WEB_URL} target="_blank" rel="noreferrer">Open SpaceMail <ArrowUpRight size={13} /></a></div>
              <p>SpaceMail&apos;s web composer does not accept prefilled draft URLs. Nothing is sent automatically: copy each field, paste it into the draft, and review it before you send.</p>
              <div className="draft-field"><span>To</span><strong>{selected.email || "No email available"}</strong><button onClick={() => void copyText(selected.email, "Recipient")}>Copy</button></div>
              <div className="draft-field"><span>Subject</span><strong>{emailSubject(selected)}</strong><button onClick={() => void copyText(emailSubject(selected), "Subject")}>Copy</button></div>
              <div className="draft-message"><div><span>{sequenceStepLabel(selected)} body</span><button onClick={copyMessage}>Copy body</button></div><p>{currentSequenceMessage(selected) || `No ${sequenceStepLabel(selected)} message has been generated for this row yet.`}</p></div>
              <button className="copy-draft" onClick={() => void copyText(spaceMailDraftText(selected), "Full SpaceMail draft")}>Copy full draft for reference</button>
            </div>}

            <div className="message-card">
              <div className="section-title"><span>{sequenceStepLabel(selected)} message</span><button onClick={copyMessage}>Copy</button></div>
              <p>{currentSequenceMessage(selected) || `No ${sequenceStepLabel(selected)} message has been generated for this row yet.`}</p>
            </div>

            <div className="evidence-list">
              <div className="section-title"><span>Source signals</span><small>Live links</small></div>
              <a href={selected.website || undefined} target="_blank" rel="noreferrer"><ExternalLink size={17} /><span><strong>Company website</strong><small>{selected.website || "Missing"}</small></span></a>
              <a href={selected.youtube || undefined} target="_blank" rel="noreferrer" className={!selected.youtube ? "muted-link" : ""}><Video size={17} /><span><strong>YouTube channel</strong><small>{selected.youtube ? selected.signal : "Not found"}</small></span></a>
              <div><Clock3 size={17} /><span><strong>Enrichment status</strong><small>{selected.enrichmentStatus}</small></span><Check size={16} /></div>
            </div>
          </aside>
        </section>
        )}
      </main>
    </div>
  );
}
