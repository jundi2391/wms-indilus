import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PackageOpen, ArrowRightLeft, ArrowDownToLine, ArrowUpFromLine, Loader2, Package, Activity, TrendingUp, TrendingDown, Building2 } from 'lucide-react';
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
    todayOutbound: 0,
    totalStockCount: 0
  });

  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
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
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setInventory(items);
      
      items.forEach((inv: any) => {
        totalQty += (inv.availableQty || 0);
      });
      setStats(prev => ({ ...prev, totalStockCount: totalQty }));
    });

    const unsubWarehouses = onSnapshot(collection(db, 'warehouses'), (snap) => {
      setWarehouses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 3. Recent Transactions
    const qRecent = query(collection(db, 'inventory_transactions'), orderBy('createdAt', 'desc'), limit(15));
    const unsubRecent = onSnapshot(qRecent, (snap) => {
      setRecentTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => {
      unsubProducts();
      unsubCustomers();
      unsubSuppliers();
      unsubInbounds();
      unsubDeliveries();
      unsubInventory();
      unsubRecent();
      unsubWarehouses();
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
    <div className="flex flex-col h-full space-y-6 md:space-y-10 max-w-[1400px] mx-auto pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-6 md:p-8 rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 leading-none">Dashboard</h2>
          <p className="text-slate-500 font-medium mt-2 text-sm md:text-base">Selamat datang kembali, <span className="text-[#0C4196] font-bold">{appUser?.name}</span>.</p>
        </div>
        <div className="flex items-center gap-4 md:gap-6 w-full md:w-auto justify-between md:justify-end">
           <div className="text-right">
             <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Waktu Sistem</p>
             <p className="text-lg md:text-xl font-bold text-slate-800">{format(new Date(), 'HH:mm:ss')}</p>
           </div>
           <div className="w-[1px] h-10 bg-slate-200 flex shrink-0"></div>
           <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5 md:w-6 md:h-6 text-[#0C4196]" />
           </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-6">
        {[
          { label: 'Total Produk', value: stats.totalProducts, sub: 'Varian terdaftar', icon: Package },
          { label: 'Stok On-Hand', value: stats.totalStockCount, sub: 'Unit tersedia', icon: PackageOpen },
          { label: 'Inbound Hari Ini', value: stats.todayInbound, sub: 'Penerimaan', icon: ArrowDownToLine },
          { label: 'Outbound Hari Ini', value: stats.todayOutbound, sub: 'Pengiriman', icon: ArrowUpFromLine },
          { label: 'Nilai Inventaris', value: `Rp ${stats.stockValue.toLocaleString('id-ID')}`, sub: 'Estimasi', icon: TrendingUp, fullRow: true },
        ].map((kpi, idx) => (
          <div key={idx} className={cn(
            "bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-sm group hover:border-[#0C4196] transition-all",
            kpi.fullRow && "col-span-2 md:col-span-1 lg:col-span-1"
          )}>
             <div className="flex justify-between items-start mb-2 md:mb-3">
               <div className="p-2 rounded-xl bg-slate-50 group-hover:bg-blue-50">
                  <kpi.icon className="w-4 h-4 text-[#0C4196]" />
               </div>
             </div>
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{kpi.label}</p>
             <h3 className="text-base md:text-xl font-bold text-slate-900 truncate">{kpi.value}</h3>
             <p className="text-[10px] text-slate-400 mt-0.5">{kpi.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-6 md:gap-8 items-stretch">
        <div className="col-span-12 lg:col-span-8 bg-white rounded-2xl md:rounded-3xl border border-slate-200 p-6 md:p-8 shadow-sm flex flex-col min-h-[400px] md:min-h-[450px]">
          <div className="flex items-center justify-between mb-6 md:mb-8">
            <div>
              <h4 className="text-lg md:text-xl font-bold text-slate-900">Status Gudang</h4>
              <p className="text-xs md:text-sm text-slate-500">Ringkasan stok per lokasi</p>
            </div>
            <Building2 className="w-5 h-5 md:w-6 md:h-6 text-slate-300" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
            {warehouses.length === 0 ? (
              <div className="col-span-2 flex items-center justify-center h-40 text-slate-400 italic text-sm">
                Belum ada data gudang
              </div>
            ) : (
              warehouses.map(w => {
                const warehouseItems = inventory.filter(inv => inv.warehouseId === w.id);
                const totalQty = warehouseItems.reduce((sum, inv) => sum + (inv.availableQty || 0), 0);
                const distinctProducts = new Set(warehouseItems.map(inv => inv.productId)).size;

                return (
                  <div key={w.id} className="p-5 border border-slate-100 rounded-2xl bg-slate-50/50 hover:bg-white hover:shadow-md hover:border-blue-100 transition-all group">
                    <div className="flex justify-between items-start mb-4">
                      <div className="space-y-1">
                        <h5 className="font-bold text-slate-900 tracking-tight">{w.name}</h5>
                        <p className="text-[10px] text-slate-500 uppercase font-medium">{w.location || 'Lokasi tidak diset'}</p>
                      </div>
                      <div className="px-2 py-1 bg-white rounded-lg border border-slate-100 shadow-sm">
                        <span className="text-[10px] font-bold text-[#0C4196]">{totalQty.toLocaleString()} Unit</span>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                       <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                          <div 
                            className="bg-[#0C4196] h-full rounded-full group-hover:bg-[#2EB9FF] transition-all" 
                            style={{ width: `${Math.min(100, (totalQty / 1000) * 100)}%` }} // Dummy capacity calculation
                          />
                       </div>
                       <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
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
