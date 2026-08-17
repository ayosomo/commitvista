import {
  formatComponentState,
  type GitHubServiceHealth as ServiceHealth,
} from "../lib/github-status";

function formatCheckedAt(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export function GitHubHealthPill({ health }: { health?: ServiceHealth }) {
  if (!health) {
    return <span className="live-data-pill"><i aria-hidden="true" /> Live GitHub data</span>;
  }

  return (
    <span className={`live-data-pill service-pill service-pill--${health.state}`}>
      <i aria-hidden="true" /> GitHub: {formatComponentState(health.state)}
    </span>
  );
}

export function GitHubServiceHealth({
  health,
  isLoading,
  error,
}: {
  health?: ServiceHealth;
  isLoading: boolean;
  error: Error | null;
}) {
  if (isLoading && !health) {
    return (
      <section className="service-health service-health--loading" aria-label="GitHub service health" aria-busy="true">
        <div><p className="eyebrow">Dependency intelligence</p><strong>Checking GitHub services…</strong></div>
      </section>
    );
  }

  if (error && !health) {
    return (
      <section className="service-health service-health--unknown" aria-labelledby="service-health-heading">
        <div>
          <p className="eyebrow">Dependency intelligence</p>
          <h2 id="service-health-heading">GitHub status is temporarily unavailable</h2>
          <p>CommitVista will keep existing dashboard data visible while the status feed reconnects.</p>
        </div>
        <a href="https://www.githubstatus.com" target="_blank" rel="noreferrer">Check GitHub Status</a>
      </section>
    );
  }

  if (!health) return null;

  const isOperational = health.state === "operational";
  const affectedComponents = health.components.filter(
    (component) => component.state !== "operational",
  );

  return (
    <section
      className={`service-health service-health--${health.state}`}
      aria-labelledby="service-health-heading"
    >
      <div className="service-health__summary">
        <div className="service-health__title">
          <span className="service-health__signal" aria-hidden="true" />
          <div>
            <p className="eyebrow">GitHub service health</p>
            <h2 id="service-health-heading">
              {isOperational ? "Data services are operational" : formatComponentState(health.state)}
            </h2>
          </div>
        </div>
        <p>
          {isOperational
            ? "CommitVista’s tracked GitHub dependencies are responding normally."
            : "Some CommitVista metrics may be delayed or incomplete. Cached results remain visible."}
        </p>
        <span className="service-health__checked">
          Last checked {formatCheckedAt(health.checkedAt)} · refreshes every 60 seconds
        </span>
      </div>

      <ul className="service-components" aria-label="Tracked GitHub components">
        {health.components.map((component) => (
          <li className={`service-component service-component--${component.state}`} key={component.id}>
            <span>{component.name}</span><strong>{formatComponentState(component.state)}</strong>
          </li>
        ))}
      </ul>

      {!isOperational && health.incident ? (
        <article className="service-incident" aria-live="polite">
          <div>
            <span>Active incident · {health.incident.impact} impact</span>
            <h3>{health.incident.name}</h3>
            {health.incident.latestUpdate ? <p>{health.incident.latestUpdate.body}</p> : null}
            {affectedComponents.length ? (
              <small>Affecting {affectedComponents.map((component) => component.name).join(", ")}</small>
            ) : null}
          </div>
          <a href={health.incident.url} target="_blank" rel="noreferrer">View incident</a>
        </article>
      ) : null}
    </section>
  );
}
