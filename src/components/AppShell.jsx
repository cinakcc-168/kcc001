import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  ArrowLeftRight,
  Barcode,
  BarChart3,
  Boxes,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  RotateCcw,
  Settings,
  ShoppingCart,
  Store,
  UserCog,
  UsersRound,
  WalletCards,
  Warehouse,
  ShieldCheck,
  TicketPercent,
  Banknote,
  ListChecks,
  ClipboardCheck,
  FileUp,
  BadgeDollarSign,
  FileText,
  Tags,
  ReceiptText,
  HandCoins,
  Send,
  KeyRound,
  CalendarClock,
  PackageCheck,
  Activity,
  Clock3,
  BookOpenCheck,
  Landmark,
  Globe2
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { switchMyBranch } from "../lib/staff";
import PwaManager from "./PwaManager";
import LanguageSwitcher from "./LanguageSwitcher";
import { useLanguage } from "../context/LanguageContext";

const links = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    permission: "dashboard.view"
  },
  {
    to: "/sales",
    label: "New Sale",
    icon: ShoppingCart,
    permission: "sales.create"
  },
  {
    to: "/quotes",
    label: "Quotations",
    icon: FileText,
    permission: "quotations.manage"
  },
  {
    to: "/sales-orders",
    label: "Sales Orders",
    icon: PackageCheck,
    any: [
      "sales_orders.manage",
      "sales_orders.deliver"
    ]
  },
  {
    to: "/online-store",
    label: "Online Store",
    icon: Globe2,
    any: [
      "online_store.manage",
      "online_orders.manage",
      "online_orders.fulfill"
    ]
  },
  {
    to: "/invoices",
    label: "Invoice Center",
    icon: ReceiptText,
    permission: "invoices.view"
  },
  {
    to: "/returns",
    label: "Returns & Refunds",
    icon: RotateCcw,
    permission: "returns.process"
  },
  {
    to: "/customers",
    label: "Customers",
    icon: UsersRound,
    permission: "customers.manage"
  },
  {
    to: "/credit-accounts",
    label: "Credit Accounts",
    icon: BadgeDollarSign,
    any: [
      "credit_accounts.manage",
      "credit_accounts.collect"
    ]
  },
  {
    to: "/coupons",
    label: "Coupons",
    icon: TicketPercent,
    permission: "coupons.manage"
  },
  {
    to: "/price-lists",
    label: "Price Lists",
    icon: Tags,
    permission: "price_lists.manage"
  },
  {
    to: "/products",
    label: "Products",
    icon: Boxes,
    permission: "products.manage"
  },
  {
    to: "/labels",
    label: "Barcode Labels",
    icon: Barcode,
    permission: "labels.print"
  },
  {
    to: "/inventory",
    label: "Inventory",
    icon: Warehouse,
    any: [
      "inventory.view",
      "inventory.adjust"
    ]
  },
  {
    to: "/batches",
    label: "Batch & Expiry",
    icon: CalendarClock,
    any: [
      "inventory.view",
      "inventory.adjust"
    ]
  },
  {
    to: "/stock-counts",
    label: "Stock Count",
    icon: ClipboardCheck,
    permission: "stock_counts.manage"
  },
  {
    to: "/transfers",
    label: "Stock Transfers",
    icon: ArrowLeftRight,
    any: [
      "transfers.create",
      "transfers.receive",
      "transfers.cancel"
    ]
  },
  {
    to: "/purchase-orders",
    label: "Purchase Orders",
    icon: ClipboardList,
    any: [
      "purchases.manage",
      "purchases.receive",
      "purchases.cancel",
      "purchases.supplier_return"
    ]
  },
  {
    to: "/supplier-payables",
    label: "Supplier Payables",
    icon: HandCoins,
    any: [
      "supplier_payables.view",
      "supplier_payables.pay"
    ]
  },
  {
    to: "/reorder",
    label: "Reorder Planner",
    icon: ListChecks,
    permission: "reorder.manage"
  },
  {
    to: "/cash-expenses",
    label: "Cash & Expenses",
    icon: WalletCards,
    any: [
      "cash_expenses.manage",
      "cash_expenses.void"
    ]
  },
  {
    to: "/cash-register",
    label: "Cash Register",
    icon: Banknote,
    any: [
      "cash_register.use",
      "cash_register.close"
    ]
  },
  {
    to: "/reports",
    label: "Reports",
    icon: BarChart3,
    permission: "reports.view"
  },
  {
    to: "/accounting",
    label: "Accounting Center",
    icon: BookOpenCheck,
    permission: "accounting.view"
  },
  {
    to: "/payroll",
    label: "Payroll Center",
    icon: Landmark,
    any: [
      "payroll.view_self",
      "payroll.manage"
    ]
  },
  {
    to: "/users",
    label: "Staff & Branches",
    icon: UserCog,
    permission: "staff.manage"
  },
  {
    to: "/staff-operations",
    label: "Attendance & Commission",
    icon: Clock3,
    any: [
      "staff_operations.self",
      "attendance.manage",
      "commissions.manage"
    ]
  },
  {
    to: "/access-control",
    label: "Access & Approvals",
    icon: KeyRound,
    any: [
      "access.manage",
      "approvals.review"
    ]
  },
  {
    to: "/admin-tools",
    label: "Audit & Backup",
    icon: ShieldCheck,
    permission: "audit_backup.manage"
  },
  {
    to: "/system-health",
    label: "System Health",
    icon: Activity,
    permission: "system_health.manage"
  },
  {
    to: "/import-center",
    label: "Import Center",
    icon: FileUp,
    permission: "import.manage"
  },
  {
    to: "/telegram",
    label: "Telegram",
    icon: Send,
    permission: "telegram.use"
  },
  {
    to: "/settings",
    label: "Settings",
    icon: Settings,
    permission: "settings.view"
  }
];

export default function AppShell() {
  const { t } = useLanguage();

  const {
    supabase,
    session,
    profile,
    shop,
    can,
    canAny,
    signOut
  } = useAuth();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [branches, setBranches] = useState([]);
  const [switchingBranch, setSwitchingBranch] = useState(false);

  const visibleLinks = useMemo(
    () =>
      links.filter((link) => {
        if (link.permission) {
          return can(link.permission);
        }

        if (link.any) {
          return canAny(link.any);
        }

        return true;
      }),
    [can, canAny]
  );

  const canSwitchBranch =
    can("branches.switch");

  useEffect(() => {
    if (!supabase || !profile?.organization_id || !canSwitchBranch) {
      setBranches([]);
      return;
    }

    let active = true;

    (async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id,name,code,is_active")
        .eq("organization_id", profile.organization_id)
        .eq("is_active", true)
        .order("name");

      if (!active || error) return;
      setBranches(data || []);
    })();

    return () => {
      active = false;
    };
  }, [supabase, profile?.organization_id, canSwitchBranch]);

  async function handleSignOut() {
    try {
      await signOut();
    } catch (error) {
      window.alert(error.message);
    }
  }

  async function handleBranchChange(event) {
    const branchId = event.target.value;
    if (!branchId || branchId === profile.branch_id) return;

    try {
      setSwitchingBranch(true);
      await switchMyBranch(session, branchId);
      window.location.reload();
    } catch (error) {
      window.alert(error.message);
      setSwitchingBranch(false);
    }
  }

  return (
    <div className={`shell ${collapsed ? "collapsed" : ""}`}>
      <aside className={open ? "side open" : "side"}>
        <div className="brand">
          {shop?.shop_logo_url ? (
            <img className="side-shop-logo" src={shop.shop_logo_url} alt="" />
          ) : (
            <b>T</b>
          )}
          <span className="side-label" data-i18n-skip>{shop?.shop_name || "Tiny POS"}</span>
        </div>

        <nav>
          {visibleLinks.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              title={collapsed ? t(label) : undefined}
            >
              <Icon size={21} />
              <span className="side-label">{t(label)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="side-footer">
          <button
            type="button"
            className="collapse-button desktop-only"
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
            <span className="side-label">{t("Collapse")}</span>
          </button>

          <button
            type="button"
            className="logout"
            onClick={handleSignOut}
            title={collapsed ? t("Log out") : undefined}
          >
            <LogOut size={20} />
            <span className="side-label">{t("Log out")}</span>
          </button>
        </div>
      </aside>

      {open && (
        <button
          type="button"
          className="backdrop"
          aria-label={t("Close menu")}
          onClick={() => setOpen(false)}
        />
      )}

      <main>
        <header>
          <button
            type="button"
            className="menu"
            onClick={() => setOpen(true)}
            aria-label={t("Open menu")}
          >
            <Menu />
          </button>

          {canSwitchBranch && branches.length > 1 ? (
            <label className="header-branch-switcher">
              <Store size={18} />
              <select
                value={profile?.branch_id || ""}
                onChange={handleBranchChange}
                disabled={switchingBranch}
                aria-label={t("Switch active branch")}
              >
                {branches.map((branch) => (
                  <option value={branch.id} key={branch.id}>{branch.name}</option>
                ))}
              </select>
            </label>
          ) : (
            <div>
              <Store size={18} />
              {profile?.branches?.name || "Main Branch"}
            </div>
          )}

          <LanguageSwitcher compact />

          <strong data-i18n-skip>
            {profile?.full_name || t("Owner")} · {t(profile?.role || "Owner")}
          </strong>
        </header>

        <PwaManager />

        <section className="content"><Outlet /></section>
      </main>
    </div>
  );
}
