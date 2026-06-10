import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Package, Home, LayoutList, Layers, Upload, FileText, ArrowDownToLine, ArrowUpFromLine, Users, Truck, Settings, Menu, ChevronLeft, Send, ClipboardPaste } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

const navItems = [
  { icon: Home, label: 'Dashboard', to: '/' },
  { icon: Package, label: 'Produk', to: '/products' },
  { icon: LayoutList, label: 'Kategori', to: '/categories' },
  { icon: Truck, label: 'Pemasok', to: '/suppliers' },
  { icon: Send, label: 'Ekspedisi', to: '/expeditions' },
  { icon: Users, label: 'Pelanggan', to: '/customers' },
  { icon: Layers, label: 'Gudang', to: '/warehouses' },
  { icon: FileText, label: 'Inventaris', to: '/inventory' },
  { icon: ArrowDownToLine, label: 'Barang Masuk', to: '/inbound' },
  { icon: ArrowUpFromLine, label: 'Barang Keluar', to: '/outbound' },
  { icon: ClipboardPaste, label: 'Laporan', to: '/reports' },
  { icon: Upload, label: 'Stok Opname', to: '/stock-opname' },
  { icon: Settings, label: 'Pengaturan', to: '/settings' },
];

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const appUser = useAuthStore((s) => s.appUser);
  const initials = appUser?.name ? appUser.name.substring(0, 2).toUpperCase() : 'W';
  
  return (
    <aside className={cn(
      "bg-white border-r border-slate-200 text-slate-600 flex flex-col h-full font-sans shadow-none z-10 shrink-0 select-none transition-all duration-300",
      isCollapsed ? "w-20" : "w-64"
    )}>
      <div className="h-16 flex items-center justify-between px-6 border-b border-slate-100">
        {!isCollapsed && (
          <div className="flex items-center gap-3">
             <img 
               src="https://storage.googleapis.com/static.antigravity.ai/samples/core-hub-logo.png" 
               alt="CoreHub" 
               className="h-9 object-contain"
               onError={(e) => {
                 // Fallback if image fails
                 e.currentTarget.style.display = 'none';
                 e.currentTarget.parentElement?.querySelector('.fallback-logo')?.classList.remove('hidden');
               }}
             />
             <div className="fallback-logo hidden flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white bg-[#0C4196]">C</div>
                <span className="font-bold text-[#0C4196] tracking-tight">CoreHub</span>
             </div>
          </div>
        )}
        {isCollapsed && (
          <div className="mx-auto">
             <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white bg-[#0C4196]">C</div>
          </div>
        )}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
        >
          {isCollapsed ? <Menu className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>
      
      <div className="flex-1 py-4 overflow-y-auto px-3 flex flex-col hide-scrollbar">
        <nav className="space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={isCollapsed ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                   'flex items-center gap-3 px-3 h-11 rounded-xl transition-all cursor-pointer group',
                   isActive 
                     ? 'bg-blue-50 text-[#0C4196] font-semibold' 
                     : 'hover:bg-slate-50 text-slate-500 hover:text-slate-900',
                   isCollapsed && "justify-center px-0"
                )
              }
            >
              <item.icon className={cn("shrink-0", isCollapsed ? "w-5 h-5" : "w-5 h-5")} />
              {!isCollapsed && <span className="text-sm">{item.label}</span>}
            </NavLink>
          ))}
        </nav>
      </div>
      
      <div className="p-4 border-t border-slate-100">
        <div className={cn(
          "flex items-center gap-3 p-2 rounded-xl transition-all",
          isCollapsed ? "justify-center" : "bg-slate-50"
        )}>
          <div className="w-10 h-10 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-sm font-bold text-indigo-700 shadow-sm shrink-0">
            {initials}
          </div>
          {!isCollapsed && (
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-slate-900 truncate">{appUser?.name || 'User'}</p>
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">{appUser?.role || 'Staf'}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
