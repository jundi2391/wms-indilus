import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { auth } from '@/lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { Package, User, Lock, ArrowRight, Loader2 } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';

export function Login() {
  const { user, isReady } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('Indilus@2026');

  if (!isReady) return <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center">Memuat...</div>;
  if (user) return <Navigate to="/" replace />;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Map 'admin' to an email for Firebase Auth
    const email = username.includes('@') ? username : `${username}@corehub.local`;

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch(err: any) {
      console.error('Login Error:', err.code, err.message);
      
      // auth/invalid-credential can mean wrong password OR user not found (in newer Firebase versions)
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        // For the requested "DEFAULT", if login fails, we attempt to auto-provision strictly for the 'admin' account
        if (username === 'admin' && password === 'Indilus@2026') {
          try {
             await createUserWithEmailAndPassword(auth, email, password);
             toast.success('Akun Admin berhasil diinisialisasi.');
          } catch(createErr: any) {
            console.error('Creation Error:', createErr.code, createErr.message);
            if (createErr.code === 'auth/email-already-in-use') {
              toast.error('Kesalahan akun. Akun Admin sudah ada dengan kata sandi yang berbeda.');
            } else if (createErr.code === 'auth/operation-not-allowed') {
              toast.error('Provider email dinonaktifkan di Firebase.');
            } else {
              toast.error('Koneksi gagal. Mohon periksa jaringan Anda.');
            }
          }
        } else {
          toast.error('Username atau kata sandi salah');
        }
      } else if (err.code === 'auth/operation-not-allowed') {
        toast.error('Provider login tidak diaktifkan.');
      } else {
        toast.error(err.message || 'Login gagal');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col items-center justify-center p-6 relative">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10 text-center">
            <img 
               src="https://storage.googleapis.com/static.antigravity.ai/samples/core-hub-logo.png" 
               alt="CoreHub" 
               className="h-16 mb-8 object-contain"
             />
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Masuk ke Portal</h1>
          <p className="text-slate-500 text-sm mt-1">Gunakan akun administrator Anda</p>
        </div>
        
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">Username</label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-white border border-slate-200 py-2.5 pl-10 pr-4 rounded-lg text-sm font-medium focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196] outline-none transition-all placeholder:text-slate-300"
                  placeholder="Username"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white border border-slate-200 py-2.5 pl-10 pr-4 rounded-lg text-sm font-medium focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196] outline-none transition-all placeholder:text-slate-300"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#0C4196] text-white py-3 rounded-lg font-bold text-sm hover:bg-[#0C4196]/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Masuk ke Panel
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest">
            Sistem Manajemen Inventaris © 2026
          </p>
        </div>
      </div>
    </div>
  );
}
