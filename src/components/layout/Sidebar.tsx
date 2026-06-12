import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Package, Home, LayoutList, Layers, Upload, FileText, ArrowDownToLine, ArrowUpFromLine, Users, Truck, Settings, Menu, ChevronLeft, Send, ClipboardPaste, Briefcase, Building2, Ticket, Database, Reply, ChevronDown, ChevronRight } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

interface NavItem {
  icon: any;
  label: string;
  to?: string;
  items?: { label: string; to: string }[];
}

const navItems: NavItem[] = [
  { icon: Home, label: 'Dashboard', to: '/' },
  { icon: Package, label: 'Produk', to: '/products' },
  { icon: LayoutList, label: 'Kategori', to: '/categories' },
  { 
    icon: Database, 
    label: 'Data', 
    items: [
      { label: 'Pemilik', to: '/owners' },
      { label: 'Project Executor', to: '/project-executors' },
      { label: 'Pelanggan', to: '/customers' },
      { label: 'Pemasok', to: '/suppliers' },
      { label: 'Gudang', to: '/warehouses' },
      { label: 'Ekspedisi', to: '/expeditions' },
    ]
  },
  { icon: Ticket, label: 'Underlying PO', to: '/underlying-pos' },
  { icon: Layers, label: 'Vendor PO', to: '/supply-pos' },
  { icon: ArrowDownToLine, label: 'Barang Masuk', to: '/inbound' },
  { icon: ArrowUpFromLine, label: 'Barang Keluar', to: '/outbound' },
  { icon: Reply, label: 'Retur & Kerusakan', to: '/returns' },
  { icon: Database, label: 'Inventory Ledger', to: '/ledger' },
  { icon: FileText, label: 'Inventaris', to: '/inventory' },
  { icon: Upload, label: 'Stok Opname', to: '/stock-opname' },
  { icon: ClipboardPaste, label: 'Laporan', to: '/reports' },
  { icon: Settings, label: 'Pengaturan', to: '/settings' },
];

export function Sidebar({ isOpen, onClose }: { isOpen?: boolean, onClose?: () => void }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>('Data');
  const location = useLocation();
  const appUser = useAuthStore((s) => s.appUser);
  const initials = appUser?.name ? appUser.name.substring(0, 2).toUpperCase() : 'W';

  const toggleSubmenu = (label: string) => {
    if (isCollapsed) setIsCollapsed(false);
    setOpenSubmenu(openSubmenu === label ? null : label);
  };
  
  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside className={cn(
        "bg-white border-r border-slate-200 text-slate-600 flex flex-col h-full font-sans shadow-none z-50 shrink-0 select-none transition-all duration-300",
        "fixed inset-y-0 left-0 lg:static lg:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full",
        isCollapsed ? "lg:w-20" : "lg:w-64",
        "w-64" // Fixed width on mobile
      )}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-100">
          {(!isCollapsed || isOpen) && (
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
          {isCollapsed && !isOpen && (
            <div className="mx-auto">
               <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white bg-[#0C4196]">C</div>
            </div>
          )}
          <button 
            onClick={() => {
              if (isOpen && onClose) {
                onClose();
              } else {
                setIsCollapsed(!isCollapsed);
              }
            }}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
          >
            {isOpen ? <ChevronLeft className="w-5 h-5" /> : (isCollapsed ? <Menu className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />)}
          </button>
        </div>
        
        <div className="flex-1 py-4 overflow-y-auto px-3 flex flex-col hide-scrollbar">
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isSubMenu = !!item.items;
              const isOpenMenu = openSubmenu === item.label;
              const isActiveParent = isSubMenu && item.items?.some(sub => location.pathname === sub.to);
              const isCollapsedMode = isCollapsed && !isOpen;

              if (isSubMenu) {
                return (
                  <div key={item.label} className="space-y-1">
                    <button
                      onClick={() => toggleSubmenu(item.label)}
                      title={isCollapsedMode ? item.label : undefined}
                      className={cn(
                        'w-full flex items-center justify-between px-3 h-11 rounded-xl transition-all cursor-pointer group',
                        isActiveParent ? 'bg-blue-50/50 text-[#0C4196]' : 'hover:bg-slate-50 text-slate-500 hover:text-slate-900',
                        isCollapsedMode && "justify-center px-0"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <item.icon className="shrink-0 w-5 h-5" />
                        {!isCollapsedMode && <span className="text-sm font-semibold">{item.label}</span>}
                      </div>
                      {!isCollapsedMode && (
                        isOpenMenu ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                    
                    {isOpenMenu && !isCollapsedMode && (
                      <div className="pl-6 space-y-1 mt-1 border-l-2 border-slate-100 ml-5">
                        {item.items?.map((sub) => (
                          <NavLink
                            key={sub.to}
                            to={sub.to}
                            onClick={() => {
                              if (isOpen && onClose) onClose();
                            }}
                            className={({ isActive }) =>
                              cn(
                                'flex items-center gap-3 px-3 h-9 rounded-lg transition-all cursor-pointer group',
                                isActive 
                                  ? 'text-[#0C4196] font-bold bg-blue-50' 
                                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                              )
                            }
                          >
                            <span className="text-sm">{sub.label}</span>
                          </NavLink>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <NavLink
                  key={item.to}
                  to={item.to!}
                  onClick={() => {
                    if (isOpen && onClose) onClose();
                  }}
                  title={isCollapsedMode ? item.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 h-11 rounded-xl transition-all cursor-pointer group',
                      isActive 
                        ? 'bg-blue-50 text-[#0C4196] font-semibold' 
                        : 'hover:bg-slate-50 text-slate-500 hover:text-slate-900',
                      isCollapsedMode && "justify-center px-0"
                    )
                  }
                >
                  <item.icon className="shrink-0 w-5 h-5" />
                  {!isCollapsedMode && <span className="text-sm">{item.label}</span>}
                </NavLink>
              );
            })}
          </nav>
        </div>
        
        <div className="p-4 border-t border-slate-100">
          <div className={cn(
            "flex items-center gap-3 p-2 rounded-xl transition-all",
            (isCollapsed && !isOpen) ? "justify-center" : "bg-slate-50"
          )}>
            <div className="w-10 h-10 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-sm font-bold text-indigo-700 shadow-sm shrink-0">
              {initials}
            </div>
            {(!isCollapsed || isOpen) && (
              <div className="overflow-hidden">
                <p className="text-sm font-bold text-slate-900 truncate">{appUser?.name || 'User'}</p>
                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">{appUser?.role || 'Staf'}</p>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
