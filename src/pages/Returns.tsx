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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function Returns() {
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [ledgers, setLedgers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [supplyPos, setSupplyPos] = useState<any[]>([]);
  const [underlyingPos, setUnderlyingPos] = useState<any[]>([]);
  const [returnRequests, setReturnRequests] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeli, setSelectedDeli] = useState<any>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const showAlloc = false;
  const setShowAlloc = (val: boolean) => {};
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedQty, setSelectedQty] = useState<number | ''>('');
  const { appUser } = useAuthStore();

  useEffect(() => {
    if (selectedDeli) {
      const items = selectedDeli.items || [];
      if (items.length > 0) {
        const firstItem = items[0];
        const prodId = firstItem.productId || firstItem.product?.id || '';
        setSelectedProductId(prodId);

        const existingTotal = ledgers
          .filter(l => l.referenceId === selectedDeli.id && l.productId === prodId && l.transactionType === 'OUTBOUND_DAMAGE')
          .reduce((sum, l) => sum + (l.qtyChange || 0), 0);
        const maxQty = Math.max(0, (firstItem.qty || 0) - existingTotal);
        setSelectedQty(maxQty);
      } else {
        setSelectedProductId('');
        setSelectedQty('');
      }
    } else {
      setSelectedProductId('');
      setSelectedQty('');
    }
  }, [selectedDeli, ledgers]);

  const handleProductChange = (prodId: string) => {
    setSelectedProductId(prodId);
    if (selectedDeli) {
      const item = selectedDeli.items?.find((it: any) => (it.productId || it.product?.id) === prodId);
      if (item) {
        const existingTotal = ledgers
          .filter(l => l.referenceId === selectedDeli.id && l.productId === prodId && l.transactionType === 'OUTBOUND_DAMAGE')
          .reduce((sum, l) => sum + (l.qtyChange || 0), 0);
        const maxQty = Math.max(0, (item.qty || 0) - existingTotal);
        setSelectedQty(maxQty);
      } else {
        setSelectedQty('');
      }
    }
  };

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
    const unsubReturnRequests = onSnapshot(query(collection(db, 'return_requests')), sn => {
      setReturnRequests(sn.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { 
      unsubDeli(); 
      unsubLedger(); 
      unsubProd(); 
      unsubSPO(); 
      unsubUPO(); 
      unsubReturnRequests(); 
    };
  }, []);

  const filteredDeli = deliveries.filter(d => 
    d.doNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.shippingAddress?.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort((a,b) => b.createdAt - a.createdAt);

  const getSPOForReturn = (ret: any) => {
    if (ret.supplyPoNumber) return ret.supplyPoNumber;

    const originalDeli = deliveries.find(d => d.doNumber === ret.doNumber || d.id === ret.do_id || d.id === ret.doId);
    if (originalDeli && originalDeli.supplyPoId) {
      const spo = supplyPos.find(s => s.id === originalDeli.supplyPoId);
      if (spo) return spo.supplyPoNumber;
    }

    const upoId = ret.underlyingPoId || ret.underlying_po_id;
    if (upoId) {
      const spo = supplyPos.find(s => s.underlyingPoId === upoId || s.underlying_po_id === upoId);
      if (spo) return spo.supplyPoNumber;
    }

    return '-';
  };

  const filteredReturnRequests = returnRequests.filter(ret => {
    const ticketNo = ret.returnNumber || '';
    const doNo = ret.doNumber || '';
    const prodName = products.find(p => p.id === ret.productId)?.name || '';
    const spoNum = getSPOForReturn(ret);
    const upo = underlyingPos.find(u => u.id === ret.underlyingPoId || u.id === ret.underlying_po_id);
    const upoNum = upo?.poNumber || '';
    const lower = searchQuery.toLowerCase();
    
    return ticketNo.toLowerCase().includes(lower) ||
      doNo.toLowerCase().includes(lower) ||
      prodName.toLowerCase().includes(lower) ||
      spoNum.toLowerCase().includes(lower) ||
      upoNum.toLowerCase().includes(lower);
  }).sort((a, b) => b.createdAt - a.createdAt);

  const handleDeleteReport = async (ret: any) => {
    if (ret.status !== 'Pending') {
      toast.error('Tidak bisa menghapus laporan yang sudah diproses (status: ' + ret.status + ')');
      return;
    }

    const confirmDel = window.confirm('Apakah Anda yakin ingin menghapus laporan ini? Stok akan dikembalikan seperti semula.');
    if (!confirmDel) return;

    const loadingToast = toast.loading('Menghapus laporan...');
    try {
      await runTransaction(db, async (transaction) => {
        const invId = `${ret.ownerId}_${ret.warehouseId}_${ret.productId}`;
        const invRef = doc(db, 'inventory', invId);
        const invSnap = await transaction.get(invRef);

        const currentOnHand = invSnap.exists() ? (Number(invSnap.data().onHandQty) || 0) : 0;
        const currentDamaged = invSnap.exists() ? (Number(invSnap.data().damagedQty) || 0) : 0;
        const currentReserved = invSnap.exists() ? (Number(invSnap.data().reservedQty) || 0) : 0;

        const newOnHand = Math.max(0, currentOnHand - ret.qty);
        const newDamaged = Math.max(0, currentDamaged - ret.qty);
        const newAvailable = newOnHand - currentReserved - newDamaged;

        transaction.set(invRef, {
          onHandQty: newOnHand,
          damagedQty: newDamaged,
          availableQty: newAvailable,
          updatedAt: Date.now()
        }, { merge: true });

        // Delete return_requests doc
        const returnReqRef = doc(db, 'return_requests', ret.id);
        transaction.delete(returnReqRef);

        // Delete OUTBOUND_DAMAGE ledger
        const ledgerQuery = query(
          collection(db, 'inventory_ledgers'),
          where('transactionNumber', '==', ret.returnNumber)
        );
        const ledgerSnaps = await getDocs(ledgerQuery);
        ledgerSnaps.forEach(lDoc => {
          transaction.delete(doc(db, 'inventory_ledgers', lDoc.id));
        });
      });

      toast.dismiss(loadingToast);
      toast.success('Laporan berhasil dihapus & stok dikembalikan.');
    } catch (err: any) {
      toast.dismiss(loadingToast);
      toast.error('Gagal menghapus: ' + err.message);
    }
  };

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
        // Read inventory first to adhere to Firestore transaction requirement: reads before writes
        const invId = `${selectedDeli.ownerId}_${selectedDeli.warehouseId}_${productId}`;
        const invRef = doc(db, 'inventory', invId);
        const invSnap = await transaction.get(invRef);
        
        let currentOnHand = invSnap.exists() ? (Number(invSnap.data().onHandQty) || 0) : 0;
        let currentDamaged = invSnap.exists() ? (Number(invSnap.data().damagedQty) || 0) : 0;
        let currentReserved = invSnap.exists() ? (Number(invSnap.data().reservedQty) || 0) : 0;

        const ledgerRef = doc(collection(db, 'inventory_ledgers'));
        const returnNo = customReturnNumber || (category === 'Returned' ? 'RET-' : 'DAM-') + Date.now();
        
        // Write Ledger document
        transaction.set(ledgerRef, {
          transactionNumber: returnNo,
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

        // Find Vendor PO Number
        const matchedSpo = supplyPos.find(s => s.id === selectedDeli.supplyPoId);
        const spoNo = matchedSpo ? matchedSpo.supplyPoNumber : '';

        // Write return_requests document (Return/damage record)
        const returnRequestRef = doc(collection(db, 'return_requests'));
        transaction.set(returnRequestRef, {
          returnNumber: returnNo,
          underlying_po_id: selectedDeli.underlyingPoId || '',
          underlyingPoId: selectedDeli.underlyingPoId || '',
          supplyPoId: selectedDeli.supplyPoId || '',
          supplyPoNumber: spoNo || '',
          do_id: selectedDeli.id || '',
          doNumber: selectedDeli.doNumber || '',
          productId,
          qty,
          category, // 'Returned' | 'Damaged'
          notes,
          shippingAddress: selectedDeli.shippingAddress || '',
          shipping_area_id: selectedDeli.shippingAddress || '',
          status: 'Pending',
          warehouseId: selectedDeli.warehouseId,
          ownerId: selectedDeli.ownerId,
          createdAt: Date.now(),
          createdBy: appUser?.uid
        });

        // Update inventory (Status stock menjadi Damaged/Returned)
        const newOnHand = currentOnHand + qty;
        const newDamaged = currentDamaged + qty;
        const newAvailable = newOnHand - currentReserved - newDamaged; // availableQty calculation

        transaction.set(invRef, {
          onHandQty: newOnHand,
          damagedQty: newDamaged,
          availableQty: newAvailable,
          updatedAt: Date.now()
        }, { merge: true });
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

      <Tabs defaultValue="reporting" className="w-full">
        <TabsList className="mb-6 bg-slate-100 p-1 rounded-xl">
          <TabsTrigger value="reporting" className="rounded-lg px-6 py-2 data-[state=active]:bg-white data-[state=active]:text-[#0C4196] data-[state=active]:shadow-sm transition-all font-bold text-xs uppercase tracking-wider">Lapor Masalah</TabsTrigger>
          <TabsTrigger value="history" className="rounded-lg px-6 py-2 data-[state=active]:bg-white data-[state=active]:text-[#0C4196] data-[state=active]:shadow-sm transition-all font-bold text-xs uppercase tracking-wider">Daftar Barang Retur</TabsTrigger>
        </TabsList>

        <TabsContent value="reporting">
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
                            VPO: {supplyPos.find(s => s.id === deli.supplyPoId)?.supplyPoNumber || '-'}
                          </div>
                          <div className="text-[9px] text-slate-400 mt-0.5 whitespace-nowrap">
                            UPO: {underlyingPos.find(u => u.id === deli.underlyingPoId)?.poNumber || '-'}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {deli.createdAt ? (() => {
                            try {
                              const d = new Date(deli.createdAt);
                              return isNaN(d.getTime()) ? '-' : format(d, 'dd MMM yyyy');
                            } catch (e) {
                              return '-';
                            }
                          })() : '-'}
                        </TableCell>
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
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="h-8 text-xs font-bold gap-1.5 border-slate-200 hover:bg-slate-50"
                            onClick={() => {
                              setSelectedDeli(deli);
                              setIsReportOpen(true);
                            }}
                          >
                             <AlertCircle className="w-3.5 h-3.5" />
                             Lapor Retur
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        </TabsContent>

        <TabsContent value="history">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-slate-50/50">
              <div className="relative w-full max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input 
                   placeholder="Cari Tiket, DO, VPO, UPO, atau Produk..." 
                   value={searchQuery}
                   onChange={(e) => setSearchQuery(e.target.value)}
                   className="pl-9 h-10 rounded-lg bg-white border-slate-200" 
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table className="min-w-[1000px]">
                <TableHeader className="bg-slate-50 border-b">
                  <TableRow>
                    <TableHead className="font-bold text-slate-600 text-xs pl-6">Tanggal</TableHead>
                    <TableHead className="font-bold text-slate-600 text-xs">No. Tiket</TableHead>
                    <TableHead className="font-bold text-slate-600 text-xs">No. Vendor PO (VPO)</TableHead>
                    <TableHead className="font-bold text-slate-600 text-xs">No. Underlying PO (UPO)</TableHead>
                    <TableHead className="font-bold text-slate-600 text-xs">No. DO Referensi</TableHead>
                    <TableHead className="font-bold text-slate-600 text-xs">Produk</TableHead>
                    <TableHead className="font-bold text-slate-600 text-xs text-center">Jumlah</TableHead>
                    <TableHead className="font-bold text-slate-600 text-xs text-center">Kategori</TableHead>
                    <TableHead className="font-bold text-slate-600 text-xs text-center">Status Tindakan</TableHead>
                    <TableHead className="text-right font-bold text-slate-600 text-xs pr-6">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReturnRequests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-20 text-slate-400">
                        <History className="w-12 h-12 mx-auto text-slate-200 mb-3" />
                        <p className="text-sm font-bold">Belum ada barang retur / rusak dilaporkan</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredReturnRequests.map((ret) => {
                      const spoNum = getSPOForReturn(ret);
                      const upo = underlyingPos.find(u => u.id === ret.underlyingPoId || u.id === ret.underlying_po_id);
                      const upoNum = upo?.poNumber || '-';
                      const prodName = products.find(p => p.id === ret.productId)?.name || 'Produk';

                      return (
                        <TableRow key={ret.id} className="group transition-colors hover:bg-slate-50/50 text-xs font-sans">
                          <TableCell className="pl-6 text-slate-500 whitespace-nowrap">
                            {ret.createdAt ? (() => {
                              try {
                                const d = new Date(ret.createdAt);
                                return isNaN(d.getTime()) ? '-' : format(d, 'dd/MM/yyyy HH:mm');
                              } catch (e) {
                                return '-';
                              }
                            })() : '-'}
                          </TableCell>
                          <TableCell className="font-mono font-bold text-slate-700 whitespace-nowrap">
                            {ret.returnNumber}
                          </TableCell>
                          <TableCell className="font-mono font-bold text-[#0C4196] whitespace-nowrap">
                            {spoNum}
                          </TableCell>
                          <TableCell className="font-medium text-slate-700 whitespace-nowrap">
                            {upoNum}
                          </TableCell>
                          <TableCell className="font-mono font-medium text-slate-500 whitespace-nowrap">
                            {ret.doNumber}
                          </TableCell>
                          <TableCell className="font-bold text-slate-800 max-w-[150px] truncate" title={prodName}>
                            {prodName}
                          </TableCell>
                          <TableCell className="text-center font-bold text-red-600">
                            {ret.qty} unit
                          </TableCell>
                          <TableCell className="text-center">
                            {ret.category === 'Returned' ? (
                              <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-100">
                                Retur
                              </span>
                            ) : (
                              <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-50 text-red-700 border border-red-100">
                                Rusak / Hilang
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {ret.status === 'Pending' ? (
                              <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-yellow-100 text-yellow-800 border border-yellow-200 animate-pulse">
                                Pending Replacement
                              </span>
                            ) : (
                              <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-green-100 text-green-800 border border-green-200">
                                Selesai Diganti
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right pr-6">
                            {ret.status === 'Pending' ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-slate-100 rounded-full"
                                onClick={() => handleDeleteReport(ret)}
                                title="Hapus Laporan Retur"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            ) : '-'}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={isReportOpen} onOpenChange={setIsReportOpen}>
        <DialogContent className="rounded-xl sm:max-w-[600px]">
           <DialogHeader>
              <DialogTitle className="text-lg font-bold text-slate-900">Laporan Retur / Kerusakan - {selectedDeli?.doNumber}</DialogTitle>
           </DialogHeader>
           {selectedDeli && (
              <form onSubmit={handleReport} className="space-y-4 mt-4 text-left font-sans">
                 <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-500 uppercase">Nomor Retur / Referensi (Opsional)</Label>
                    <Input name="returnNumber" placeholder="Contoh: RET-001 / DAM-001" className="h-10" />
                 </div>
                 <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-[#0C4196] uppercase flex items-center gap-1.5">
                      Pilih Produk <span className="px-1.5 py-0.5 bg-[#0C4196]/10 text-[#0C4196] text-[9px] rounded font-black uppercase">Otomatis Terambil</span>
                    </Label>
                    <select 
                       name="productId" 
                       required 
                       value={selectedProductId}
                       onChange={(e) => handleProductChange(e.target.value)}
                       className="flex h-10 w-full rounded-lg border border-[#0C4196] bg-white px-3 py-2 text-sm outline-none font-bold text-[#0C4196] focus:border-[#0C4196]"
                    >
                       <option value="">-- Pilih item yang bermasalah --</option>
                       {selectedDeli.items?.map((it: any) => (
                         <option key={it.productId || it.product?.id} value={it.productId || it.product?.id}>
                           {products.find(p => p.id === (it.productId || it.product?.id))?.name} (Terkirim: {it.qty})
                         </option>
                       ))}
                    </select>
                 </div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                       <Label className="text-xs font-bold text-[#0C4196] uppercase flex items-center gap-1.5">
                         Jumlah Masalah <span className="px-1.5 py-0.5 bg-green-500/10 text-green-700 text-[9px] rounded font-black uppercase">Pre-filled</span>
                       </Label>
                       <Input 
                          type="number" 
                          name="qty" 
                          required 
                          min="1" 
                          placeholder="0" 
                          value={selectedQty}
                          onChange={(e) => setSelectedQty(e.target.value === '' ? '' : Number(e.target.value))}
                          className="h-10 border-[#0C4196] font-bold text-[#0C4196]" 
                       />
                    </div>
                    <div className="space-y-1.5">
                       <Label className="text-xs font-bold text-slate-500 uppercase">Status Masalah</Label>
                       <select name="category" required className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-500 font-bold text-slate-700">
                          <option value="Returned">Retur (Bisa Dikirim Ulang)</option>
                          <option value="Damaged">Rusak / Hilang (Ganti Baru)</option>
                       </select>
                    </div>
                 </div>
                 <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-500 uppercase">Catatan / Alasan</Label>
                    <Input name="notes" placeholder="Contoh: Barang cacat, Salah alamat, dll" className="h-10" />
                 </div>

                 <div className="hidden">
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
                          Alokasi Sisa (Buat VPO Baru untuk Pengiriman Ulang)
                       </Label>
                    </div>
                    
                    {showAlloc && (() => {
                       const uPoNo = underlyingPos.find(u => u.id === selectedDeli.underlyingPoId || u.id === selectedDeli.underlying_po_id)?.poNumber || '';
                       return (
                          <div className="space-y-1.5 pl-6 animate-in fade-in slide-in-from-top-1 duration-200">
                             <Label className="text-[10px] font-bold text-[#0C4196] uppercase">Nomor Underlying PO Penerima</Label>
                             <Input 
                                name="newSPO" 
                                value={uPoNo}
                                readOnly
                                className="h-9 text-xs bg-slate-100 border-[#0C4196]/30 font-bold cursor-not-allowed text-[#0C4196]" 
                             />
                             <p className="text-[10px] text-slate-400 italic">
                                VPO Alokasi baru akan dibuat secara otomatis dengan mengambil nomor Underlying PO ({uPoNo || 'N/A'}) sebagai referensi.
                             </p>
                          </div>
                       );
                    })()}
                 </div>

                 <Button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white font-bold h-11 rounded-lg shadow-sm">
                    Simpan Laporan
                 </Button>
              </form>
           )}
        </DialogContent>
      </Dialog>

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
