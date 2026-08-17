import type {
  GitHubEvent,
  GitHubRepository,
  RepositoryLanguages,
} from "./github";

export interface ActivityPoint {
  commits: number;
  day: string;
  events: number;
  label: string;
}

export interface LanguageShare {
  bytes: number;
  color: string;
  name: string;
  percentage: number;
}

const languageColors = ["#b9f45f", "#8198ff", "#ff9a72", "#e0c5ff", "#67d8cf"];

function eventCommitCount(event: GitHubEvent): number {
  if (event.type !== "PushEvent") return 0;
  return event.payload.size ?? event.payload.commits?.length ?? 0;
}

export function buildActivitySeries(events: GitHubEvent[], days = 14): ActivityPoint[] {
  const byDay = new Map<string, { commits: number; events: number }>();
  for (const event of events) {
    if (!event.created_at) continue;
    const key = event.created_at.slice(0, 10);
    const current = byDay.get(key) ?? { commits: 0, events: 0 };
    current.events += 1;
    current.commits += eventCommitCount(event);
    byDay.set(key, current);
  }

  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - (days - index - 1));
    const day = date.toISOString().slice(0, 10);
    const values = byDay.get(day) ?? { commits: 0, events: 0 };
    return {
      ...values,
      day,
      label: date.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    };
  });
}

export function buildLanguageShares(
  languagesByRepository: Record<string, RepositoryLanguages>,
): LanguageShare[] {
  const totals = new Map<string, number>();
  for (const languages of Object.values(languagesByRepository)) {
    for (const [language, bytes] of Object.entries(languages)) {
      totals.set(language, (totals.get(language) ?? 0) + bytes);
    }
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const grandTotal = sorted.reduce((sum, [, bytes]) => sum + bytes, 0);
  if (grandTotal === 0) return [];

  const visible = sorted.slice(0, 4);
  const otherBytes = sorted.slice(4).reduce((sum, [, bytes]) => sum + bytes, 0);
  if (otherBytes > 0) visible.push(["Other", otherBytes]);

  return visible.map(([name, bytes], index) => ({
    bytes,
    color: languageColors[index % languageColors.length],
    name,
    percentage: Math.round((bytes / grandTotal) * 100),
  }));
}

export function deriveActivityInsights(events: GitHubEvent[], repositories: GitHubRepository[]) {
  const now = Date.now();
  const recentCutoff = now - 15 * 24 * 60 * 60 * 1000;
  const previousCutoff = now - 30 * 24 * 60 * 60 * 1000;
  const recentEvents = events.filter(
    (event) => event.created_at && new Date(event.created_at).getTime() >= recentCutoff,
  );
  const previousEvents = events.filter((event) => {
    if (!event.created_at) return false;
    const time = new Date(event.created_at).getTime();
    return time >= previousCutoff && time < recentCutoff;
  });

  const trend =
    previousEvents.length === 0
      ? recentEvents.length > 0
        ? null
        : 0
      : Math.round(((recentEvents.length - previousEvents.length) / previousEvents.length) * 100);

  const dayCounts = new Map<string, number>();
  const activeDays = new Set<string>();
  for (const event of events) {
    if (!event.created_at) continue;
    const date = new Date(event.created_at);
    const dayName = date.toLocaleDateString("en-GB", { weekday: "long" });
    dayCounts.set(dayName, (dayCounts.get(dayName) ?? 0) + 1);
    activeDays.add(event.created_at.slice(0, 10));
  }
  const busiestDay = [...dayCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "No activity yet";

  const pullRequests = events.filter((event) => event.type === "PullRequestEvent");
  const issues = events.filter((event) => event.type === "IssuesEvent");
  const commits = events.reduce((sum, event) => sum + eventCommitCount(event), 0);
  const mergedPullRequests = pullRequests.filter(
    (event) => event.payload.action === "closed" && event.payload.pull_request?.merged,
  ).length;

  return {
    activeRepositories: new Set(events.map((event) => event.repo.name)).size,
    busiestDay,
    commits,
    consistency: Math.round((activeDays.size / 30) * 100),
    forks: repositories.reduce((sum, repository) => sum + repository.forks_count, 0),
    issues: issues.length,
    mergedPullRequests,
    openRepositoryIssues: repositories.reduce(
      (sum, repository) => sum + repository.open_issues_count,
      0,
    ),
    pullRequests: pullRequests.length,
    stars: repositories.reduce((sum, repository) => sum + repository.stargazers_count, 0),
    trend,
  };
}
