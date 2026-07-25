import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Store
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const links = [
  ["/dashboard", "Dashboard", LayoutDashboard],
  ["/products", "Products", Boxes],
  ["/settings", "Settings", Settings]
];

export default function AppShell() {
  const { profile, shop, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`shell ${collapsed ? "collapsed" : ""}`}>
      <aside className={open ? "side open" : "side"}>
        <div className="brand">
          <b>T</b>
          <span className="side-label">{shop?.shop_name || "Tiny POS"}</span>
        </div>

        <nav>
          {links.map(([to, label, Icon]) => (
            <NavLink key={to} to={to} onClick={() => setOpen(false)} title={collapsed ? label : undefined}>
              <Icon size={21} />
              <span className="side-label">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="side-footer">
          <button className="collapse-button desktop-only" onClick={() => setCollapsed((value) => !value)}>
            {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
            <span className="side-label">Collapse</span>
          </button>
          <button className="logout" onClick={signOut} title={collapsed ? "Log out" : undefined}>
            <LogOut size={20} />
            <span className="side-label">Log out</span>
          </button>
        </div>
      </aside>

      {open && <button className="backdrop" aria-label="Close menu" onClick={() => setOpen(false)} />}

      <main>
        <header>
          <button className="menu" onClick={() => setOpen(true)} aria-label="Open menu"><Menu /></button>
          <div><Store size={18} /> {profile?.branches?.name || "Main Branch"}</div>
          <strong>{profile?.full_name || "Owner"} · {profile?.role}</strong>
        </header>
        <section className="content"><Outlet /></section>
      </main>
    </div>
  );
}
