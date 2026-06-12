import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, doc, writeBatch, runTransaction, onSnapshot, deleteDoc, updateDoc, query } from 'firebase/firestore';
import { toast } from 'sonner';
import { ScanBarcode, CheckCircle2, Pencil, Trash2, MoreVertical, Search, ArrowDownToLine, Plus, Truck, Eye } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { format } from 'date-fns';

export function Inbound() {
  const { appUser } = useAuthStore();
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const scannerRef = useRef<HTMLInputElement>(null);

  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [inbounds, setInbounds] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [owners, setOwners] = useState<any[]>([]);
  const [supplyPos, setSupplyPos] = useState<any[]>([]);
  const [isProcessingPending, setIsProcessingPending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [inboundType, setInboundType] = useState<'General' | 'SPO'>('General');
  const [selectedSPOId, setSelectedSPOId] = useState('');
  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');

  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [editInbound, setEditInbound] = useState<any>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [viewInbound, setViewInbound] = useState<any>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);

  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, 'products'), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubWarehouses = onSnapshot(collection(db, 'warehouses'), (snap) => {
      setWarehouses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubInbounds = onSnapshot(collection(db, 'inbounds'), (snap) => {
      setInbounds(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubSuppliers = onSnapshot(collection(db, 'suppliers'), (snap) => {
      setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubOwners = onSnapshot(collection(db, 'owners'), (snap) => {
      setOwners(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubSupplyPos = onSnapshot(query(collection(db, 'supply_pos')), (snap) => {
      setSupplyPos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => {
      unsubProducts();
      unsubWarehouses();
      unsubInbounds();
      unsubSuppliers();
      unsubOwners();
      unsubSupplyPos();
    };
  }, []);

  // Catch-up logic for pending inbounds reached their time
  useEffect(() => {
    if (inbounds.length > 0 && !isProcessingPending) {
      processPendingInbounds();
    }
  }, [inbounds]);

  const processPendingInbounds = async () => {
    const now = Date.now();
    const pendingToComplete = inbounds.filter(inb => inb.status === 'Pending' && inb.scheduledDate <= now);
    
    if (pendingToComplete.length === 0) return;
    
    setIsProcessingPending(true);
    toast.info(`Memproses ${pendingToComplete.length} barang masuk yang dijadwalkan...`);
    
    for (const inb of pendingToComplete) {
      try {
        await completeInboundLogic(inb.id, inb.warehouseId, inb.ownerId, inb.items);
      } catch (err) {
        console.error('Gagal menyelesaikan inbound otomatis', inb.id, err);
      }
    }
    setIsProcessingPending(false);
  };

  const completeInboundLogic = async (inboundId: string, warehouseId: string, ownerId: string, inboundItems: any[]) => {
    const now = Date.now();
    await runTransaction(db, async (transaction) => {
      const invRefs = inboundItems.map(item => doc(db, 'inventory', `${ownerId}_${warehouseId}_${item.product.id}`));
      const invDocs = await Promise.all(invRefs.map(ref => transaction.get(ref)));

      transaction.update(doc(db, 'inbounds', inboundId), {
        status: 'Completed',
        completedAt: now,
        updatedAt: now
      });

      inboundItems.forEach((item, index) => {
        const invRef = invRefs[index];
        const invDoc = invDocs[index];
        let balanceAfter = item.qty;
        let qtyBefore = 0;

        if (invDoc.exists()) {
          qtyBefore = (invDoc.data().availableQty || 0);
          balanceAfter = qtyBefore + item.qty;
          transaction.update(invRef, {
            availableQty: balanceAfter,
            updatedAt: now
          });
        } else {
          transaction.set(invRef, {
            ownerId,
            warehouseId,
            productId: item.product.id,
            availableQty: balanceAfter,
            reservedQty: 0,
            returnQty: 0,
            damagedQty: 0,
            updatedAt: now
          });
        }

        const ledgerRef = doc(collection(db, 'inventory_ledgers'));
        transaction.set(ledgerRef, {
          transactionNumber: 'TRX-AUTO-' + now + '-' + index,
          transactionType: 'INBOUND_RECEIVE',
          productId: item.product.id,
          ownerId,
          warehouseId,
          qtyBefore,
          qtyChange: item.qty,
          qtyAfter: balanceAfter,
          referenceType: 'INBOUND_DO',
          referenceId: inboundId,
          createdBy: 'system-auto',
          createdAt: now
        });
      });
    });
  };

  useEffect(() => {
    scannerRef.current?.focus();
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
      toast.success(`Berhasil scan: ${matchedProduct.name}`);
    } else {
      toast.error('Produk tidak ditemukan untuk barcode: ' + scannedBarcode);
    }
    setScannedBarcode('');
  };

  const submitInbound = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (items.length === 0) {
      toast.error('Belum ada item yang di-scan');
      return;
    }
    const fd = new FormData(form);
    
    let ownerId = selectedOwnerId;
    let warehouseId = selectedWarehouseId;
    let supplyPoId = '';

    if (inboundType === 'SPO') {
      supplyPoId = selectedSPOId;
      const selectedSupplyPo = supplyPos.find(spo => spo.id === supplyPoId);
      if (!selectedSupplyPo) {
        toast.error('Vendor PO tidak valid');
        return;
      }
      ownerId = selectedSupplyPo.ownerId;
      warehouseId = selectedSupplyPo.warehouseId;
    } else {
      if (!ownerId || !warehouseId) {
        toast.error('Pilih Owner dan Gudang untuk General Inbound');
        return;
      }
    }

    try {
      const now = Date.now();
      const inboundRef = doc(collection(db, 'inbounds'));
      
      await runTransaction(db, async (transaction) => {
        const invRefs = items.map(item => doc(db, 'inventory', `${ownerId}_${warehouseId}_${item.product.id}`));
        const invDocs = await Promise.all(invRefs.map(ref => transaction.get(ref)));

        const inbData = {
          inboundType,
          supplyPoId,
          ownerId,
          warehouseId,
          supplierId: fd.get('supplierId'),
          inboundNumber: 'INB-' + now,
          poNumber: fd.get('poNumber'),
          supplierSjNumber: fd.get('supplierDoNumber'),
          notes: fd.get('notes'),
          status: 'Completed',
          scheduledDate: now,
          completedAt: now,
          createdBy: appUser?.uid,
          createdAt: now,
          items
        };
        transaction.set(inboundRef, inbData);

        items.forEach((item, index) => {
          const invRef = invRefs[index];
          const invDoc = invDocs[index];
          
          let currentOH = 0;
          let currentAvailable = 0;
          let currentReserved = 0;
          let currentDamaged = 0;

          if (invDoc.exists()) {
            currentOH = Number(invDoc.data().onHandQty) || 0;
            currentAvailable = Number(invDoc.data().availableQty) || 0;
            currentReserved = Number(invDoc.data().reservedQty) || 0;
            currentDamaged = Number(invDoc.data().damagedQty) || 0;
          }

          const newOH = currentOH + item.qty;
          let newAvailable = currentAvailable;

          if (inboundType === 'General') {
            // General inbound increases available immediately
            newAvailable = currentAvailable + item.qty;
          } else {
            // SPO inbound increases On Hand. 
            // Available is derived: OH - Reserved - Damaged.
            // If SPO approval already created reservation, this OH increase will resolve the potential negative available.
            newAvailable = newOH - currentReserved - currentDamaged;
          }

          if (invDoc.exists()) {
            transaction.update(invRef, {
              onHandQty: newOH,
              availableQty: newAvailable,
              updatedAt: now
            });
          } else {
            transaction.set(invRef, {
              ownerId,
              warehouseId,
              productId: item.product.id,
              onHandQty: newOH,
              availableQty: newAvailable,
              reservedQty: 0,
              returnQty: 0,
              damagedQty: 0,
              updatedAt: now
            });
          }

          const ledgerRef = doc(collection(db, 'inventory_ledgers'));
          transaction.set(ledgerRef, {
            transactionNumber: 'TRX-' + now + '-' + index,
            transactionType: 'INBOUND_RECEIVE',
            productId: item.product.id,
            ownerId,
            warehouseId,
            qtyBefore: currentOH,
            qtyChange: item.qty,
            qtyAfter: newOH,
            referenceType: 'INBOUND_DO',
            referenceId: inboundRef.id,
            createdBy: appUser?.uid,
            createdAt: now
          });
        });
        
        const auditRef = doc(collection(db, 'audit_logs'));
        transaction.set(auditRef, {
            user: appUser?.name || 'Unknown',
            action: `Inbound DO Created (${inboundType})`,
            module: 'Inbound',
            recordId: inboundRef.id,
            timestamp: now
        });
      });
      
      toast.success('Penerimaan berhasil diproses');
      setItems([]);
      setSelectedSPOId('');
      form.reset();
    } catch(err: any) {
      toast.error(err.message || 'Gagal memproses barang masuk');
    }
  };

  const openEdit = (inb: any) => {
    setEditInbound(inb);
    setIsEditOpen(true);
  };

  const saveEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const scheduledDateStr = fd.get('scheduledDate') as string;
      const scheduledDate = scheduledDateStr ? new Date(scheduledDateStr).getTime() : editInbound.scheduledDate;
      
      await updateDoc(doc(db, 'inbounds', editInbound.id), {
        warehouseId: fd.get('warehouseId'),
        supplierId: fd.get('supplierId'),
        poNumber: fd.get('poNumber'),
        supplierSjNumber: fd.get('supplierDoNumber'),
        notes: fd.get('notes'),
        scheduledDate,
        updatedAt: Date.now()
      });
      toast.success('Tugas barang masuk berhasil diperbarui');
      setIsEditOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Gagal memperbarui tugas');
    }
  };

  const filteredInbounds = useMemo(() => {
    return inbounds.filter(inb => {
      const inboundMonth = format(new Date(inb.createdAt), 'yyyy-MM');
      const matchesMonth = inboundMonth === selectedMonth;
      
      const supplierName = suppliers.find(s => s.id === inb.supplierId)?.name || '';
      const matchesSearch = 
        inb.inboundNumber?.toLowerCase().includes(searchQuery.toLowerCase()) || 
        inb.poNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        supplierName.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesMonth && matchesSearch;
    }).sort((a,b) => b.createdAt - a.createdAt);
  }, [inbounds, selectedMonth, searchQuery, suppliers]);

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    inbounds.forEach(inb => {
      months.add(format(new Date(inb.createdAt), 'yyyy-MM'));
    });
    months.add(format(new Date(), 'yyyy-MM'));
    return Array.from(months).sort().reverse();
  }, [inbounds]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 leading-none">Barang Masuk</h2>
          <p className="text-sm md:text-base text-slate-500 font-medium mt-2">Kelola barang masuk dan riwayat penerimaan</p>
        </div>
      </div>

      <Tabs defaultValue="receive" className="w-full">
        <TabsList className="mb-6 bg-slate-100 p-1 rounded-xl">
          <TabsTrigger value="receive" className="rounded-lg px-6 py-2 data-[state=active]:bg-white data-[state=active]:text-[#0C4196] data-[state=active]:shadow-sm transition-all font-bold text-xs uppercase tracking-wider">Terima Barang</TabsTrigger>
          <TabsTrigger value="history" className="rounded-lg px-6 py-2 data-[state=active]:bg-white data-[state=active]:text-[#0C4196] data-[state=active]:shadow-sm transition-all font-bold text-xs uppercase tracking-wider">Riwayat Barang Masuk</TabsTrigger>
        </TabsList>
        
        <TabsContent value="receive">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm border-t-4 border-t-[#0C4196] flex flex-col">
              <div className="p-6 flex-1 flex flex-col">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-50 pb-4 mb-6 uppercase tracking-wider">
                  <ScanBarcode className="w-4 h-4 text-[#0C4196]" /> PDA Scanner
                </h3>
                <form onSubmit={handleScan} className="space-y-3 mb-8">
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
                  <h4 className="text-xs font-bold text-slate-900 mb-4 uppercase tracking-wider">Tambah Manual</h4>
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
                    <Button type="submit" variant="outline" className="w-full h-10 rounded-lg font-bold border-slate-200 text-slate-700 hover:bg-slate-50">
                      Tambah Item
                    </Button>
                  </form>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
              <div className="p-6 h-full flex flex-col">
                <h3 className="text-sm font-bold text-slate-900 mb-6 uppercase tracking-wider">Detail Barang Masuk</h3>
                <div className="flex flex-wrap gap-2 mb-6 p-1 bg-slate-100 rounded-lg w-fit">
                   <Button 
                    type="button" 
                    variant={inboundType === 'General' ? 'default' : 'ghost'} 
                    onClick={() => setInboundType('General')}
                    className={`h-8 px-4 text-xs font-bold rounded-md transition-all ${inboundType === 'General' ? 'bg-white text-[#0C4196] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                   >General Stock</Button>
                   <Button 
                    type="button" 
                    variant={inboundType === 'SPO' ? 'default' : 'ghost'} 
                    onClick={() => setInboundType('SPO')}
                    className={`h-8 px-4 text-xs font-bold rounded-md transition-all ${inboundType === 'SPO' ? 'bg-white text-[#0C4196] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                   >Vendor PO Ref</Button>
                </div>

                <form id="inboundForm" onSubmit={submitInbound} className="space-y-6 flex-1 flex flex-col">
                  {inboundType === 'SPO' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="space-y-1.5 flex-1">
                        <Label className="text-xs font-bold text-slate-600 uppercase">Referensi Vendor PO</Label>
                        <select name="supplyPoId" required value={selectedSPOId} onChange={e => setSelectedSPOId(e.target.value)} className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0C4196] outline-none">
                          <option value="">Pilih Vendor PO...</option>
                          {supplyPos?.filter(spo => spo.status === 'Verified' || spo.status === 'Sent').map((w: any) => (
                            <option key={w.id} value={w.id}>{w.supplyPoNumber} ({owners.find(o => o.id === w.ownerId)?.name})</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5 flex-1 opacity-60">
                        <Label className="text-xs font-bold text-slate-600 uppercase">Pemasok</Label>
                        <select name="supplierId" required className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0C4196] outline-none">
                          <option value="">Pilih Pemasok...</option>
                          {suppliers?.map((s: any) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold text-slate-600 uppercase">Owner Target</Label>
                          <select required value={selectedOwnerId} onChange={e => setSelectedOwnerId(e.target.value)} className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0C4196] outline-none">
                            <option value="">Pilih Owner...</option>
                            {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold text-slate-600 uppercase">Gudang Target</Label>
                          <select required value={selectedWarehouseId} onChange={e => setSelectedWarehouseId(e.target.value)} className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0C4196] outline-none">
                            <option value="">Pilih Gudang...</option>
                            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold text-slate-600 uppercase">Pemasok</Label>
                          <select name="supplierId" required className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0C4196] outline-none">
                            <option value="">Pilih Pemasok...</option>
                            {suppliers?.map((s: any) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-600 uppercase">Nomor PO</Label>
                      <Input name="poNumber" required placeholder="PO-2023-XXXX" className="h-10 rounded-lg focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-600 uppercase">Nomor DO Pemasok</Label>
                      <Input name="supplierDoNumber" required placeholder="DO-SUPP-XXXX" className="h-10 rounded-lg focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-600 uppercase">Tanggal Masuk</Label>
                        <Input name="scheduledDate" type="date" className="h-10 rounded-lg focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]" defaultValue={format(new Date(), 'yyyy-MM-dd')} />
                     </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-600 uppercase">Catatan</Label>
                    <Input name="notes" placeholder="Catatan opsional untuk pengiriman ini" className="h-10 rounded-lg focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]" />
                  </div>

                  <div className="border border-slate-100 rounded-xl mt-6 flex-1 bg-slate-50/10 shadow-inner min-h-[200px] overflow-hidden">
                    <div className="overflow-x-auto">
                      <Table className="min-w-[500px]">
                        <TableHeader className="bg-slate-50/50 border-b border-slate-100">
                          <TableRow className="h-10">
                            <TableHead className="font-bold text-slate-600 text-[10px] uppercase pl-4">SKU</TableHead>
                            <TableHead className="font-bold text-slate-600 text-[10px] uppercase">Produk</TableHead>
                            <TableHead className="text-right font-bold text-slate-600 text-[10px] uppercase">Jumlah Diterima</TableHead>
                            <TableHead className="pr-4"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center py-20 text-slate-400 bg-white">
                                <ArrowDownToLine className="w-12 h-12 mx-auto text-slate-100 mb-2" />
                                <p className="text-sm font-bold text-slate-500">Belum ada item yang di-scan.</p>
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
                  </div>

                  <div className="flex justify-end pt-6 border-t mt-auto">
                    <Button type="submit" size="lg" disabled={items.length === 0} className="w-full sm:w-auto bg-[#0C4196] hover:bg-[#0C4196]/90 text-white shadow-sm rounded-lg px-10 font-bold h-12">
                      <CheckCircle2 className="w-5 h-5 mr-2" />
                      Proses Barang Masuk
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="history">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-slate-50/50 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider whitespace-nowrap">Riwayat Barang Masuk</h3>
                <div className="relative w-full md:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <Input 
                    placeholder="Cari No. Inbound, PO, atau Pemasok..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9 w-full bg-white border-slate-200 focus:border-[#0C4196] focus:ring-[#0C4196] text-xs pl-9"
                  />
                </div>
              </div>
              <select
                className="flex h-9 w-full md:w-44 rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm focus:border-[#0C4196] outline-none"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              >
                {availableMonths.map(month => (
                  <option key={month} value={month}>{format(new Date(month + '-01'), 'MMMM yyyy')}</option>
                ))}
              </select>
            </div>
            <div className="overflow-x-auto">
              <Table className="min-w-[900px]">
                <TableHeader className="bg-slate-50 border-b border-slate-200">
                  <TableRow className="h-12 hover:bg-transparent">
                    <TableHead className="font-bold text-slate-600 text-xs pl-6">Tanggal</TableHead>
                    <TableHead className="font-bold text-slate-600 text-xs">No. Inbound</TableHead>
                    <TableHead className="font-bold text-slate-600 text-xs">No. PO</TableHead>
                    <TableHead className="font-bold text-slate-600 text-xs">Gudang</TableHead>
                    <TableHead className="font-bold text-slate-600 text-xs">Pemasok</TableHead>
                    <TableHead className="text-right font-bold text-slate-600 text-xs text-center pr-6">Total Item</TableHead>
                    <TableHead className="text-right font-bold text-slate-600 text-xs text-center pr-6">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInbounds.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-20 text-slate-400">
                        Tidak ada data ditemukan untuk bulan ini.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredInbounds.map(inb => (
                      <TableRow key={inb.id} className="h-16 group hover:bg-slate-50/50">
                        <TableCell className="text-xs text-slate-500 pl-6">{format(new Date(inb.createdAt), 'dd/MM/yyyy HH:mm')}</TableCell>
                        <TableCell className="font-mono text-xs text-[#0C4196] uppercase">{inb.inboundNumber}</TableCell>
                        <TableCell className="text-xs font-bold text-slate-700 uppercase">{inb.poNumber || '-'}</TableCell>
                        <TableCell className="text-sm text-slate-700 font-medium">
                          {warehouses.find(w => w.id === inb.warehouseId)?.name || 'Tidak Diketahui'}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600 font-medium">
                          {suppliers.find(s => s.id === inb.supplierId)?.name || 'Pemasok Umum'}
                        </TableCell>
                        <TableCell className="text-center font-bold text-slate-900 border-x border-slate-50">
                          {inb.items?.reduce((sum: number, i: any) => sum + i.qty, 0) || 0}
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => { setViewInbound(inb); setIsViewOpen(true); }} className="h-8 w-8 text-slate-400 hover:text-[#0C4196] hover:bg-white">
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => openEdit(inb)} className="h-8 w-8 text-slate-400 hover:text-[#0C4196] hover:bg-white">
                              <Pencil className="w-3.5 h-3.5" />
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
          <DialogHeader className="p-4 sm:p-6 bg-[#0C4196] text-white">
            <DialogTitle className="text-xl font-bold flex items-center gap-3">
              <ArrowDownToLine className="w-6 h-6" /> Detail Barang Masuk
            </DialogTitle>
          </DialogHeader>
          {viewInbound && (
            <div className="p-4 sm:p-8 space-y-6 sm:space-y-8 max-h-[80vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 text-sm">
                <div className="space-y-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No. Inbound</span>
                    <span className="font-mono text-[#0C4196] font-bold text-base">{viewInbound.inboundNumber}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pemasok</span>
                    <span className="font-bold text-slate-900">{suppliers.find(s => s.id === viewInbound.supplierId)?.name || 'Pemasok Umum'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gudang Tujuan</span>
                    <span className="font-bold text-slate-900">{warehouses.find(w => w.id === viewInbound.warehouseId)?.name || 'Gudang Umum'}</span>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tanggal</span>
                    <span className="font-bold text-slate-900">{format(new Date(viewInbound.createdAt), 'dd MMMM yyyy HH:mm')}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No. PO</span>
                    <span className="font-bold text-slate-900">{viewInbound.poNumber || '-'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No. DO Pemasok</span>
                    <span className="font-bold text-slate-900">{viewInbound.supplierSjNumber || '-'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</span>
                    <span className="inline-flex w-fit px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-100">
                      Diterima
                    </span>
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
                    {viewInbound.items?.map((item: any, idx: number) => (
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

              {viewInbound.notes && (
                <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-100/50">
                  <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest block mb-1">Catatan</span>
                  <p className="text-sm text-amber-800">{viewInbound.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-5xl rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Ubah Tugas Barang Masuk</DialogTitle>
          </DialogHeader>
          {editInbound && (
            <form onSubmit={saveEdit} className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase">Gudang</Label>
                <select name="warehouseId" required defaultValue={editInbound.warehouseId} className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0C4196] outline-none">
                  {warehouses?.map((w: any) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase">Pemasok</Label>
                <select name="supplierId" required defaultValue={editInbound.supplierId} className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0C4196] outline-none">
                  {suppliers?.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase">Nomor PO</Label>
                <Input name="poNumber" defaultValue={editInbound.poNumber} required className="h-10 rounded-lg focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase">Nomor DO Pemasok</Label>
                <Input name="supplierDoNumber" defaultValue={editInbound.supplierSjNumber} required className="h-10 rounded-lg focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase">Tanggal Jadwal</Label>
                <Input name="scheduledDate" type="date" defaultValue={format(new Date(editInbound.scheduledDate), 'yyyy-MM-dd')} required className="h-10 rounded-lg focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase">Catatan</Label>
                <Input name="notes" defaultValue={editInbound.notes} className="h-10 rounded-lg focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]" />
              </div>
              <Button type="submit" className="w-full bg-[#0C4196] hover:bg-[#0C4196]/90 text-white rounded-lg font-bold h-11 mt-4 shadow-sm">
                Simpan Perubahan
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

