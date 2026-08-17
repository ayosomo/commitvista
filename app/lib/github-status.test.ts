import { describe, expect, it } from "vitest";
import { parseGitHubServiceSummary, TRACKED_GITHUB_COMPONENTS } from "./github-status";

function buildSummary(
  overrides: Partial<Record<(typeof TRACKED_GITHUB_COMPONENTS)[number], string>> = {},
) {
  return {
    page: { updated_at: "2026-08-17T19:01:45.593Z" },
    components: [
      ...TRACKED_GITHUB_COMPONENTS.map((name, index) => ({
        id: String(index),
        name,
        status: overrides[name] ?? "operational",
        updated_at: "2026-08-17T19:01:45.593Z",
      })),
      {
        id: "copilot",
        name: "Copilot",
        status: "major_outage",
        updated_at: "2026-08-17T19:01:45.593Z",
      },
    ],
    incidents: [],
    scheduled_maintenances: [],
  };
}

describe("GitHub service health", () => {
  it("only uses services that CommitVista depends on for its health state", () => {
    const health = parseGitHubServiceSummary(buildSummary(), "2026-08-17T19:02:00.000Z");

    expect(health.state).toBe("operational");
    expect(health.components.map((component) => component.name)).toEqual(
      TRACKED_GITHUB_COMPONENTS,
    );
  });

  it("surfaces the most severe tracked component state", () => {
    const health = parseGitHubServiceSummary(
      buildSummary({ Issues: "degraded_performance", Actions: "partial_outage" }),
    );

    expect(health.state).toBe("partial_outage");
  });

  it("selects the latest update from a relevant incident", () => {
    const summary = {
      ...buildSummary({ "API Requests": "major_outage" }),
      incidents: [{
        id: "incident-1",
        impact: "critical",
        name: "Incident with GitHub.com",
        shortlink: "https://stspg.io/example",
        status: "investigating",
        updated_at: "2026-08-17T16:16:13.252Z",
        incident_updates: [
          {
            body: "Initial investigation",
            created_at: "2026-08-17T13:40:03.705Z",
            display_at: "2026-08-17T13:40:03.705Z",
            status: "investigating",
            affected_components: null,
          },
          {
            body: "Earlier update",
            created_at: "2026-08-17T15:42:25.338Z",
            display_at: "2026-08-17T15:42:25.338Z",
            status: "investigating",
            affected_components: [
              { name: "API Requests", new_status: "major_outage" },
            ],
          },
          {
            body: "Recovery is under way.",
            created_at: "2026-08-17T16:16:13.252Z",
            display_at: "2026-08-17T16:16:13.252Z",
            status: "monitoring",
            affected_components: [
              { name: "API Requests", new_status: "major_outage" },
            ],
          },
        ],
      }],
    };

    const health = parseGitHubServiceSummary(summary);

    expect(health.incident?.latestUpdate?.body).toBe("Recovery is under way.");
    expect(health.incident?.url).toBe("https://stspg.io/example");
  });
});
