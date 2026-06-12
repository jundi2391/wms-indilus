import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PackageOpen, ArrowRightLeft, ArrowDownToLine, ArrowUpFromLine, Loader2, Package, Activity, TrendingUp, TrendingDown, Building2, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { collection, onSnapshot, query, limit, orderBy, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, subDays, startOfDay } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';

export function Dashboard() {
  const { appUser } = useAuthStore();
  const [stats, setStats] = useState({
    totalProducts: 0,
    todayInbound: 0,
    todayOutbound: 0,
    totalStockCount: 0,
    totalOnHand: 0,
    totalDamaged: 0,
  });

  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  // References for mapping
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [inbounds, setInbounds] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);

  useEffect(() => {
    // Dynamic system clock
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // 1. Fetch Static/Reference Data
    const unsubProducts = onSnapshot(collection(db, 'products'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setProducts(list);
      setStats(prev => ({ ...prev, totalProducts: list.length }));
    });

    const unsubCustomers = onSnapshot(collection(db, 'customers'), (snap) => {
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubSuppliers = onSnapshot(collection(db, 'suppliers'), (snap) => {
      setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubInbounds = onSnapshot(collection(db, 'inbounds'), (snap) => {
      setInbounds(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      // Also update today's stats
      const today = new Date().toDateString();
      const todayCount = snap.docs.filter(d => new Date(d.data().createdAt).toDateString() === today).length;
      setStats(prev => ({ ...prev, todayInbound: todayCount }));
    });

    const unsubDeliveries = onSnapshot(collection(db, 'delivery_orders'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setDeliveries(list);
      
      const today = new Date().toDateString();
      const todayCount = list.filter((d: any) => {
        const date = d.createdAt ? new Date(d.createdAt).toDateString() : '';
        return date === today;
      }).length;
      setStats(prev => ({ ...prev, todayOutbound: todayCount }));
    });

    const unsubInventory = onSnapshot(collection(db, 'inventory'), (snap) => {
      let totalQty = 0;
      let totalOnHand = 0;
      let totalDamaged = 0;
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setInventory(items);
      
      items.forEach((inv: any) => {
        const oh = Number(inv.onHandQty) || 0;
        const dmg = Number(inv.damagedQty) || 0;
        totalOnHand += oh;
        totalDamaged += dmg;
        totalQty += (oh + dmg);
      });
      setStats(prev => ({ ...prev, totalStockCount: totalQty, totalOnHand, totalDamaged }));
      setLoading(false);
    });

    const unsubWarehouses = onSnapshot(collection(db, 'warehouses'), (snap) => {
      setWarehouses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubProducts();
      unsubCustomers();
      unsubSuppliers();
      unsubInbounds();
      unsubDeliveries();
      unsubInventory();
      unsubWarehouses();
    };
  }, []);

  return (
    <div className="flex flex-col h-full space-y-6 md:space-y-10 max-w-[1400px] mx-auto pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-6 md:p-8 rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 leading-none">Dashboard</h2>
          <p className="text-slate-500 font-medium mt-2 text-sm md:text-base">Selamat datang kembali, <span className="text-[#0C4196] font-bold">{appUser?.name}</span>.</p>
        </div>
        <div className="flex items-center gap-4 md:gap-6 w-full md:w-auto justify-between md:justify-end">
           <div className="text-right flex flex-col items-end">
             <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Waktu Sistem</p>
             <p className="text-xl md:text-2xl font-bold text-slate-800 font-mono tracking-tight tabular-nums flex items-baseline gap-1">
                {format(currentTime, 'HH')}
                <span className="text-slate-300 animate-pulse">:</span>
                {format(currentTime, 'mm')}
                <span className="text-slate-300 animate-pulse">:</span>
                <span className="text-[#0C4196]">{format(currentTime, 'ss')}</span>
             </p>
           </div>
           <div className="w-[1px] h-10 bg-slate-200 flex shrink-0"></div>
           <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5 md:w-6 md:h-6 text-[#0C4196]" />
           </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 md:gap-6">
        {[
          { label: 'Total Produk', value: stats.totalProducts, sub: 'Varian terdaftar', icon: Package },
          { label: 'Total Stok', value: stats.totalStockCount, sub: 'Semua unit', icon: PackageOpen },
          { label: 'Stok On-Hand', value: stats.totalOnHand, sub: 'Unit OK', icon: Package },
          { label: 'Stok Damaged', value: stats.totalDamaged, sub: 'Rusak/Retur', icon: AlertTriangle },
          { label: 'Inbound Hari Ini', value: stats.todayInbound, sub: 'Penerimaan', icon: ArrowDownToLine },
          { label: 'Outbound Hari Ini', value: stats.todayOutbound, sub: 'Pengiriman', icon: ArrowUpFromLine },
        ].map((kpi, idx) => (
          <div key={idx} className={cn(
            "bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-sm group hover:border-[#0C4196] transition-all"
          )}>
             <div className="flex justify-between items-start mb-2 md:mb-3">
               <div className="p-2 rounded-xl bg-slate-50 group-hover:bg-blue-50">
                  <kpi.icon className={cn("w-4 h-4", kpi.label === 'Stok Damaged' ? 'text-red-500' : 'text-[#0C4196]')} />
               </div>
             </div>
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{kpi.label}</p>
             {loading ? (
               <Skeleton className="h-6 w-24 my-0.5" />
             ) : (
               <h3 className="text-base md:text-xl font-bold text-slate-900 truncate">{kpi.value}</h3>
             )}
             <p className="text-[10px] text-slate-400 mt-0.5">{kpi.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-6 md:gap-8 items-stretch">
        <div className="col-span-12 bg-white rounded-2xl md:rounded-3xl border border-slate-200 p-6 md:p-8 shadow-sm flex flex-col min-h-[400px]">
          <div className="flex items-center justify-between mb-6 md:mb-8">
            <div>
              <h4 className="text-lg md:text-xl font-bold text-slate-900">Status Gudang</h4>
              <p className="text-xs md:text-sm text-slate-500">Ringkasan stok per lokasi</p>
            </div>
            <Building2 className="w-5 h-5 md:w-6 md:h-6 text-slate-300" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 flex-1">
            {loading ? (
              Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="p-5 border border-slate-100 rounded-2xl bg-slate-50/50 flex flex-col justify-between h-[132px]">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1.5 flex-1 pr-4">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    <Skeleton className="h-5 w-16" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-1.5 w-full rounded" />
                    <div className="flex justify-between">
                      <Skeleton className="h-3 w-10" />
                      <Skeleton className="h-3 w-10" />
                    </div>
                  </div>
                </div>
              ))
            ) : warehouses.length === 0 ? (
              <div className="col-span-12 flex items-center justify-center h-40 text-slate-400 italic text-sm">
                Belum ada data gudang
              </div>
            ) : (
              warehouses.map(w => {
                const warehouseItems = inventory.filter(inv => inv.warehouseId === w.id);
                const totalQty = warehouseItems.reduce((sum, inv) => sum + (inv.onHandQty || 0) + (inv.damagedQty || 0), 0);
                const distinctProducts = new Set(warehouseItems.map(inv => inv.productId)).size;

                return (
                  <div key={w.id} className="p-5 border border-slate-100 rounded-2xl bg-slate-50/50 hover:bg-white hover:shadow-md hover:border-blue-100 transition-all group">
                    <div className="flex justify-between items-start mb-4">
                      <div className="space-y-1">
                        <h5 className="font-bold text-slate-900 tracking-tight leading-tight">{w.name}</h5>
                        <p className="text-[10px] text-slate-500 uppercase font-medium mt-1">{w.location || 'Lokasi tidak diset'}</p>
                      </div>
                      <div className="px-2 py-1 bg-white rounded-lg border border-slate-100 shadow-sm shrink-0">
                        <span className="text-[10px] font-bold text-[#0C4196]">{totalQty.toLocaleString()} Unit</span>
                      </div>
                    </div>
                    
                    <div className="space-y-3 mt-auto">
                       <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-4">
                          <span>{distinctProducts} SKU</span>
                          <span>{w.type || 'Storage'}</span>
                       </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

