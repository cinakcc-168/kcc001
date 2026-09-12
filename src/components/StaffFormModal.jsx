import { useEffect, useMemo, useState } from "react";
import { Save, UserPlus } from "lucide-react";
import Modal from "./Modal";
import { useLanguage } from "../context/LanguageContext";
import { roleLabel, staffToForm } from "../lib/staff";

export default function StaffFormModal({
  open,
  member,
  branches,
  customRoles = [],
  callerRole,
  busy,
  onClose,
  onSave
}) {
  const { t } = useLanguage();
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

  const selectedCustomRole = useMemo(
    () => customRoles.find((item) => item.id === form.custom_role_id) || null,
    [customRoles, form.custom_role_id]
  );

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
      setError(t("Staff name is required."));
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      setError(t("Enter a valid staff email address."));
      return;
    }

    if (!form.branch_id) {
      setError(t("Choose a branch."));
      return;
    }

    if (!editing) {
      if (form.password.length < 8) {
        setError(t("The temporary password must contain at least 8 characters."));
        return;
      }

      if (form.password !== form.confirm_password) {
        setError(t("The password confirmation does not match."));
        return;
      }
    }

    try {
      await onSave({
        user_id: form.user_id,
        email: form.email.trim(),
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        role: ownerAccount ? "owner" : (selectedCustomRole?.base_role || form.role),
        custom_role_id: ownerAccount ? null : (form.custom_role_id || null),
        branch_id: form.branch_id,
        is_active: form.is_active,
        password: form.password
      });
    } catch (saveError) {
      setError(saveError?.message || t("The staff account could not be saved."));
    }
  }

  return (
    <Modal
      title={editing ? t("Edit staff account") : t("Add staff account")}
      onClose={onClose}
      wide
    >
      <form className="staff-form" onSubmit={submit}>
        <div className="staff-form-grid">
          <label>
            <span>{t("Full name *")}</span>
            <input
              autoFocus
              value={form.full_name}
              onChange={(event) => update("full_name", event.target.value)}
              placeholder={t("Staff member name")}
            />
          </label>

          <label>
            <span>{t("Email *")}</span>
            <input
              type="email"
              autoComplete="off"
              value={form.email}
              onChange={(event) => update("email", event.target.value)}
              placeholder="staff@example.com"
            />
          </label>

          <label>
            <span>{t("Phone")}</span>
            <input
              value={form.phone}
              onChange={(event) => update("phone", event.target.value)}
              placeholder={t("Optional phone number")}
            />
          </label>

          <label>
            <span>{t("Role *")}</span>
            <select
              value={form.custom_role_id ? `custom:${form.custom_role_id}` : `base:${form.role}`}
              disabled={ownerAccount || (roleOptions.length === 1 && customRoles.length === 0)}
              onChange={(event) => {
                const [kind, value] = event.target.value.split(":");
                if (kind === "custom") {
                  const custom = customRoles.find((item) => item.id === value);
                  setForm((current) => ({ ...current, custom_role_id: value, role: custom?.base_role || "viewer" }));
                } else {
                  setForm((current) => ({ ...current, custom_role_id: "", role: value }));
                }
                setError("");
              }}
            >
              <optgroup label={t("Standard roles")}>
                {roleOptions.map((role) => (
                  <option value={`base:${role}`} key={role}>
                    {t(roleLabel(role))}
                  </option>
                ))}
              </optgroup>
              {customRoles.some((item) => item.is_active || item.id === form.custom_role_id) && (
                <optgroup label={t("Custom roles")}>
                  {customRoles
                    .filter((item) => item.is_active || item.id === form.custom_role_id)
                    .filter((item) => callerRole === "owner" || item.base_role !== "admin")
                    .map((item) => (
                      <option value={`custom:${item.id}`} key={item.id}>
                        {item.name} · {t("based on")} {t(roleLabel(item.base_role))}
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
          </label>

          <label>
            <span>{t("Assigned branch *")}</span>
            <select
              value={form.branch_id}
              onChange={(event) => update("branch_id", event.target.value)}
            >
              <option value="">{t("Choose branch")}</option>
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
                <span>{t("Temporary password *")}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) => update("password", event.target.value)}
                  placeholder={t("At least 8 characters")}
                />
              </label>

              <label>
                <span>{t("Confirm password *")}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={form.confirm_password}
                  onChange={(event) =>
                    update("confirm_password", event.target.value)
                  }
                  placeholder={t("Repeat temporary password")}
                />
              </label>
            </>
          )}

          {!ownerAccount && (
            <label className="staff-active-toggle">
              <span>
                <strong>{t("Active account")}</strong>
                <small>
                  {t("Inactive staff cannot use POS data or complete transactions.")}
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
          <strong>{selectedCustomRole?.name || t(roleLabel(form.role))}</strong>
          <span>
            {selectedCustomRole?.description || (selectedCustomRole && `${t("Custom permission template based on")} ${t(roleLabel(selectedCustomRole.base_role))}.`)}
            {!selectedCustomRole && form.role === "admin" &&
              t("Manages products, inventory, returns, staff, branches, and settings.")}
            {!selectedCustomRole && form.role === "manager" &&
              t("Manages sales, refunds, customers, products, purchases, and inventory.")}
            {!selectedCustomRole && form.role === "cashier" &&
              t("Creates sales and customers but cannot manage inventory or refunds.")}
            {!selectedCustomRole && form.role === "viewer" &&
              t("Read-only role intended for dashboards and reports.")}
            {!selectedCustomRole && form.role === "owner" && t("Full access to the entire organization.")}
          </span>
        </div>

        {error && <div className="notice error">{t(error)}</div>}

        <div className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={busy}
          >
            {t("Cancel")}
          </button>
          <button type="submit" className="primary-button" disabled={busy}>
            {editing ? <Save size={18} /> : <UserPlus size={18} />}
            {busy
              ? t("Saving...")
              : editing
                ? t("Save staff account")
                : t("Create staff account")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
