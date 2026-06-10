import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { FirebaseProvider } from './components/layout/FirebaseProvider';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Products } from './pages/Products';
import { Categories } from './pages/Categories';
import { Warehouses } from './pages/Warehouses';
import { Inventory } from './pages/Inventory';
import { StockOpname } from './pages/StockOpname';
import { Inbound } from './pages/Inbound';
import { Toaster } from 'sonner';

import { Outbound } from './pages/Outbound';
import { Customers } from './pages/Customers';
import { Suppliers } from './pages/Suppliers';
import { Expeditions } from './pages/Expeditions';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';

export default function App() {
  return (
    <BrowserRouter>
      <FirebaseProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<DashboardLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/products" element={<Products />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/suppliers" element={<Suppliers />} />
            <Route path="/expeditions" element={<Expeditions />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/warehouses" element={<Warehouses />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/stock-opname" element={<StockOpname />} />
            <Route path="/inbound" element={<Inbound />} />
            <Route path="/outbound" element={<Outbound />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
            {/* Fallbacks */}
            <Route path="*" element={<div className="p-8 text-center text-muted-foreground">Work in progress</div>} />
          </Route>
        </Routes>
        <Toaster position="top-center" richColors />
      </FirebaseProvider>
    </BrowserRouter>
  );
}
