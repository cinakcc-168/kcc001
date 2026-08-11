import {
  AlertTriangle,
  ArchiveRestore,
  CheckCircle2,
  Cloud,
  CloudUpload,
  DatabaseBackup,
  Download,
  Eye,
  FileCheck2,
  Filter,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  TimerReset,
  Unplug
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import AuditDetailModal from "../components/AuditDetailModal";
import DateRangePresetFields from "../components/DateRangePresetFields";
import {
  createDriveBackup,
  defaultAuditDates,
  disconnectGoogleDrive,
  downloadBusinessBackup,
  getGoogleDriveConnectUrl,
  loadAdminToolsWorkspace,
  loadBackupCenterSettings,
  readBackupFile,
  restoreBusinessBackup,
  saveBackupCenterSettings,
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
  const [backupCenter, setBackupCenter] = useState(null);
  const [scheduleForm, setScheduleForm] = useState({
    is_enabled: false,
    frequency_days: 1,
    backup_time: "23:00",
    timezone: "Asia/Phnom_Penh",
    google_drive_folder_url: ""
  });
  const [backupProgress, setBackupProgress] = useState("");

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
      const [workspace, center] = await Promise.all([
        loadAdminToolsWorkspace(
          supabase,
          profile,
          filters
        ),
        loadBackupCenterSettings(session)
      ]);

      setAuditLogs(workspace.auditLogs);
      setBranches(workspace.branches);
      setProfiles(workspace.profiles);
      setBackupLogs(workspace.backupLogs);
      setBackupCenter(center);
      setScheduleForm({
        is_enabled: Boolean(center.schedule?.is_enabled),
        frequency_days: Number(center.schedule?.frequency_days || 1),
        backup_time: center.schedule?.backup_time || "23:00",
        timezone: center.schedule?.timezone || "Asia/Phnom_Penh",
        google_drive_folder_url: center.schedule?.google_drive_folder_url || ""
      });
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, session, profile, filters, canUse]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    function handleDriveMessage(event) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "tiny-pos-drive-connected") return;
      announce("success", "Google Drive connected successfully.");
      refresh();
    }

    window.addEventListener("message", handleDriveMessage);
    return () => window.removeEventListener("message", handleDriveMessage);
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
      setBackupProgress("Collecting Tiny POS data and building one backup ZIP…");
      const result = await downloadBusinessBackup(session);
      setSafetyBackupDownloaded(true);
      announce("success", `${result.filename} downloaded.`);
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBackupProgress("");
      setBusy("");
    }
  }

  async function handleDriveBackup() {
    if (!backupCenter?.drive?.connected) {
      announce("error", "Connect Google Drive first.");
      return;
    }

    try {
      setBusy("drive-backup");
      setBackupProgress("Collecting data, packing the backup ZIP and uploading it to Google Drive…");
      const result = await createDriveBackup(session);
      announce("success", `${result.filename} saved to Google Drive.`);
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBackupProgress("");
      setBusy("");
    }
  }

  async function handleDriveConnect() {
    const popup = window.open("", "tiny-pos-google-drive", "width=560,height=720");
    try {
      setBusy("drive-connect");
      setBackupProgress("Preparing Google Drive permission request…");
      const authUrl = await getGoogleDriveConnectUrl(session);
      if (popup) popup.location.href = authUrl;
      else window.location.href = authUrl;
    } catch (error) {
      if (popup) popup.close();
      announce("error", error.message);
    } finally {
      setBackupProgress("");
      setBusy("");
    }
  }

  async function handleDriveDisconnect() {
    if (!window.confirm("Disconnect Google Drive and turn off automatic backup?")) return;
    try {
      setBusy("drive-disconnect");
      setBackupProgress("Disconnecting Google Drive…");
      await disconnectGoogleDrive(session);
      announce("success", "Google Drive disconnected. Automatic backup is off.");
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBackupProgress("");
      setBusy("");
    }
  }

  async function handleSaveSchedule() {
    if (scheduleForm.is_enabled && !backupCenter?.drive?.connected) {
      announce("error", "Connect Google Drive before enabling automatic backup.");
      return;
    }

    try {
      setBusy("schedule");
      setBackupProgress("Checking the backup location and saving the schedule…");
      const center = await saveBackupCenterSettings(session, scheduleForm);
      setBackupCenter(center);
      setScheduleForm({
        is_enabled: Boolean(center.schedule?.is_enabled),
        frequency_days: Number(center.schedule?.frequency_days || 1),
        backup_time: center.schedule?.backup_time || "23:00",
        timezone: center.schedule?.timezone || "Asia/Phnom_Penh",
        google_drive_folder_url: center.schedule?.google_drive_folder_url || ""
      });
      announce("success", scheduleForm.is_enabled ? "Automatic backup schedule saved." : "Backup settings saved. Automatic backup is off.");
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBackupProgress("");
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
      setBackupProgress("Opening and validating the selected backup file…");
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
      setBackupProgress("");
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
      setBackupProgress("Restoring Tiny POS business data. Do not close this page…");
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
      setBackupProgress("");
      setBusy("");
    }
  }

  const frequencyPreset = [1, 3, 7].includes(Number(scheduleForm.frequency_days))
    ? String(scheduleForm.frequency_days)
    : "custom";

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

            <DateRangePresetFields
              from={filters.from}
              to={filters.to}
              onChange={(range) =>
                setFilters((current) => ({
                  ...current,
                  from: range.from,
                  to: range.to
                }))
              }
            />

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
        <div className="backup-layout backup-center-layout">
          {backupProgress && (
            <section className="panel backup-progress-card">
              <LoaderCircle className="spin" size={26} />
              <div>
                <strong>Backup in progress</strong>
                <span>{backupProgress}</span>
              </div>
            </section>
          )}

          <section className="panel backup-card backup-create-card">
            <div className="backup-card-icon">
              <DatabaseBackup size={27} />
            </div>
            <div>
              <p className="eyebrow">ONE BACKUP FILE</p>
              <h2>Create Tiny POS backup</h2>
              <p className="muted">
                Creates one ZIP package containing the Tiny POS business
                backup, a manifest and a Cloudinary asset-link list.
              </p>
            </div>

            <div className="backup-warning">
              <AlertTriangle size={19} />
              Login passwords, Netlify/API secrets and the actual Cloudinary
              image binaries are intentionally not copied into the ZIP.
            </div>

            <div className="backup-primary-actions">
              <button
                type="button"
                className="primary-button"
                onClick={handleDownload}
                disabled={Boolean(busy)}
              >
                <Download size={19} />
                {busy === "download" ? "Creating…" : "Create & Download ZIP"}
              </button>

              <button
                type="button"
                className="secondary-button"
                onClick={handleDriveBackup}
                disabled={Boolean(busy) || !backupCenter?.drive?.connected}
              >
                <CloudUpload size={19} />
                {busy === "drive-backup" ? "Uploading…" : "Backup now to Drive"}
              </button>
            </div>
          </section>

          <section className="panel backup-card backup-drive-card">
            <div className="backup-card-icon">
              <Cloud size={27} />
            </div>
            <div className="backup-card-heading-row">
              <div>
                <p className="eyebrow">BACKUP LOCATION</p>
                <h2>Google Drive</h2>
              </div>
              <span className={`status-pill ${backupCenter?.drive?.connected ? "active" : "inactive"}`}>
                {backupCenter?.drive?.connected ? "Connected" : "Not connected"}
              </span>
            </div>

            {!backupCenter?.drive?.configured && (
              <div className="notice error backup-config-notice">
                Add the Google backup Client ID, Client Secret and encryption
                key in Netlify before using Connect Google Drive.
              </div>
            )}

            {backupCenter?.drive?.connected ? (
              <div className="backup-drive-account">
                <CheckCircle2 size={18} />
                <div>
                  <strong>{backupCenter.drive.account_email || "Google account"}</strong>
                  <span>Connected {dateTime(backupCenter.drive.connected_at)}</span>
                </div>
              </div>
            ) : (
              <p className="muted">
                Google will ask you to approve Drive access once. The saved
                permission lets scheduled backups run even when Tiny POS is closed.
              </p>
            )}

            <label>
              <span>Google Drive backup folder link</span>
              <div className="backup-folder-input">
                <FolderOpen size={18} />
                <input
                  value={scheduleForm.google_drive_folder_url}
                  onChange={(event) => setScheduleForm((current) => ({
                    ...current,
                    google_drive_folder_url: event.target.value
                  }))}
                  placeholder="https://drive.google.com/drive/folders/..."
                  disabled={Boolean(busy)}
                />
              </div>
              <small className="field-help">
                Leave blank and Tiny POS will create a “Tiny POS Backups” folder automatically.
              </small>
            </label>

            <div className="backup-drive-actions">
              {!backupCenter?.drive?.connected ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleDriveConnect}
                  disabled={Boolean(busy) || !backupCenter?.drive?.configured}
                >
                  <Cloud size={18} />
                  Connect Google Drive
                </button>
              ) : (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleDriveDisconnect}
                  disabled={Boolean(busy)}
                >
                  <Unplug size={18} />
                  Disconnect
                </button>
              )}
            </div>
          </section>

          <section className="panel backup-card backup-schedule-card">
            <div className="backup-card-icon">
              <TimerReset size={27} />
            </div>
            <div>
              <p className="eyebrow">AUTOMATIC BACKUP</p>
              <h2>Backup schedule</h2>
              <p className="muted">
                Automatic backups are saved to the connected Google Drive folder.
              </p>
            </div>

            <label className="backup-auto-toggle">
              <input
                type="checkbox"
                checked={scheduleForm.is_enabled}
                onChange={(event) => setScheduleForm((current) => ({
                  ...current,
                  is_enabled: event.target.checked
                }))}
                disabled={Boolean(busy)}
              />
              <span>
                <strong>Auto backup</strong>
                <small>{scheduleForm.is_enabled ? "Enabled" : "Off"}</small>
              </span>
            </label>

            <div className="backup-schedule-grid">
              <label>
                <span>Frequency</span>
                <select
                  value={frequencyPreset}
                  onChange={(event) => {
                    const value = event.target.value;
                    setScheduleForm((current) => ({
                      ...current,
                      frequency_days: value === "custom"
                        ? ([1, 3, 7].includes(Number(current.frequency_days)) ? 10 : Math.max(2, Number(current.frequency_days || 10)))
                        : Number(value)
                    }));
                  }}
                  disabled={Boolean(busy)}
                >
                  <option value="1">Every day</option>
                  <option value="3">Every 3 days</option>
                  <option value="7">Every week</option>
                  <option value="custom">Custom days</option>
                </select>
              </label>

              {frequencyPreset === "custom" && (
                <label>
                  <span>Every</span>
                  <div className="backup-days-input">
                    <input
                      type="number"
                      min="2"
                      max="90"
                      value={scheduleForm.frequency_days}
                      onChange={(event) => setScheduleForm((current) => ({
                        ...current,
                        frequency_days: Math.max(2, Math.min(90, Number(event.target.value || 2)))
                      }))}
                    />
                    <span>days</span>
                  </div>
                </label>
              )}

              <label>
                <span>Backup time</span>
                <input
                  type="time"
                  value={scheduleForm.backup_time}
                  onChange={(event) => setScheduleForm((current) => ({
                    ...current,
                    backup_time: event.target.value
                  }))}
                  disabled={Boolean(busy)}
                />
              </label>
            </div>

            <div className="backup-schedule-status">
              <div>
                <span>Timezone</span>
                <strong>{backupCenter?.schedule?.timezone || scheduleForm.timezone}</strong>
              </div>
              <div>
                <span>Last backup</span>
                <strong>{dateTime(backupCenter?.schedule?.last_backup_at)}</strong>
              </div>
              <div>
                <span>Next backup</span>
                <strong>{scheduleForm.is_enabled ? dateTime(backupCenter?.schedule?.next_backup_at) : "Off"}</strong>
              </div>
            </div>

            {backupCenter?.schedule?.last_status === "failed" && backupCenter?.schedule?.last_error && (
              <div className="notice error">{backupCenter.schedule.last_error}</div>
            )}

            <button
              type="button"
              className="primary-button"
              onClick={handleSaveSchedule}
              disabled={Boolean(busy)}
            >
              <Save size={18} />
              {busy === "schedule" ? "Saving…" : "Save backup settings"}
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
                Tiny POS accepts the new ZIP backup and older JSON backups.
                Validation does not change database records.
              </p>
            </div>

            <label className="backup-file-input">
              <span>Choose backup ZIP or JSON</span>
              <input
                type="file"
                accept="application/zip,.zip,application/json,.json"
                onChange={handleFile}
                disabled={Boolean(busy)}
              />
              <strong>{backupFile?.name || "No file selected"}</strong>
            </label>

            {validation && (
              <div className={`backup-validation ${validation.valid ? "valid" : "invalid"}`}>
                <strong>{validation.valid ? "Valid Tiny POS backup" : "Backup is not valid"}</strong>
                {validation.valid ? (
                  <>
                    <span>Source: {validation.source_organization || "Tiny POS"}</span>
                    <span>Created: {dateTime(validation.created_at)}</span>
                    <span>Rows: {totalRows(validation.row_counts)}</span>
                    <span>Version: {validation.version}</span>
                  </>
                ) : (
                  <ul>{(validation.problems || []).map((problem) => <li key={problem}>{problem}</li>)}</ul>
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
                Restore replaces the current organization’s business records
                with the selected backup. Existing Supabase login accounts are retained.
              </p>
            </div>

            {!isOwner ? (
              <div className="notice error">Only the owner account can run a restore.</div>
            ) : (
              <>
                <label className="restore-check">
                  <input
                    type="checkbox"
                    checked={safetyBackupDownloaded}
                    onChange={(event) => setSafetyBackupDownloaded(event.target.checked)}
                  />
                  <span>I downloaded a current safety backup before restoring.</span>
                </label>

                <label>
                  <span>Type exactly: <b>RESTORE TINY POS</b></span>
                  <input
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    placeholder="RESTORE TINY POS"
                  />
                </label>

                <button
                  type="button"
                  className="danger-button restore-button"
                  onClick={handleRestore}
                  disabled={Boolean(busy) || !validation?.valid || confirmation !== "RESTORE TINY POS" || !safetyBackupDownloaded}
                >
                  <ArchiveRestore size={19} />
                  {busy === "restore" ? "Restoring…" : "Restore selected backup"}
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
                      <strong>{entry.filename || readable(entry.action)}</strong>
                      <span>
                        {entry.profiles?.full_name || "System"} · {dateTime(entry.created_at)}
                      </span>
                      <small>
                        {entry.details?.trigger === "scheduled" ? "Automatic" : "Manual"}
                        {entry.details?.destination === "google_drive" ? " · Google Drive" : " · Download / validation"}
                      </small>
                    </div>
                    <div>
                      <span className={`status-pill ${entry.status === "completed" ? "active" : "inactive"}`}>
                        {entry.status}
                      </span>
                      <small>{totalRows(entry.row_counts)} rows</small>
                      {entry.details?.drive_web_view_link && (
                        <a href={entry.details.drive_web_view_link} target="_blank" rel="noreferrer">
                          Open in Drive
                        </a>
                      )}
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
