import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  Edit3,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  UserCheck,
  UserRoundX,
  UsersRound
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import BranchFormModal from "../components/BranchFormModal";
import PasswordResetModal from "../components/PasswordResetModal";
import StaffFormModal from "../components/StaffFormModal";
import {
  createStaffUser,
  loadStaffWorkspace,
  resetStaffPassword,
  roleLabel,
  saveBranch,
  setBranchStatus,
  setStaffStatus,
  updateStaffUser
} from "../lib/staff";

function dateTime(value) {
  if (!value) return "Never";
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
  const allowed = can("staff.manage");

  const [staff, setStaff] = useState([]);
  const [branches, setBranches] = useState([]);
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
      if (roleFilter !== "all" && member.role !== roleFilter) return false;
      if (branchFilter !== "all" && member.branch_id !== branchFilter) return false;
      if (statusFilter === "active" && !member.is_active) return false;
      if (statusFilter === "inactive" && member.is_active) return false;

      if (!needle) return true;

      return [
        member.full_name,
        member.email,
        member.phone,
        member.role,
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

  if (!allowed) {
    return (
      <section className="panel empty-state">
        <ShieldCheck size={48} />
        <h2>Staff management is restricted</h2>
        <p>Only the owner or an administrator can manage users and branches.</p>
      </section>
    );
  }

  return (
    <div className="page-stack users-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ACCESS CONTROL</p>
          <h1>Staff & Branches</h1>
          <p className="muted">
            Create secure staff logins, assign roles, and control branch access.
          </p>
        </div>

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

      {message && <div className={`notice ${messageType}`}>{message}</div>}

      <div className="staff-metrics">
        <article>
          <UserCheck size={22} />
          <span>Active staff</span>
          <strong>{counts.activeStaff}</strong>
        </article>
        <article>
          <UserRoundX size={22} />
          <span>Inactive staff</span>
          <strong>{counts.inactiveStaff}</strong>
        </article>
        <article>
          <Building2 size={22} />
          <span>Active branches</span>
          <strong>{counts.activeBranches}</strong>
        </article>
      </div>

      <div className="staff-tabs">
        <button
          type="button"
          className={tab === "staff" ? "active" : ""}
          onClick={() => setTab("staff")}
        >
          <UsersRound size={18} /> Staff
        </button>
        <button
          type="button"
          className={tab === "branches" ? "active" : ""}
          onClick={() => setTab("branches")}
        >
          <Store size={18} /> Branches
        </button>
        <button
          type="button"
          className={tab === "roles" ? "active" : ""}
          onClick={() => setTab("roles")}
        >
          <ShieldCheck size={18} /> Role guide
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
                placeholder="Search name, email, phone, role or branch"
              />
            </div>

            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
            >
              <option value="all">All roles</option>
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="cashier">Cashier</option>
              <option value="viewer">Viewer</option>
            </select>

            <select
              value={branchFilter}
              onChange={(event) => setBranchFilter(event.target.value)}
            >
              <option value="all">All branches</option>
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
              <option value="active">Active staff</option>
              <option value="inactive">Inactive staff</option>
              <option value="all">All statuses</option>
            </select>

            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setEditingStaff(null);
                setStaffFormOpen(true);
              }}
            >
              <Plus size={18} /> Add staff
            </button>
          </section>

          <section className="panel staff-list-panel">
            {loading ? (
              <div className="empty-state">
                <RefreshCw className="spin" />
                <p>Loading staff accounts...</p>
              </div>
            ) : filteredStaff.length === 0 ? (
              <div className="empty-state">
                <UsersRound size={44} />
                <h2>No staff found</h2>
                <p>Change the filters or add a new staff login.</p>
              </div>
            ) : (
              <div className="staff-card-list">
                {filteredStaff.map((member) => (
                  <article className="staff-card" key={member.id}>
                    <div className="staff-avatar">
                      {member.full_name?.trim()?.[0]?.toUpperCase() || "U"}
                    </div>

                    <div className="staff-main">
                      <div>
                        <strong>{member.full_name}</strong>
                        {member.id === profile.id && <span className="you-pill">You</span>}
                      </div>
                      <span>{member.email}</span>
                      <small>{member.phone || "No phone"}</small>
                    </div>

                    <div className="staff-role-branch">
                      <span className={`role-pill role-${member.role}`}>
                        {roleLabel(member.role)}
                      </span>
                      <strong>{member.branches?.name || "No branch"}</strong>
                      <small>{member.branches?.code || "—"}</small>
                    </div>

                    <div className="staff-last-login">
                      <span>Last login</span>
                      <strong>
                        {dateTime(member.auth_last_sign_in_at || member.last_login_at)}
                      </strong>
                      <small>Created {dateTime(member.created_at)}</small>
                    </div>

                    <span className={`status-pill ${member.is_active ? "active" : "inactive"}`}>
                      {member.is_active ? "Active" : "Inactive"}
                    </span>

                    <div className="staff-actions">
                      <button
                        type="button"
                        className="icon-button"
                        title="Edit staff"
                        disabled={!canEdit(member)}
                        onClick={() => {
                          setEditingStaff(member);
                          setStaffFormOpen(true);
                        }}
                      >
                        <Edit3 size={18} />
                      </button>

                      <button
                        type="button"
                        className="icon-button"
                        title="Reset password"
                        disabled={!canEdit(member)}
                        onClick={() => setResetMember(member)}
                      >
                        <KeyRound size={18} />
                      </button>

                      {canChangeStatus(member) && (
                        <button
                          type="button"
                          className={member.is_active ? "danger-text-button" : "success-text-button"}
                          disabled={busy}
                          onClick={() => toggleStaff(member)}
                        >
                          {member.is_active ? "Deactivate" : "Activate"}
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {tab === "branches" && (
        <section className="panel branch-management-panel">
          <div className="panel-heading">
            <div>
              <h2>Branches</h2>
              <p className="muted">
                New branches receive zero-stock inventory rows for every existing product.
              </p>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setEditingBranch(null);
                setBranchFormOpen(true);
              }}
            >
              <Plus size={18} /> Add branch
            </button>
          </div>

          <div className="branch-card-grid">
            {branches.map((branch) => (
              <article className="branch-management-card" key={branch.id}>
                <div className="branch-card-heading">
                  <div className="branch-icon"><Store size={22} /></div>
                  <div>
                    <strong>{branch.name}</strong>
                    <span>{branch.code}</span>
                  </div>
                  <span className={`status-pill ${branch.is_active ? "active" : "inactive"}`}>
                    {branch.is_active ? "Active" : "Inactive"}
                  </span>
                </div>

                <div className="branch-card-details">
                  <div><span>Phone</span><strong>{branch.phone || "—"}</strong></div>
                  <div><span>Active staff</span><strong>{branch.active_staff_count}</strong></div>
                  <div className="branch-address"><span>Address</span><strong>{branch.address || "—"}</strong></div>
                </div>

                <div className="branch-card-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setEditingBranch(branch);
                      setBranchFormOpen(true);
                    }}
                  >
                    <Edit3 size={17} /> Edit
                  </button>
                  <button
                    type="button"
                    className={branch.is_active ? "danger-text-button" : "success-text-button"}
                    disabled={busy}
                    onClick={() => toggleBranch(branch)}
                  >
                    {branch.is_active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === "roles" && (
        <section className="role-guide-grid">
          {roleGuide.map((item) => (
            <article className="panel role-guide-card" key={item.role}>
              <ShieldCheck size={24} />
              <h2>{item.role}</h2>
              <p>{item.text}</p>
            </article>
          ))}
        </section>
      )}

      <StaffFormModal
        open={staffFormOpen}
        member={editingStaff}
        branches={branches}
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
