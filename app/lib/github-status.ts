import { z } from "zod";

const componentStateSchema = z.enum([
  "operational",
  "degraded_performance",
  "partial_outage",
  "major_outage",
  "under_maintenance",
]);

const affectedComponentSchema = z.object({
  name: z.string(),
  new_status: componentStateSchema,
});

const incidentUpdateSchema = z.object({
  body: z.string(),
  created_at: z.string(),
  display_at: z.string(),
  status: z.string(),
  affected_components: z.array(affectedComponentSchema).default([]),
});

const incidentSchema = z.object({
  id: z.string(),
  impact: z.string(),
  name: z.string(),
  shortlink: z.string().url(),
  status: z.string(),
  updated_at: z.string(),
  incident_updates: z.array(incidentUpdateSchema),
});

const summarySchema = z.object({
  page: z.object({ updated_at: z.string() }),
  components: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      status: componentStateSchema,
      updated_at: z.string(),
    }),
  ),
  incidents: z.array(incidentSchema),
  scheduled_maintenances: z.array(z.unknown()).default([]),
});

export type GitHubComponentState = z.infer<typeof componentStateSchema>;

export interface TrackedGitHubComponent {
  id: string;
  name: string;
  state: GitHubComponentState;
  updatedAt: string;
}

export interface GitHubIncident {
  id: string;
  impact: string;
  name: string;
  status: string;
  url: string;
  updatedAt: string;
  latestUpdate: {
    body: string;
    createdAt: string;
    status: string;
  } | null;
}

export interface GitHubServiceHealth {
  state: GitHubComponentState;
  checkedAt: string;
  sourceUpdatedAt: string;
  components: TrackedGitHubComponent[];
  incident: GitHubIncident | null;
  scheduledMaintenanceCount: number;
}

export const TRACKED_GITHUB_COMPONENTS = [
  "API Requests",
  "Issues",
  "Pull Requests",
  "Actions",
  "Webhooks",
] as const;

const severity: Record<GitHubComponentState, number> = {
  operational: 0,
  under_maintenance: 1,
  degraded_performance: 2,
  partial_outage: 3,
  major_outage: 4,
};

function mostSevereState(components: TrackedGitHubComponent[]): GitHubComponentState {
  return components.reduce<GitHubComponentState>(
    (current, component) =>
      severity[component.state] > severity[current] ? component.state : current,
    "operational",
  );
}

export function parseGitHubServiceSummary(
  input: unknown,
  checkedAt = new Date().toISOString(),
): GitHubServiceHealth {
  const summary = summarySchema.parse(input);
  const trackedNames = new Set<string>(TRACKED_GITHUB_COMPONENTS);
  const components = summary.components
    .filter((component) => trackedNames.has(component.name))
    .map((component) => ({
      id: component.id,
      name: component.name,
      state: component.status,
      updatedAt: component.updated_at,
    }));

  const relevantIncident = summary.incidents.find((incident) =>
    incident.incident_updates.some((update) =>
      update.affected_components.some((component) => trackedNames.has(component.name)),
    ),
  );
  const latestUpdate = relevantIncident?.incident_updates
    .slice()
    .sort((a, b) => Date.parse(b.display_at) - Date.parse(a.display_at))[0];

  return {
    state: mostSevereState(components),
    checkedAt,
    sourceUpdatedAt: summary.page.updated_at,
    components,
    incident: relevantIncident
      ? {
          id: relevantIncident.id,
          impact: relevantIncident.impact,
          name: relevantIncident.name,
          status: relevantIncident.status,
          url: relevantIncident.shortlink,
          updatedAt: relevantIncident.updated_at,
          latestUpdate: latestUpdate
            ? {
                body: latestUpdate.body,
                createdAt: latestUpdate.created_at,
                status: latestUpdate.status,
              }
            : null,
        }
      : null,
    scheduledMaintenanceCount: summary.scheduled_maintenances.length,
  };
}

export async function getGitHubServiceHealth(signal?: AbortSignal) {
  const response = await fetch("https://www.githubstatus.com/api/v2/summary.json", { signal });
  if (!response.ok) {
    throw new Error(`GitHub Status returned ${response.status}.`);
  }

  try {
    return parseGitHubServiceSummary(await response.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error("GitHub Status returned data CommitVista could not validate.");
    }
    throw error;
  }
}

export function formatComponentState(state: GitHubComponentState) {
  const labels: Record<GitHubComponentState, string> = {
    operational: "Operational",
    degraded_performance: "Degraded performance",
    partial_outage: "Partial outage",
    major_outage: "Major outage",
    under_maintenance: "Maintenance",
  };
  return labels[state];
}
