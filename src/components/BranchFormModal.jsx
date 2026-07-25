import { useEffect, useState } from "react";
import { Save, Store } from "lucide-react";
import Modal from "./Modal";
import { branchToForm } from "../lib/staff";

export default function BranchFormModal({
  open,
  branch,
  busy,
  onClose,
  onSave
}) {
  const [form, setForm] = useState(() => branchToForm(branch));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(branchToForm(branch));
    setError("");
  }, [open, branch]);

  if (!open) return null;

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    setError("");

    if (!form.name.trim()) {
      setError("Branch name is required.");
      return;
    }

    if (!/^[A-Z0-9_-]{1,20}$/.test(form.code.trim().toUpperCase())) {
      setError("Branch code may use only A-Z, 0-9, underscore, and dash.");
      return;
    }

    await onSave({
      ...form,
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      phone: form.phone.trim(),
      address: form.address.trim()
    });
  }

  return (
    <Modal title={branch ? "Edit branch" : "Add branch"} onClose={onClose}>
      <form className="branch-form" onSubmit={submit}>
        <label>
          <span>Branch name *</span>
          <input
            autoFocus
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
            placeholder="For example, Siem Reap Branch"
          />
        </label>

        <label>
          <span>Branch code *</span>
          <input
            value={form.code}
            onChange={(event) =>
              update("code", event.target.value.toUpperCase())
            }
            placeholder="For example, SR"
            maxLength="20"
          />
        </label>

        <label>
          <span>Phone</span>
          <input
            value={form.phone}
            onChange={(event) => update("phone", event.target.value)}
            placeholder="Branch phone"
          />
        </label>

        <label>
          <span>Address</span>
          <textarea
            rows="3"
            value={form.address}
            onChange={(event) => update("address", event.target.value)}
            placeholder="Branch address"
          />
        </label>

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
            {branch ? <Save size={18} /> : <Store size={18} />}
            {busy ? "Saving..." : branch ? "Save branch" : "Create branch"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
