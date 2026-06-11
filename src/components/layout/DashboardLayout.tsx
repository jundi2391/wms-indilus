import { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { LogOut, Search, Bell, Menu as Hamburger } from 'lucide-react';

export function DashboardLayout() {
  const { user, isReady } = useAuthStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  if (!isReady) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;

  const handleLogout = () => {
    signOut(auth);
  };

  return (
    <div className="flex h-screen w-full bg-[#f8f9fa] font-sans text-slate-800 overflow-hidden relative">
      <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
      
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8 shrink-0">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-slate-50 text-slate-500 transition-colors"
            >
              <Hamburger className="w-6 h-6" />
            </button>
            <h1 className="text-lg font-bold tracking-tight text-slate-700 truncate">Manajemen Inventaris</h1>
          </div>
          <div className="flex items-center gap-3 md:gap-6">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg">
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50"></div>
               <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-nowrap">Sistem Aktif</span>
            </div>
            <button onClick={handleLogout} className="text-slate-500 hover:text-red-600 px-2 py-2 md:px-3 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-8">
          <Outlet />
        </main>
      </div>

      <div className="fixed bottom-6 right-8 hidden sm:block pointer-events-none z-50">
        <div className="bg-[#1E293B] text-white p-3 rounded-lg shadow-2xl flex items-center gap-4 border border-white/10 pointer-events-auto">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-xs font-mono">SCANNER READY</span>
        </div>
      </div>
    </div>
  );
}
