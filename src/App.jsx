import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AppShell from "./components/AppShell";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import SalesPage from "./pages/SalesPage";
import ReturnsPage from "./pages/ReturnsPage";
import CustomersPage from "./pages/CustomersPage";
import UsersPage from "./pages/UsersPage";
import ReportsPage from "./pages/ReportsPage";
import CashExpensesPage from "./pages/CashExpensesPage";
import TransfersPage from "./pages/TransfersPage";
import PurchaseOrdersPage from "./pages/PurchaseOrdersPage";
import LabelsPage from "./pages/LabelsPage";
import ProductsPage from "./pages/ProductsPage";
import InventoryPage from "./pages/InventoryPage";
import SettingsPage from "./pages/SettingsPage";
import AdminToolsPage from "./pages/AdminToolsPage";
import CouponsPage from "./pages/CouponsPage";
import CashRegisterPage from "./pages/CashRegisterPage";

export default function App() {
  const { loading } = useAuth();

  if (loading) {
    return <div className="loading">Loading Tiny POS…</div>;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/sales" element={<SalesPage />} />
        <Route path="/returns" element={<ReturnsPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/coupons" element={<CouponsPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/cash-expenses" element={<CashExpensesPage />} />
        <Route path="/cash-register" element={<CashRegisterPage />} />
        <Route path="/transfers" element={<TransfersPage />} />
        <Route path="/purchase-orders" element={<PurchaseOrdersPage />} />
        <Route path="/labels" element={<LabelsPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/admin-tools" element={<AdminToolsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
