import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  ExternalLink
} from "lucide-react";
import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";

export default function SystemHealthCheckCard({ check }) {
  const { t } = useLanguage();
  const failed = check.status === "fail";
  const critical = failed && check.severity === "critical";
  const Icon = !failed
    ? CheckCircle2
    : critical
      ? CircleAlert
      : AlertTriangle;

  return (
    <article
      className={`system-check-card ${
        !failed ? "pass" : critical ? "critical" : "warning"
      }`}
    >
      <Icon size={22} />
      <div>
        <strong>{t(check.label)}</strong>
        <span>{t(check.detail)}</span>
      </div>
      <b>{Number(check.count || 0)}</b>
      {failed && check.path && (
        <Link to={check.path} title={t("Open related page")}>
          <ExternalLink size={17} />
        </Link>
      )}
    </article>
  );
}
