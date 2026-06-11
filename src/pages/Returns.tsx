import React, { useState, useEffect } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Reply, Search, AlertCircle, CheckCircle2, History, Trash2, ArrowRight } from 'lucide-react';
import { collection, query, onSnapshot, addDoc, doc, runTransaction, getDocs, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/authStore';
import { format } from 'date-fns';

export function Returns() {
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [ledgers, setLedgers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [supplyPos, setSupplyPos] = useState<any[]>([]);
  const [underlyingPos, setUnderlyingPos] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeli, setSelectedDeli] = useState<any>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [showAlloc, setShowAlloc] = useState(false);
  const { appUser } = useAuthStore();

  useEffect(() => {
    const unsubDeli = onSnapshot(query(collection(db, 'delivery_orders')), sn => {
      setDeliveries(sn.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubLedger = onSnapshot(query(collection(db, 'inventory_ledgers')), sn => {
      setLedgers(sn.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubProd = onSnapshot(query(collection(db, 'products')), sn => {
      setProducts(sn.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubSPO = onSnapshot(query(collection(db, 'supply_pos')), sn => {
      setSupplyPos(sn.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubUPO = onSnapshot(query(collection(db, 'underlying_pos')), sn => {
      setUnderlyingPos(sn.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubDeli(); unsubLedger(); unsubProd(); unsubSPO(); unsubUPO(); };
  }, []);

  const filteredDeli = deliveries.filter(d => 
    d.doNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.shippingAddress?.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort((a,b) => b.createdAt - a.createdAt);

  const handleReport = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const productId = fd.get('productId') as string;
    const qty = Number(fd.get('qty'));
    const category = fd.get('category') as string; // 'Returned' or 'Damaged'
    const notes = fd.get('notes') as string;

    if (!selectedDeli || !productId || qty <= 0) {
      toast.error('Data tidak lengkap');
      return;
    }

    const customReturnNumber = fd.get('returnNumber') as string;
    const createAllocation = fd.get('createAllocation') === 'on';
    const newSPO = fd.get('newSPO') as string;

    if (createAllocation && !newSPO) {
      toast.error('Nomor SPO Alokasi harus diisi jika ingin membuat alokasi sisa');
      return;
    }

    const reportItem = selectedDeli.items.find((it: any) => (it.productId || it.product?.id) === productId);
    if (!reportItem) {
      toast.error('Produk tidak ditemukan dalam pengiriman ini');
      return;
    }

    // Check existing reports for this DO & Product to not exceed DO qty
    const existingTotal = ledgers
      .filter(l => l.referenceId === selectedDeli.id && l.productId === productId && l.transactionType === 'OUTBOUND_DAMAGE')
      .reduce((sum, l) => sum + (l.qtyChange || 0), 0);
    
    if (existingTotal + qty > reportItem.qty) {
      toast.error(`Jumlah retur/damage melebihi sisa item di DO ini. Maksimal: ${reportItem.qty - existingTotal}`);
      return;
    }

    const loadingToast = toast.loading('Memproses laporan...');
    try {
      await runTransaction(db, async (transaction) => {
        const ledgerRef = doc(collection(db, 'inventory_ledgers'));
        transaction.set(ledgerRef, {
          transactionNumber: customReturnNumber || (category === 'Returned' ? 'RET-' : 'DAM-') + Date.now(),
          transactionType: 'OUTBOUND_DAMAGE',
          productId,
          ownerId: selectedDeli.ownerId,
          warehouseId: selectedDeli.warehouseId,
          qtyChange: qty,
          referenceType: 'DELIVERY_ORDER',
          referenceId: selectedDeli.id,
          category,
          notes,
          createdAt: Date.now(),
          createdBy: appUser?.uid
        });

        if (createAllocation && category === 'Returned') {
          const spoRef = doc(collection(db, 'supply_pos'));
          transaction.set(spoRef, {
            supplyPoNumber: newSPO,
            underlyingPoId: selectedDeli.underlyingPoId,
            ownerId: selectedDeli.ownerId,
            warehouseId: selectedDeli.warehouseId,
            items: [{ 
              productId, 
              qty, 
              shippingAddress: selectedDeli.shippingAddress 
            }],
            notes: `Auto-generated from DO Return report: ${selectedDeli.doNumber}. ${notes}`,
            createdAt: Date.now(),
            createdBy: appUser?.uid,
            status: 'Verified',
            verifiedAt: Date.now(),
            verifiedBy: appUser?.uid
          });

          // Reserve the stock
          const invId = `${selectedDeli.ownerId}_${selectedDeli.warehouseId}_${productId}`;
          const invRef = doc(db, 'inventory', invId);
          const invSnap = await transaction.get(invRef);
          
          let currentAvailable = invSnap.exists() ? (Number(invSnap.data().availableQty) || 0) : 0;
          let currentReserved = invSnap.exists() ? (Number(invSnap.data().reservedQty) || 0) : 0;

          transaction.set(invRef, {
            reservedQty: currentReserved + qty,
            availableQty: currentAvailable - qty,
            updatedAt: Date.now()
          }, { merge: true });
        }
      });

      toast.dismiss(loadingToast);
      toast.success('Laporan berhasil disimpan');
      setIsReportOpen(false);
    } catch (err: any) {
      toast.dismiss(loadingToast);
      toast.error('Gagal: ' + err.message);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 leading-none">Retur & Kerusakan</h2>
          <p className="text-sm md:text-base text-slate-500 font-medium mt-2">Kelola pengembalian barang atau laporan kerusakan setelah pengiriman (DO)</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-slate-50/50">
          <div className="relative w-full max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input 
               placeholder="Cari No. DO atau Alamat..." 
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               className="pl-9 h-10 rounded-lg bg-white border-slate-200" 
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table className="min-w-[800px]">
          <TableHeader className="bg-slate-50 border-b">
            <TableRow>
              <TableHead className="font-bold text-slate-600 text-xs pl-6">No. DO & PO</TableHead>
              <TableHead className="font-bold text-slate-600 text-xs">Tgl Kirim</TableHead>
              <TableHead className="font-bold text-slate-600 text-xs">Informasi Customer</TableHead>
              <TableHead className="font-bold text-slate-600 text-xs">Total Item</TableHead>
              <TableHead className="font-bold text-slate-600 text-xs text-center">Status Retur</TableHead>
              <TableHead className="text-right font-bold text-slate-600 text-xs pr-6">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDeli.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-20 text-slate-400">
                  <Reply className="w-12 h-12 mx-auto text-slate-200 mb-3" />
                  <p className="text-sm font-bold">Belum ada data pengiriman</p>
                </TableCell>
              </TableRow>
            ) : (
              filteredDeli.map((deli) => {
                const totalItem = deli.items?.reduce((sum: number, it: any) => sum + (it.qty || 0), 0) || 0;
                const reports = ledgers.filter(l => l.referenceId === deli.id && l.transactionType === 'OUTBOUND_DAMAGE');
                const totalReported = reports.reduce((sum, l) => sum + (l.qtyChange || 0), 0);

                return (
                  <TableRow key={deli.id} className="group transition-colors hover:bg-slate-50/50">
                    <TableCell className="pl-6">
                      <div className="font-mono text-xs font-bold text-[#0C4196] uppercase">{deli.doNumber}</div>
                      <div className="text-[9px] text-slate-400 mt-0.5 whitespace-nowrap">
                        SPO: {supplyPos.find(s => s.id === deli.supplyPoId)?.supplyPoNumber || '-'}
                      </div>
                      <div className="text-[9px] text-slate-400 mt-0.5 whitespace-nowrap">
                        UPO: {underlyingPos.find(u => u.id === deli.underlyingPoId)?.poNumber || '-'}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{format(new Date(deli.createdAt), 'dd MMM yyyy')}</TableCell>
                    <TableCell>
                      <div className="text-sm font-bold text-slate-900 truncate max-w-[200px]" title={deli.shippingAddress}>
                        {deli.shippingAddress || deli.customerName || '-'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-bold text-slate-900">{totalItem} <span className="text-[10px] text-slate-400 font-normal">PCS</span></div>
                      {totalReported > 0 && (
                        <div className="text-[10px] text-red-500 font-bold mt-0.5 uppercase tracking-wider">
                          DILAPORKAN: {totalReported}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                       {totalReported >= totalItem && totalItem > 0 ? (
                         <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-50 text-red-600 border border-red-100">FULL REFUND</span>
                       ) : totalReported > 0 ? (
                         <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-50 text-amber-600 border border-amber-100">PARTIAL REFUND</span>
                       ) : (
                         <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-50 text-emerald-600 border border-emerald-100">CLEAN</span>
                       )}
                    </TableCell>
                    <TableCell className="text-right pr-6">
                        <Dialog open={isReportOpen && selectedDeli?.id === deli.id} onOpenChange={(v) => { setIsReportOpen(v); if(v) setSelectedDeli(deli); }}>
                           <DialogTrigger nativeButton={true} render={
                              <Button size="sm" variant="outline" className="h-8 text-xs font-bold gap-1.5 border-slate-200 hover:bg-slate-50">
                                 <AlertCircle className="w-3.5 h-3.5" />
                                 Lapor Retur
                              </Button>
                           } />
                          <DialogContent className="rounded-xl sm:max-w-[600px]">
                             <DialogHeader>
                                <DialogTitle className="text-lg font-bold">Laporan Retur / Kerusakan - {deli.doNumber}</DialogTitle>
                             </DialogHeader>
                             <form onSubmit={handleReport} className="space-y-4 mt-4 text-left">
                                <div className="space-y-1.5">
                                   <Label className="text-xs font-bold text-slate-500 uppercase">Nomor Retur / Referensi (Opsional)</Label>
                                   <Input name="returnNumber" placeholder="Contoh: RET-001 / DAM-001" className="h-10" />
                                </div>
                                <div className="space-y-1.5">
                                   <Label className="text-xs font-bold text-slate-500 uppercase">Pilih Produk</Label>
                                   <select name="productId" required className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0C4196]">
                                      <option value="">-- Pilih item yang bermasalah --</option>
                                      {deli.items?.map((it: any) => (
                                        <option key={it.productId || it.product?.id} value={it.productId || it.product?.id}>
                                          {products.find(p => p.id === (it.productId || it.product?.id))?.name} (Terkirim: {it.qty})
                                        </option>
                                      ))}
                                   </select>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                   <div className="space-y-1.5">
                                      <Label className="text-xs font-bold text-slate-500 uppercase">Jumlah Masalah</Label>
                                      <Input type="number" name="qty" required min="1" placeholder="0" className="h-10" />
                                   </div>
                                   <div className="space-y-1.5">
                                      <Label className="text-xs font-bold text-slate-500 uppercase">Status Masalah</Label>
                                      <select name="category" required className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-500">
                                         <option value="Returned">Retur (Bisa Dikirim Ulang)</option>
                                         <option value="Damaged">Rusak / Hilang (Ganti Baru)</option>
                                      </select>
                                   </div>
                                </div>
                                <div className="space-y-1.5">
                                   <Label className="text-xs font-bold text-slate-500 uppercase">Catatan / Alasan</Label>
                                   <Input name="notes" placeholder="Contoh: Barang cacat, Salah alamat, dll" className="h-10" />
                                </div>

                                <div className="p-4 bg-slate-50 border border-slate-100 rounded-lg space-y-3">
                                   <div className="flex items-center gap-2">
                                      <input 
                                         type="checkbox" 
                                         name="createAllocation" 
                                         id="createAllocation" 
                                         checked={showAlloc}
                                         onChange={(e) => setShowAlloc(e.target.checked)}
                                         className="w-4 h-4 rounded border-slate-300 text-[#0C4196]"
                                      />
                                      <Label htmlFor="createAllocation" className="text-xs font-bold text-slate-700 cursor-pointer">
                                         Alokasi Sisa (Buat SPO Baru untuk Pengiriman Ulang)
                                      </Label>
                                   </div>
                                   
                                   {showAlloc && (
                                      <div className="space-y-1.5 pl-6 animate-in fade-in slide-in-from-top-1 duration-200">
                                         <Label className="text-[10px] font-bold text-slate-500 uppercase">Nomor Supply PO (SPO) Alokasi</Label>
                                         <Input 
                                            name="newSPO" 
                                            placeholder="Masukkan nomor SPO manual..." 
                                            className="h-9 text-xs" 
                                         />
                                         <p className="text-[10px] text-slate-400 italic">
                                            Stok akan otomatis di-reserve untuk Underlying PO terkait.
                                         </p>
                                      </div>
                                   )}
                                </div>

                                <Button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white font-bold h-11 rounded-lg shadow-sm">
                                   Simpan Laporan
                                </Button>
                             </form>
                          </DialogContent>
                       </Dialog>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
      </div>

      <div className="bg-slate-50 rounded-xl p-8 border border-slate-200 border-dashed text-center">
         <History className="w-12 h-12 mx-auto text-slate-300 mb-4" />
         <h3 className="font-bold text-slate-600">Butuh Kirim Ulang?</h3>
         <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
           Barang yang telah dilaporkan "Retur" akan otomatis masuk kembali ke stok <b>Reserved</b> PO terkait. 
           Silakan gunakan menu <b>Barang Keluar</b> untuk membuat DO baru bagi pengiriman ulang.
         </p>
         <Button variant="link" className="mt-4 text-[#0C4196] font-bold gap-2" nativeButton={false} render={
            <a href="/outbound">
               Pergi ke Barang Keluar
               <ArrowRight className="w-4 h-4" />
            </a>
         } />
      </div>
    </div>
  );
}
