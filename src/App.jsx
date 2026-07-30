import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { useLanguage } from "./context/LanguageContext";
import ProtectedRoute from "./components/ProtectedRoute";
import PermissionRoute from "./components/PermissionRoute";
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
import ReorderPage from "./pages/ReorderPage";
import StockCountsPage from "./pages/StockCountsPage";
import ImportCenterPage from "./pages/ImportCenterPage";
import CreditAccountsPage from "./pages/CreditAccountsPage";
import QuotesPage from "./pages/QuotesPage";
import PriceListsPage from "./pages/PriceListsPage";
import InvoicesPage from "./pages/InvoicesPage";
import SupplierPayablesPage from "./pages/SupplierPayablesPage";
import TelegramPage from "./pages/TelegramPage";
import PermissionsPage from "./pages/PermissionsPage";
import BatchesPage from "./pages/BatchesPage";
import SalesOrdersPage from "./pages/SalesOrdersPage";
import SystemHealthPage from "./pages/SystemHealthPage";
import StaffOperationsPage from "./pages/StaffOperationsPage";
import AccountingPage from "./pages/AccountingPage";
import PayrollPage from "./pages/PayrollPage";
import OnlineStorePage from "./pages/OnlineStorePage";
import PublicStorefrontPage from "./pages/PublicStorefrontPage";
import OfflineCheckoutPage from "./pages/OfflineCheckoutPage";

export default function App() {
  const { loading } = useAuth();
  const { t } = useLanguage();

  if (loading) {
    return <div className="loading">{t("Loading Tiny POS…")}</div>;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/shop/:slug" element={<PublicStorefrontPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<PermissionRoute permission="dashboard.view"><DashboardPage /></PermissionRoute>} />
        <Route path="/sales" element={<PermissionRoute permission="sales.create"><SalesPage /></PermissionRoute>} />
        <Route path="/offline-checkout" element={<PermissionRoute permission="offline_checkout.use"><OfflineCheckoutPage /></PermissionRoute>} />
        <Route path="/quotes" element={<PermissionRoute permission="quotations.manage"><QuotesPage /></PermissionRoute>} />
        <Route path="/sales-orders" element={<PermissionRoute any={["sales_orders.manage","sales_orders.deliver"]}><SalesOrdersPage /></PermissionRoute>} />
        <Route path="/online-store" element={<PermissionRoute any={["online_store.manage","online_orders.manage","online_orders.fulfill"]}><OnlineStorePage /></PermissionRoute>} />
        <Route path="/invoices" element={<PermissionRoute permission="invoices.view"><InvoicesPage /></PermissionRoute>} />
        <Route path="/returns" element={<PermissionRoute permission="returns.process"><ReturnsPage /></PermissionRoute>} />
        <Route path="/customers" element={<PermissionRoute permission="customers.manage"><CustomersPage /></PermissionRoute>} />
        <Route path="/credit-accounts" element={<PermissionRoute any={["credit_accounts.manage","credit_accounts.collect"]}><CreditAccountsPage /></PermissionRoute>} />
        <Route path="/coupons" element={<PermissionRoute permission="coupons.manage"><CouponsPage /></PermissionRoute>} />
        <Route path="/price-lists" element={<PermissionRoute permission="price_lists.manage"><PriceListsPage /></PermissionRoute>} />
        <Route path="/users" element={<PermissionRoute permission="staff.manage"><UsersPage /></PermissionRoute>} />
        <Route path="/staff-operations" element={<PermissionRoute any={["staff_operations.self","attendance.manage","commissions.manage"]}><StaffOperationsPage /></PermissionRoute>} />
        <Route path="/reports" element={<PermissionRoute permission="reports.view"><ReportsPage /></PermissionRoute>} />
        <Route path="/accounting" element={<PermissionRoute permission="accounting.view"><AccountingPage /></PermissionRoute>} />
        <Route path="/payroll" element={<PermissionRoute any={["payroll.view_self","payroll.manage"]}><PayrollPage /></PermissionRoute>} />
        <Route path="/cash-expenses" element={<PermissionRoute any={["cash_expenses.manage","cash_expenses.void"]}><CashExpensesPage /></PermissionRoute>} />
        <Route path="/cash-register" element={<PermissionRoute any={["cash_register.use","cash_register.close"]}><CashRegisterPage /></PermissionRoute>} />
        <Route path="/transfers" element={<PermissionRoute any={["transfers.create","transfers.receive","transfers.cancel"]}><TransfersPage /></PermissionRoute>} />
        <Route path="/purchase-orders" element={<PermissionRoute any={["purchases.manage","purchases.receive","purchases.cancel","purchases.supplier_return"]}><PurchaseOrdersPage /></PermissionRoute>} />
        <Route path="/supplier-payables" element={<PermissionRoute any={["supplier_payables.view","supplier_payables.pay"]}><SupplierPayablesPage /></PermissionRoute>} />
        <Route path="/reorder" element={<PermissionRoute permission="reorder.manage"><ReorderPage /></PermissionRoute>} />
        <Route path="/labels" element={<PermissionRoute permission="labels.print"><LabelsPage /></PermissionRoute>} />
        <Route path="/products" element={<PermissionRoute permission="products.manage"><ProductsPage /></PermissionRoute>} />
        <Route path="/inventory" element={<PermissionRoute any={["inventory.view","inventory.adjust"]}><InventoryPage /></PermissionRoute>} />
        <Route path="/batches" element={<PermissionRoute any={["inventory.view","inventory.adjust"]}><BatchesPage /></PermissionRoute>} />
        <Route path="/stock-counts" element={<PermissionRoute permission="stock_counts.manage"><StockCountsPage /></PermissionRoute>} />
        <Route path="/settings" element={<PermissionRoute permission="settings.view"><SettingsPage /></PermissionRoute>} />
        <Route path="/telegram" element={<PermissionRoute permission="telegram.use"><TelegramPage /></PermissionRoute>} />
        <Route path="/access-control" element={<PermissionRoute any={["access.manage","approvals.review"]}><PermissionsPage /></PermissionRoute>} />
        <Route path="/admin-tools" element={<PermissionRoute permission="audit_backup.manage"><AdminToolsPage /></PermissionRoute>} />
        <Route path="/system-health" element={<PermissionRoute permission="system_health.manage"><SystemHealthPage /></PermissionRoute>} />
        <Route path="/import-center" element={<PermissionRoute permission="import.manage"><ImportCenterPage /></PermissionRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
