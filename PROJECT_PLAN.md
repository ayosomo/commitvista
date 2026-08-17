# CommitVista project plan

## Phase 1 — Live developer overview

Status: complete

- Search by GitHub username or profile URL
- Fetch and validate live public profile, repository, event and language data
- Cache server state with TanStack Query
- Calculate commit rhythm, activity momentum and language composition
- Add repository filtering, sorting and six-row pagination
- Handle loading, empty, 404, rate-limit and unexpected API states
- Monitor GitHub service health and active incidents with 60-second polling
- Keep cached metrics visible and provide dependency-aware guidance during outages
- Build accessible, responsive charts and repository views
- Cover insight calculations and the primary search form with automated tests

## Phase 2 — Repository intelligence

- Accept `organisation/repository` URLs
- Add a dedicated repository detail route
- Query issues and pull requests with independent pagination
- Compare 30-day periods and surface repository health explanations
- Add URL-backed repository filters and date windows
- Introduce an optional server-side GitHub token for higher request limits
- Expand component and API contract tests

## Phase 3 — Personal workspaces

- Integrate GitHub OAuth through an established identity flow
- Save watched developers and repositories
- Add comparison dashboards and shareable reports
- Move GitHub requests behind a server-side boundary
- Add end-to-end tests for critical journeys

## Phase 4 — Production delivery

- Add CI checks for lint, typecheck, tests and build
- Add accessibility automation and manual audit notes
- Capture and optimise performance baselines
- Configure security headers and deployment observability
- Publish the production demo and a recruiter walkthrough

## Product principle

CommitVista treats activity as context. It must not rank developers or present event volume as a substitute for code quality, collaboration, customer impact or sustainable delivery.
