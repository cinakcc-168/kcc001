import {
  AlertTriangle,
  ArrowRight,
  CircleAlert,
  CircleCheck,
  Info
} from "lucide-react";
import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { money } from "../lib/catalog";

function AlertIcon({ severity }) {
  if (severity === "danger") {
    return <CircleAlert size={21} />;
  }

  if (severity === "warning") {
    return <AlertTriangle size={21} />;
  }

  if (severity === "info") {
    return <Info size={21} />;
  }

  return <CircleCheck size={21} />;
}

function formatAlertTitle(title, t, language) {
  if (!title) return "";
  const direct = t(title);
  if (direct && direct !== title) return direct;

  if (language === "km") {
    const absentMatch = title.match(/^(\d+)\s+staff\s+absent\s+today$/i);
    if (absentMatch) {
      return `បុគ្គលិក ${absentMatch[1]} នាក់អវត្តមានថ្ងៃនេះ`;
    }

    const onlineOrderMatch = title.match(/^Online\s+order\s+(.+)$/i);
    if (onlineOrderMatch) {
      return `ការបញ្ជាទិញតាមអនឡាញ ${onlineOrderMatch[1]}`;
    }
  }

  return direct;
}

function formatAlertDetail(detail, t, language) {
  if (!detail) return "";
  const direct = t(detail);
  if (direct && direct !== detail) return direct;

  if (language === "km") {
    const outOfStockMatch = detail.match(/^(\d+)\s+product\/branch\s+stock\s+records?\s+need\s+attention\.?$/i);
    if (outOfStockMatch) {
      return `កំណត់ត្រាស្តុកទំនិញ/សាខាចំនួន ${outOfStockMatch[1]} ត្រូវការការយកចិត្តទុកដាក់។`;
    }

    const transferMatch = detail.match(/^(\d+)\s+transfers?\s+(?:is|are)\s+waiting\s+to\s+be\s+received\s+or\s+cancelled\.?$/i);
    if (transferMatch) {
      return `ការផ្ទេរចំនួន ${transferMatch[1]} កំពុងរង់ចាំការទទួល ឬការបោះបង់។`;
    }

    const poMatch = detail.match(/^(\d+)\s+draft\s+purchase\s+orders?\s+need(?:s)?\s+review\.?$/i);
    if (poMatch) {
      return `សេចក្តីព្រាងការបញ្ជាទិញទំនិញចំនួន ${poMatch[1]} ត្រូវការពិនិត្យ។`;
    }

    const parkedMatch = detail.match(/^(\d+)\s+parked\s+bills?\s+(?:is|are)\s+waiting\s+to\s+be\s+resumed\.?$/i);
    if (parkedMatch) {
      return `វិក្កយបត្រដែលបានផ្អាកចំនួន ${parkedMatch[1]} កំពុងរង់ចាំការបន្តឡើងវិញ។`;
    }

    const lowStockMatch = detail.match(/^(\d+)\s+product\/branch\s+stock\s+records?\s+reached\s+the\s+reorder\s+point\.?$/i);
    if (lowStockMatch) {
      return `កំណត់ត្រាស្តុកទំនិញ/សាខាចំនួន ${lowStockMatch[1]} ដល់ចំណុចបញ្ជាទិញបន្ថែម។`;
    }

    const quoteMatch = detail.match(/^(\d+)\s+quotes?\s+(?:is|are)\s+waiting\s+for\s+customer\s+confirmation\.?$/i);
    if (quoteMatch) {
      return `ការផ្តល់តម្លៃចំនួន ${quoteMatch[1]} កំពុងរង់ចាំការបញ្ជាក់ពីអតិថិជន។`;
    }

    const soMatch = detail.match(/^(\d+)\s+sales\s+orders?\s+(?:is|are)\s+waiting\s+for\s+delivery\s+or\s+fulfillment\.?$/i);
    if (soMatch) {
      return `ការបញ្ជាទិញចំនួន ${soMatch[1]} កំពុងរង់ចាំការដឹកជញ្ជូន ឬបំពេញតាមការបញ្ជា។`;
    }

    if (detail.includes(" · ")) {
      return detail
        .split(" · ")
        .map((part) => t(part.trim()))
        .join(" · ");
    }
  }

  return direct;
}

export default function DashboardAlertCard({
  alert,
  currency = "USD"
}) {
  const { t, language } = useLanguage();
  const target = alert.key === "out_of_stock"
    ? "/reorder?status=out_of_stock"
    : alert.key === "low_stock"
      ? "/reorder?status=attention"
      : alert.link || "/dashboard";

  return (
    <Link
      to={target}
      className={`dashboard-alert-card ${alert.severity || "neutral"}`}
    >
      <div className="dashboard-alert-icon">
        <AlertIcon severity={alert.severity} />
      </div>

      <div>
        <strong>{formatAlertTitle(alert.title, t, language)}</strong>
        <span>{formatAlertDetail(alert.detail, t, language)}</span>

        {alert.amount !== undefined
          && alert.amount !== null && (
            <b>
              {money(
                alert.amount,
                alert.currency || currency
              )}
            </b>
          )}
      </div>

      <ArrowRight size={18} />
    </Link>
  );
}
