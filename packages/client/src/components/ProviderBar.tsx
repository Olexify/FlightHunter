import type { ProviderStatus } from "@flighthunter/shared";

interface Props {
  providers: ProviderStatus[];
  elapsedMs: number;
  cached: boolean;
  totalBeforeFilters: number;
  shown: number;
}

/**
 * Honest per-provider reporting. The old UI dumped every upstream failure into
 * one opaque "Messages" blob; this says which source answered, how fast, and
 * exactly what failed.
 */
export default function ProviderBar({
  providers,
  elapsedMs,
  cached,
  totalBeforeFilters,
  shown,
}: Props) {
  const failing = providers.filter((p) => !p.ok);

  return (
    <div className="provider-bar">
      <div className="provider-chips">
        {providers.map((p) => (
          <span key={p.provider} className={p.ok ? "pchip ok" : "pchip bad"}>
            <span className="pchip-dot" />
            {p.provider}
            <span className="muted">
              {p.offers} offer{p.offers === 1 ? "" : "s"}
              {p.cacheHits > 0 ? ` · ${p.cacheHits} cached` : ""}
            </span>
          </span>
        ))}

        <span className="muted timing">
          {cached ? "served from cache" : `${elapsedMs} ms`}
          {totalBeforeFilters !== shown && ` · ${totalBeforeFilters - shown} filtered out`}
        </span>
      </div>

      {failing.length > 0 && (
        <details className="provider-errors">
          <summary>
            {failing.length} provider{failing.length === 1 ? "" : "s"} reported errors
          </summary>
          {failing.map((p) => (
            <div key={p.provider}>
              <strong>{p.provider}</strong>
              <ul>
                {p.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
