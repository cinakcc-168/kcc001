import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Download,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wrench,
  XCircle
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import { useAuth } from "../context/AuthContext";
import SystemHealthCheckCard from "../components/SystemHealthCheckCard";
import {
  clearAllSystemErrors,
  deleteSingleSystemError,
  downloadDiagnostics,
  healthDateTime,
  loadEnvironmentHealth,
  loadSystemHealthWorkspace,
  resolveSystemError,
  runDataHealthCheck,
  runSafeMaintenance
} from "../lib/systemHealth";
import {
  APP_RELEASE,
  APP_RELEASE_LABEL,
  APP_SCHEMA_STEP
} from "../lib/release";

function statusLabel(status) {
  return String(status || "unknown")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function SystemHealthPage() {
  const {
    supabase,
    session,
    profile,
    can
  } = useAuth();

  const allowed = can("system_health.manage");
  const [runs, setRuns] = useState([]);
  const [errors, setErrors] = useState([]);
  const [environment, setEnvironment] = useState(null);
  const [currentRun, setCurrentRun] = useState(null);
  const [allBranches, setAllBranches] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  const refresh = useCallback(async () => {
    if (!supabase || !profile?.organization_id || !allowed) return;

    try {
      setLoading(true);
      const workspace = await loadSystemHealthWorkspace(
        supabase,
        profile
      );
      setRuns(workspace.runs);

      const orgKey = profile.organization_id;
      const clearedAllAtStr = localStorage.getItem(`tinypos_cleared_errors_at_${orgKey}`);
      const clearedAllAt = clearedAllAtStr ? new Date(clearedAllAtStr).getTime() : 0;
      const clearedIdsStr = localStorage.getItem(`tinypos_cleared_error_ids_${orgKey}`) || "[]";
      let clearedIds = [];
      try { clearedIds = JSON.parse(clearedIdsStr); } catch (e) { clearedIds = []; }

      const filteredErrors = (workspace.errors || []).filter((row) => {
        if (clearedIds.includes(row.id)) return false;
        if (clearedAllAt && row.last_seen_at) {
          const rowTime = new Date(row.last_seen_at).getTime();
          if (rowTime <= clearedAllAt) return false;
        }
        return true;
      });

      setErrors(filteredErrors);
      setCurrentRun((current) => current || workspace.runs[0] || null);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, profile, allowed]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const unresolvedErrors = useMemo(
    () => errors.filter((row) => !row.resolved_at),
    [errors]
  );

  async function runChecks() {
    try {
      setBusy("run");
      setMessage("");

      const [dataRun, environmentRun] = await Promise.all([
        runDataHealthCheck(supabase, allBranches),
        loadEnvironmentHealth(session)
      ]);

      setCurrentRun(dataRun);
      setEnvironment(environmentRun);
      setMessageType(
        dataRun.overall_status === "critical"
          ? "error"
          : dataRun.overall_status === "warning"
            ? "warning"
            : "success"
      );
      setMessage(
        `System check completed with score ${dataRun.score}/100.`
      );
      await refresh();
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setBusy("");
    }
  }

  async function maintain() {
    try {
      setBusy("maintenance");
      const result = await runSafeMaintenance(supabase);
      setMessageType("success");
      setMessage([
        `${result.expired_approvals} approvals expired`,
        `${result.expired_quotes} quotations expired`,
        `${result.deleted_link_codes} old link codes removed`,
        `${result.failed_stale_deliveries} stale notifications closed`
      ].join(" · "));
      await runChecks();
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setBusy("");
    }
  }

  async function resolve(row) {
    try {
      setBusy(`resolve-${row.id}`);
      await resolveSystemError(supabase, row.id);
      setMessageType("success");
      setMessage("Application error marked resolved.");
      await refresh();
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setBusy("");
    }
  }

  async function deleteSingleError(errorId) {
    try {
      setBusy(`delete-${errorId}`);
      await deleteSingleSystemError(supabase, profile, errorId);
      if (profile?.organization_id && errorId) {
        const orgKey = profile.organization_id;
        const key = `tinypos_cleared_error_ids_${orgKey}`;
        let existing = [];
        try { existing = JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) { existing = []; }
        if (!existing.includes(errorId)) existing.push(errorId);
        localStorage.setItem(key, JSON.stringify(existing));
      }
      setErrors((prev) => prev.filter((row) => row.id !== errorId));
      setMessageType("success");
      setMessage("Application error deleted.");
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Failed to delete error.");
    } finally {
      setBusy("");
    }
  }

  async function clearErrors() {
    try {
      setBusy("clear-errors");
      await clearAllSystemErrors(supabase, profile, errors);
      if (profile?.organization_id) {
        localStorage.setItem(`tinypos_cleared_errors_at_${profile.organization_id}`, new Date().toISOString());
      }
      setErrors([]);
      setMessageType("success");
      setMessage("All captured application errors cleared.");
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Failed to clear errors.");
    } finally {
      setBusy("");
    }
  }

  if (!allowed) {
    return (
      <section className="panel empty-state">
        <ShieldCheck size={48} />
        <h2>Owner or administrator access required</h2>
        <p>Your account cannot open production diagnostics.</p>
      </section>
    );
  }

  const envChecks = environment?.checks || [];
  const checks = currentRun?.checks || [];

  return (
    <div className="page-stack system-health-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PRODUCTION CONTROL</p>
          <h1>System Health</h1>
          <p className="muted">
            Diagnose configuration, data integrity, frontend errors and safe
            operational housekeeping.
          </p>
        </div>

        <div className="page-heading-actions">
          <label className="system-health-scope">
            <span>Scope</span>
            <select
              value={allBranches ? "all" : "current"}
              onChange={(event) =>
                setAllBranches(event.target.value === "all")
              }
            >
              <option value="all">All branches</option>
              <option value="current">Current branch</option>
            </select>
          </label>

          <button
            type="button"
            className="primary-button"
            onClick={runChecks}
            disabled={Boolean(busy)}
          >
            <Activity size={18} />
            {busy === "run" ? "Checking..." : "Run full check"}
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw size={18} className={loading ? "spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {message && <div className={`notice ${messageType}`}>{message}</div>}

      <section className="system-release-strip">
        <div><Sparkles size={19} /><span>Release</span><strong>{APP_RELEASE_LABEL}</strong></div>
        <div><ServerCog size={19} /><span>Build</span><strong>{APP_RELEASE}</strong></div>
        <div><ShieldCheck size={19} /><span>Schema step</span><strong>{APP_SCHEMA_STEP}</strong></div>
        <div><Activity size={19} /><span>Last check</span><strong>{healthDateTime(currentRun?.generated_at)}</strong></div>
      </section>

      <div className="system-health-metrics">
        <article className={currentRun?.overall_status || "unknown"}>
          {currentRun?.overall_status === "healthy"
            ? <CheckCircle2 size={24} />
            : <AlertTriangle size={24} />}
          <span>Overall status</span>
          <strong>{statusLabel(currentRun?.overall_status)}</strong>
        </article>
        <article>
          <Activity size={24} />
          <span>Health score</span>
          <strong>{currentRun ? `${currentRun.score}/100` : "—"}</strong>
        </article>
        <article>
          <XCircle size={24} />
          <span>Critical checks</span>
          <strong>{Number(currentRun?.critical_count || 0)}</strong>
        </article>
        <article>
          <AlertTriangle size={24} />
          <span>Unresolved app errors</span>
          <strong>{unresolvedErrors.length}</strong>
        </article>
      </div>

      <div className="system-health-grid">
        <section className="panel">
          <div className="panel-title-row">
            <div>
              <p className="eyebrow">DATA INTEGRITY</p>
              <h2>Business-data checks</h2>
              <span className="muted">
                These checks are read-only and never repair quantities automatically.
              </span>
            </div>
            <ShieldCheck size={23} />
          </div>

          {checks.length === 0 ? (
            <div className="empty-state compact">
              <p>Run a full check to inspect production data.</p>
            </div>
          ) : (
            <div className="system-check-list">
              {checks.map((check) => (
                <SystemHealthCheckCard key={check.key} check={check} />
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-title-row">
            <div>
              <p className="eyebrow">DEPLOYMENT</p>
              <h2>Environment checks</h2>
              <span className="muted">
                Secrets are checked by name and connectivity; secret values are never returned.
              </span>
            </div>
            <ServerCog size={23} />
          </div>

          {envChecks.length === 0 ? (
            <div className="empty-state compact">
              <p>Run a full check to inspect Netlify services.</p>
            </div>
          ) : (
            <div className="environment-check-list">
              {envChecks.map((check) => (
                <article key={check.key} className={check.status}>
                  {check.status === "pass"
                    ? <CheckCircle2 size={20} />
                    : <AlertTriangle size={20} />}
                  <div>
                    <strong>{check.label}</strong>
                    <span>{check.detail}</span>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="system-health-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={maintain}
              disabled={Boolean(busy)}
            >
              <Wrench size={18} />
              {busy === "maintenance" ? "Maintaining..." : "Run safe maintenance"}
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={() => downloadDiagnostics({
                health_run: currentRun,
                environment,
                unresolved_errors: unresolvedErrors,
                recent_runs: runs.slice(0, 10)
              })}
              disabled={!currentRun && !environment}
            >
              <Download size={18} />
              Export diagnostics
            </button>
          </div>
        </section>
      </div>

      <section className="panel system-error-panel">
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">ERROR RECOVERY</p>
            <h2>Captured application errors</h2>
            <span className="muted">
              Repeated identical errors are grouped for ten minutes to prevent log flooding.
            </span>
          </div>
          <button
            type="button"
            className="secondary-button compact danger-button"
            onClick={clearErrors}
            disabled={busy === "clear-errors" || errors.length === 0}
            title="Clear all application errors"
            style={{
              color: "#ef4444",
              borderColor: "color-mix(in srgb, #ef4444 40%, var(--border))",
              background: "color-mix(in srgb, #ef4444 8%, var(--surface))"
            }}
          >
            <XCircle size={20} style={{ color: "#ef4444" }} />
            <span>{busy === "clear-errors" ? "Clearing..." : "Clear all errors"}</span>
          </button>
        </div>

        {errors.length === 0 ? (
          <div className="empty-state compact">
            <CheckCircle2 size={40} />
            <p>No authenticated frontend errors have been captured.</p>
          </div>
        ) : (
          <div className="system-error-list">
            {errors.map((row) => (
              <article key={row.id} className={row.resolved_at ? "resolved" : row.severity}>
                <div>
                  <span className={`system-error-severity ${row.severity}`}>
                    {row.severity}
                  </span>
                  {row.resolved_at && <span className="status-pill active">Resolved</span>}
                </div>
                <strong>{row.message}</strong>
                <span>
                  {row.profiles?.full_name || "POS user"}
                  {row.branches?.name ? ` · ${row.branches.name}` : ""}
                  {row.route ? ` · ${row.route}` : ""}
                </span>
                <small>
                  Last seen {healthDateTime(row.last_seen_at)} · {row.occurrence_count} occurrence(s)
                  {row.release ? ` · ${row.release}` : ""}
                </small>
                {row.stack && <details><summary>Technical details</summary><pre>{row.stack}</pre></details>}
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
                  {!row.resolved_at && (
                    <button
                      type="button"
                      className="secondary-button compact"
                      onClick={() => resolve(row)}
                      disabled={busy === `resolve-${row.id}`}
                    >
                      <CheckCircle2 size={16} />
                      Mark resolved
                    </button>
                  )}
                  <button
                    type="button"
                    className="secondary-button compact danger-button"
                    onClick={() => deleteSingleError(row.id)}
                    disabled={busy === `delete-${row.id}`}
                    style={{
                      color: "#ef4444",
                      borderColor: "color-mix(in srgb, #ef4444 40%, var(--border))",
                      background: "color-mix(in srgb, #ef4444 8%, var(--surface))"
                    }}
                  >
                    <Trash2 size={15} style={{ color: "#ef4444" }} />
                    <span>Delete</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel system-run-history">
        <div className="panel-title-row">
          <div><p className="eyebrow">HISTORY</p><h2>Recent health runs</h2></div>
          <Activity size={22} />
        </div>
        <div className="system-run-list">
          {runs.map((run) => (
            <button type="button" key={run.id} onClick={() => setCurrentRun(run)}>
              <span className={`system-run-status ${run.overall_status}`} />
              <div><strong>{statusLabel(run.overall_status)}</strong><small>{healthDateTime(run.generated_at)} · {run.trigger_source}</small></div>
              <b>{run.score}/100</b>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
