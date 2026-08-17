import { afterEach, describe, expect, it, vi } from "vitest";
import type { GitHubEvent } from "./github";
import { buildActivitySeries, buildLanguageShares, deriveActivityInsights } from "./insights";

function event(overrides: Partial<GitHubEvent> = {}): GitHubEvent {
  return {
    created_at: "2026-08-16T10:00:00Z",
    id: "event-1",
    payload: {},
    repo: { name: "commitvista/web" },
    type: "PushEvent",
    ...overrides,
  };
}

afterEach(() => vi.useRealTimers());

describe("CommitVista insights", () => {
  it("builds a complete activity series and counts push commits", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T12:00:00Z"));
    const series = buildActivitySeries([
      event({ payload: { size: 3 } }),
      event({ id: "event-2", type: "IssuesEvent", payload: { action: "opened" } }),
    ], 3);

    expect(series).toHaveLength(3);
    expect(series.at(-2)).toMatchObject({ day: "2026-08-16", commits: 3, events: 2 });
    expect(series.at(-1)).toMatchObject({ day: "2026-08-17", commits: 0, events: 0 });
  });

  it("turns repository language bytes into ranked percentages", () => {
    const shares = buildLanguageShares({
      "commitvista/app": { TypeScript: 700, CSS: 200 },
      "commitvista/api": { TypeScript: 100 },
    });

    expect(shares).toEqual([
      expect.objectContaining({ name: "TypeScript", percentage: 80 }),
      expect.objectContaining({ name: "CSS", percentage: 20 }),
    ]);
  });

  it("derives trend, PR and consistency signals from public events", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T12:00:00Z"));
    const insights = deriveActivityInsights([
      event({ created_at: "2026-08-16T10:00:00Z", payload: { size: 2 } }),
      event({ id: "event-2", created_at: "2026-08-15T10:00:00Z", type: "PullRequestEvent", payload: { action: "closed", pull_request: { merged: true } } }),
      event({ id: "event-3", created_at: "2026-07-25T10:00:00Z", type: "IssuesEvent", payload: { action: "opened" } }),
    ], []);

    expect(insights.commits).toBe(2);
    expect(insights.pullRequests).toBe(1);
    expect(insights.mergedPullRequests).toBe(1);
    expect(insights.trend).toBe(100);
    expect(insights.consistency).toBe(10);
  });
});
