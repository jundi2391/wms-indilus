import { Outlet, Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { LogOut, Search, Bell } from 'lucide-react';

export function DashboardLayout() {
  const { user, isReady } = useAuthStore();

  if (!isReady) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;

  const handleLogout = () => {
    signOut(auth);
  };

  return (
    <div className="flex h-screen w-full bg-[#f8f9fa] font-sans text-slate-800 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center">
            <h1 className="text-lg font-bold tracking-tight text-slate-700">Manajemen Inventaris</h1>
          </div>
          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg">
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50"></div>
               <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sistem Aktif</span>
            </div>
            <button onClick={handleLogout} className="text-slate-500 hover:text-red-600 px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all">
              <LogOut className="w-4 h-4" />
              Keluar
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-8">
          <Outlet />
        </main>
      </div>

      <div className="fixed bottom-6 right-8 pointer-events-none z-50">
        <div className="bg-[#1E293B] text-white p-3 rounded-lg shadow-2xl flex items-center gap-4 border border-white/10 pointer-events-auto">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-xs font-mono">SCANNER READY</span>
        </div>
      </div>
    </div>
  );
}
