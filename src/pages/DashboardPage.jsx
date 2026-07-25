import { useEffect, useState } from "react";
import { Boxes, CircleDollarSign, PackageSearch, TrendingUp } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { money } from "../lib/catalog";

export default function DashboardPage() {
  const { supabase, profile, shop } = useAuth();
  const [metrics, setMetrics] = useState({ sales: 0, profit: 0, salesCount: 0, products: 0, lowStock: 0 });

  useEffect(() => {
    if (!supabase || !profile?.organization_id) return;
    (async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const [salesResult, productsResult] = await Promise.all([
        supabase.from("sales").select("total_amount,gross_profit,status").eq("organization_id", profile.organization_id).eq("status", "completed").gte("created_at", start.toISOString()),
        supabase.from("products").select("id,is_active,track_stock,low_stock_threshold,inventory_balances(branch_id,quantity)").eq("organization_id", profile.organization_id)
      ]);
      if (salesResult.error || productsResult.error) return;
      const sales = salesResult.data || [];
      const products = (productsResult.data || []).filter((p) => p.is_active);
      const lowStock = products.filter((p) => {
        const balance = (p.inventory_balances || []).find((b) => b.branch_id === profile.branch_id);
        return p.track_stock && Number(balance?.quantity || 0) <= Number(p.low_stock_threshold || 0);
      }).length;
      setMetrics({
        sales: sales.reduce((sum, row) => sum + Number(row.total_amount || 0), 0),
        profit: sales.reduce((sum, row) => sum + Number(row.gross_profit || 0), 0),
        salesCount: sales.length,
        products: products.length,
        lowStock
      });
    })();
  }, [supabase, profile]);

  const currency = shop?.base_currency || "USD";
  const cards = [
    ["Today's sales", money(metrics.sales, currency), `${metrics.salesCount} completed sales`, CircleDollarSign],
    ["Today's profit", money(metrics.profit, currency), "Gross profit", TrendingUp],
    ["Products", metrics.products, "Active products", Boxes],
    ["Low stock", metrics.lowStock, "Needs attention", PackageSearch]
  ];

  return <div><p className="eyebrow">OVERVIEW</p><h1>Dashboard</h1><p className="muted">Welcome back, {profile?.full_name || "Owner"}.</p><div className="metrics">{cards.map(([label,value,detail,Icon])=><article key={label}><Icon size={22}/><span>{label}</span><b>{value}</b><small>{detail}</small></article>)}</div><section className="panel"><h2>Product management is connected</h2><p>Categories, product codes, barcodes, prices, opening stock and Cloudinary product photos are now available.</p></section></div>;
}
