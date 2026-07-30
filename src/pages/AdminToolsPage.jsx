import {
  AlertTriangle,
  ArchiveRestore,
  DatabaseBackup,
  Download,
  Eye,
  FileCheck2,
  Filter,
  RefreshCw,
  Search,
  ShieldCheck
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import AuditDetailModal from "../components/AuditDetailModal";
import {
  defaultAuditDates,
  downloadBusinessBackup,
  loadAdminToolsWorkspace,
  readBackupFile,
  restoreBusinessBackup,
  validateBusinessBackup
} from "../lib/adminTools";

function dateTime(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function totalRows(rowCounts) {
  return Object.values(rowCounts || {}).reduce(
    (sum, value) => sum + Number(value || 0),
    0
  );
}

function readable(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function AdminToolsPage() {
  const { supabase, session, profile, can } = useAuth();
  const isOwner = profile?.role === "owner";
  const canUse = can("audit_backup.manage");

  const [tab, setTab] = useState("audit");
  const [filters, setFilters] = useState(() => ({
    ...defaultAuditDates(),
    branch_id: "",
    user_id: "",
    action: "",
    entity_type: ""
  }));
  const [search, setSearch] = useState("");
  const [auditLogs, setAuditLogs] = useState([]);
  const [branches, setBranches] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [backupLogs, setBackupLogs] = useState([]);
  const [selectedAudit, setSelectedAudit] = useState(null);

  const [backupFile, setBackupFile] = useState(null);
  const [backupDocument, setBackupDocument] = useState(null);
  const [validation, setValidation] = useState(null);
  const [confirmation, setConfirmation] = useState("");
  const [safetyBackupDownloaded, setSafetyBackupDownloaded] =
    useState(false);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  const refresh = useCallback(async () => {
    if (!supabase || !profile?.organization_id || !canUse) {
      return;
    }

    try {
      setLoading(true);
      const workspace = await loadAdminToolsWorkspace(
        supabase,
        profile,
        filters
      );

      setAuditLogs(workspace.auditLogs);
      setBranches(workspace.branches);
      setProfiles(workspace.profiles);
      setBackupLogs(workspace.backupLogs);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, profile, filters, canUse]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const actions = useMemo(
    () =>
      [...new Set(auditLogs.map((entry) => entry.action))]
        .filter(Boolean)
        .sort(),
    [auditLogs]
  );

  const entityTypes = useMemo(
    () =>
      [...new Set(auditLogs.map((entry) => entry.entity_type))]
        .filter(Boolean)
        .sort(),
    [auditLogs]
  );

  const filteredAudit = useMemo(() => {
    const needle = search.trim().toLowerCase();

    if (!needle) return auditLogs;

    return auditLogs.filter((entry) =>
      [
        entry.action,
        entry.entity_type,
        entry.entity_id,
        entry.profiles?.full_name,
        entry.profiles?.email,
        entry.branches?.name,
        JSON.stringify(entry.new_data || {})
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [auditLogs, search]);

  function announce(type, text) {
    setMessageType(type);
    setMessage(text);
  }

  async function handleDownload() {
    try {
      setBusy("download");
      const result = await downloadBusinessBackup(session);
      setSafetyBackupDownloaded(true);
      announce("success", `${result.filename} downloaded.`);
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy("");
    }
  }

  async function handleFile(event) {
    const file = event.target.files?.[0] || null;

    setBackupFile(file);
    setBackupDocument(null);
    setValidation(null);
    setConfirmation("");

    if (!file) return;

    try {
      setBusy("validate");
      const document = await readBackupFile(file);
      const result = await validateBusinessBackup(
        session,
        document
      );
      setBackupDocument(document);
      setValidation(result);
      announce(
        "success",
        `${file.name} is a valid Tiny POS backup.`
      );
      await refresh();
    } catch (error) {
      setBackupDocument(null);
      setValidation({
        valid: false,
        problems: [error.message]
      });
      announce("error", error.message);
    } finally {
      setBusy("");
    }
  }

  async function handleRestore() {
    if (!backupDocument || !validation?.valid) {
      announce("error", "Choose and validate a backup first.");
      return;
    }

    try {
      setBusy("restore");
      const result = await restoreBusinessBackup(
        session,
        backupDocument,
        confirmation,
        safetyBackupDownloaded
      );

      const missing = result.missing_staff?.length || 0;
      announce(
        "success",
        `Restore completed. ${missing} staff account(s) must be recreated or matched by email.`
      );

      setConfirmation("");
      setBackupFile(null);
      setBackupDocument(null);
      setValidation(null);

      setTimeout(() => window.location.reload(), 1400);
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy("");
    }
  }

  if (!canUse) {
    return (
      <section className="panel empty-state">
        <ShieldCheck size={46} />
        <h2>Administrator access required</h2>
        <p>
          Only the owner or an admin can view the audit trail
          and create backups.
        </p>
      </section>
    );
  }

  return (
    <div className="page-stack admin-tools-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">SYSTEM CONTROL</p>
          <h1>Audit & Backup</h1>
          <p className="muted">
            Review staff activity and protect the new Tiny POS data.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw
            size={18}
            className={loading ? "spin" : ""}
          />
          Refresh
        </button>
      </div>

      {message && (
        <div className={`notice ${messageType}`}>
          {message}
        </div>
      )}

      <div className="admin-tool-tabs">
        <button
          type="button"
          className={tab === "audit" ? "active" : ""}
          onClick={() => setTab("audit")}
        >
          <ShieldCheck size={18} />
          Audit trail
        </button>
        <button
          type="button"
          className={tab === "backup" ? "active" : ""}
          onClick={() => setTab("backup")}
        >
          <DatabaseBackup size={18} />
          Backup center
        </button>
      </div>

      {tab === "audit" ? (
        <>
          <section className="panel audit-filter-panel">
            <div className="search-box">
              <Search size={18} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search action, user, record or details"
              />
            </div>

            <label>
              <span>From</span>
              <input
                type="date"
                value={filters.from}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    from: event.target.value
                  }))
                }
              />
            </label>

            <label>
              <span>To</span>
              <input
                type="date"
                value={filters.to}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    to: event.target.value
                  }))
                }
              />
            </label>

            <label>
              <span>Branch</span>
              <select
                value={filters.branch_id}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    branch_id: event.target.value
                  }))
                }
              >
                <option value="">All branches</option>
                {branches.map((branch) => (
                  <option value={branch.id} key={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>User</span>
              <select
                value={filters.user_id}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    user_id: event.target.value
                  }))
                }
              >
                <option value="">All users</option>
                {profiles.map((member) => (
                  <option value={member.id} key={member.id}>
                    {member.full_name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Action</span>
              <select
                value={filters.action}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    action: event.target.value
                  }))
                }
              >
                <option value="">All actions</option>
                {actions.map((action) => (
                  <option value={action} key={action}>
                    {readable(action)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Record type</span>
              <select
                value={filters.entity_type}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    entity_type: event.target.value
                  }))
                }
              >
                <option value="">All record types</option>
                {entityTypes.map((type) => (
                  <option value={type} key={type}>
                    {readable(type)}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="panel audit-list-panel">
            <div className="panel-title-row">
              <div>
                <p className="eyebrow">ACTIVITY</p>
                <h2>{filteredAudit.length} audit entries</h2>
              </div>
              <Filter size={21} />
            </div>

            {loading ? (
              <div className="empty-state">
                <RefreshCw className="spin" />
                <p>Loading audit history...</p>
              </div>
            ) : filteredAudit.length === 0 ? (
              <div className="empty-state">
                <ShieldCheck size={44} />
                <h2>No activity found</h2>
                <p>Change the date range or filters.</p>
              </div>
            ) : (
              <div className="audit-table-wrap">
                <table className="audit-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>User</th>
                      <th>Branch</th>
                      <th>Action</th>
                      <th>Record</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAudit.map((entry) => (
                      <tr key={entry.id}>
                        <td data-label="Date">
                          {dateTime(entry.created_at)}
                        </td>
                        <td data-label="User">
                          <strong>
                            {entry.profiles?.full_name || "System"}
                          </strong>
                          <small>
                            {entry.profiles?.role || "system"}
                          </small>
                        </td>
                        <td data-label="Branch">
                          {entry.branches?.name || "—"}
                        </td>
                        <td data-label="Action">
                          <span className="audit-action-pill">
                            {readable(entry.action)}
                          </span>
                        </td>
                        <td data-label="Record">
                          <strong>{readable(entry.entity_type)}</strong>
                          <small>{entry.entity_id || "—"}</small>
                        </td>
                        <td data-label="Details">
                          <button
                            type="button"
                            className="icon-button"
                            onClick={() => setSelectedAudit(entry)}
                            title="View details"
                          >
                            <Eye size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : (
        <div className="backup-layout">
          <section className="panel backup-card">
            <div className="backup-card-icon">
              <Download size={27} />
            </div>
            <div>
              <p className="eyebrow">EXPORT</p>
              <h2>Download full business backup</h2>
              <p className="muted">
                Exports products, stock, customers, sales, purchases,
                refunds, cash entries, settings, transfers and audit
                history to one JSON file.
              </p>
            </div>

            <div className="backup-warning">
              <AlertTriangle size={19} />
              Supabase Auth passwords are never exported. Staff are
              identified by email so they can be matched during restore.
            </div>

            <button
              type="button"
              className="primary-button"
              onClick={handleDownload}
              disabled={Boolean(busy)}
            >
              <DatabaseBackup size={19} />
              {busy === "download"
                ? "Creating backup..."
                : "Download backup"}
            </button>
          </section>

          <section className="panel backup-card">
            <div className="backup-card-icon">
              <FileCheck2 size={27} />
            </div>
            <div>
              <p className="eyebrow">VALIDATE</p>
              <h2>Check a backup file</h2>
              <p className="muted">
                Validation reads and checks the file without changing
                any database records.
              </p>
            </div>

            <label className="backup-file-input">
              <span>Choose JSON backup</span>
              <input
                type="file"
                accept="application/json,.json"
                onChange={handleFile}
                disabled={Boolean(busy)}
              />
              <strong>
                {backupFile?.name || "No file selected"}
              </strong>
            </label>

            {validation && (
              <div
                className={`backup-validation ${
                  validation.valid ? "valid" : "invalid"
                }`}
              >
                <strong>
                  {validation.valid
                    ? "Valid Tiny POS backup"
                    : "Backup is not valid"}
                </strong>

                {validation.valid ? (
                  <>
                    <span>
                      Source:{" "}
                      {validation.source_organization || "Tiny POS"}
                    </span>
                    <span>
                      Created: {dateTime(validation.created_at)}
                    </span>
                    <span>
                      Rows: {totalRows(validation.row_counts)}
                    </span>
                    <span>
                      Version: {validation.version}
                    </span>
                  </>
                ) : (
                  <ul>
                    {(validation.problems || []).map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          <section className="panel backup-card restore-card">
            <div className="backup-card-icon danger">
              <ArchiveRestore size={27} />
            </div>
            <div>
              <p className="eyebrow">OWNER ONLY</p>
              <h2>Restore business data</h2>
              <p className="muted">
                Restore replaces the current organization’s business
                records with the selected backup. Existing Supabase
                login accounts are retained.
              </p>
            </div>

            {!isOwner ? (
              <div className="notice error">
                Only the owner account can run a restore.
              </div>
            ) : (
              <>
                <label className="restore-check">
                  <input
                    type="checkbox"
                    checked={safetyBackupDownloaded}
                    onChange={(event) =>
                      setSafetyBackupDownloaded(
                        event.target.checked
                      )
                    }
                  />
                  <span>
                    I downloaded a current safety backup before restoring.
                  </span>
                </label>

                <label>
                  <span>
                    Type exactly: <b>RESTORE TINY POS</b>
                  </span>
                  <input
                    value={confirmation}
                    onChange={(event) =>
                      setConfirmation(event.target.value)
                    }
                    placeholder="RESTORE TINY POS"
                  />
                </label>

                <button
                  type="button"
                  className="danger-button restore-button"
                  onClick={handleRestore}
                  disabled={
                    Boolean(busy) ||
                    !validation?.valid ||
                    confirmation !== "RESTORE TINY POS" ||
                    !safetyBackupDownloaded
                  }
                >
                  <ArchiveRestore size={19} />
                  {busy === "restore"
                    ? "Restoring..."
                    : "Restore selected backup"}
                </button>
              </>
            )}
          </section>

          <section className="panel backup-history-card">
            <div className="panel-title-row">
              <div>
                <p className="eyebrow">HISTORY</p>
                <h2>Backup operations</h2>
              </div>
              <DatabaseBackup size={21} />
            </div>

            {backupLogs.length === 0 ? (
              <p className="muted">No backup activity yet.</p>
            ) : (
              <div className="backup-log-list">
                {backupLogs.map((entry) => (
                  <article key={entry.id}>
                    <div>
                      <strong>
                        {readable(entry.action)}
                      </strong>
                      <span>
                        {entry.profiles?.full_name || "System"} ·{" "}
                        {dateTime(entry.created_at)}
                      </span>
                    </div>
                    <div>
                      <span
                        className={`status-pill ${
                          entry.status === "completed"
                            ? "active"
                            : "inactive"
                        }`}
                      >
                        {entry.status}
                      </span>
                      <small>
                        {totalRows(entry.row_counts)} rows
                      </small>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <AuditDetailModal
        entry={selectedAudit}
        onClose={() => setSelectedAudit(null)}
      />
    </div>
  );
}
