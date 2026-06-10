import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, writeBatch, runTransaction, onSnapshot } from 'firebase/firestore';
import { toast } from 'sonner';
import { ScanBarcode, Send, Eye, ArrowUpFromLine, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { deleteDoc } from 'firebase/firestore';
import { format } from 'date-fns';

export function Outbound() {
  const { appUser } = useAuthStore();
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const scannerRef = useRef<HTMLInputElement>(null);

  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [expeditions, setExpeditions] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [viewOutbound, setViewOutbound] = useState<any>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);

  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, 'products'), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubWarehouses = onSnapshot(collection(db, 'warehouses'), (snap) => {
      setWarehouses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubCustomers = onSnapshot(collection(db, 'customers'), (snap) => {
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubDeliveries = onSnapshot(collection(db, 'delivery_orders'), (snap) => {
      setDeliveries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubExpeditions = onSnapshot(collection(db, 'expeditions'), (snap) => {
      setExpeditions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => {
      unsubProducts();
      unsubWarehouses();
      unsubCustomers();
      unsubDeliveries();
      unsubExpeditions();
    };
  }, []);

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scannedBarcode || !products) return;

    const matchedProduct = products.find((p: any) => p.barcode === scannedBarcode);
    
    if (matchedProduct) {
      setItems(prev => {
        const existing = prev.find(i => i.product.id === matchedProduct.id);
        if (existing) {
          return prev.map(i => i.product.id === matchedProduct.id ? { ...i, qty: i.qty + 1 } : i);
        }
        return [...prev, { product: matchedProduct, qty: 1 }];
      });
      toast.success(`Scanned Out: ${matchedProduct.name}`);
    } else {
      toast.error('Product not found: ' + scannedBarcode);
    }
    setScannedBarcode('');
  };

  const submitOutbound = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (items.length === 0) {
      toast.error('No items scanned');
      return;
    }
    const fd = new FormData(form);
    const warehouseId = fd.get('warehouseId') as string;
    const doNumber = fd.get('doNumber') as string || 'DO-' + Date.now();
    
    try {
      const now = Date.now();
      const deliveryRef = doc(collection(db, 'delivery_orders'));

      await runTransaction(db, async (transaction) => {
        // Read phases first
        const invRefs = items.map(item => doc(db, 'inventory', `${warehouseId}_${item.product.id}`));
        const invDocs = await Promise.all(invRefs.map(ref => transaction.get(ref)));

        // Validate enough stock
        invDocs.forEach((invDoc, index) => {
          const item = items[index];
          const currentQty = invDoc.exists() ? (Number(invDoc.data().availableQty) || 0) : 0;
          if (!invDoc.exists() || currentQty < item.qty) {
            throw new Error(`Not enough stock for ${item.product.name} in this warehouse. Available: ${currentQty}, Requested: ${item.qty}`);
          }
        });

        // Write phases
        transaction.set(deliveryRef, {
          warehouseId,
          customerId: fd.get('customerId'),
          expeditionId: fd.get('expeditionId'),
          doNumber,
          poNumber: fd.get('poNumber'),
          shippingAddress: fd.get('shippingAddress'),
          notes: fd.get('notes'),
          status: 'Completed',
          createdBy: appUser?.uid,
          createdAt: now,
          items // include items for UI ref
        });

        items.forEach((item, index) => {
          const invRef = invRefs[index];
          const invDoc = invDocs[index];
          
          const currentQty = Number(invDoc.data().availableQty) || 0;
          const balanceAfter = currentQty - item.qty;
          
          transaction.update(invRef, {
            availableQty: balanceAfter,
            updatedAt: now
          });

          const txRef = doc(collection(db, 'inventory_transactions'));
          transaction.set(txRef, {
            warehouseId,
            productId: item.product.id,
            transactionType: 'outbound',
            referenceType: 'delivery_order',
            referenceId: deliveryRef.id,
            qtyIn: 0,
            qtyOut: item.qty,
            balanceAfter,
            createdBy: appUser?.uid,
            createdAt: now
          });
        });
      });

      toast.success('Outbound delivery created and inventory updated');
      setItems([]);
      form.reset();
    } catch(err: any) {
      toast.error(err.message || 'Failed to process outbound');
    }
  };

  const filteredDeliveries = useMemo(() => {
    return deliveries.filter(deli => {
      const deliveryMonth = format(new Date(deli.createdAt), 'yyyy-MM');
      const matchesMonth = deliveryMonth === selectedMonth;
      const matchesSearch = 
        deli.doNumber?.toLowerCase().includes(searchQuery.toLowerCase()) || 
        deli.poNumber?.toLowerCase().includes(searchQuery.toLowerCase());
      
      return matchesMonth && matchesSearch;
    }).sort((a,b) => b.createdAt - a.createdAt);
  }, [deliveries, selectedMonth, searchQuery]);

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    deliveries.forEach(d => {
      months.add(format(new Date(d.createdAt), 'yyyy-MM'));
    });
    months.add(format(new Date(), 'yyyy-MM'));
    return Array.from(months).sort().reverse();
  }, [deliveries]);

  const handleDelete = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus riwayat pengiriman ini?')) return;
    try {
      await deleteDoc(doc(db, 'delivery_orders', id));
      toast.success('Riwayat pengiriman berhasil dihapus');
    } catch (err: any) {
      toast.error(err.message || 'Gagal menghapus riwayat');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Barang Keluar</h2>
          <p className="text-slate-500 text-sm mt-1">Kelola pesanan keluar dan riwayat pengiriman</p>
        </div>
      </div>

      <Tabs defaultValue="outbound" className="w-full">
        <TabsList className="mb-6 bg-slate-100 p-1 rounded-xl">
          <TabsTrigger value="outbound" className="rounded-lg px-6 py-2 data-[state=active]:bg-white data-[state=active]:text-[#0C4196] data-[state=active]:shadow-sm transition-all font-bold text-xs uppercase tracking-wider">Kirim Barang</TabsTrigger>
          <TabsTrigger value="history" className="rounded-lg px-6 py-2 data-[state=active]:bg-white data-[state=active]:text-[#0C4196] data-[state=active]:shadow-sm transition-all font-bold text-xs uppercase tracking-wider">Riwayat Pengiriman</TabsTrigger>
        </TabsList>
        <TabsContent value="outbound">
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-white rounded-xl border border-slate-200 shadow-sm border-t-4 border-t-[#0C4196] flex flex-col">
              <div className="p-6 flex-1 flex flex-col">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-50 pb-4 mb-6 uppercase tracking-wider">
                  <ScanBarcode className="w-4 h-4 text-[#0C4196]" /> PDA Picking
                </h3>
                <form onSubmit={handleScan} className="space-y-2 mb-8">
                  <Label className="text-xs font-bold text-slate-600 uppercase">Scan Barcode Produk</Label>
                  <Input
                    ref={scannerRef}
                    autoFocus
                    placeholder="Scan atau ketik barcode..."
                    value={scannedBarcode}
                    onChange={e => setScannedBarcode(e.target.value)}
                    className="h-12 text-lg font-mono rounded-lg focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]"
                  />
                  <p className="text-[10px] text-slate-400 font-medium">Input menangkap event keyboard PDA scanner secara otomatis.</p>
                </form>

                <div className="border-t border-slate-50 mt-auto pt-6">
                  <h4 className="text-xs font-bold text-slate-900 mb-4 uppercase tracking-wider">Atau Pilih Manual</h4>
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const fd = new FormData(form);
                    const productId = fd.get('productId') as string;
                    const qty = parseInt(fd.get('qty') as string) || 1;
                    
                    if (!productId || qty < 1) return;
                    const matchedProduct = products?.find((p: any) => p.id === productId);
                    if (matchedProduct) {
                      setItems(prev => {
                        const existing = prev.find(i => i.product.id === matchedProduct.id);
                        if (existing) {
                          return prev.map(i => i.product.id === matchedProduct.id ? { ...i, qty: i.qty + qty } : i);
                        }
                        return [...prev, { product: matchedProduct, qty }];
                      });
                      toast.success(`Berhasil ditambah: ${qty}x ${matchedProduct.name}`);
                      form.reset();
                    }
                  }} className="space-y-4">
                    <div className="space-y-1.5">
                       <Label className="text-[10px] font-bold text-slate-500 uppercase">Pilih Produk</Label>
                       <select name="productId" required className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0C4196] outline-none">
                         <option value="">Pilih produk...</option>
                         {products?.map((p: any) => (
                           <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                         ))}
                       </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase">Jumlah</Label>
                      <Input type="number" name="qty" min="1" defaultValue="1" required className="h-10 rounded-lg focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]" />
                    </div>
                    <Button type="submit" variant="outline" className="w-full h-10 rounded-lg font-bold border-slate-200 text-slate-700 hover:bg-slate-50">Tambah Item</Button>
                  </form>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
              <div className="p-6 h-full flex flex-col">
                <h3 className="text-sm font-bold text-slate-900 mb-6 uppercase tracking-wider">Detail Pengiriman</h3>
                <form onSubmit={submitOutbound} className="space-y-6 flex-1 flex flex-col">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-600 uppercase">Gudang Asal</Label>
                      <select name="warehouseId" required className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0C4196] outline-none">
                        <option value="">Pilih Gudang...</option>
                        {warehouses?.map((w: any) => (
                           <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-600 uppercase">Pelanggan Tujuan</Label>
                      <select name="customerId" required className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0C4196] outline-none">
                        <option value="">Pilih Pelanggan...</option>
                        {customers?.map((c: any) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                       <Label className="text-xs font-bold text-slate-600 uppercase">Ekspedisi / Kurir</Label>
                       <select name="expeditionId" required className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0C4196] outline-none">
                         <option value="">Pilih Ekspedisi...</option>
                         {expeditions?.map((e: any) => (
                           <option key={e.id} value={e.id}>{e.name} ({e.code})</option>
                         ))}
                       </select>
                    </div>
                    <div className="space-y-1.5">
                       <Label className="text-xs font-bold text-slate-600 uppercase">Nomor DO</Label>
                       <Input name="doNumber" placeholder="DO-2023-XXXX" className="h-10 rounded-lg focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]" />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                     <div className="space-y-1.5">
                       <Label className="text-xs font-bold text-slate-600 uppercase">Nomor PO</Label>
                       <Input name="poNumber" placeholder="PO-XXXX" className="h-10 rounded-lg focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]" />
                     </div>
                     <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-600 uppercase">Alamat Pengiriman</Label>
                        <Input name="shippingAddress" required placeholder="Alamat lengkap pengiriman..." className="h-10 rounded-lg focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]" />
                     </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-600 uppercase">Catatan</Label>
                    <Input name="notes" placeholder="Instruksi pengiriman..." className="h-10 rounded-lg focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]" />
                  </div>

                  <div className="border border-slate-100 rounded-xl mt-6 flex-1 bg-slate-50/10 overflow-hidden shadow-inner min-h-[200px]">
                    <Table>
                      <TableHeader className="bg-slate-50/50 border-b border-slate-100">
                        <TableRow className="h-10">
                          <TableHead className="font-bold text-slate-600 text-[10px] uppercase pl-4">SKU</TableHead>
                          <TableHead className="font-bold text-slate-600 text-[10px] uppercase">Produk</TableHead>
                          <TableHead className="text-right font-bold text-slate-600 text-[10px] uppercase">Jumlah Diambil</TableHead>
                          <TableHead className="pr-4"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-20 text-slate-400 bg-white">
                              <ScanBarcode className="w-12 h-12 mx-auto text-slate-100 mb-2" />
                              <p className="text-sm font-bold text-slate-500">Belum ada item yang diambil.</p>
                            </TableCell>
                          </TableRow>
                        ) : (
                          items.map((item, idx) => (
                            <TableRow key={idx} className="bg-white hover:bg-slate-50/50 h-14">
                              <TableCell className="font-mono text-xs font-bold text-[#0C4196] pl-4">{item.product.sku}</TableCell>
                              <TableCell className="font-bold text-slate-900 text-sm">{item.product.name}</TableCell>
                              <TableCell className="text-right text-lg font-bold text-[#0C4196]">{item.qty}</TableCell>
                              <TableCell className="text-right pr-4">
                                 <Button type="button" variant="ghost" size="sm" onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 px-3 rounded-lg font-bold text-xs uppercase">Hapus</Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex justify-end pt-6 border-t mt-auto">
                    <Button type="submit" size="lg" disabled={items.length === 0} className="bg-[#0C4196] hover:bg-[#0C4196]/90 text-white shadow-sm rounded-lg px-10 font-bold h-12">
                      <Send className="w-5 h-5 mr-2" />
                      Proses Pengiriman
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="history">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider whitespace-nowrap">Riwayat Pengiriman</h3>
                <Input 
                  placeholder="Cari No. DO atau PO..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 w-full sm:w-64 bg-white border-slate-200 focus:border-[#0C4196] focus:ring-[#0C4196] text-xs"
                />
              </div>
              <select
                className="flex h-9 w-full sm:w-44 rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm focus:border-[#0C4196] outline-none"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              >
                {availableMonths.map(month => (
                  <option key={month} value={month}>{format(new Date(month + '-01'), 'MMMM yyyy')}</option>
                ))}
              </select>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50 border-b border-slate-200">
                  <TableRow className="h-12 hover:bg-transparent">
                    <TableHead className="font-bold text-slate-600 text-xs pl-6">Tanggal</TableHead>
                    <TableHead className="font-bold text-slate-600 text-xs">Nomor DO</TableHead>
                    <TableHead className="font-bold text-slate-600 text-xs">Nomor PO</TableHead>
                    <TableHead className="font-bold text-slate-600 text-xs">Ekspedisi</TableHead>
                    <TableHead className="font-bold text-slate-600 text-xs">Gudang</TableHead>
                    <TableHead className="font-bold text-slate-600 text-xs">Pelanggan</TableHead>
                    <TableHead className="text-right font-bold text-slate-600 text-xs text-center pr-6">Total Item</TableHead>
                    <TableHead className="text-right font-bold text-slate-600 text-xs text-center pr-6">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDeliveries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-20 text-slate-400">
                        Tidak ada riwayat pengiriman ditemukan.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredDeliveries.map(deli => (
                      <TableRow key={deli.id} className="h-16 group hover:bg-slate-50/50">
                        <TableCell className="text-xs text-slate-500 pl-6">{format(new Date(deli.createdAt), 'dd/MM/yyyy HH:mm')}</TableCell>
                        <TableCell className="font-mono text-xs text-[#0C4196] uppercase">{deli.doNumber}</TableCell>
                        <TableCell className="text-xs font-bold text-slate-700 uppercase">{deli.poNumber || '-'}</TableCell>
                        <TableCell className="text-sm font-bold text-slate-900">
                          {expeditions.find(e => e.id === deli.expeditionId)?.name || '-'}
                        </TableCell>
                        <TableCell className="text-sm text-slate-700 font-medium">
                          {warehouses.find(w => w.id === deli.warehouseId)?.name || 'Tidak Diketahui'}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600 font-medium">
                          {customers.find(c => c.id === deli.customerId)?.name || 'Pelanggan Umum'}
                        </TableCell>
                        <TableCell className="text-center font-bold text-slate-900 border-x border-slate-50">
                          {deli.items?.reduce((sum: number, i: any) => sum + i.qty, 0) || 0}
                        </TableCell>
                        <TableCell className="text-right pr-6">
                           <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => { setViewOutbound(deli); setIsViewOpen(true); }} className="h-8 w-8 text-slate-400 hover:text-[#0C4196] hover:bg-white">
                                <Eye className="w-4 h-4" />
                              </Button>
                           </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="sm:max-w-5xl rounded-2xl p-0 overflow-hidden border-none shadow-2xl">
          <DialogHeader className="p-6 bg-[#0C4196] text-white">
            <DialogTitle className="text-xl font-bold flex items-center gap-3">
              <ArrowUpFromLine className="w-6 h-6" /> Detail Barang Keluar
            </DialogTitle>
          </DialogHeader>
          {viewOutbound && (
            <div className="p-8 space-y-8 max-h-[80vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-2 gap-8 text-sm">
                <div className="space-y-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No. Outbound / DO</span>
                    <span className="font-mono text-[#0C4196] font-bold text-base">{viewOutbound.doNumber}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pelanggan</span>
                    <span className="font-bold text-slate-900">{customers.find(c => c.id === viewOutbound.customerId)?.name || 'Pelanggan Umum'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gudang Asal</span>
                    <span className="font-bold text-slate-900">{warehouses.find(w => w.id === viewOutbound.warehouseId)?.name || 'Gudang Umum'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ekspedisi / Kurir</span>
                    <span className="font-bold text-slate-900">{expeditions.find(e => e.id === viewOutbound.expeditionId)?.name || '-'}</span>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tanggal</span>
                    <span className="font-bold text-slate-900">{format(new Date(viewOutbound.createdAt), 'dd MMMM yyyy HH:mm')}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No. PO</span>
                    <span className="font-bold text-slate-900">{viewOutbound.poNumber || '-'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Alamat Pengiriman</span>
                    <span className="font-medium text-slate-700 text-xs">{viewOutbound.shippingAddress || '-'}</span>
                  </div>
                </div>
              </div>

              <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="text-[10px] font-bold text-slate-500 uppercase py-3 pl-4">Produk</TableHead>
                      <TableHead className="text-[10px] font-bold text-slate-500 uppercase py-3 text-right pr-4">Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewOutbound.items?.map((item: any, idx: number) => (
                      <TableRow key={idx} className="hover:bg-slate-50/50">
                        <TableCell className="py-4 pl-4">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-900">{item.product?.name}</span>
                            <span className="text-[10px] font-mono text-slate-400 uppercase leading-none mt-1">{item.product?.sku}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right py-4 pr-4 font-bold text-lg text-[#0C4196]">{item.qty} <span className="text-[10px] text-slate-400 font-medium">Unit</span></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {viewOutbound.notes && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Catatan</span>
                  <p className="text-sm text-slate-600">{viewOutbound.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

