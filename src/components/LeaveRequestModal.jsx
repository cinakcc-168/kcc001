import {
  CalendarRange,
  ImagePlus,
  Send
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import { isoDate } from "../lib/staffOperations";

export default function LeaveRequestModal({
  open,
  busy,
  onClose,
  onSave
}) {
  const [form, setForm] = useState({
    date_from: isoDate(),
    date_to: isoDate(),
    leave_type: "personal",
    reason: "",
    file: null
  });
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm({
      date_from: isoDate(),
      date_to: isoDate(),
      leave_type: "personal",
      reason: "",
      file: null
    });
    setError("");
  }, [open]);

  const preview = useMemo(() => {
    if (!form.file) return "";
    return URL.createObjectURL(form.file);
  }, [form.file]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  if (!open) return null;

  function selectFile(file) {
    setError("");
    if (!file) {
      setForm((current) => ({ ...current, file: null }));
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setError("The supporting image must be 6 MB or smaller.");
      return;
    }
    setForm((current) => ({ ...current, file }));
  }

  function submit(event) {
    event.preventDefault();
    setError("");
    if (!form.date_from || !form.date_to || form.date_to < form.date_from) {
      setError("Choose a valid leave date range.");
      return;
    }
    if (form.reason.trim().length < 2) {
      setError("Enter the reason for leave.");
      return;
    }
    onSave({ ...form, reason: form.reason.trim() });
  }

  return (
    <Modal title="Take Leave" wide onClose={() => !busy && onClose()}>
      <form className="leave-request-form" onSubmit={submit}>
        <div className="leave-request-intro">
          <CalendarRange size={24} />
          <div>
            <strong>Submit a leave request</strong>
            <span>This is different from the manager’s Day-Off schedule. It stays pending until reviewed.</span>
          </div>
        </div>

        <div className="leave-request-grid">
          <label>
            <span>From date</span>
            <input
              type="date"
              value={form.date_from}
              onChange={(event) => setForm((current) => ({
                ...current,
                date_from: event.target.value,
                date_to: current.date_to < event.target.value ? event.target.value : current.date_to
              }))}
            />
          </label>
          <label>
            <span>To date</span>
            <input
              type="date"
              min={form.date_from}
              value={form.date_to}
              onChange={(event) => setForm((current) => ({ ...current, date_to: event.target.value }))}
            />
          </label>
          <label>
            <span>Leave type</span>
            <select
              value={form.leave_type}
              onChange={(event) => setForm((current) => ({ ...current, leave_type: event.target.value }))}
            >
              <option value="annual">Annual leave</option>
              <option value="sick">Sick leave</option>
              <option value="personal">Personal leave</option>
              <option value="unpaid">Unpaid leave</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="leave-picture-field">
            <span>Supporting picture (optional)</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => selectFile(event.target.files?.[0])}
            />
            <span className="secondary-button leave-file-button"><ImagePlus size={18} />Choose picture</span>
          </label>
        </div>

        {preview && (
          <a className="leave-image-preview" href={preview} target="_blank" rel="noreferrer">
            <img src={preview} alt="Leave supporting document preview" />
            <span>Tap the image to view it</span>
          </a>
        )}

        <label>
          <span>Reason</span>
          <textarea
            rows="5"
            maxLength="2000"
            value={form.reason}
            onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
            placeholder="Explain the leave request..."
          />
        </label>

        {error && <div className="notice error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="primary-button" disabled={busy}>
            <Send size={18} />{busy ? "Submitting..." : "Submit pending request"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
