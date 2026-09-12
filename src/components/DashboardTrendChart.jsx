import { TrendingUp } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { money } from "../lib/catalog";
import { dashboardDay } from "../lib/dashboard";

export default function DashboardTrendChart({
  rows = [],
  currency = "USD"
}) {
  const { t, language } = useLanguage();
  const maximum = Math.max(
    1,
    ...rows.map((row) =>
      Math.max(0, Number(row.net_sales || 0))
    )
  );

  const total = rows.reduce(
    (sum, row) =>
      sum + Number(row.net_sales || 0),
    0
  );

  return (
    <section className="panel dashboard-chart-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">{t("LAST 7 DAYS")}</p>
          <h2>{t("Weekly sales trend")}</h2>
          <span className="muted">
            {money(total, currency)} {t("net sales")}
          </span>
        </div>
        <TrendingUp size={23} />
      </div>

      <div className="dashboard-bar-chart">
        {rows.map((row) => {
          const netSales = Number(row.net_sales || 0);
          const height = Math.max(
            netSales > 0 ? 7 : 2,
            (Math.max(0, netSales) / maximum) * 100
          );

          return (
            <article
              key={row.date}
              title={[
                money(netSales, currency),
                `${Number(row.sale_count || 0)} ${t("sales")}`,
                `${money(row.refunds || 0, currency)} ${t("refunds")}`
              ].join(" · ")}
            >
              <div className="dashboard-bar-value">
                {money(netSales, currency)}
              </div>

              <div className="dashboard-bar-track">
                <div
                  className="dashboard-bar-fill"
                  style={{ height: `${height}%` }}
                />
              </div>

              <strong>{dashboardDay(row.date, language)}</strong>
              <small>
                {Number(row.sale_count || 0)} {t("sales")}
              </small>
            </article>
          );
        })}
      </div>
    </section>
  );
}
