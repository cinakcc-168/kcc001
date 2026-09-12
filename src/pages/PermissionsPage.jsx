import {
  CalendarRange,
  Check,
  Clock3,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  X
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { notifyTelegramEvent } from "../lib/telegram";
import UserPermissionModal from "../components/UserPermissionModal";
import { money } from "../lib/catalog";
import { roleLabel } from "../lib/staff";
import {
  approvalStatusLabel,
  loadAccessWorkspace,
  loadRefundPermissionWorkspace,
  reviewApprovalRequest,
  saveRefundPermissionWindow,
  saveUserAccess
} from "../lib/permissions";

function dateTime(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function effectivePermissionCount(
  member,
  definitions
) {
  if (member.role === "owner") {
    return definitions.length;
  }

  return definitions.filter((definition) => {
    if (
      Object.prototype.hasOwnProperty.call(
        member.overrides || {},
        definition.permission_key
      )
    ) {
      return Boolean(
        member.overrides[
          definition.permission_key
        ]
      );
    }

    return (
      definition.default_roles || []
    ).includes(member.role);
  }).length;
}

export default function PermissionsPage() {
  const {
    supabase,
    profile,
    session,
    canAny,
    refreshAccess
  } = useAuth();
  const { t } = useLanguage();

  const [searchParams, setSearchParams] =
    useSearchParams();

  const requestedTab =
    searchParams.get("tab");

  const [tab, setTab] = useState(
    requestedTab === "approvals"
      ? "approvals"
      : requestedTab === "refunds"
        ? "refunds"
        : "permissions"
  );

  const [workspace, setWorkspace] =
    useState({
      can_manage: false,
      can_review: false,
      definitions: [],
      staff: [],
      requests: []
    });

  const [search, setSearch] =
    useState("");
  const [roleFilter, setRoleFilter] =
    useState("all");
  const [refundWorkspace, setRefundWorkspace] =
    useState({ staff: [], windows: [] });
  const [refundSearch, setRefundSearch] =
    useState("");
  const [refundRoleFilter, setRefundRoleFilter] =
    useState("all");
  const [editing, setEditing] =
    useState(null);
  const [loading, setLoading] =
    useState(true);
  const [busy, setBusy] =
    useState("");
  const [message, setMessage] =
    useState("");
  const [messageType, setMessageType] =
    useState("success");

  const allowed = canAny([
    "access.manage",
    "approvals.review"
  ]);

  const refresh = useCallback(async () => {
    if (!supabase || !allowed) return;

    try {
      setLoading(true);
      setMessage("");

      const data =
        await loadAccessWorkspace(
          supabase
        );

      setWorkspace(data);

      if (data.can_manage) {
        const refundData =
          await loadRefundPermissionWorkspace(
            supabase
          );
        setRefundWorkspace(refundData);
      } else {
        setRefundWorkspace({ staff: [], windows: [] });
      }

      if (
        !data.can_manage
        && data.can_review
      ) {
        setTab("approvals");
      }
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, allowed]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (
      requestedTab === "approvals"
      && workspace.can_review
    ) {
      setTab("approvals");
    } else if (
      requestedTab === "refunds"
      && workspace.can_manage
    ) {
      setTab("refunds");
    }
  }, [
    requestedTab,
    workspace.can_review,
    workspace.can_manage
  ]);

  const filteredStaff = useMemo(() => {
    const needle = search
      .trim()
      .toLowerCase();

    return workspace.staff.filter(
      (member) => {
        if (
          roleFilter !== "all"
          && member.role !== roleFilter
        ) {
          return false;
        }

        if (!needle) return true;

        return [
          member.full_name,
          member.email,
          member.phone,
          member.role,
          member.branch_name,
          member.branch_code
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle);
      }
    );
  }, [
    workspace.staff,
    search,
    roleFilter
  ]);

  const filteredRefundStaff = useMemo(() => {
    const needle = refundSearch.trim().toLowerCase();

    return refundWorkspace.staff.filter((member) => {
      if (refundRoleFilter !== "all") {
        if (member.role_key !== refundRoleFilter) return false;
      }

      if (!needle) return true;

      return [
        member.full_name,
        member.email,
        member.phone,
        member.role_label,
        member.branch_name,
        member.branch_code
      ]
        .filter(Boolean)
        .join(" " )
        .toLowerCase()
        .includes(needle);
    });
  }, [
    refundWorkspace.staff,
    refundSearch,
    refundRoleFilter
  ]);

  const pendingRequests = useMemo(
    () =>
      workspace.requests.filter(
        (request) =>
          request.status === "pending"
      ),
    [workspace.requests]
  );

  async function saveAccess(values) {
    try {
      setBusy("save-access");

      await saveUserAccess(
        supabase,
        values
      );

      setEditing(null);
      setMessageType("success");
      setMessage(
        "Individual permissions and approval limits saved."
      );

      if (values.user_id === profile.id) {
        await refreshAccess();
      }

      await refresh();
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setBusy("");
    }
  }

  async function changeRefundWindow(member, refundWindow) {
    try {
      setBusy(`refund-window-${member.id}`);

      await saveRefundPermissionWindow(
        supabase,
        member.id,
        refundWindow
      );

      setMessageType("success");
      setMessage(
        `${member.full_name} refund permission changed to ${refundWorkspace.windows.find((item) => item.value === refundWindow)?.label || refundWindow}.`
      );

      await refresh();
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setBusy("");
    }
  }

  async function review(
    request,
    decision
  ) {
    const note = window.prompt(
      decision === "approve"
        ? `${t("Approval note for")} ${request.requested_by_name}:`
        : `${t("Reason for rejecting")} ${request.requested_by_name}:`,
      decision === "approve"
        ? t("Approved for this one transaction.")
        : ""
    );

    if (note === null) return;

    try {
      setBusy(
        `${decision}-${request.id}`
      );

      await reviewApprovalRequest(
        supabase,
        {
          request_id: request.id,
          decision,
          note
        }
      );

      void notifyTelegramEvent(
        session,
        decision === "approve" ? "approval_approved" : "approval_rejected",
        request.id
      );

      setMessageType("success");
      setMessage(
        decision === "approve"
          ? "Approval granted for one use."
          : "Approval request rejected."
      );

      await refresh();
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setBusy("");
    }
  }

  function changeTab(nextTab) {
    setTab(nextTab);

    const next = new URLSearchParams(
      searchParams
    );

    if (nextTab === "approvals") {
      next.set("tab", "approvals");
    } else if (nextTab === "refunds") {
      next.set("tab", "refunds");
    } else {
      next.delete("tab");
    }

    setSearchParams(next, {
      replace: true
    });
  }

  if (!allowed) {
    return (
      <section className="panel empty-state">
        <ShieldCheck size={48} />
        <h2>{t("Access control is restricted")}</h2>
        <p>
          {t("Your account cannot manage permissions or review approvals.")}
        </p>
      </section>
    );
  }

  return (
    <div className="page-stack permissions-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {t("INDIVIDUAL ACCESS CONTROL")}
          </p>
          <h1>{t("Access & Approvals")}</h1>
          <p className="muted">
            {t("Hide functions per user and approve high-risk discounts or refunds one transaction at a time.")}
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
            className={
              loading ? "spin" : ""
            }
          />
          {t("Refresh")}
        </button>
      </div>

      {message && (
        <div
          className={`notice ${messageType}`}
          onClick={() => setMessage("")}
        >
          {t(message)}
        </div>
      )}

      <div className="permission-tabs">
        {workspace.can_manage && (
          <button
            type="button"
            className={
              tab === "permissions"
                ? "active"
                : ""
            }
            onClick={() =>
              changeTab("permissions")
            }
          >
            <UserCog size={18} />
            {t("Staff Permissions")}
          </button>
        )}

        {workspace.can_review && (
          <button
            type="button"
            className={
              tab === "approvals"
                ? "active"
                : ""
            }
            onClick={() =>
              changeTab("approvals")
            }
          >
            <ShieldCheck size={18} />
            {t("Approval Center")}
            {pendingRequests.length > 0 && (
              <span>
                {pendingRequests.length}
              </span>
            )}
          </button>
        )}

        {workspace.can_manage && (
          <button
            type="button"
            className={
              tab === "refunds"
                ? "active"
                : ""
            }
            onClick={() =>
              changeTab("refunds")
            }
          >
            <CalendarRange size={18} />
            {t("Refund Permissions")}
          </button>
        )}
      </div>

      {tab === "permissions"
        && workspace.can_manage && (
          <>
            <section className="panel permission-filter-panel">
              <label className="search-box">
                <Search size={18} />
                <input
                  value={search}
                  onChange={(event) =>
                    setSearch(
                      event.target.value
                    )
                  }
                  placeholder={t("Search staff, email, role or branch")}
                />
              </label>

              <select
                value={roleFilter}
                onChange={(event) =>
                  setRoleFilter(
                    event.target.value
                  )
                }
              >
                <option value="all">
                  {t("All roles")}
                </option>
                <option value="owner">
                  {t("Owner")}
                </option>
                <option value="admin">
                  {t("Admin")}
                </option>
                <option value="manager">
                  {t("Manager")}
                </option>
                <option value="cashier">
                  {t("Cashier")}
                </option>
                <option value="viewer">
                  {t("Viewer")}
                </option>
              </select>
            </section>

            <section className="permission-staff-grid">
              {filteredStaff.map((member) => {
                const allowedCount =
                  effectivePermissionCount(
                    member,
                    workspace.definitions
                  );

                const overrideCount =
                  Object.keys(
                    member.overrides || {}
                  ).length;

                const editable =
                  profile.role === "owner"
                  || (
                    member.role !== "owner"
                    && (
                      member.role !== "admin"
                      || member.id === profile.id
                    )
                  );

                return (
                  <article
                    key={member.id}
                    className="panel permission-staff-card"
                  >
                    <div className="permission-staff-heading">
                      <div>
                        <strong>
                          {member.full_name}
                        </strong>
                        <span>
                          {member.email}
                        </span>
                      </div>

                      <span
                        className={`status-pill ${
                          member.is_active
                            ? "active"
                            : "inactive"
                        }`}
                      >
                        {member.is_active
                          ? t("Active")
                          : t("Inactive")}
                      </span>
                    </div>

                    <div className="permission-staff-meta">
                      <span>{t(roleLabel(member.role))}</span>
                      <span>
                        {member.branch_name
                          ? member.branch_name
                          : t("No branch")}
                      </span>
                    </div>

                    <div className="permission-staff-stats">
                      <div>
                        <span>
                          {t("Effective permissions")}
                        </span>
                        <strong>
                          {allowedCount}
                          {" / "}
                          {
                            workspace
                              .definitions
                              .length
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          {t("Individual overrides")}
                        </span>
                        <strong>
                          {overrideCount}
                        </strong>
                      </div>
                    </div>

                    <div className="permission-limit-preview">
                      <span>
                        {t("Discount")}:{" "}
                        {member.limits
                          ?.max_discount_percent
                          === null
                          ? t("Unlimited")
                          : `${member.limits?.max_discount_percent ?? 0}%`}
                      </span>

                      <span>
                        {t("Refund USD")}:{" "}
                        {member.limits
                          ?.max_refund_amount_usd
                          === null
                          ? t("Unlimited")
                          : money(
                              member.limits
                                ?.max_refund_amount_usd
                                || 0,
                              "USD"
                            )}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="secondary-button"
                      disabled={!editable}
                      onClick={() =>
                        setEditing(member)
                      }
                    >
                      <SlidersHorizontal
                        size={18}
                      />
                      {editable
                        ? t("Edit permissions")
                        : t("Protected account")}
                    </button>
                  </article>
                );
              })}
            </section>
          </>
        )}

      {tab === "refunds"
        && workspace.can_manage && (
          <section className="panel refund-permission-panel">
            <div className="panel-title-row">
              <div>
                <p className="eyebrow">{t("REFUND DATE ACCESS")}</p>
                <h2>{t("Refund Permissions")}</h2>
                <span className="muted">
                  {t("Control how far back each staff member can refund invoices. Amount-based approval limits still apply separately.")}
                </span>
              </div>
              <CalendarRange size={23} />
            </div>

            <div className="refund-permission-filters">
              <label className="search-box">
                <Search size={18} />
                <input
                  value={refundSearch}
                  onChange={(event) => setRefundSearch(event.target.value)}
                  placeholder={t("Search staff, email or branch")}
                />
              </label>

              <select
                value={refundRoleFilter}
                onChange={(event) => setRefundRoleFilter(event.target.value)}
                aria-label={t("Filter refund permissions by role")}
              >
                <option value="all">{t("All staff")}</option>
                {Array.from(
                  new Map(
                    refundWorkspace.staff.map((member) => [
                      member.role_key,
                      member.role_label
                    ])
                  ).entries()
                )
                  .sort((a, b) => String(a[1]).localeCompare(String(b[1])))
                  .map(([value, label]) => (
                    <option key={value} value={value}>{t(label)}</option>
                  ))}
              </select>
            </div>

            <div className="refund-permission-list">
              {filteredRefundStaff.length === 0 ? (
                <div className="empty-state compact">
                  <CalendarRange size={40} />
                  <p>{t("No staff match the current filters.")}</p>
                </div>
              ) : filteredRefundStaff.map((member) => {
                const locked = Boolean(member.window_locked);
                const saving = busy === `refund-window-${member.id}`;

                return (
                  <article className="refund-permission-row" key={member.id}>
                    <div className="refund-permission-person">
                      <strong>{member.full_name}</strong>
                      <small>{member.email || member.phone || t("No contact")}</small>
                    </div>

                    <div className="refund-permission-meta">
                      <span>{member.branch_name ? member.branch_name : t("No branch")}</span>
                      <span>{t(member.role_label) || t(roleLabel(member.role))}</span>
                      <span className={`status-pill ${member.is_active ? "active" : "inactive"}`}>
                        {member.is_active ? t("Active") : t("Inactive")}
                      </span>
                    </div>

                    <div className="refund-permission-access">
                      <small>{member.can_refund ? t("Returns & Refunds enabled") : t("Returns & Refunds hidden")}</small>
                      <select
                        value={member.refund_window}
                        onChange={(event) => changeRefundWindow(member, event.target.value)}
                        disabled={locked || saving}
                        aria-label={`${t("Refund date permission for")} ${member.full_name}`}
                        title={locked ? t("Owner and admin always have any-date refund access") : t("Choose refund date permission")}
                      >
                        {refundWorkspace.windows.map((option) => (
                          <option key={option.value} value={option.value}>
                            {t(option.label)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

      {tab === "approvals"
        && workspace.can_review && (
          <section className="panel approval-center-panel">
            <div className="panel-title-row">
              <div>
                <p className="eyebrow">
                  {t("ONE-TIME AUTHORIZATION")}
                </p>
                <h2>{t("Approval requests")}</h2>
                <span className="muted">
                  {t("Approved requests expire after 30 minutes and work once.")}
                </span>
              </div>

              <ShieldCheck size={23} />
            </div>

            {workspace.requests.length === 0 ? (
              <div className="empty-state compact">
                <ShieldCheck size={43} />
                <h3>{t("No approval requests")}</h3>
                <p>
                  {t("Requests appear here when a discount or refund exceeds the user’s limit.")}
                </p>
              </div>
            ) : (
              <div className="approval-center-list">
                {workspace.requests.map(
                  (request) => (
                    <article
                      key={request.id}
                      className={`approval-center-row ${request.status}`}
                    >
                      <div className="approval-center-icon">
                        {request.status
                          === "approved"
                          || request.status
                            === "consumed"
                          ? (
                            <Check size={20} />
                          )
                          : request.status
                              === "rejected"
                            ? (
                              <X size={20} />
                            )
                            : (
                              <Clock3
                                size={20}
                              />
                            )}
                      </div>

                      <div>
                        <strong>
                          {t(request.action_summary)}
                        </strong>

                        <span>
                          {request.requested_by_name}
                          {" · "}
                          {t(roleLabel(request.requested_by_role))}
                          {" · "}
                          {request.branch_name
                            ? request.branch_name
                            : t("Current branch")}
                        </span>

                        <small>
                          {t("Requested")}{" "}
                          {dateTime(
                            request.requested_at
                          )}
                          {" · "}{t("Expires")}{" "}
                          {dateTime(
                            request.expires_at
                          )}
                        </small>

                        {request.review_note && (
                          <small>
                            {t("Review note")}:{" "}
                            {request.review_note}
                          </small>
                        )}
                      </div>

                      <div className="approval-center-value">
                        {request.amount !== null
                          && request.currency
                          ? (
                            <strong>
                              {money(
                                request.amount,
                                request.currency
                              )}
                            </strong>
                          )
                          : (
                            <strong>
                              {t(request.action_type)}
                            </strong>
                          )}

                        <span
                          className={`approval-status ${request.status}`}
                        >
                          {t(approvalStatusLabel(
                            request.status
                          ))}
                        </span>
                      </div>

                      {request.status
                        === "pending" && (
                          <div className="approval-center-actions">
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() =>
                                review(
                                  request,
                                  "reject"
                                )
                              }
                              disabled={
                                busy
                                  === `reject-${request.id}`
                              }
                            >
                              <X size={17} />
                              {t("Reject")}
                            </button>

                            <button
                              type="button"
                              className="primary-button"
                              onClick={() =>
                                review(
                                  request,
                                  "approve"
                                )
                              }
                              disabled={
                                busy
                                  === `approve-${request.id}`
                              }
                            >
                              <Check size={17} />
                              {t("Approve once")}
                            </button>
                          </div>
                        )}
                    </article>
                  )
                )}
              </div>
            )}
          </section>
        )}

      <UserPermissionModal
        member={editing}
        definitions={workspace.definitions}
        busy={busy === "save-access"}
        onClose={() =>
          setEditing(null)
        }
        onSubmit={saveAccess}
      />
    </div>
  );
}

