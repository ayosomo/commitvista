# CommitVista

CommitVista turns live public GitHub activity into understandable engineering insights. Enter a GitHub username or profile URL to explore repository health, recent contribution rhythm, pull-request signals and language composition.

> Phase 1 is a frontend product prototype backed by the real GitHub REST API. It does not use invented dashboard data and it does not claim that activity volume is a complete measure of developer productivity.

## Phase 1 highlights

- Live GitHub profile, repository, public-event and language data
- Runtime API validation with Zod
- TanStack Query caching, retries and paginated repository queries
- Fourteen-day activity chart and derived 30-day engineering signals
- Language composition calculated from repository byte counts
- Repository search, language filtering and sorting
- Explicit loading, empty, 404, API error and rate-limit states
- URL-backed GitHub identity and repository page
- Responsive layouts for desktop, tablet and mobile
- Keyboard-visible focus states and semantic labels
- Vitest and React Testing Library coverage

## Architecture

```text
Browser / responsive UI
          │
          ▼
CommitVista application state
          │
          ▼
TanStack Query cache
          │
          ▼
Typed GitHub service ──► Zod response validation
          │
          ▼
GitHub REST API
          │
          ▼
Pure insight functions ──► charts, trends and repository health
```

The service layer in `app/lib/github.ts` owns HTTP headers, response validation and API errors. The pure functions in `app/lib/insights.ts` transform those validated responses into chart series and explainable derived signals. UI components never parse unknown API payloads directly.

## Technology

- React 19 and TypeScript in strict mode
- vinext/Vite application runtime
- TanStack React Query
- GitHub REST API
- Zod
- Recharts
- Vitest and React Testing Library
- Plain CSS for the visual system and responsive layout

## Run locally

Prerequisite: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Quality commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## GitHub API behaviour

The browser requests public GitHub resources directly. No access token or secret is required for Phase 1. GitHub applies a smaller request allowance to unauthenticated clients, so CommitVista reads the response headers and shows the lowest remaining allowance in the interface. A rate-limit response includes the approximate reset time.

Public GitHub events are a recent, eventually consistent activity feed. They do not expose private work, may arrive with delay and do not represent all engineering collaboration. Language analysis currently samples up to four original repositories from the visible page to keep the public request budget predictable.

## Accessibility notes

- Search and filter controls use explicit labels
- Errors and refresh states are announced to assistive technology
- Charts include accessible text descriptions and the same values are surfaced in adjacent content
- Focus indicators remain visible on dark and light surfaces
- Motion is removed when the user requests reduced motion

## Known limitations

- Phase 1 analyses users, not organisation/repository URLs
- Unauthenticated GitHub requests have a low shared browser allowance
- Public events are limited to GitHub's recent public event window
- Pull-request and issue metrics reflect public activity events, not exhaustive repository history
- Repository filters apply to the current six-item API page
- There is no account, saved dashboard or authenticated GitHub integration yet

## Roadmap

See [PROJECT_PLAN.md](PROJECT_PLAN.md) for the phased plan. The next phase will add dedicated repository analysis, richer PR/issue queries and an optional authenticated GitHub connection without placing tokens in the client bundle.

## Data and privacy

CommitVista reads public GitHub data only. It does not collect passwords, store GitHub tokens or persist profile data. External links open the relevant GitHub resource.

## Repository security

- CI runs linting, strict typechecking, tests and a production build on every pull request
- CodeQL analyses JavaScript and TypeScript on pushes, pull requests and a weekly schedule
- Dependabot monitors npm packages and GitHub Actions
- Workflow permissions are declared explicitly and third-party actions are pinned to immutable commits
- Vulnerabilities should be reported privately using the process in [SECURITY.md](SECURITY.md)
- `.env` files are ignored and Phase 1 requires no client-side secret

The public source is licensed for portfolio review under the terms in [LICENSE](LICENSE). Future commercial services, private integrations and production credentials should remain in separate private repositories.
