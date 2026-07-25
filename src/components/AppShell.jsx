import { useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  RotateCcw,
  Settings,
  ShoppingCart,
  Store,
  Warehouse
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const links = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard
  },
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
    to: "/products",
    label: "Products",
    icon: Boxes
  },
  {
    to: "/inventory",
    label: "Inventory",
    icon: Warehouse,
    roles: ["owner", "admin", "manager"]
  },
  {
    to: "/settings",
    label: "Settings",
    icon: Settings
  }
];

export default function AppShell() {
  const { profile, shop, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const visibleLinks = useMemo(
    () =>
      links.filter(
        (link) =>
          !link.roles || link.roles.includes(profile?.role)
      ),
    [profile?.role]
  );

  async function handleSignOut() {
    try {
      await signOut();
    } catch (error) {
      window.alert(error.message);
    }
  }

  return (
    <div className={`shell ${collapsed ? "collapsed" : ""}`}>
      <aside className={open ? "side open" : "side"}>
        <div className="brand">
          <b>T</b>
          <span className="side-label">
            {shop?.shop_name || "Tiny POS"}
          </span>
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
            {collapsed ? (
              <ChevronRight size={20} />
            ) : (
              <ChevronLeft size={20} />
            )}
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

          <div>
            <Store size={18} />
            {profile?.branches?.name || "Main Branch"}
          </div>

          <strong>
            {profile?.full_name || "Owner"} · {profile?.role}
          </strong>
        </header>

        <section className="content">
          <Outlet />
        </section>
      </main>
    </div>
  );
}
