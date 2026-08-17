"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getLanguagesForRepositories,
  getProfile,
  getPublicEvents,
  getRepositories,
  GitHubApiError,
  normaliseGitHubInput,
  type GitHubRepository,
  type GitHubEvent,
  type RateLimit,
} from "./lib/github";
import {
  buildActivitySeries,
  buildLanguageShares,
  deriveActivityInsights,
} from "./lib/insights";
import { GitHubHealthPill, GitHubServiceHealth } from "./components/GitHubServiceHealth";
import { getGitHubServiceHealth, type GitHubServiceHealth as ServiceHealth } from "./lib/github-status";

const REPOSITORIES_PER_PAGE = 6;
const EMPTY_EVENTS: GitHubEvent[] = [];
const EMPTY_REPOSITORIES: GitHubRepository[] = [];

function readInitialUsername() {
  if (typeof window === "undefined") return "";
  return normaliseGitHubInput(new URLSearchParams(window.location.search).get("user") ?? "");
}

function readInitialPage() {
  if (typeof window === "undefined") return 1;
  const page = Number(new URLSearchParams(window.location.search).get("page"));
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function shouldRetry(failureCount: number, error: Error) {
  return error instanceof GitHubApiError && error.status >= 500 && failureCount < 1;
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-GB", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "No recent push";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

function SearchIcon() {
  return (
    <Icon>
      <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16 16 4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </Icon>
  );
}

function ArrowIcon() {
  return (
    <Icon>
      <path d="M5 12h13m-5-5 5 5-5 5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </Icon>
  );
}

function ErrorPanel({
  error,
  health,
  onRetry,
}: {
  error: Error;
  health?: ServiceHealth;
  onRetry: () => void;
}) {
  const githubError = error instanceof GitHubApiError ? error : null;
  const isRateLimited = githubError?.status === 403 && githubError.rateLimit.remaining === 0;
  const resetTime = githubError?.rateLimit.resetAt
    ? new Date(githubError.rateLimit.resetAt * 1000).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <main className="error-shell">
      <section className="error-panel" role="alert">
        <span className="error-code">
          {githubError?.status === 404 ? "404" : isRateLimited ? "API LIMIT" : "REQUEST ERROR"}
        </span>
        <h1>
          {githubError?.status === 404
            ? "That GitHub identity is out of view."
            : "GitHub interrupted the analysis."}
        </h1>
        <p>{error.message}</p>
        {health && health.state !== "operational" ? (
          <p className="dependency-note">
            GitHub is reporting {health.state.replaceAll("_", " ")}. Some metrics may be
            delayed or incomplete while GitHub restores service.
          </p>
        ) : null}
        {isRateLimited && resetTime ? (
          <p className="reset-note">Public requests reset at approximately {resetTime}.</p>
        ) : null}
        <button className="primary-button" type="button" onClick={onRetry}>
          Try again <ArrowIcon />
        </button>
      </section>
    </main>
  );
}

function DashboardSkeleton() {
  return (
    <main className="dashboard-shell" aria-busy="true" aria-label="Building the GitHub dashboard">
      <div className="dashboard-inner skeleton-stack">
        <div className="skeleton skeleton-hero" />
        <div className="skeleton-grid">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="skeleton skeleton-card" key={index} />
          ))}
        </div>
        <div className="skeleton skeleton-chart" />
      </div>
      <p className="sr-only">Loading GitHub profile, repositories and recent activity.</p>
    </main>
  );
}

function MetricCard({
  eyebrow,
  value,
  caption,
  accent = "",
}: {
  eyebrow: string;
  value: string;
  caption: string;
  accent?: string;
}) {
  return (
    <article className={`metric-card ${accent}`}>
      <p>{eyebrow}</p>
      <strong>{value}</strong>
      <span>{caption}</span>
    </article>
  );
}

function RepositoryCard({ repository }: { repository: GitHubRepository }) {
  return (
    <article className="repository-card">
      <div className="repository-card__top">
        <div>
          <div className="repository-badges">
            {repository.language ? (
              <span className="language-tag"><i aria-hidden="true" />{repository.language}</span>
            ) : (
              <span className="language-tag muted">Unclassified</span>
            )}
            {repository.fork ? <span className="type-tag">Fork</span> : null}
            {repository.archived ? <span className="type-tag">Archived</span> : null}
          </div>
          <h3><a href={repository.html_url} target="_blank" rel="noreferrer">{repository.name}</a></h3>
        </div>
        <a
          className="external-link"
          href={repository.html_url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${repository.name} on GitHub`}
        >
          <ArrowIcon />
        </a>
      </div>
      <p className="repository-description">
        {repository.description ?? "No public repository description."}
      </p>
      <dl className="repository-stats">
        <div><dt>Stars</dt><dd>{formatCompactNumber(repository.stargazers_count)}</dd></div>
        <div><dt>Forks</dt><dd>{formatCompactNumber(repository.forks_count)}</dd></div>
        <div><dt>Open issues</dt><dd>{formatCompactNumber(repository.open_issues_count)}</dd></div>
      </dl>
      <p className="repository-updated">Last push · {formatDate(repository.pushed_at)}</p>
    </article>
  );
}

export function CommitVistaApp() {
  const [username, setUsername] = useState(readInitialUsername);
  const [query, setQuery] = useState(readInitialUsername);
  const [page, setPage] = useState(readInitialPage);
  const [repositorySearch, setRepositorySearch] = useState("");
  const [language, setLanguage] = useState("all");
  const [sort, setSort] = useState("activity");

  const serviceHealthQuery = useQuery({
    queryKey: ["github-service-health"],
    queryFn: ({ signal }) => getGitHubServiceHealth(signal),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });

  useEffect(() => {
    const syncFromHistory = () => {
      setUsername(readInitialUsername());
      setQuery(readInitialUsername());
      setPage(readInitialPage());
    };
    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, []);

  useEffect(() => {
    if (!username) return;
    const params = new URLSearchParams({ user: username });
    if (page > 1) params.set("page", String(page));
    window.history.replaceState(null, "", `?${params}`);
  }, [page, username]);

  const profileQuery = useQuery({
    queryKey: ["github-profile", username],
    queryFn: () => getProfile(username),
    enabled: Boolean(username),
    retry: shouldRetry,
  });
  const eventsQuery = useQuery({
    queryKey: ["github-events", username],
    queryFn: () => getPublicEvents(username),
    enabled: Boolean(username) && profileQuery.isSuccess,
    retry: shouldRetry,
  });
  const repositoriesQuery = useQuery({
    queryKey: ["github-repositories", username, page],
    queryFn: () => getRepositories(username, page, REPOSITORIES_PER_PAGE),
    enabled: Boolean(username) && profileQuery.isSuccess,
    placeholderData: keepPreviousData,
    retry: shouldRetry,
  });
  const languagesQuery = useQuery({
    queryKey: ["github-languages", username, repositoriesQuery.data?.data.map((repo) => repo.id)],
    queryFn: () => getLanguagesForRepositories(repositoriesQuery.data?.data ?? []),
    enabled: Boolean(repositoriesQuery.data?.data.length),
    retry: shouldRetry,
  });

  const profile = profileQuery.data?.data;
  const events = eventsQuery.data?.data ?? EMPTY_EVENTS;
  const repositories = repositoriesQuery.data?.data ?? EMPTY_REPOSITORIES;
  const activity = useMemo(() => buildActivitySeries(events), [events]);
  const insights = useMemo(
    () => deriveActivityInsights(events, repositories),
    [events, repositories],
  );
  const languageShares = useMemo(
    () => buildLanguageShares(languagesQuery.data?.data ?? {}),
    [languagesQuery.data?.data],
  );
  const availableLanguages = useMemo(
    () => [...new Set(repositories.map((repo) => repo.language).filter(Boolean))].sort() as string[],
    [repositories],
  );
  const visibleRepositories = useMemo(() => {
    const filtered = repositories.filter((repository) => {
      const matchesLanguage = language === "all" || repository.language === language;
      const term = repositorySearch.trim().toLowerCase();
      const matchesSearch =
        !term || `${repository.name} ${repository.description ?? ""}`.toLowerCase().includes(term);
      return matchesLanguage && matchesSearch;
    });
    return filtered.sort((a, b) => {
      if (sort === "stars") return b.stargazers_count - a.stargazers_count;
      if (sort === "issues") return b.open_issues_count - a.open_issues_count;
      return (
        new Date(b.pushed_at ?? b.updated_at).getTime() -
        new Date(a.pushed_at ?? a.updated_at).getTime()
      );
    });
  }, [language, repositories, repositorySearch, sort]);

  const rateLimits = [
    profileQuery.data?.rateLimit,
    eventsQuery.data?.rateLimit,
    repositoriesQuery.data?.rateLimit,
    languagesQuery.data?.rateLimit,
  ].filter(
    (value): value is RateLimit => Boolean(value?.remaining !== null && value?.remaining !== undefined),
  );
  const remainingRequests = rateLimits.length
    ? Math.min(...rateLimits.map((value) => value.remaining as number))
    : null;
  const totalPages = profile
    ? Math.max(1, Math.ceil(profile.public_repos / REPOSITORIES_PER_PAGE))
    : 1;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextUsername = normaliseGitHubInput(query);
    if (!nextUsername) return;
    setPage(1);
    setRepositorySearch("");
    setLanguage("all");
    setUsername(nextUsername);
  }

  function resetSearch() {
    setUsername("");
    setQuery("");
    setPage(1);
    window.history.pushState(null, "", window.location.pathname);
  }

  const criticalError =
    (!profileQuery.data ? profileQuery.error : null) ??
    (!eventsQuery.data ? eventsQuery.error : null) ??
    (!repositoriesQuery.data ? repositoriesQuery.error : null);
  const hasRefreshError = Boolean(
    (profileQuery.error && profileQuery.data) ||
      (eventsQuery.error && eventsQuery.data) ||
      (repositoriesQuery.error && repositoriesQuery.data),
  );
  if (
    username &&
    (profileQuery.isPending ||
      (profileQuery.isSuccess && (eventsQuery.isPending || repositoriesQuery.isPending)))
  ) {
    return <DashboardSkeleton />;
  }
  if (username && criticalError) {
    return (
      <ErrorPanel
        error={criticalError}
        health={serviceHealthQuery.data}
        onRetry={() => {
          void profileQuery.refetch();
          void eventsQuery.refetch();
          void repositoriesQuery.refetch();
        }}
      />
    );
  }

  if (!username || !profile) {
    return (
      <main className="site-shell">
        <header className="topbar">
          <a className="brand" href="#top" aria-label="CommitVista home">
            <span className="brand-mark" aria-hidden="true">CV</span><span>CommitVista</span>
          </a>
          <GitHubHealthPill health={serviceHealthQuery.data} />
        </header>
        <section className="hero" id="top">
          <div className="hero-copy">
            <p className="eyebrow">Developer productivity intelligence</p>
            <h1>See the engineering story behind the activity.</h1>
            <p className="hero-intro">
              Turn public GitHub work into clear signals across repositories, commits, pull
              requests, issues and languages.
            </p>
            <form className="search-form" onSubmit={handleSubmit}>
              <label htmlFor="github-search">GitHub username or profile URL</label>
              <div className="search-control">
                <span aria-hidden="true">github.com/</span>
                <input id="github-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="octocat" autoComplete="off" required />
                <button type="submit">Build dashboard <ArrowIcon /></button>
              </div>
            </form>
            <p className="activity-note">
              Activity is context—not a complete measure of developer impact.
            </p>
          </div>
          <div className="product-frame" aria-hidden="true">
            <div className="frame-header">
              <span>Engineering intelligence</span>
              <span className="frame-period"><i /> Live public data</span>
            </div>
            <div className="preview-board">
              <div className="preview-board__glow" />

              <section className="preview-velocity">
                <div>
                  <span>14-day velocity</span>
                  <strong>+28.6%</strong>
                </div>
                <div className="velocity-bars">
                  <i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i />
                </div>
              </section>

              <section className="preview-network">
                <span className="network-label">Repository graph</span>
                <i className="network-link network-link--one" />
                <i className="network-link network-link--two" />
                <i className="network-link network-link--three" />
                <b className="network-node network-node--one" />
                <b className="network-node network-node--two" />
                <b className="network-node network-node--three" />
                <b className="network-node network-node--four" />
                <b className="network-node network-node--five" />
              </section>

              <section className="preview-trend">
                <div className="preview-trend__heading">
                  <span>Contribution momentum</span><strong>84 signal score</strong>
                </div>
                <div className="trend-grid"><i /><i /><i /><i /></div>
                <div className="trend-line trend-line--lime"><i /><i /><i /><i /><i /></div>
                <div className="trend-line trend-line--blue"><i /><i /><i /><i /><i /></div>
                <div className="trend-dots"><i /><i /><i /><i /><i /><i /></div>
              </section>

              <section className="preview-activity">
                <span>Commit rhythm</span>
                <div className="activity-bars">
                  <i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i />
                </div>
              </section>

              <section className="preview-health">
                <div className="health-ring"><span>92</span></div>
                <div><strong>Healthy</strong><span>Repository pulse</span></div>
              </section>

              <div className="preview-legend">
                <span><i className="legend-lime" /> Commits</span>
                <span><i className="legend-blue" /> Pull requests</span>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-topbar">
        <div className="dashboard-topbar__inner">
          <button className="brand brand-button" type="button" onClick={resetSearch} aria-label="Return to CommitVista search">
            <span className="brand-mark" aria-hidden="true">CV</span><span>CommitVista</span>
          </button>
          <form className="compact-search" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="dashboard-search">Analyse another GitHub identity</label>
            <SearchIcon /><input id="dashboard-search" value={query} onChange={(event) => setQuery(event.target.value)} /><button type="submit">Analyse</button>
          </form>
          <span className="rate-limit" title="GitHub public API requests remaining in the current window">
            <i aria-hidden="true" />{remainingRequests === null ? "Live API" : `${remainingRequests} API requests left`}
          </span>
        </div>
      </header>

      <div className="dashboard-inner">
        <GitHubServiceHealth
          health={serviceHealthQuery.data}
          isLoading={serviceHealthQuery.isPending}
          error={serviceHealthQuery.error}
        />
        {hasRefreshError ? (
          <p className="cached-data-notice" role="status">
            Live refresh is temporarily unavailable. Showing the most recent cached GitHub data.
          </p>
        ) : null}
        <section className="profile-banner">
          <div className="profile-identity">
            <Image src={profile.avatar_url} alt={`${profile.name ?? profile.login}'s GitHub avatar`} width={96} height={96} unoptimized />
            <div>
              <p className="eyebrow">Developer overview</p>
              <h1>{profile.name ?? profile.login}</h1>
              <a href={profile.html_url} target="_blank" rel="noreferrer">@{profile.login}</a>
              <p>{profile.bio ?? "No public bio provided."}</p>
            </div>
          </div>
          <dl className="profile-facts">
            <div><dt>Public repos</dt><dd>{profile.public_repos}</dd></div>
            <div><dt>Followers</dt><dd>{formatCompactNumber(profile.followers)}</dd></div>
            <div><dt>Following</dt><dd>{formatCompactNumber(profile.following)}</dd></div>
            <div><dt>On GitHub since</dt><dd>{new Date(profile.created_at).getFullYear()}</dd></div>
          </dl>
        </section>

        <section aria-labelledby="signal-heading">
          <div className="section-heading">
            <div><p className="eyebrow">Last 30 public activity events</p><h2 id="signal-heading">Engineering signals</h2></div>
            <p>Derived from GitHub’s public activity feed.</p>
          </div>
          <div className="metrics-grid">
            <MetricCard eyebrow="Commits captured" value={formatCompactNumber(insights.commits)} caption="Across recent PushEvents" accent="metric-card--lime" />
            <MetricCard eyebrow="Pull request activity" value={formatCompactNumber(insights.pullRequests)} caption={`${insights.mergedPullRequests} merged in public events`} />
            <MetricCard eyebrow="Active repositories" value={formatCompactNumber(insights.activeRepositories)} caption="Seen in recent public events" />
            <MetricCard eyebrow="Contribution rhythm" value={`${insights.consistency}%`} caption="Days active in a 30-day window" accent="metric-card--blue" />
          </div>
        </section>

        <section className="analytics-grid" aria-label="Activity and language analytics">
          <article className="panel activity-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">Activity rhythm</p><h2>Fourteen-day signal</h2></div>
              <div className="chart-legend"><span><i className="legend-lime" />Events</span><span><i className="legend-blue" />Commits</span></div>
            </div>
            {events.length ? (
              <div className="chart-container" role="img" aria-label="Area chart of public events and commits over the last fourteen days">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={activity} margin={{ left: -24, right: 4, top: 14, bottom: 0 }}>
                    <defs><linearGradient id="eventsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b9f45f" stopOpacity={0.45} /><stop offset="100%" stopColor="#b9f45f" stopOpacity={0.02} /></linearGradient></defs>
                    <CartesianGrid stroke="#28303b" vertical={false} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} interval={2} tick={{ fill: "#7f8997", fontSize: 10 }} />
                    <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fill: "#7f8997", fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: "#171d26", border: "1px solid #333c49", borderRadius: 10, fontSize: 12 }} />
                    <Area type="monotone" dataKey="events" stroke="#b9f45f" strokeWidth={2} fill="url(#eventsFill)" />
                    <Area type="monotone" dataKey="commits" stroke="#8198ff" strokeWidth={2} fill="transparent" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="panel-empty"><strong>No public events yet</strong><span>GitHub may delay public event data by several hours.</span></div>
            )}
            <div className="insight-strip">
              <article><span>Momentum</span><strong>{insights.trend === null ? "New signal" : `${insights.trend >= 0 ? "+" : ""}${insights.trend}%`}</strong><p>Compared with the preceding 15 days.</p></article>
              <article><span>Busiest day</span><strong>{insights.busiestDay}</strong><p>Based on recent event frequency.</p></article>
              <article><span>Open issue load</span><strong>{formatCompactNumber(insights.openRepositoryIssues)}</strong><p>Across this repository page.</p></article>
            </div>
          </article>

          <article className="panel language-panel">
            <div className="panel-heading"><div><p className="eyebrow">Code composition</p><h2>Language mix</h2></div><span className="scope-note">Top 4 original repos</span></div>
            {languagesQuery.isPending ? (
              <div className="panel-empty"><strong>Reading languages…</strong><span>Validating live repository data.</span></div>
            ) : languageShares.length ? (
              <>
                <div className="donut-wrap" role="img" aria-label="Donut chart showing repository language proportions">
                  <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={languageShares} dataKey="bytes" nameKey="name" innerRadius={62} outerRadius={88} paddingAngle={3} stroke="none">{languageShares.map((entry) => <Cell fill={entry.color} key={entry.name} />)}</Pie><Tooltip contentStyle={{ background: "#171d26", border: "1px solid #333c49", borderRadius: 10, fontSize: 12 }} formatter={(value) => `${formatCompactNumber(Number(value))} bytes`} /></PieChart></ResponsiveContainer>
                  <div className="donut-centre"><strong>{languageShares.length}</strong><span>languages</span></div>
                </div>
                <ul className="language-list">{languageShares.map((entry) => <li key={entry.name}><span><i style={{ background: entry.color }} />{entry.name}</span><strong>{entry.percentage}%</strong></li>)}</ul>
              </>
            ) : (
              <div className="panel-empty"><strong>No language data found</strong><span>Repositories may be empty, forked or unavailable.</span></div>
            )}
          </article>
        </section>

        <section className="repositories-section" aria-labelledby="repositories-heading">
          <div className="section-heading"><div><p className="eyebrow">Repository health</p><h2 id="repositories-heading">Public repositories</h2></div><p>Page {page} of {totalPages}</p></div>
          <div className="repository-toolbar">
            <label className="repo-search"><span className="sr-only">Search repositories on this page</span><SearchIcon /><input value={repositorySearch} onChange={(event) => setRepositorySearch(event.target.value)} placeholder="Search this page" /></label>
            <label><span>Language</span><select value={language} onChange={(event) => setLanguage(event.target.value)}><option value="all">All languages</option>{availableLanguages.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
            <label><span>Sort by</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="activity">Recent activity</option><option value="stars">Most stars</option><option value="issues">Open issues</option></select></label>
          </div>
          {repositoriesQuery.isFetching && repositories.length ? <p className="refresh-note" role="status">Refreshing repository data…</p> : null}
          {visibleRepositories.length ? (
            <div className="repository-grid">{visibleRepositories.map((repository) => <RepositoryCard repository={repository} key={repository.id} />)}</div>
          ) : (
            <div className="repository-empty"><strong>No repositories match those filters.</strong><button type="button" onClick={() => { setRepositorySearch(""); setLanguage("all"); }}>Clear filters</button></div>
          )}
          <nav className="pagination" aria-label="Repository pages">
            <button type="button" disabled={page === 1 || repositoriesQuery.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
            <span>Page <strong>{page}</strong> of {totalPages}</span>
            <button type="button" disabled={page >= totalPages || repositoriesQuery.isFetching} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</button>
          </nav>
        </section>

        <footer className="dashboard-footer">
          <p><strong>CommitVista</strong> turns public activity into context, not employee scoring. Quality, collaboration and impact extend beyond GitHub events.</p>
          <a href="https://docs.github.com/en/rest" target="_blank" rel="noreferrer">GitHub REST API documentation <ArrowIcon /></a>
        </footer>
      </div>
    </main>
  );
}
