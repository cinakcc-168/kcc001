import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  Edit3,
  KeyRound,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  UserCheck,
  UserRoundX,
  UsersRound
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import BranchFormModal from "../components/BranchFormModal";
import PasswordResetModal from "../components/PasswordResetModal";
import StaffFormModal from "../components/StaffFormModal";
import CustomRoleModal from "../components/CustomRoleModal";
import ResponsiveDataList from "../components/ResponsiveDataList";
import {
  createStaffUser,
  loadStaffWorkspace,
  resetStaffPassword,
  roleLabel,
  saveBranch,
  saveCustomRole,
  deleteCustomRole,
  setBranchStatus,
  setStaffStatus,
  updateStaffUser
} from "../lib/staff";

function dateTime(value, t) {
  if (!value) return t ? t("Never") : "Never";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

const roleGuide = [
  {
    role: "Owner",
    text: "Full organization access, including administrators, branches, and shop settings."
  },
  {
    role: "Admin",
    text: "Manages managers, cashiers, viewers, products, inventory, customers, and refunds."
  },
  {
    role: "Manager",
    text: "Runs sales, refunds, customers, products, purchases, and inventory operations."
  },
  {
    role: "Cashier",
    text: "Creates sales and customer records. Inventory and refund administration stay hidden."
  },
  {
    role: "Viewer",
    text: "Read-only access intended for dashboards and reports as reporting modules are added."
  }
];

export default function UsersPage() {
  const { session, profile, can } = useAuth();
  const { t } = useLanguage();
  const allowed = can("staff.manage");

  const [staff, setStaff] = useState([]);
  const [branches, setBranches] = useState([]);
  const [customRoles, setCustomRoles] = useState([]);
  const [permissionDefinitions, setPermissionDefinitions] = useState([]);
  const [customRoleOpen, setCustomRoleOpen] = useState(false);
  const [editingCustomRole, setEditingCustomRole] = useState(null);
  const [tab, setTab] = useState("staff");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [branchFilter, setBranchFilter] = useState("all");
  const [staffFormOpen, setStaffFormOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [resetMember, setResetMember] = useState(null);
  const [branchFormOpen, setBranchFormOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  const refresh = useCallback(async () => {
    if (!allowed || !session) return;

    try {
      setLoading(true);
      const data = await loadStaffWorkspace(session);
      setStaff(data.staff);
      setBranches(data.branches);
      setCustomRoles(data.customRoles);
      setPermissionDefinitions(data.permissionDefinitions);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [allowed, session]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filteredStaff = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return staff.filter((member) => {
      if (roleFilter !== "all") {
        if (roleFilter.startsWith("custom:")) {
          if (member.custom_role_id !== roleFilter.slice(7)) return false;
        } else if (member.role !== roleFilter) return false;
      }
      if (branchFilter !== "all" && member.branch_id !== branchFilter) return false;
      if (statusFilter === "active" && !member.is_active) return false;
      if (statusFilter === "inactive" && member.is_active) return false;

      if (!needle) return true;

      return [
        member.full_name,
        member.email,
        member.phone,
        member.role,
        member.custom_staff_roles?.name,
        member.branches?.name,
        member.branches?.code
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [staff, search, roleFilter, branchFilter, statusFilter]);

  const counts = useMemo(
    () => ({
      activeStaff: staff.filter((member) => member.is_active).length,
      inactiveStaff: staff.filter((member) => !member.is_active).length,
      activeBranches: branches.filter((branch) => branch.is_active).length
    }),
    [staff, branches]
  );

  const roleRows = useMemo(() => {
    const standard = roleGuide.map((item) => {
      const roleKey = item.role.toLowerCase();
      return {
        id: `standard-${roleKey}`,
        kind: "standard",
        name: item.role,
        base_role: roleKey,
        description: item.text,
        permission_count: "System",
        assigned_staff_count: staff.filter((member) => member.role === roleKey && !member.custom_role_id).length,
        is_active: true
      };
    });

    const custom = customRoles.map((role) => ({
      ...role,
      kind: "custom",
      permission_count: (role.permission_keys || []).length
    }));

    return [...standard, ...custom];
  }, [customRoles, staff]);

  function canEdit(member) {
    if (profile.role === "owner") return true;
    if (member.role === "owner" || member.role === "admin") {
      return member.id === profile.id;
    }
    return true;
  }

  function canChangeStatus(member) {
    if (member.id === profile.id || member.role === "owner") return false;
    if (profile.role === "admin" && member.role === "admin") return false;
    return true;
  }

  async function saveStaff(values) {
    try {
      setBusy(true);
      setMessage("");

      if (values.user_id) {
        await updateStaffUser(session, values);
        setMessage("Staff account updated.");
      } else {
        await createStaffUser(session, values);
        setMessage("Staff login created successfully.");
      }

      setMessageType("success");
      setStaffFormOpen(false);
      setEditingStaff(null);
      await refresh();
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function toggleStaff(member) {
    const nextStatus = !member.is_active;
    const confirmed = window.confirm(
      `${nextStatus ? "Activate" : "Deactivate"} ${member.full_name}?`
    );
    if (!confirmed) return;

    try {
      setBusy(true);
      await setStaffStatus(session, member.id, nextStatus);
      setMessageType("success");
      setMessage(
        nextStatus
          ? `${member.full_name} is active.`
          : `${member.full_name} is inactive and cannot use the POS.`
      );
      await refresh();
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(password) {
    try {
      setBusy(true);
      await resetStaffPassword(session, resetMember.id, password);
      setMessageType("success");
      setMessage(`Password reset for ${resetMember.full_name}.`);
      setResetMember(null);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitBranch(values) {
    try {
      setBusy(true);
      await saveBranch(session, values);
      setMessageType("success");
      setMessage(values.id ? "Branch updated." : "New branch created.");
      setBranchFormOpen(false);
      setEditingBranch(null);
      await refresh();
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function toggleBranch(branch) {
    const nextStatus = !branch.is_active;
    const confirmed = window.confirm(
      `${nextStatus ? "Activate" : "Deactivate"} ${branch.name}?`
    );
    if (!confirmed) return;

    try {
      setBusy(true);
      await setBranchStatus(session, branch.id, nextStatus);
      setMessageType("success");
      setMessage(
        nextStatus ? `${branch.name} is active.` : `${branch.name} is inactive.`
      );
      await refresh();
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitCustomRole(values) {
    try {
      setBusy(true);
      await saveCustomRole(session, values);
      setMessageType("success");
      setMessage(values.id ? "Custom role updated." : "Custom role created.");
      setCustomRoleOpen(false);
      setEditingCustomRole(null);
      await refresh();
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function removeCustomRole(role) {
    if (!window.confirm(`Delete ${role.name}? Existing staff must be moved to another role first.`)) return;
    try {
      setBusy(true);
      await deleteCustomRole(session, role.id);
      setMessageType("success");
      setMessage(`${role.name} deleted.`);
      await refresh();
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) {
    return (
      <section className="panel empty-state">
        <ShieldCheck size={48} />
        <h2>{t("Staff management is restricted")}</h2>
        <p>{t("Only the owner or an administrator can manage users and branches.")}</p>
      </section>
    );
  }

  return (
    <div className="page-stack users-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t("ACCESS CONTROL")}</p>
          <h1>{t("Staff & Branches")}</h1>
          <p className="muted">
            {t("Create secure staff logins, assign roles, and control branch access.")}
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw size={18} className={loading ? "spin" : ""} />
          {t("Refresh")}
        </button>
      </div>

      {message && <div className={`notice ${messageType}`}>{t(message)}</div>}

      <div className="staff-metrics">
        <article>
          <UserCheck size={22} />
          <span>{t("Active staff")}</span>
          <strong>{counts.activeStaff}</strong>
        </article>
        <article>
          <UserRoundX size={22} />
          <span>{t("Inactive staff")}</span>
          <strong>{counts.inactiveStaff}</strong>
        </article>
        <article>
          <Building2 size={22} />
          <span>{t("Active branches")}</span>
          <strong>{counts.activeBranches}</strong>
        </article>
      </div>

      <div className="staff-tabs">
        <button
          type="button"
          className={tab === "staff" ? "active" : ""}
          onClick={() => setTab("staff")}
        >
          <UsersRound size={18} /> {t("Staff")}
        </button>
        <button
          type="button"
          className={tab === "branches" ? "active" : ""}
          onClick={() => setTab("branches")}
        >
          <Store size={18} /> {t("Branches")}
        </button>
        <button
          type="button"
          className={tab === "roles" ? "active" : ""}
          onClick={() => setTab("roles")}
        >
          <ShieldCheck size={18} /> {t("Roles")}
        </button>
      </div>

      {tab === "staff" && (
        <>
          <section className="panel staff-toolbar">
            <div className="search-box">
              <Search size={18} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("Search name, email, phone, role or branch")}
              />
            </div>

            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
            >
              <option value="all">{t("All roles")}</option>
              <option value="owner">{t("Owner")}</option>
              <option value="admin">{t("Admin")}</option>
              <option value="manager">{t("Manager")}</option>
              <option value="cashier">{t("Cashier")}</option>
              <option value="viewer">{t("Viewer")}</option>
              {customRoles.map((role) => (
                <option value={`custom:${role.id}`} key={role.id}>{role.name}</option>
              ))}
            </select>

            <select
              value={branchFilter}
              onChange={(event) => setBranchFilter(event.target.value)}
            >
              <option value="all">{t("All branches")}</option>
              {branches.map((branch) => (
                <option value={branch.id} key={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="active">{t("Active staff")}</option>
              <option value="inactive">{t("Inactive staff")}</option>
              <option value="all">{t("All statuses")}</option>
            </select>

            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setEditingStaff(null);
                setStaffFormOpen(true);
              }}
            >
              <Plus size={18} /> {t("Add staff")}
            </button>
          </section>

          {loading ? (
            <section className="panel staff-list-panel">
              <div className="empty-state">
                <RefreshCw className="spin" />
                <p>{t("Loading staff accounts...")}</p>
              </div>
            </section>
          ) : (
            <ResponsiveDataList
              storageKey="tiny-pos-staff-directory"
              title={t("Staff")}
              subtitle={t("Switch between a compact table and responsive cards on PC or phone.")}
              rows={filteredStaff}
              filename="tiny-pos-staff.xls"
              printTitle={t("Staff")}
              emptyTitle={t("No staff found")}
              emptyText={t("Change the filters or add a new staff login.")}
              columns={[
                { label: t("Staff"), width: 190, value: (member) => member.full_name || "—", render: (member) => <><strong>{member.full_name || "—"}</strong>{member.id === profile.id && <small>{t("You")}</small>}</> },
                { label: t("Email"), width: 210, value: (member) => member.email || "—" },
                { label: t("Phone"), width: 130, value: (member) => member.phone || "—" },
                { label: t("Role"), width: 140, value: (member) => member.custom_staff_roles?.name || t(roleLabel(member.role)) },
                { label: t("Branch"), width: 170, value: (member) => member.branches?.name || t("No branch"), render: (member) => <>{member.branches?.name || t("No branch")}<small>{member.branches?.code || "—"}</small></> },
                { label: t("Last login"), width: 180, value: (member) => dateTime(member.auth_last_sign_in_at || member.last_login_at, t) },
                { label: t("Status"), width: 100, value: (member) => member.is_active ? t("Active") : t("Inactive"), render: (member) => <span className={`status-pill ${member.is_active ? "active" : "inactive"}`}>{member.is_active ? t("Active") : t("Inactive")}</span> },
                { label: t("Actions"), actionsOnly: true, excludeDocument: true, render: (member) => <div className="staff-table-actions"><button type="button" className="icon-button" title={t("Edit staff")} disabled={!canEdit(member)} onClick={() => { setEditingStaff(member); setStaffFormOpen(true); }}><Edit3 size={18} /></button><button type="button" className="icon-button" title={t("Reset password")} disabled={!canEdit(member)} onClick={() => setResetMember(member)}><KeyRound size={18} /></button>{canChangeStatus(member) && <button type="button" className={member.is_active ? "danger-text-button" : "success-text-button"} disabled={busy} onClick={() => toggleStaff(member)}>{member.is_active ? t("Deactivate") : t("Activate")}</button>}</div> }
              ]}
              renderCard={(member) => (
                <article className="responsive-data-card staff-directory-card">
                  <header>
                    <div className="staff-directory-card-title">
                      <span className="staff-avatar">{member.full_name?.trim()?.[0]?.toUpperCase() || "U"}</span>
                      <span><strong>{member.full_name || "—"}</strong><small>{member.email || "—"}</small></span>
                    </div>
                    <span className={`status-pill ${member.is_active ? "active" : "inactive"}`}>{member.is_active ? t("Active") : t("Inactive")}</span>
                  </header>
                  <div><span>{t("Phone")}</span><strong>{member.phone || "—"}</strong></div>
                  <div><span>{t("Role")}</span><strong>{member.custom_staff_roles?.name || t(roleLabel(member.role))}</strong></div>
                  <div><span>{t("Branch")}</span><strong>{member.branches?.name || t("No branch")}</strong><small>{member.branches?.code || "—"}</small></div>
                  <div><span>{t("Last login")}</span><strong>{dateTime(member.auth_last_sign_in_at || member.last_login_at, t)}</strong><small>{t("Created")} {dateTime(member.created_at, t)}</small></div>
                  <footer>
                    <button type="button" className="secondary-button compact-button" disabled={!canEdit(member)} onClick={() => { setEditingStaff(member); setStaffFormOpen(true); }}><Edit3 size={17} />{t("Edit")}</button>
                    <button type="button" className="secondary-button compact-button" disabled={!canEdit(member)} onClick={() => setResetMember(member)}><KeyRound size={17} />{t("Password")}</button>
                    {canChangeStatus(member) && <button type="button" className={member.is_active ? "danger-text-button" : "success-text-button"} disabled={busy} onClick={() => toggleStaff(member)}>{member.is_active ? t("Deactivate") : t("Activate")}</button>}
                  </footer>
                </article>
              )}
            />
          )}
        </>
      )}

      {tab === "branches" && (
        loading ? (
          <section className="panel"><div className="empty-state"><RefreshCw className="spin" /><p>{t("Loading branches...")}</p></div></section>
        ) : (
          <ResponsiveDataList
            storageKey="tiny-pos-branch-directory"
            title={t("Branches")}
            subtitle={t("New branches receive zero-stock inventory rows for every existing product.")}
            rows={branches}
            filename="tiny-pos-branches.xls"
            printTitle={t("Branches")}
            emptyTitle={t("No branches found")}
            headingExtra={<button type="button" className="primary-button" onClick={() => { setEditingBranch(null); setBranchFormOpen(true); }}><Plus size={18} />{t("Add branch")}</button>}
            columns={[
              { label: t("Branch"), width: 180, value: (branch) => branch.name || "—", render: (branch) => <><strong>{branch.name || "—"}</strong><small>{branch.code || "—"}</small></> },
              { label: t("Phone"), width: 135, value: (branch) => branch.phone || "—" },
              { label: t("Address"), width: 260, value: (branch) => branch.address || "—" },
              { label: t("Active staff"), width: 100, value: (branch) => branch.active_staff_count || 0 },
              { label: t("Attendance"), width: 170, value: (branch) => branch.attendance_geofence_required ? `${branch.attendance_radius_m || 150} m geofence` : t("Location check off") },
              { label: t("Status"), width: 100, value: (branch) => branch.is_active ? t("Active") : t("Inactive"), render: (branch) => <span className={`status-pill ${branch.is_active ? "active" : "inactive"}`}>{branch.is_active ? t("Active") : t("Inactive")}</span> },
              { label: t("Actions"), actionsOnly: true, excludeDocument: true, render: (branch) => <div className="branch-table-actions"><button type="button" className="secondary-button compact-button" onClick={() => { setEditingBranch(branch); setBranchFormOpen(true); }}><Edit3 size={17} />{t("Edit")}</button><button type="button" className={branch.is_active ? "danger-text-button" : "success-text-button"} disabled={busy} onClick={() => toggleBranch(branch)}>{branch.is_active ? t("Deactivate") : t("Activate")}</button></div> }
            ]}
            renderCard={(branch) => (
              <article className="responsive-data-card branch-directory-card">
                <header>
                  <div className="branch-directory-card-title"><span className="branch-icon"><Store size={21} /></span><span><strong>{branch.name || "—"}</strong><small>{branch.code || "—"}</small></span></div>
                  <span className={`status-pill ${branch.is_active ? "active" : "inactive"}`}>{branch.is_active ? t("Active") : t("Inactive")}</span>
                </header>
                <div><span>{t("Phone")}</span><strong>{branch.phone || "—"}</strong></div>
                <div><span>{t("Active staff")}</span><strong>{branch.active_staff_count || 0}</strong></div>
                <div><span>{t("Address")}</span><strong>{branch.address || "—"}</strong></div>
                <div><span>{t("Attendance")}</span><strong>{branch.attendance_geofence_required ? `${branch.attendance_radius_m || 150} m geofence` : t("Location check off")}</strong></div>
                <footer><button type="button" className="secondary-button compact-button" onClick={() => { setEditingBranch(branch); setBranchFormOpen(true); }}><Edit3 size={17} />{t("Edit")}</button><button type="button" className={branch.is_active ? "danger-text-button" : "success-text-button"} disabled={busy} onClick={() => toggleBranch(branch)}>{branch.is_active ? t("Deactivate") : t("Activate")}</button></footer>
              </article>
            )}
          />
        )
      )}

      {tab === "roles" && (
        loading ? (
          <section className="panel"><div className="empty-state"><RefreshCw className="spin" /><p>{t("Loading roles...")}</p></div></section>
        ) : (
          <ResponsiveDataList
            storageKey="tiny-pos-role-directory"
            title={t("Roles")}
            subtitle={t("Standard and custom roles. Switch between Table and Cards on PC or phone.")}
            rows={roleRows}
            filename="tiny-pos-roles.xls"
            printTitle={t("Staff Roles")}
            emptyTitle={t("No roles found")}
            headingExtra={<button type="button" className="primary-button" onClick={() => { setEditingCustomRole(null); setCustomRoleOpen(true); }}><Plus size={18} />{t("Add custom role")}</button>}
            columns={[
              { label: t("Role"), width: 180, value: (role) => role.name || "—", render: (role) => <><strong>{t(role.name) || "—"}</strong><small>{role.kind === "standard" ? t("Standard role") : t("Custom role")}</small></> },
              { label: t("Based on"), width: 125, value: (role) => t(roleLabel(role.base_role)) },
              { label: t("Description"), width: 320, value: (role) => t(role.description) || t("No description.") },
              { label: t("Permissions"), width: 100, value: (role) => role.permission_count },
              { label: t("Staff"), width: 90, value: (role) => role.assigned_staff_count || 0 },
              { label: t("Status"), width: 100, value: (role) => role.is_active ? t("Active") : t("Inactive"), render: (role) => <span className={`status-pill ${role.is_active ? "active" : "inactive"}`}>{role.is_active ? t("Active") : t("Inactive")}</span> },
              { label: t("Actions"), actionsOnly: true, excludeDocument: true, render: (role) => role.kind === "custom" ? <div className="role-table-actions"><button type="button" className="secondary-button compact-button" onClick={() => { setEditingCustomRole(role); setCustomRoleOpen(true); }}><Edit3 size={17} />{t("Edit")}</button><button type="button" className="danger-text-button" disabled={busy || Number(role.assigned_staff_count || 0) > 0} onClick={() => removeCustomRole(role)}><Trash2 size={17} />{t("Delete")}</button></div> : <span className="muted">{t("System role")}</span> }
            ]}
            renderCard={(role) => (
              <article className="responsive-data-card role-directory-card">
                <header>
                  <div className="role-directory-card-title"><ShieldCheck size={22} /><span><strong>{t(role.name) || "—"}</strong><small>{role.kind === "standard" ? t("Standard role") : `${t("Based on")} ${t(roleLabel(role.base_role))}`}</small></span></div>
                  <span className={`status-pill ${role.is_active ? "active" : "inactive"}`}>{role.is_active ? t("Active") : t("Inactive")}</span>
                </header>
                <p className="role-directory-description">{t(role.description) || t("No description.")}</p>
                <div><span>{t("Based on")}</span><strong>{t(roleLabel(role.base_role))}</strong></div>
                <div><span>{t("Permissions")}</span><strong>{role.permission_count}</strong></div>
                <div><span>{t("Assigned staff")}</span><strong>{role.assigned_staff_count || 0}</strong></div>
                <footer>{role.kind === "custom" ? <><button type="button" className="secondary-button compact-button" onClick={() => { setEditingCustomRole(role); setCustomRoleOpen(true); }}><Edit3 size={17} />{t("Edit")}</button><button type="button" className="danger-text-button" disabled={busy || Number(role.assigned_staff_count || 0) > 0} onClick={() => removeCustomRole(role)}><Trash2 size={17} />{t("Delete")}</button></> : <span className="muted">{t("System role")}</span>}</footer>
              </article>
            )}
          />
        )
      )}

      <StaffFormModal
        open={staffFormOpen}
        member={editingStaff}
        branches={branches}
        customRoles={customRoles}
        callerRole={profile.role}
        busy={busy}
        onClose={() => {
          setStaffFormOpen(false);
          setEditingStaff(null);
        }}
        onSave={saveStaff}
      />

      <PasswordResetModal
        member={resetMember}
        busy={busy}
        onClose={() => setResetMember(null)}
        onReset={resetPassword}
      />

      <CustomRoleModal
        open={customRoleOpen}
        role={editingCustomRole}
        definitions={permissionDefinitions}
        callerRole={profile.role}
        busy={busy}
        onClose={() => { setCustomRoleOpen(false); setEditingCustomRole(null); }}
        onSave={submitCustomRole}
      />

      <BranchFormModal
        open={branchFormOpen}
        branch={editingBranch}
        busy={busy}
        onClose={() => {
          setBranchFormOpen(false);
          setEditingBranch(null);
        }}
        onSave={submitBranch}
      />
    </div>
  );
}
