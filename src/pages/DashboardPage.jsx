import { useEffect, useState } from "react";
import {
  Boxes,
  CircleDollarSign,
  PackageSearch,
  TrendingUp
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { money } from "../lib/catalog";

export default function DashboardPage() {
  const { supabase, profile, shop } = useAuth();
  const [metrics, setMetrics] = useState({
    sales: 0,
    profit: 0,
    salesCount: 0,
    refunds: 0,
    refundCount: 0,
    products: 0,
    lowStock: 0
  });

  useEffect(() => {
    if (!supabase || !profile?.organization_id) return;

    let active = true;

    (async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);

      const [salesResult, returnsResult, productsResult] =
        await Promise.all([
          supabase
            .from("sales")
            .select("total_amount,gross_profit,status")
            .eq("organization_id", profile.organization_id)
            .eq("branch_id", profile.branch_id)
            .in("status", [
              "completed",
              "partially_refunded",
              "refunded"
            ])
            .gte("created_at", start.toISOString()),
          supabase
            .from("returns")
            .select("refund_amount,profit_reversal,status")
            .eq("organization_id", profile.organization_id)
            .eq("branch_id", profile.branch_id)
            .eq("status", "completed")
            .gte("processed_at", start.toISOString()),
          supabase
            .from("products")
            .select(`
              id,
              is_active,
              track_stock,
              low_stock_threshold,
              inventory_balances (
                branch_id,
                quantity
              )
            `)
            .eq("organization_id", profile.organization_id)
        ]);

      if (
        salesResult.error
        || returnsResult.error
        || productsResult.error
      ) {
        return;
      }

      const sales = salesResult.data || [];
      const refunds = returnsResult.data || [];
      const products = (productsResult.data || []).filter(
        (product) => product.is_active
      );

      const lowStock = products.filter((product) => {
        const balance = (product.inventory_balances || []).find(
          (row) => row.branch_id === profile.branch_id
        );

        return (
          product.track_stock
          && Number(balance?.quantity || 0)
            <= Number(product.low_stock_threshold || 0)
        );
      }).length;

      const grossSales = sales.reduce(
        (sum, row) => sum + Number(row.total_amount || 0),
        0
      );
      const grossProfit = sales.reduce(
        (sum, row) => sum + Number(row.gross_profit || 0),
        0
      );
      const refundAmount = refunds.reduce(
        (sum, row) => sum + Number(row.refund_amount || 0),
        0
      );
      const profitReversal = refunds.reduce(
        (sum, row) => sum + Number(row.profit_reversal || 0),
        0
      );

      if (!active) return;

      setMetrics({
        sales: grossSales - refundAmount,
        profit: grossProfit - profitReversal,
        salesCount: sales.length,
        refunds: refundAmount,
        refundCount: refunds.length,
        products: products.length,
        lowStock
      });
    })();

    return () => {
      active = false;
    };
  }, [supabase, profile]);

  const currency = shop?.base_currency || "USD";

  const cards = [
    [
      "Today's net sales",
      money(metrics.sales, currency),
      `${metrics.salesCount} sales · ${metrics.refundCount} refunds`,
      CircleDollarSign
    ],
    [
      "Today's net profit",
      money(metrics.profit, currency),
      `After ${money(metrics.refunds, currency)} refunded`,
      TrendingUp
    ],
    [
      "Products",
      metrics.products,
      "Active products",
      Boxes
    ],
    [
      "Low stock",
      metrics.lowStock,
      "Needs attention",
      PackageSearch
    ]
  ];

  return (
    <div>
      <p className="eyebrow">OVERVIEW</p>
      <h1>Dashboard</h1>
      <p className="muted">
        Welcome back, {profile?.full_name || "Owner"}.
      </p>

      <div className="metrics">
        {cards.map(([label, value, detail, Icon]) => (
          <article key={label}>
            <Icon size={22} />
            <span>{label}</span>
            <b>{value}</b>
            <small>{detail}</small>
          </article>
        ))}
      </div>

      <section className="panel">
        <h2>Sales and refunds are connected</h2>
        <p>
          Dashboard sales and profit now subtract completed refunds,
          while stock is restored only when the refund is marked for
          restocking.
        </p>
      </section>
    </div>
  );
}
