import React, { useState, useEffect, useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Layers, Search, Plus, Trash2, CheckCircle2, ArrowRightCircle } from 'lucide-react';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, updateDoc, writeBatch, runTransaction } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/authStore';
import { format } from 'date-fns';

// Vendor PO Dokumen pengadaan dan pengiriman barang ke warehouse.
// Relates to UnderlyingPO, Owner, Warehouse

export function SupplyPOs() {
  const [pos, setPos] = useState<any[]>([]);
  const [underlyingPos, setUnderlyingPos] = useState<any[]>([]);
  const [owners, setOwners] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUPOId, setSelectedUPOId] = useState('');
  const [allocationItems, setAllocationItems] = useState<any[]>([]);
  
  const { appUser } = useAuthStore();
  const isAdminOrManager = appUser?.role === 'Warehouse Manager' || appUser?.role === 'Super Admin';

  useEffect(() => {
    const unsubPos = onSnapshot(query(collection(db, 'supply_pos')), sn => setPos(sn.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubUpos = onSnapshot(query(collection(db, 'underlying_pos')), sn => setUnderlyingPos(sn.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubOwn = onSnapshot(query(collection(db, 'owners')), sn => setOwners(sn.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubWh = onSnapshot(query(collection(db, 'warehouses')), sn => setWarehouses(sn.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubProd = onSnapshot(query(collection(db, 'products')), sn => setProducts(sn.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubCust = onSnapshot(query(collection(db, 'customers')), sn => setCustomers(sn.docs.map(d => ({ id: d.id, ...d.data() }))));

    return () => { unsubPos(); unsubUpos(); unsubOwn(); unsubWh(); unsubProd(); unsubCust(); };
  }, []);

  const selectedUPO = useMemo(() => underlyingPos.find(u => u.id === selectedUPOId), [selectedUPOId, underlyingPos]);

  const upoStats = useMemo(() => {
    if (!selectedUPO) return null;
    
    // Items in Underlying PO
    const upoItems = selectedUPO.items || [];
    
    // Approved Vendor POs for this Underlying PO
    const relatedApprovedSPOs = pos.filter(p => p.underlyingPoId === selectedUPOId && p.status !== 'Draft' && p.status !== 'Cancelled');
    
    // Calculate consumed per product
    const consumed: Record<string, number> = {};
    relatedApprovedSPOs.forEach(spo => {
      spo.items?.forEach((it: any) => {
        consumed[it.productId] = (consumed[it.productId] || 0) + (Number(it.qty) || 0);
      });
    });

    const itemsWithStats = upoItems.map((it: any) => {
      const alreadyAllocated = consumed[it.productId] || 0;
      const remaining = Math.max(0, it.qty - alreadyAllocated);
      const fulfillment = it.qty > 0 ? (alreadyAllocated / it.qty) * 100 : 0;
      return { ...it, alreadyAllocated, remaining, fulfillment };
    });

    return {
      items: itemsWithStats,
      customer: customers.find(c => c.id === selectedUPO.customerId),
      dueDeliveryDate: selectedUPO.dueDeliveryDate,
    };
  }, [selectedUPO, pos, selectedUPOId, customers]);

  useEffect(() => {
    if (upoStats) {
      setAllocationItems(upoStats.items.map((it: any) => ({
        productId: it.productId,
        qty: 0,
        sku: products.find(p => p.id === it.productId)?.sku || '',
        name: products.find(p => p.id === it.productId)?.name || '',
        remaining: it.remaining,
        shippingAddress: it.shippingAddress
      })));
    } else {
      setAllocationItems([]);
    }
  }, [upoStats, products]);

  const filteredPOs = pos.filter(po => 
    po.supplyPoNumber?.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort((a, b) => b.createdAt - a.createdAt);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedUPO) {
      toast.error('Pilih Underlying PO terlebih dahulu');
      return;
    }

    const itemsToAllocate = allocationItems.filter(it => it.qty > 0);
    if (itemsToAllocate.length === 0) {
      toast.error('Masukkan jumlah alokasi minimal untuk satu produk');
      return;
    }

    // Validation: cannot exceed remaining
    for (const it of itemsToAllocate) {
      if (it.qty > it.remaining) {
        toast.error(`Alokasi untuk ${it.name} melebihi sisa PO (${it.remaining})`);
        return;
      }
    }

    const fd = new FormData(e.currentTarget);
    const warehouseId = fd.get('warehouseId') as string;
    const now = Date.now();
    
    try {
      await runTransaction(db, async (transaction) => {
        // Read inventory for all items
        const invUpdates: any[] = [];
        for (const item of itemsToAllocate) {
          const invId = `${selectedUPO.ownerId}_${warehouseId}_${item.productId}`;
          const invRef = doc(db, 'inventory', invId);
          const invSnap = await transaction.get(invRef);
          
          let currentAvailable = invSnap.exists() ? (Number(invSnap.data().availableQty) || 0) : 0;
          let currentReserved = invSnap.exists() ? (Number(invSnap.data().reservedQty) || 0) : 0;
          let currentOnHand = invSnap.exists() ? (Number(invSnap.data().onHandQty) || 0) : 0;

          if (currentAvailable < item.qty) {
            throw new Error(`Stok tersedia tidak cukup untuk ${item.name}. Tersedia: ${currentAvailable}, Diminta: ${item.qty}`);
          }

          const newAvailable = currentAvailable - item.qty;
          const newReserved = currentReserved + item.qty;

          invUpdates.push({
            ref: invRef,
            exists: invSnap.exists(),
            data: {
              availableQty: newAvailable,
              reservedQty: newReserved,
              ownerId: selectedUPO.ownerId,
              warehouseId: warehouseId,
              productId: item.productId,
              updatedAt: now,
              onHandQty: currentOnHand
            }
          });
        }

        // Apply updates
        for (const up of invUpdates) {
          if (up.exists) {
            transaction.update(up.ref, up.data);
          } else {
            transaction.set(up.ref, { ...up.data, damagedQty: 0 });
          }
        }

        // Create Vendor PO (Verified)
        const spoRef = doc(collection(db, 'supply_pos'));
        transaction.set(spoRef, {
          supplyPoNumber: fd.get('supplyPoNumber') as string,
          underlyingPoId: selectedUPOId,
          ownerId: selectedUPO.ownerId,
          warehouseId: warehouseId,
          items: itemsToAllocate.map(it => ({ productId: it.productId, qty: it.qty, shippingAddress: it.shippingAddress })),
          notes: fd.get('notes') as string,
          createdAt: now,
          createdBy: appUser?.uid,
          status: 'Verified',
          verifiedAt: now,
          verifiedBy: appUser?.uid
        });

        // Audit log
        const auditRef = doc(collection(db, 'audit_logs'));
        transaction.set(auditRef, {
            user: appUser?.name || 'Unknown',
            action: 'Vendor PO Created & Verified (Auto-Reserved)',
            module: 'Vendor PO',
            recordId: spoRef.id,
            timestamp: now
        });
      });

      toast.success('Vendor PO dibuat & Stok otomatis direservasi');
      setIsOpen(false);
      setSelectedUPOId('');
    } catch (error: any) {
      console.error(error);
      toast.error('Gagal membuat alokasi: ' + error.message);
    }
  };

  const verifySupplyPO = async (po: any) => {
    if (po.status !== 'Draft') return;
    
    const items = po.items || [];
    if (items.length === 0) {
      toast.error('Tidak ada item untuk diverifikasi');
      return;
    }

    const loadingToast = toast.loading('Memproses verifikasi & reservasi stok...');
    try {
      await runTransaction(db, async (transaction) => {
        // Read inventory for all items
        const invUpdates: any[] = [];
        for (const item of items) {
          const invId = `${po.ownerId}_${po.warehouseId}_${item.productId}`;
          const invRef = doc(db, 'inventory', invId);
          const invSnap = await transaction.get(invRef);
          
          let currentAvailable = invSnap.exists() ? (Number(invSnap.data().availableQty) || 0) : 0;
          let currentReserved = invSnap.exists() ? (Number(invSnap.data().reservedQty) || 0) : 0;
          let currentOnHand = invSnap.exists() ? (Number(invSnap.data().onHandQty) || 0) : 0;

          const newAvailable = currentAvailable - item.qty;
          const newReserved = currentReserved + item.qty;

          invUpdates.push({
            ref: invRef,
            exists: invSnap.exists(),
            data: {
              availableQty: newAvailable,
              reservedQty: newReserved,
              ownerId: po.ownerId,
              warehouseId: po.warehouseId,
              productId: item.productId,
              updatedAt: Date.now(),
              onHandQty: currentOnHand
            }
          });
        }

        // Apply updates
        for (const up of invUpdates) {
          if (up.exists) {
            transaction.update(up.ref, up.data);
          } else {
            transaction.set(up.ref, { ...up.data, damagedQty: 0 });
          }
        }

        // Update PO status
        transaction.update(doc(db, 'supply_pos', po.id), {
          status: 'Verified',
          verifiedAt: Date.now(),
          verifiedBy: appUser?.uid
        });

        // Audit log
        const auditRef = doc(collection(db, 'audit_logs'));
        transaction.set(auditRef, {
            user: appUser?.name || 'Unknown',
            action: 'Vendor PO Verified (Reservation Created)',
            module: 'Vendor PO',
            recordId: po.id,
            timestamp: Date.now()
        });
      });

      toast.dismiss(loadingToast);
      toast.success('Vendor PO diverifikasi & Stok direservasi');
    } catch (err: any) {
      console.error('Verify error:', err);
      toast.dismiss(loadingToast);
      toast.error('Gagal verifikasi: ' + err.message);
    }
  };

  const updateStatus = async (id: string, currentStatus: string) => {
    let nextStatus = currentStatus;
    if (currentStatus === 'Verified') nextStatus = 'Sent';
    else if (currentStatus === 'Sent') nextStatus = 'Completed';
    else return;

    try {
      await updateDoc(doc(db, 'supply_pos', id), {
        status: nextStatus,
        updatedAt: Date.now()
      });
      toast.success(`Status pindah ke ${nextStatus}`);
    } catch(err) {
      toast.error('Gagal update status');
    }
  };

  const handleDelete = async (po: any) => {
    if (!isAdminOrManager) return;
    
    if (po.status === 'Completed') {
      toast.error('Cannot delete a completed Vendor PO');
      return;
    }

    const loadingToast = toast.loading('Menghapus data & mengembalikan reservasi stok...');
    try {
      await runTransaction(db, async (transaction) => {
        // If PO was Verified or Sent, it has reservations that must be restored.
        if (po.status === 'Verified' || po.status === 'Sent') {
          for (const item of (po.items || [])) {
            const invId = `${po.ownerId}_${po.warehouseId}_${item.productId}`;
            const invRef = doc(db, 'inventory', invId);
            const invSnap = await transaction.get(invRef);
            
            if (invSnap.exists()) {
              const currentAvailable = Number(invSnap.data().availableQty) || 0;
              const currentReserved = Number(invSnap.data().reservedQty) || 0;
              
              transaction.update(invRef, {
                availableQty: currentAvailable + item.qty,
                reservedQty: Math.max(0, currentReserved - item.qty),
                updatedAt: Date.now()
              });
            }
          }
        }
        
        // Delete the PO
        transaction.delete(doc(db, 'supply_pos', po.id));

        // Audit log
        const auditRef = doc(collection(db, 'audit_logs'));
        transaction.set(auditRef, {
            user: appUser?.name || 'Unknown',
            action: `Vendor PO Deleted (Status: ${po.status}${po.status !== 'Draft' ? ', Stock Restored' : ''})`,
            module: 'Vendor PO',
            recordId: po.id,
            timestamp: Date.now()
        });
      });

      toast.dismiss(loadingToast);
      toast.success('Vendor PO dihapus & Reservasi dikembalikan');
    } catch(err: any) {
      console.error('Delete error:', err);
      toast.dismiss(loadingToast);
      toast.error('Gagal menghapus: ' + err.message);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('PERHATIAN: Apakah Anda yakin ingin menghapus SEMUA data Vendor PO?')) return;
    try {
      for (const p of pos) {
        await deleteDoc(doc(db, 'supply_pos', p.id));
      }
      toast.success('Semua data Vendor PO berhasil dihapus!');
    } catch(err: any) {
      console.error(err);
      toast.error('Gagal menghapus semua data: ' + err.message);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 leading-none">Vendor PO (Stock Allocation)</h2>
          <p className="text-sm md:text-base text-slate-500 font-medium mt-2">Alokasi dan reservasi stok berdasarkan Underlying PO</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2">
          {isAdminOrManager && (
            <Button variant="destructive" onClick={handleClearAll} className="w-full sm:w-auto rounded-lg px-6 font-bold shadow-sm transition-all h-11">
              Hapus Semua
            </Button>
          )}
          {isAdminOrManager && (
            <Dialog open={isOpen} onOpenChange={(v) => { setIsOpen(v); if(!v) setSelectedUPOId(''); }}>
              <DialogTrigger nativeButton={true} render={
                <Button className="w-full sm:w-auto bg-[#0C4196] hover:bg-[#0C4196]/90 text-white rounded-lg px-6 font-bold shadow-sm transition-all h-11">
                  <Plus className="w-4 h-4 mr-2" />
                  Buat Allocation (VPO)
                </Button>
              } />
            <DialogContent className="rounded-xl sm:max-w-[1200px] w-[95vw] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">Buat Stock Allocation (Vendor PO)</DialogTitle>
              </DialogHeader>
              <form onSubmit={onSubmit} className="space-y-6 mt-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                   <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-600 uppercase">1. Referensi Underlying PO</Label>
                    <select name="underlyingPoId" required value={selectedUPOId} onChange={e => setSelectedUPOId(e.target.value)} className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0C4196] outline-none">
                      <option value="">Pilih Underlying PO...</option>
                      {underlyingPos.map(u => <option key={u.id} value={u.id}>{u.poNumber}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-600 uppercase">2. Vendor PO Number (Internal)</Label>
                    <Input name="supplyPoNumber" required placeholder="Contoh: VPO-ALLOC-001" className="h-10 rounded-lg focus:border-[#0C4196]" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-600 uppercase">3. Target Gudang (Stock Location)</Label>
                    <select name="warehouseId" required className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0C4196] outline-none">
                      <option value="">Pilih Gudang...</option>
                      {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                </div>

                {upoStats && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl shadow-sm">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Customer</span>
                        <span className="font-bold text-slate-900 border-b border-white pb-1">{upoStats.customer?.name || '-'}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                         <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Due Delivery Date</span>
                         <span className="font-bold text-slate-900 border-b border-white pb-1">{upoStats.dueDeliveryDate ? format(new Date(upoStats.dueDeliveryDate), 'dd MMMM yyyy') : '-'}</span>
                      </div>
                       <div className="flex flex-col gap-1">
                         <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Owner (Principal)</span>
                         <span className="font-bold text-slate-900 border-b border-white pb-1">{owners.find(o => o.id === selectedUPO?.ownerId)?.name || '-'}</span>
                      </div>
                    </div>

                    <div className="space-y-3">
                         <h4 className="text-xs font-bold text-slate-900 uppercase tracking-widest px-1">Item Allocation Matrix</h4>
                         <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm overflow-x-auto">
                            <Table className="min-w-[800px]">
                               <TableHeader className="bg-slate-50">
                                  <TableRow>
                                    <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Product</TableHead>
                                    <TableHead className="text-[10px] font-bold text-slate-500 uppercase">PO Qty</TableHead>
                                    <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Allocated</TableHead>
                                    <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Remaining</TableHead>
                                    <TableHead className="text-[10px] font-bold text-slate-500 uppercase text-center">Fulfillment</TableHead>
                                    <TableHead className="text-[10px] font-bold text-slate-700 uppercase bg-blue-50/50">Qty Allocation (Current)</TableHead>
                                    <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Ship-to Address (Read-only)</TableHead>
                                  </TableRow>
                               </TableHeader>
                               <TableBody>
                                  {allocationItems.map((it, idx) => (
                                    <TableRow key={idx}>
                                       <TableCell className="py-4">
                                          <div className="flex flex-col">
                                            <span className="font-bold text-slate-900">{it.name}</span>
                                            <span className="text-[10px] font-mono text-slate-400 uppercase">{it.sku}</span>
                                          </div>
                                       </TableCell>
                                       <TableCell className="font-medium text-slate-600">{upoStats.items[idx].qty}</TableCell>
                                       <TableCell className="font-medium text-blue-600">{upoStats.items[idx].alreadyAllocated}</TableCell>
                                       <TableCell className="font-bold text-slate-900">{it.remaining}</TableCell>
                                       <TableCell className="text-center">
                                          <div className="w-20 mx-auto">
                                             <div className="text-[10px] font-bold text-slate-500 mb-1">{Math.round(upoStats.items[idx].fulfillment)}%</div>
                                             <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-[#0C4196] transition-all" style={{ width: `${Math.min(100, upoStats.items[idx].fulfillment)}%` }}></div>
                                             </div>
                                          </div>
                                       </TableCell>
                                       <TableCell className="bg-blue-50/20">
                                          <Input 
                                            type="number" 
                                            min="0"
                                            max={it.remaining}
                                            value={it.qty}
                                            onChange={e => {
                                              const newItems = [...allocationItems];
                                              newItems[idx].qty = Number(e.target.value);
                                              setAllocationItems(newItems);
                                            }}
                                            className="h-9 w-24 rounded-lg border-blue-200 focus:border-[#0C4196] font-bold text-[#0C4196]"
                                          />
                                       </TableCell>
                                       <TableCell className="text-[10px] text-slate-500 max-w-[200px] truncate" title={it.shippingAddress}>
                                          {it.shippingAddress || '-'}
                                       </TableCell>
                                    </TableRow>
                                  ))}
                               </TableBody>
                            </Table>
                         </div>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase">Catatan</Label>
                  <Input name="notes" placeholder="Catatan internal atau instruksi alokasi..." className="h-10 rounded-lg focus:border-[#0C4196]" />
                </div>

                <div className="flex justify-end pt-4 border-t">
                    <Button type="submit" disabled={!selectedUPOId} className="w-full h-11 bg-[#0C4196] hover:bg-[#0C4196]/90 text-white rounded-lg font-bold shadow-sm">
                        Submit Vendor PO (Draft Allocation)
                    </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-slate-50/50">
          <div className="relative w-full max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input 
               placeholder="Cari Vendor PO..." 
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               className="pl-9 h-10 rounded-lg bg-white border-slate-200 focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]" 
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHeader className="bg-slate-50 border-b border-slate-200">
              <TableRow className="hover:bg-transparent h-12">
                <TableHead className="font-bold text-slate-600 text-xs pl-6">Vendor PO No</TableHead>
                <TableHead className="font-bold text-slate-600 text-xs text-center">Status</TableHead>
                <TableHead className="font-bold text-slate-600 text-xs">Underlying PO</TableHead>
                <TableHead className="font-bold text-slate-600 text-xs">Produk Alokasi</TableHead>
                <TableHead className="font-bold text-slate-600 text-xs">Owner & Gudang</TableHead>
                <TableHead className="text-right font-bold text-slate-600 text-xs text-center pr-6">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPOs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-20 text-slate-400">
                    <Layers className="w-12 h-12 mx-auto text-slate-200 mb-3" />
                    <p className="text-sm font-bold text-slate-600">Vendor PO tidak ditemukan</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredPOs.map((po) => {
                  const uPos = underlyingPos.find(u => u.id === po.underlyingPoId)?.poNumber || '-';
                  const ownerName = owners.find(o => o.id === po.ownerId)?.name || 'Unknown';
                  const whName = warehouses.find(w => w.id === po.warehouseId)?.name || 'Unknown';
                  
                  const poItems: any[] = po.items || [];

                  return (
                   <TableRow key={po.id} className="h-16 group hover:bg-slate-50/50">
                    <TableCell className="font-mono text-xs font-medium text-[#0C4196] pl-6 uppercase">{po.supplyPoNumber}</TableCell>
                    <TableCell className="text-center">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                        po.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' :
                        po.status === 'Verified' ? 'bg-blue-100 text-blue-700' :
                        po.status === 'Sent' ? 'bg-orange-100 text-orange-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {po.status}
                      </span>
                    </TableCell>
                    <TableCell className="font-bold text-slate-700 text-xs uppercase">{uPos}</TableCell>
                    <TableCell>
                       <div className="space-y-1">
                          {poItems.map((it, idx) => {
                            const pName = products.find(p => p.id === it.productId)?.name || 'Unknown';
                            return (
                              <div key={idx} className="flex items-center gap-2">
                                 <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-mono font-bold text-slate-500">{it.qty}x</span>
                                 <span className="text-xs font-bold text-slate-900">{pName}</span>
                              </div>
                            )
                          })}
                       </div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                       <div><span className="font-bold text-slate-500">O:</span> {ownerName}</div>
                       <div className="mt-0.5"><span className="font-bold text-slate-500">W:</span> {whName}</div>
                    </TableCell>
                        <TableCell className="text-right pr-6">
                          <div className="flex justify-end gap-1">
                            {po.status === 'Draft' && isAdminOrManager && (
                              <Button variant="ghost" size="icon" onClick={() => verifySupplyPO(po)} title="Verifikasi & Reservasi Stok" className="h-8 w-8 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50">
                                <CheckCircle2 className="w-4 h-4" />
                              </Button>
                            )}
                        {po.status !== 'Completed' && po.status !== 'Draft' && isAdminOrManager && (
                          <Button variant="ghost" size="icon" onClick={() => updateStatus(po.id, po.status)} title="Proses Status Selanjutnya" className="h-8 w-8 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50">
                            <ArrowRightCircle className="w-4 h-4" />
                          </Button>
                        )}
                        {isAdminOrManager && (
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(po)} className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                   </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
