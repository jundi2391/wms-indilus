import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PackageOpen, ArrowRightLeft, ArrowDownToLine, ArrowUpFromLine, Loader2, Package, Activity, TrendingUp, TrendingDown } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { collection, onSnapshot, query, limit, orderBy, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, subDays, startOfDay } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

export function Dashboard() {
  const { appUser } = useAuthStore();
  const [stats, setStats] = useState({
    totalProducts: 0,
    stockValue: 0,
    todayInbound: 0,
    totalStockCount: 0
  });

  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [trendData, setTrendData] = useState<{ day: string, inbound: number, outbound: number }[]>([]);
  const [loading, setLoading] = useState(true);

  // References for mapping
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [inbounds, setInbounds] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);

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
      setDeliveries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 2. Fetch Inventory for Stats
    const unsubInventory = onSnapshot(collection(db, 'inventory'), (snap) => {
      let totalVal = 0;
      let totalQty = 0;
      const items = snap.docs.map(d => d.data());
      
      items.forEach(inv => {
        // Use the current products list from outside the effector
        totalQty += (inv.availableQty || 0);
      });
      setStats(prev => ({ ...prev, totalStockCount: totalQty }));
    });

    // 3. Recent Transactions
    const qRecent = query(collection(db, 'inventory_transactions'), orderBy('createdAt', 'desc'), limit(10));
    const unsubRecent = onSnapshot(qRecent, (snap) => {
      setRecentTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    // 4. Trend Data (Last 7 Days)
    const sevenDaysAgo = subDays(startOfDay(new Date()), 7).getTime();
    const qTrend = query(collection(db, 'inventory_transactions'), where('createdAt', '>=', sevenDaysAgo), orderBy('createdAt', 'asc'));
    const unsubTrend = onSnapshot(qTrend, (snap) => {
       const idDays = ['MIN', 'SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB'];
       const last7Days = Array.from({ length: 7 }).map((_, i) => {
          const date = subDays(new Date(), 6 - i);
          return {
             day: idDays[date.getDay()],
             date: date.toDateString(),
             inbound: 0,
             outbound: 0
          };
       });

       snap.docs.forEach(d => {
          const data = d.data();
          const txDate = new Date(data.createdAt).toDateString();
          const dayObj = last7Days.find(ld => ld.date === txDate);
          if (dayObj) {
             if (data.transactionType === 'inbound') dayObj.inbound += (data.qtyIn || 0);
             if (data.transactionType === 'outbound') dayObj.outbound += (data.qtyOut || 0);
          }
       });

       setTrendData(last7Days);
    });

    return () => {
      unsubProducts();
      unsubCustomers();
      unsubSuppliers();
      unsubInbounds();
      unsubDeliveries();
      unsubInventory();
      unsubRecent();
      unsubTrend();
    };
  }, []);

  // Calculate stock value whenever products or inventory change (simplified by fetching separately if needed)
  useEffect(() => {
    const fetchValue = async () => {
      const snap = await getDocs(collection(db, 'inventory'));
      let val = 0;
      snap.docs.forEach(d => {
        const inv = d.data();
        const product = products.find(p => p.id === inv.productId);
        if (product) {
          val += (product.price || 0) * (inv.availableQty || 0);
        }
      });
      setStats(prev => ({ ...prev, stockValue: val }));
    };
    if (products.length > 0) fetchValue();
  }, [products]);

  const enhancedTransactions = recentTransactions.map(tx => {
    const product = products.find(p => p.id === tx.productId);
    let refDetails = '-';
    let partnerName = '-';

    if (tx.referenceType === 'delivery_order') {
       const delivery = deliveries.find(d => d.id === tx.referenceId);
       if (delivery) {
          refDetails = delivery.doNumber;
          partnerName = customers.find(c => c.id === delivery.customerId)?.name || 'Pelanggan Umum';
       }
    } else if (tx.referenceType === 'inbound') {
       const inbound = inbounds.find(i => i.id === tx.referenceId);
       if (inbound) {
          refDetails = inbound.inboundNumber;
          partnerName = suppliers.find(s => s.id === inbound.supplierId)?.name || 'Pemasok Umum';
       }
    }

    return {
      ...tx,
      productName: product?.name || 'Produk Tidak Diketahui',
      sku: product?.sku || '-',
      refDetails,
      partnerName
    };
  });

  return (
    <div className="flex flex-col h-full space-y-10 max-w-[1400px] mx-auto pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 leading-none">Dashboard</h2>
          <p className="text-slate-500 font-medium mt-2">Selamat datang kembali, <span className="text-[#0C4196] font-bold">{appUser?.name}</span>.</p>
        </div>
        <div className="flex items-center gap-6">
           <div className="text-right">
             <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Waktu Sistem</p>
             <p className="text-xl font-bold text-slate-800">{format(new Date(), 'HH:mm:ss')}</p>
           </div>
           <div className="w-[1px] h-10 bg-slate-200"></div>
           <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
              <Activity className="w-6 h-6 text-[#0C4196]" />
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Produk', value: stats.totalProducts, sub: 'Produk terdaftar', icon: Package, color: 'blue' },
          { label: 'Stok Terdaftar', value: stats.totalStockCount, sub: 'Unit tersedia', icon: PackageOpen, color: 'blue' },
          { label: 'Nilai Inventaris', value: `Rp ${stats.stockValue.toLocaleString('id-ID')}`, sub: 'Estimasi nilai', icon: TrendingUp, color: 'blue' },
          { label: 'Inbound Hari Ini', value: stats.todayInbound, sub: 'Penerimaan hari ini', icon: ArrowDownToLine, color: 'blue' },
        ].map((kpi, idx) => (
          <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm group hover:border-[#0C4196] transition-all">
             <div className="flex justify-between items-start mb-4">
               <div className="p-3 rounded-xl bg-slate-50 group-hover:bg-blue-50">
                  <kpi.icon className="w-5 h-5 text-[#0C4196]" />
               </div>
             </div>
             <p className="text-xs font-bold text-slate-500 mb-1">{kpi.label}</p>
             <h3 className="text-2xl font-bold text-slate-900">{kpi.value}</h3>
             <p className="text-[11px] text-slate-400 mt-1">{kpi.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-8 items-stretch">
        <div className="col-span-12 lg:col-span-8 bg-white rounded-3xl border border-slate-200 p-8 shadow-sm flex flex-col h-[450px]">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h4 className="text-xl font-bold text-slate-900">Tren Pergerakan Barang</h4>
              <p className="text-sm text-slate-500">Statistik keluar masuk 7 hari terakhir</p>
            </div>
          </div>

          <div className="flex-1 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis 
                  dataKey="day" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#64748B' }} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#64748B' }} 
                />
                <Tooltip 
                  cursor={{ fill: '#F8FAFC' }}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', fontWeight: 'bold' }}
                />
                <Legend 
                  verticalAlign="top" 
                  align="right" 
                  iconType="circle" 
                  wrapperStyle={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', paddingBottom: '20px' }}
                />
                <Bar name="Masuk" dataKey="inbound" fill="#0C4196" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar name="Keluar" dataKey="outbound" fill="#2EB9FF" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 bg-white border border-slate-200 rounded-3xl p-8 shadow-sm flex flex-col h-[450px]">
          <h4 className="text-xl font-bold text-slate-900 mb-8">Aktivitas Terkini</h4>

          <div className="space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar focus:outline-none">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                 <Loader2 className="w-8 h-8 animate-spin text-[#0C4196]" />
              </div>
            ) : enhancedTransactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                 <Package className="w-10 h-10 mb-2 opacity-20" />
                 <p className="text-xs font-bold uppercase">Tidak ada aktivitas</p>
              </div>
            ) : (
              enhancedTransactions.map((tx, idx) => (
                <div key={idx} className="flex gap-4 group">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-slate-100 ${tx.transactionType === 'inbound' ? 'bg-emerald-50' : tx.transactionType === 'outbound' ? 'bg-orange-50' : 'bg-blue-50'}`}>
                    {tx.transactionType === 'inbound' ? (
                      <ArrowDownToLine className="w-5 h-5 text-emerald-600" />
                    ) : tx.transactionType === 'outbound' ? (
                      <ArrowUpFromLine className="w-5 h-5 text-orange-600" />
                    ) : (
                      <ArrowRightLeft className="w-5 h-5 text-blue-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <p className="text-sm font-bold text-slate-800">
                        {tx.transactionType === 'inbound' ? 'Penerimaan Barang' : tx.transactionType === 'outbound' ? 'Pengiriman Barang' : 'Penyesuaian Stok'}
                      </p>
                      <span className="text-[10px] font-medium text-slate-400">{format(tx.createdAt, 'HH:mm')}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                       <p className="text-[11px] font-bold text-[#0C4196] uppercase">{tx.productName}</p>
                       <p className="text-[10px] text-slate-500 font-medium">Ref: <span className="font-mono font-bold text-slate-700">{tx.refDetails}</span> | {tx.partnerName}</p>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                       <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${tx.transactionType === 'inbound' ? 'bg-emerald-100 text-emerald-700' : tx.transactionType === 'outbound' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-700'}`}>
                         {tx.qtyIn > 0 ? `+${tx.qtyIn}` : `-${tx.qtyOut}`} Unit
                       </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
