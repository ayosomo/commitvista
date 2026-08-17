import { z } from "zod";

const profileSchema = z.object({
  avatar_url: z.string().url(),
  bio: z.string().nullable(),
  company: z.string().nullable(),
  created_at: z.string(),
  followers: z.number(),
  following: z.number(),
  html_url: z.string().url(),
  location: z.string().nullable(),
  login: z.string(),
  name: z.string().nullable(),
  public_repos: z.number(),
});

const repositorySchema = z.object({
  archived: z.boolean(),
  description: z.string().nullable(),
  fork: z.boolean(),
  forks_count: z.number(),
  full_name: z.string(),
  html_url: z.string().url(),
  id: z.number(),
  language: z.string().nullable(),
  name: z.string(),
  open_issues_count: z.number(),
  pushed_at: z.string().nullable(),
  size: z.number(),
  stargazers_count: z.number(),
  updated_at: z.string(),
});

const eventSchema = z.object({
  created_at: z.string().nullable(),
  id: z.string(),
  payload: z
    .object({
      action: z.string().optional(),
      commits: z.array(z.unknown()).optional(),
      pull_request: z
        .object({
          merged: z.boolean().optional(),
        })
        .passthrough()
        .optional(),
      size: z.number().optional(),
    })
    .passthrough(),
  repo: z.object({ name: z.string() }),
  type: z.string(),
});

const languageSchema = z.record(z.string(), z.number());

export type GitHubProfile = z.infer<typeof profileSchema>;
export type GitHubRepository = z.infer<typeof repositorySchema>;
export type GitHubEvent = z.infer<typeof eventSchema>;
export type RepositoryLanguages = z.infer<typeof languageSchema>;

export interface RateLimit {
  limit: number | null;
  remaining: number | null;
  resetAt: number | null;
}

export interface GitHubResponse<T> {
  data: T;
  rateLimit: RateLimit;
}

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly rateLimit: RateLimit,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

const API_ROOT = "https://api.github.com";
const API_VERSION = "2026-03-10";

function readRateLimit(headers: Headers): RateLimit {
  const toNumber = (value: string | null) => (value === null ? null : Number(value));
  return {
    limit: toNumber(headers.get("x-ratelimit-limit")),
    remaining: toNumber(headers.get("x-ratelimit-remaining")),
    resetAt: toNumber(headers.get("x-ratelimit-reset")),
  };
}

async function githubFetch<T>(path: string, schema: z.ZodType<T>): Promise<GitHubResponse<T>> {
  const response = await fetch(`${API_ROOT}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": API_VERSION,
    },
  });
  const rateLimit = readRateLimit(response.headers);

  if (!response.ok) {
    const message =
      response.status === 404
        ? "We could not find that public GitHub account."
        : response.status === 403 && rateLimit.remaining === 0
          ? "GitHub’s public API limit has been reached. Try again after the reset time."
          : `GitHub returned ${response.status}. Please try again.`;
    throw new GitHubApiError(message, response.status, rateLimit);
  }

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new GitHubApiError(
      "GitHub returned data CommitVista could not validate.",
      502,
      rateLimit,
    );
  }

  return { data: parsed.data, rateLimit };
}

export function normaliseGitHubInput(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0]
    .trim();
}

export function getProfile(username: string) {
  return githubFetch(`/users/${encodeURIComponent(username)}`, profileSchema);
}

export function getRepositories(username: string, page: number, perPage = 6) {
  const params = new URLSearchParams({
    direction: "desc",
    page: String(page),
    per_page: String(perPage),
    sort: "pushed",
    type: "owner",
  });
  return githubFetch(
    `/users/${encodeURIComponent(username)}/repos?${params}`,
    z.array(repositorySchema),
  );
}

export function getPublicEvents(username: string) {
  return githubFetch(
    `/users/${encodeURIComponent(username)}/events/public?per_page=100`,
    z.array(eventSchema),
  );
}

export async function getLanguagesForRepositories(repositories: GitHubRepository[]) {
  const selected = repositories.filter((repo) => !repo.fork).slice(0, 4);
  const responses = await Promise.all(
    selected.map(async (repository) => {
      const separator = repository.full_name.indexOf("/");
      const owner = repository.full_name.slice(0, separator);
      const name = repository.full_name.slice(separator + 1);
      const response = await githubFetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/languages`,
        languageSchema,
      );
      return { name: repository.full_name, ...response };
    }),
  );

  return {
    data: Object.fromEntries(responses.map((response) => [response.name, response.data])),
    rateLimit: responses.reduce<RateLimit>(
      (lowest, response) => {
        if (response.rateLimit.remaining === null) return lowest;
        if (lowest.remaining === null || response.rateLimit.remaining < lowest.remaining) {
          return response.rateLimit;
        }
        return lowest;
      },
      { limit: null, remaining: null, resetAt: null },
    ),
  };
}
