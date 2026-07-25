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
  TicketPercent
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { switchMyBranch } from "../lib/staff";

const links = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    to: "/sales",
    label: "New Sale",
    icon: ShoppingCart,
    roles: ["owner", "admin", "manager", "cashier"]
  },
  {
    to: "/returns",
    label: "Returns & Refunds",
    icon: RotateCcw,
    roles: ["owner", "admin", "manager"]
  },
  {
    to: "/customers",
    label: "Customers",
    icon: UsersRound,
    roles: ["owner", "admin", "manager"]
  },
  {
    to: "/coupons",
    label: "Coupons",
    icon: TicketPercent,
    roles: ["owner", "admin", "manager"]
  },
  { to: "/products", label: "Products", icon: Boxes },
  {
    to: "/labels",
    label: "Barcode Labels",
    icon: Barcode,
    roles: ["owner", "admin", "manager"]
  },
  {
    to: "/inventory",
    label: "Inventory",
    icon: Warehouse,
    roles: ["owner", "admin", "manager"]
  },
  {
    to: "/transfers",
    label: "Stock Transfers",
    icon: ArrowLeftRight,
    roles: ["owner", "admin", "manager"]
  },
  {
    to: "/purchase-orders",
    label: "Purchase Orders",
    icon: ClipboardList,
    roles: ["owner", "admin", "manager"]
  },
  {
    to: "/cash-expenses",
    label: "Cash & Expenses",
    icon: WalletCards,
    roles: ["owner", "admin", "manager"]
  },
  {
    to: "/reports",
    label: "Reports",
    icon: BarChart3,
    roles: ["owner", "admin", "manager", "viewer"]
  },
  {
    to: "/users",
    label: "Staff & Branches",
    icon: UserCog,
    roles: ["owner", "admin"]
  },
  {
    to: "/admin-tools",
    label: "Audit & Backup",
    icon: ShieldCheck,
    roles: ["owner", "admin"]
  },
  { to: "/settings", label: "Settings", icon: Settings }
];

export default function AppShell() {
  const { supabase, session, profile, shop, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [branches, setBranches] = useState([]);
  const [switchingBranch, setSwitchingBranch] = useState(false);

  const visibleLinks = useMemo(
    () => links.filter((link) => !link.roles || link.roles.includes(profile?.role)),
    [profile?.role]
  );

  const canSwitchBranch = ["owner", "admin"].includes(profile?.role);

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
          <span className="side-label">{shop?.shop_name || "Tiny POS"}</span>
        </div>

        <nav>
          {visibleLinks.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              title={collapsed ? label : undefined}
            >
              <Icon size={21} />
              <span className="side-label">{label}</span>
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
            <span className="side-label">Collapse</span>
          </button>

          <button
            type="button"
            className="logout"
            onClick={handleSignOut}
            title={collapsed ? "Log out" : undefined}
          >
            <LogOut size={20} />
            <span className="side-label">Log out</span>
          </button>
        </div>
      </aside>

      {open && (
        <button
          type="button"
          className="backdrop"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      )}

      <main>
        <header>
          <button
            type="button"
            className="menu"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
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
                aria-label="Switch active branch"
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

          <strong>{profile?.full_name || "Owner"} · {profile?.role}</strong>
        </header>

        <section className="content"><Outlet /></section>
      </main>
    </div>
  );
}
