import { useEffect, useMemo, useState } from "react";
import { Save, UserPlus } from "lucide-react";
import Modal from "./Modal";
import { roleLabel, staffToForm } from "../lib/staff";

export default function StaffFormModal({
  open,
  member,
  branches,
  callerRole,
  busy,
  onClose,
  onSave
}) {
  const [form, setForm] = useState(() => staffToForm(member));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(staffToForm(member));
    setError("");
  }, [open, member]);

  const roleOptions = useMemo(() => {
    const roles =
      callerRole === "owner"
        ? ["admin", "manager", "cashier", "viewer"]
        : ["manager", "cashier", "viewer"];

    if (member?.role === "owner") return ["owner"];
    if (member?.role === "admin" && callerRole === "admin") return ["admin"];
    return roles;
  }, [callerRole, member]);

  if (!open) return null;

  const editing = Boolean(member);
  const ownerAccount = member?.role === "owner";

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    setError("");

    if (form.full_name.trim().length < 2) {
      setError("Staff name is required.");
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      setError("Enter a valid staff email address.");
      return;
    }

    if (!form.branch_id) {
      setError("Choose a branch.");
      return;
    }

    if (!editing) {
      if (form.password.length < 8) {
        setError("The temporary password must contain at least 8 characters.");
        return;
      }

      if (form.password !== form.confirm_password) {
        setError("The password confirmation does not match.");
        return;
      }
    }

    await onSave({
      user_id: form.user_id,
      email: form.email.trim(),
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      role: ownerAccount ? "owner" : form.role,
      branch_id: form.branch_id,
      is_active: form.is_active,
      password: form.password
    });
  }

  return (
    <Modal
      title={editing ? "Edit staff account" : "Add staff account"}
      onClose={onClose}
      wide
    >
      <form className="staff-form" onSubmit={submit}>
        <div className="staff-form-grid">
          <label>
            <span>Full name *</span>
            <input
              autoFocus
              value={form.full_name}
              onChange={(event) => update("full_name", event.target.value)}
              placeholder="Staff member name"
            />
          </label>

          <label>
            <span>Email *</span>
            <input
              type="email"
              autoComplete="off"
              value={form.email}
              onChange={(event) => update("email", event.target.value)}
              placeholder="staff@example.com"
            />
          </label>

          <label>
            <span>Phone</span>
            <input
              value={form.phone}
              onChange={(event) => update("phone", event.target.value)}
              placeholder="Optional phone number"
            />
          </label>

          <label>
            <span>Role *</span>
            <select
              value={form.role}
              disabled={ownerAccount || roleOptions.length === 1}
              onChange={(event) => update("role", event.target.value)}
            >
              {roleOptions.map((role) => (
                <option value={role} key={role}>
                  {roleLabel(role)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Assigned branch *</span>
            <select
              value={form.branch_id}
              onChange={(event) => update("branch_id", event.target.value)}
            >
              <option value="">Choose branch</option>
              {branches
                .filter((branch) => branch.is_active || branch.id === form.branch_id)
                .map((branch) => (
                  <option value={branch.id} key={branch.id}>
                    {branch.name} ({branch.code})
                  </option>
                ))}
            </select>
          </label>

          {!editing && (
            <>
              <label>
                <span>Temporary password *</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) => update("password", event.target.value)}
                  placeholder="At least 8 characters"
                />
              </label>

              <label>
                <span>Confirm password *</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={form.confirm_password}
                  onChange={(event) =>
                    update("confirm_password", event.target.value)
                  }
                  placeholder="Repeat temporary password"
                />
              </label>
            </>
          )}

          {!ownerAccount && (
            <label className="staff-active-toggle">
              <span>
                <strong>Active account</strong>
                <small>
                  Inactive staff cannot use POS data or complete transactions.
                </small>
              </span>
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) => update("is_active", event.target.checked)}
              />
            </label>
          )}
        </div>

        <div className="role-description-card">
          <strong>{roleLabel(form.role)}</strong>
          <span>
            {form.role === "admin" &&
              "Manages products, inventory, returns, staff, branches, and settings."}
            {form.role === "manager" &&
              "Manages sales, refunds, customers, products, purchases, and inventory."}
            {form.role === "cashier" &&
              "Creates sales and customers but cannot manage inventory or refunds."}
            {form.role === "viewer" &&
              "Read-only role intended for dashboards and reports."}
            {form.role === "owner" && "Full access to the entire organization."}
          </span>
        </div>

        {error && <div className="notice error">{error}</div>}

        <div className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={busy}>
            {editing ? <Save size={18} /> : <UserPlus size={18} />}
            {busy
              ? "Saving..."
              : editing
                ? "Save staff account"
                : "Create staff account"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
