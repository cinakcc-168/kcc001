import { CalendarPlus, Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import { useLanguage } from "../context/LanguageContext";

function currentMonth() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

function daysInMonth(month) {
  const [year, monthNumber] = String(month || currentMonth()).split("-").map(Number);
  return new Date(year, monthNumber, 0).getDate();
}

export default function ManualAttendanceModal({
  open,
  staff,
  branches,
  busy,
  onClose,
  onSave
}) {
  const { t } = useLanguage();
  const [form, setForm] = useState({
    user_id: "",
    branch_id: "",
    month: currentMonth(),
    day_type: "work",
    day_count: 1,
    check_in_time: "07:00",
    check_out_time: "17:00",
    note: ""
  });
  const [selectedDays, setSelectedDays] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const first = staff[0];
    setForm({
      user_id: first?.id || "",
      branch_id: first?.branch_id || branches[0]?.id || "",
      month: currentMonth(),
      day_type: "work",
      day_count: 1,
      check_in_time: "07:00",
      check_out_time: "17:00",
      note: ""
    });
    setSelectedDays([]);
    setError("");
  }, [open, staff, branches]);

  const totalDays = useMemo(() => daysInMonth(form.month), [form.month]);
  const dayNumbers = useMemo(
    () => Array.from({ length: totalDays }, (_, index) => index + 1),
    [totalDays]
  );

  if (!open) return null;

  function changeStaff(userId) {
    const member = staff.find((row) => row.id === userId);
    setForm((current) => ({
      ...current,
      user_id: userId,
      branch_id: member?.branch_id || current.branch_id
    }));
  }

  function changeCount(value) {
    const count = Math.min(totalDays, Math.max(1, Number(value || 1)));
    setForm((current) => ({ ...current, day_count: count }));
    setSelectedDays((current) => current.slice(0, count));
  }

  function toggleDay(day) {
    setError("");
    setSelectedDays((current) => {
      if (current.includes(day)) return current.filter((value) => value !== day);
      if (current.length >= Number(form.day_count || 1)) return current;
      return [...current, day].sort((a, b) => a - b);
    });
  }

  function submit(event) {
    event.preventDefault();
    setError("");
    if (!form.user_id) return setError(t("Choose a staff member."));
    if (!form.branch_id) return setError(t("Choose a branch."));
    if (!form.month) return setError(t("Choose a month."));
    if (selectedDays.length !== Number(form.day_count)) {
      return setError(`${t("Number of days to select")}: ${form.day_count}`);
    }
    if (form.day_type === "work" && form.check_out_time <= form.check_in_time) {
      return setError(t("Check-out time must be after check-in time."));
    }
    onSave({
      ...form,
      month: `${form.month}-01`,
      days: selectedDays
    });
  }

  return (
    <Modal title={t("Set attendance")} wide onClose={() => !busy && onClose()}>
      <form className="manual-attendance-form" onSubmit={submit}>
        <div className="manual-attendance-grid">
          <label>
            <span>{t("Staff member")}</span>
            <select value={form.user_id} onChange={(event) => changeStaff(event.target.value)}>
              <option value="">{t("Choose staff")}</option>
              {staff.map((row) => (
                <option key={row.id} value={row.id}>{row.full_name} · {t(row.role)}</option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("Branch")}</span>
            <select value={form.branch_id} onChange={(event) => setForm((current) => ({ ...current, branch_id: event.target.value }))}>
              <option value="">{t("Choose branch")}</option>
              {branches.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>
          <label>
            <span>{t("Month")}</span>
            <input type="month" value={form.month} onChange={(event) => {
              setForm((current) => ({ ...current, month: event.target.value }));
              setSelectedDays([]);
            }} />
          </label>
          <label>
            <span>{t("Attendance type")}</span>
            <select value={form.day_type} onChange={(event) => setForm((current) => ({ ...current, day_type: event.target.value }))}>
              <option value="work">{t("Working day")}</option>
              <option value="day_off">{t("Day off")}</option>
              <option value="leave">{t("Approved leave")}</option>
              <option value="absence">{t("Mark absent")}</option>
            </select>
          </label>
          <label>
            <span>{t("Number of days to select")}</span>
            <input type="number" min="1" max={totalDays} value={form.day_count} onChange={(event) => changeCount(event.target.value)} />
          </label>
          {form.day_type === "work" && (
            <>
              <label><span>{t("Check-in time")}</span><input type="time" value={form.check_in_time} onChange={(event) => setForm((current) => ({ ...current, check_in_time: event.target.value }))} /></label>
              <label><span>{t("Check-out time")}</span><input type="time" value={form.check_out_time} onChange={(event) => setForm((current) => ({ ...current, check_out_time: event.target.value }))} /></label>
            </>
          )}
        </div>

        <section className="attendance-day-picker">
          <div className="attendance-day-picker-heading">
            <span><CalendarPlus size={19} />{t("Select days in")} {form.month}</span>
            <strong>{selectedDays.length} / {form.day_count} {t("selected")}</strong>
          </div>
          <div className="attendance-day-buttons">
            {dayNumbers.map((day) => {
              const active = selectedDays.includes(day);
              const disabled = !active && selectedDays.length >= Number(form.day_count);
              return (
                <button type="button" key={day} className={active ? "active" : ""} disabled={disabled} onClick={() => toggleDay(day)}>
                  {active && <Check size={14} />}{day}
                </button>
              );
            })}
          </div>
        </section>

        <label>
          <span>{t("Note")}</span>
          <textarea rows="3" value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} placeholder={t("Optional attendance, leave or day-off note")} />
        </label>

        {error && <div className="notice error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>{t("Cancel")}</button>
          <button type="submit" className="primary-button" disabled={busy}>
            <CalendarPlus size={18} />{busy ? t("Saving...") : t("Save selected days")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
