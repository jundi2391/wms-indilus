import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileDown, Calendar, Filter, Loader2, Download, Table as TableIcon, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { collection, onSnapshot, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

export function Reports() {
  const [loading, setLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  
  // Data for reports
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [expeditions, setExpeditions] = useState<any[]>([]);

  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, 'products'), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubCategories = onSnapshot(collection(db, 'categories'), (snap) => {
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubWarehouses = onSnapshot(collection(db, 'warehouses'), (snap) => {
      setWarehouses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubSuppliers = onSnapshot(collection(db, 'suppliers'), (snap) => {
      setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubCustomers = onSnapshot(collection(db, 'customers'), (snap) => {
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubExpeditions = onSnapshot(collection(db, 'expeditions'), (snap) => {
      setExpeditions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubProducts();
      unsubCategories();
      unsubWarehouses();
      unsubSuppliers();
      unsubCustomers();
      unsubExpeditions();
    };
  }, []);

  const exportToExcel = async (reportType: 'inbound' | 'outbound' | 'inventory') => {
    setLoading(true);
    try {
      const start = startOfMonth(parseISO(selectedMonth + '-01')).getTime();
      const end = endOfMonth(parseISO(selectedMonth + '-01')).getTime();

      let data: any[] = [];
      let filename = '';

      if (reportType === 'inbound') {
        const q = query(collection(db, 'inbounds'), where('createdAt', '>=', start), where('createdAt', '<=', end), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        
        snap.docs.forEach(doc => {
          const d = doc.data();
          const supplier = suppliers.find(s => s.id === d.supplierId)?.name || 'Pemasok Umum';
          const warehouse = warehouses.find(w => w.id === d.warehouseId)?.name || 'Gudang Umum';
          
          if (d.items && d.items.length > 0) {
            d.items.forEach((item: any) => {
              data.push({
                'No Inbound': d.inboundNumber,
                'No DO Pemasok': d.supplierSjNumber || '-',
                'No PO': d.poNumber || '-',
                'Tanggal': format(d.createdAt, 'dd-MM-yyyy'),
                'Jam': format(d.createdAt, 'HH:mm'),
                'Nama Pemasok': supplier,
                'Gudang': warehouse,
                'SKU': item.product?.sku || '-',
                'Nama Barang': item.product?.name || 'Produk Tidak Diketahui',
                'Qty': item.qty || 0,
                'Satuan': item.product?.unit || 'Pcs',
                'Catatan': d.notes || '-'
              });
            });
          }
        });
        filename = `Laporan_Barang_Masuk_${selectedMonth}.xlsx`;
      } else if (reportType === 'outbound') {
        const q = query(collection(db, 'delivery_orders'), where('createdAt', '>=', start), where('createdAt', '<=', end), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        
        const underlyingDocs = await getDocs(collection(db, 'underlying_pos'));
        const undPos = underlyingDocs.docs.map(x => ({id: x.id, ...x.data() as any}));

        const supplyDocs = await getDocs(collection(db, 'supply_pos'));
        const supplyPos = supplyDocs.docs.map(x => ({id: x.id, ...x.data() as any}));
        
        snap.docs.forEach(doc => {
          const d = doc.data();
          const customer = customers.find(c => c.id === d.customerId)?.name || 'Pelanggan Umum';
          const warehouse = warehouses.find(w => w.id === d.warehouseId)?.name || 'Gudang Umum';
          const courier = expeditions.find(e => e.id === d.expeditionId)?.name || '-';
          const uPoObj = undPos.find(u => u.id === d.underlyingPoId);
          const sPoObj = supplyPos.find(s => s.id === d.supplyPoId);

          if (d.items && d.items.length > 0) {
            d.items.forEach((item: any) => {
              data.push({
                'No DO': d.doNumber,
                'No Underlying PO': uPoObj?.poNumber || d.poNumber || '-',
                'No Supply PO': sPoObj?.supplyPoNumber || '-',
                'Tanggal': format(d.createdAt, 'dd-MM-yyyy'),
                'Jam': format(d.createdAt, 'HH:mm'),
                'Nama Pelanggan': customer,
                'Alamat Pengiriman': d.shippingAddress || '-',
                'Kurir/Ekspedisi': courier,
                'Gudang Asal': warehouse,
                'SKU': item.product?.sku || '-',
                'Nama Barang': item.product?.name || 'Produk Tidak Diketahui',
                'Qty': item.qty || 0,
                'Satuan': item.product?.unit || 'Pcs',
                'Status DO': d.status || 'Verified',
                'Catatan': d.notes || '-'
              });
            });
          }
        });
        filename = `Laporan_Barang_Keluar_${selectedMonth}.xlsx`;
      } else if (reportType === 'inventory') {
        const invSnap = await getDocs(collection(db, 'inventory'));
        data = invSnap.docs.map(doc => {
          const d = doc.data();
          const product = products.find(p => p.id === d.productId);
          const warehouse = warehouses.find(w => w.id === d.warehouseId)?.name || 'Gudang Umum';
          return {
            'SKU': product?.sku || '-',
            'Nama Produk': product?.name || 'Produk Tidak Diketahui',
            'Kategori': categories.find(c => c.id === product?.categoryId)?.name || '-',
            'Gudang': warehouse,
            'Stok Tersedia (Available)': d.availableQty || 0,
            'Stok Dipesan (Reserved)': d.reservedQty || 0,
            'Stok Rusak/Refund (Damaged)': d.damagedQty || 0,
            'Total Stok (On Hand)': (d.availableQty || 0) + (d.reservedQty || 0) + (d.damagedQty || 0),
            'Satuan': product?.unit || 'Pcs',
            'Minimum Stok': product?.minStock || 0
          };
        });
        filename = `Laporan_Inventaris_Lengkap_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      }

      if (data.length === 0) {
        toast.info('Tidak ada data untuk periode ini');
        return;
      }

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
      XLSX.writeFile(workbook, filename);
      toast.success('Laporan berhasil diunduh');
    } catch (error: any) {
      console.error(error);
      toast.error('Gagal mengunduh laporan: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 leading-none">Laporan & Analitik</h2>
          <p className="text-sm md:text-base text-slate-500 font-medium mt-2">Unduh laporan operasional dalam format Excel</p>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm border-none bg-slate-50 p-6 rounded-3xl">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Pilih Periode Bulan</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="month" 
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="pl-10 pr-4 h-11 bg-white border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-slate-200 shadow-sm rounded-3xl overflow-hidden hover:border-blue-200 transition-all group">
          <CardHeader className="bg-slate-50/50">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mb-2">
              <ArrowDownToLine className="w-5 h-5 text-emerald-600" />
            </div>
            <CardTitle className="text-lg font-bold text-slate-800">Barang Masuk</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500 mb-6">Laporan detail semua penerimaan barang dalam periode terpilih.</p>
            <button 
              onClick={() => exportToExcel('inbound')}
              disabled={loading}
              className="w-full h-11 bg-[#0C4196] hover:bg-[#093175] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Unduh Excel
            </button>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm rounded-3xl overflow-hidden hover:border-blue-200 transition-all group">
          <CardHeader className="bg-slate-50/50">
            <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center mb-2">
              <ArrowUpFromLine className="w-5 h-5 text-orange-600" />
            </div>
            <CardTitle className="text-lg font-bold text-slate-800">Barang Keluar</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500 mb-6">Laporan detail semua pengiriman barang dan DO dalam periode terpilih.</p>
            <button 
              onClick={() => exportToExcel('outbound')}
              disabled={loading}
              className="w-full h-11 bg-[#0C4196] hover:bg-[#093175] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Unduh Excel
            </button>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm rounded-3xl overflow-hidden hover:border-blue-200 transition-all group">
          <CardHeader className="bg-slate-50/50">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-2">
              <TableIcon className="w-5 h-5 text-blue-600" />
            </div>
            <CardTitle className="text-lg font-bold text-slate-800">Status Inventaris</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500 mb-6">Laporan posisi stok saat ini untuk semua produk di semua gudang.</p>
            <button 
              onClick={() => exportToExcel('inventory')}
              disabled={loading}
              className="w-full h-11 bg-[#0C4196] hover:bg-[#093175] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Unduh Excel
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
