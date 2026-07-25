import {Navigate,Route,Routes} from 'react-router-dom';
import {useAuth} from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppShell from './components/AppShell';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ProductsPage from './pages/ProductsPage';
import SettingsPage from './pages/SettingsPage';
export default function App(){const {loading}=useAuth();if(loading)return <div className="loading">Loading Tiny POS…</div>;return <Routes><Route path="/login" element={<LoginPage/>}/><Route element={<ProtectedRoute><AppShell/></ProtectedRoute>}><Route index element={<Navigate to="/dashboard" replace/>}/><Route path="/dashboard" element={<DashboardPage/>}/><Route path="/products" element={<ProductsPage/>}/><Route path="/settings" element={<SettingsPage/>}/></Route><Route path="*" element={<Navigate to="/dashboard" replace/>}/></Routes>}
