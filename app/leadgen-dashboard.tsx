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
import { useCallback, useEffect, useMemo, useState } from "react";

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
  matchScore: number;
  matchStatus: string;
  eligibility: string;
  channel: string;
  connectionStatus: string;
  enrichmentStatus: string;
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

type DashboardView = "queue" | "all" | "linkedin" | "email" | "results";

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
      matchScore: 72,
      matchStatus: "Needs review",
      eligibility: "Review identity",
      channel: "Email first",
      connectionStatus: "Not sent",
      enrichmentStatus: "review",
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
      matchScore: 94,
      matchStatus: "Verified",
      eligibility: "Connect",
      channel: "LinkedIn",
      connectionStatus: "Ready",
      enrichmentStatus: "verified",
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
      matchScore: 61,
      matchStatus: "Company only",
      eligibility: "Find person",
      channel: "Email first",
      connectionStatus: "Missing person",
      enrichmentStatus: "company_only",
    },
  ],
};

const filters = ["Priority", "Verified", "Needs review", "Ready to connect", "Email first"];

function scoreTone(score: number) {
  if (score >= 90) return "score score-good";
  if (score >= 80) return "score score-warm";
  return "score score-review";
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
          setSelected((current) => next.leads.find((lead) => lead.row === current.row) || next.leads[0]);
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
    linkedin: data.leads.filter((lead) => Boolean(lead.linkedIn)).length,
    email: data.leads.filter((lead) => Boolean(lead.email)).length,
    verified: data.leads.filter((lead) => lead.matchScore >= 90).length,
    review: data.leads.filter((lead) => lead.matchScore < 80).length,
  }), [data.leads]);

  const leads = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.leads.filter((lead) => {
      const matchesView =
        activeView === "queue" ||
        activeView === "all" ||
        activeView === "results" ||
        (activeView === "linkedin" && Boolean(lead.linkedIn)) ||
        (activeView === "email" && Boolean(lead.email));
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
  }, [selected.row]);

  const viewCopy: Record<DashboardView, { eyebrow: string; title: string; description: string }> = {
    queue: { eyebrow: "Today", title: "Your highest-leverage leads", description: "Sorted by fit, evidence, and actionability" },
    all: { eyebrow: "Lead database", title: "All leads", description: "Search the complete Sheet3 lead inventory" },
    linkedin: { eyebrow: "LinkedIn channel", title: "LinkedIn outreach", description: "Profiles found and ready for identity review" },
    email: { eyebrow: "Email channel", title: "Email outreach", description: "Contacts with an email and current Day 1 copy" },
    results: { eyebrow: "Coverage", title: "Enrichment results", description: "Current completion, verification, and channel coverage" },
  };

  function changeView(view: DashboardView) {
    setActiveView(view);
    setFilter("Priority");
    setQuery("");
    setSidebarOpen(false);
  }

  async function updateLead(row: number, field: string, value: string | boolean) {
    setNotice("Saving to Sheet3…");
    try {
      const response = await fetch("/api/leadgen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "update", row, field, value }),
      });
      if (!response.ok) throw new Error("save failed");
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

  async function copyMessage() {
    await navigator.clipboard.writeText(selected.message || "");
    setNotice("LinkedIn message copied");
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
          <button className={activeView === "email" ? "nav-item active" : "nav-item"} onClick={() => changeView("email")} aria-current={activeView === "email" ? "page" : undefined}><Mail size={18} /> Email <span>{viewCounts.email}</span></button>
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
              <article><Mail size={20} /><span>Email coverage</span><strong>{viewCounts.email}</strong><small>Contacts available for email outreach</small></article>
              <article><UserRoundCheck size={20} /><span>Verified people</span><strong>{viewCounts.verified}</strong><small>Identity match score of 90 or higher</small></article>
              <article><CircleAlert size={20} /><span>Needs review</span><strong>{viewCounts.review}</strong><small>Manual identity review recommended</small></article>
            </div>
            <div className="coverage-card">
              <div className="section-title"><span>Pipeline coverage</span><small>{data.pipeline.status}</small></div>
              <div className="coverage-row"><span>LinkedIn candidates</span><div><i style={{ width: `${data.leads.length ? Math.round((viewCounts.linkedin / data.leads.length) * 100) : 0}%` }} /></div><strong>{data.leads.length ? Math.round((viewCounts.linkedin / data.leads.length) * 100) : 0}%</strong></div>
              <div className="coverage-row"><span>Email contacts</span><div><i style={{ width: `${data.leads.length ? Math.round((viewCounts.email / data.leads.length) * 100) : 0}%` }} /></div><strong>{data.leads.length ? Math.round((viewCounts.email / data.leads.length) * 100) : 0}%</strong></div>
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

            <div className="section-title"><span>Recommended next action</span><small>{selected.eligibility}</small></div>
            <div className="action-grid">
              <a className="action primary-action" href={selected.linkedIn || undefined} target="_blank" rel="noreferrer"><BadgeCheck size={18} /><span><strong>Open LinkedIn</strong><small>{selected.connectionStatus}</small></span><ArrowUpRight size={16} /></a>
              <button className="action" onClick={copyMessage}><Copy size={18} /><span><strong>Copy message</strong><small>Current Day 1 copy</small></span></button>
              <a className="action" href={selected.email ? `mailto:${selected.email}` : undefined}><Mail size={18} /><span><strong>Compose email</strong><small>{selected.email || "No email"}</small></span></a>
              <button className="action" onClick={() => updateLead(selected.row, "Connection Request Sent", true)}><Send size={18} /><span><strong>Mark request sent</strong><small>Writes timestamp to Sheet3</small></span></button>
            </div>

            <div className="message-card">
              <div className="section-title"><span>Day 1 message</span><button onClick={copyMessage}>Copy</button></div>
              <p>{selected.message || "No Day 1 message has been generated for this row yet."}</p>
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
