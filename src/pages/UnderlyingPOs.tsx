import React, { useState, useEffect } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileText, Search, Plus, Trash2, Pencil, Eye, CheckCircle2 } from 'lucide-react';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/authStore';
import { format } from 'date-fns';

export function UnderlyingPOs() {
  const [pos, setPos] = useState<any[]>([]);
  const [owners, setOwners] = useState<any[]>([]);
  const [executors, setExecutors] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [ledgers, setLedgers] = useState<any[]>([]);
  
  const [isOpen, setIsOpen] = useState(false);
  const [viewingPO, setViewingPO] = useState<any>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [editPO, setEditPO] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [items, setItems] = useState<{productId: string, qty: number, shippingAddress: string, dueDeliveryDate?: string}[]>([{productId: '', qty: 1, shippingAddress: '', dueDeliveryDate: ''}]);
  
  const { appUser } = useAuthStore();
  const isAdminOrManager = appUser?.role === 'Warehouse Manager' || appUser?.role === 'Super Admin';
  const isAdmin = appUser?.role === 'Super Admin';

  useEffect(() => {
    const qPOs = query(collection(db, 'underlying_pos'));
    const unsubPOs = onSnapshot(qPOs, sn => setPos(sn.docs.map(d => ({ id: d.id, ...d.data() }))));

    const qDeli = query(collection(db, 'delivery_orders'));
    const unsubDeli = onSnapshot(qDeli, sn => setDeliveries(sn.docs.map(d => ({ id: d.id, ...d.data() }))));

    const qLedger = query(collection(db, 'inventory_ledgers'));
    const unsubLedger = onSnapshot(qLedger, sn => setLedgers(sn.docs.map(d => ({ id: d.id, ...d.data() }))));

    const qOwn = query(collection(db, 'owners'));
    const unsubOwn = onSnapshot(qOwn, sn => setOwners(sn.docs.map(d => ({ id: d.id, ...d.data() }))));

    const qExe = query(collection(db, 'project_executors'));
    const unsubExe = onSnapshot(qExe, sn => setExecutors(sn.docs.map(d => ({ id: d.id, ...d.data() }))));

    const qCust = query(collection(db, 'customers'));
    const unsubCust = onSnapshot(qCust, sn => setCustomers(sn.docs.map(d => ({ id: d.id, ...d.data() }))));

    const qProd = query(collection(db, 'products'));
    const unsubProd = onSnapshot(qProd, sn => setProducts(sn.docs.map(d => ({ id: d.id, ...d.data() }))));

    return () => { unsubPOs(); unsubDeli(); unsubLedger(); unsubOwn(); unsubExe(); unsubCust(); unsubProd(); };
  }, []);

  // Auto Status Update Logic
  useEffect(() => {
    if (pos.length === 0 || deliveries.length === 0) return;

    pos.forEach(async (po) => {
      if (po.status === 'Draft' || po.status === 'Closed' || po.status === 'Completed') return;

      const poItems = po.items || [];
      if (poItems.length === 0) return;

      const relatedDeliveries = deliveries.filter(d => d.underlyingPoId === po.id);
      
      let totalOrderedQty = 0;
      let totalShippedQty = 0;
      let totalDamagedQty = 0;
      let someShipped = false;

      poItems.forEach(item => {
        totalOrderedQty += (item.qty || 0);

        const pid = item.productId || item.product?.id;
        const normalizedItemAddr = (item.shippingAddress || '').trim().toLowerCase();
        
        const itemShipped = relatedDeliveries.reduce((sum, d) => {
          const normalizedDeliAddr = (d.shippingAddress || '').trim().toLowerCase();
          // Match by product ID. If either has shipping address, they must match.
          if (normalizedItemAddr && normalizedDeliAddr && normalizedItemAddr !== normalizedDeliAddr) return sum;
          
          const line = d.items?.find((it: any) => (it.productId === pid || it.product?.id === pid));
          return sum + (line?.qty || 0);
        }, 0);
        
        const itemDamaged = ledgers.filter(l => 
          l.referenceId && 
          relatedDeliveries.some(d => {
            const normalizedDeliAddr = (d.shippingAddress || '').trim().toLowerCase();
            if (normalizedItemAddr && normalizedDeliAddr && normalizedItemAddr !== normalizedDeliAddr) return false;
            return d.id === l.referenceId;
          }) && 
          l.productId === pid &&
          l.transactionType === 'OUTBOUND_DAMAGE'
        ).reduce((sum, l) => sum + (l.qtyChange || 0), 0);

        totalShippedQty += itemShipped;
        totalDamagedQty += itemDamaged;
        if (itemShipped > 0) someShipped = true;
      });

      let nextStatus: string = po.status;
      const netShipped = totalShippedQty - totalDamagedQty;

      if (netShipped >= totalOrderedQty && totalOrderedQty > 0) {
        nextStatus = 'Completed';
      } else if (totalDamagedQty > 0) {
        nextStatus = 'Partial Refund';
      } else if (totalShippedQty >= totalOrderedQty && totalOrderedQty > 0) {
        // Technically fully sent, but if netShipped < totalOrdered (due to damages), it falls to Partial Refund above.
        // If totalDamaged leads to extra demand, it stays Partial Refund until satisfied.
        nextStatus = 'Sent';
      } else if (someShipped) {
        nextStatus = 'Partial Sent';
      } else if (po.verifiedAt) {
        nextStatus = 'Verified';
      }

      if (nextStatus !== po.status) {
        try {
          await updateDoc(doc(db, 'underlying_pos', po.id), {
            status: nextStatus,
            ...(nextStatus === 'Completed' ? { completedAt: Date.now() } : {})
          });
        } catch (e) {
          console.error("Auto status update failed", e);
        }
      }
    });
  }, [pos, deliveries, ledgers]);

  const filteredPOs = pos.filter(po => 
    po.poNumber?.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort((a, b) => b.createdAt - a.createdAt);

  const openAdd = () => {
    setEditPO(null);
    setItems([{ productId: '', qty: 1, shippingAddress: '', dueDeliveryDate: '' }]);
    setIsOpen(true);
  };

  const openEdit = (po: any) => {
    setEditPO(po);
    if (po.items && po.items.length > 0) {
      setItems(po.items.map((it: any) => ({
        productId: it.productId,
        qty: it.qty,
        shippingAddress: it.shippingAddress || '',
        dueDeliveryDate: it.dueDeliveryDate || ''
      })));
    } else if (po.productId) {
      setItems([{ 
        productId: po.productId, 
        qty: po.qty || 1, 
        shippingAddress: po.shippingAddress || '', 
        dueDeliveryDate: po.dueDeliveryDate || '' 
      }]);
    } else {
      setItems([{ productId: '', qty: 1, shippingAddress: '', dueDeliveryDate: '' }]);
    }
    setIsOpen(true);
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = {
      poNumber: fd.get('poNumber') as string,
      customerId: fd.get('customerId') as string,
      ownerId: fd.get('ownerId') as string,
      executorId: fd.get('executorId') as string,
      poDate: fd.get('poDate') as string,
      items: items,
      updatedAt: Date.now()
    };

    try {
      if (editPO) {
        await setDoc(doc(db, 'underlying_pos', editPO.id), { ...editPO, ...data });
        
        // Log Audit Trail
        addDoc(collection(db, 'audit_logs'), {
             user: appUser?.name || 'Unknown',
             action: 'Underlying PO Updated',
             module: 'Underlying PO',
             recordId: editPO.id,
             timestamp: Date.now()
        });

        toast.success('Underlying PO diperbarui');
      } else {
        const poRef = await addDoc(collection(db, 'underlying_pos'), { 
          ...data, 
          status: 'Draft',
          createdAt: Date.now(),
          createdBy: appUser?.uid 
        });

        // Log Audit Trail
        addDoc(collection(db, 'audit_logs'), {
             user: appUser?.name || 'Unknown',
             action: 'Underlying PO Created',
             module: 'Underlying PO',
             recordId: poRef.id,
             timestamp: Date.now()
        });

        toast.success('Underlying PO ditambahkan');
      }
      setIsOpen(false);
      setEditPO(null);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Gagal menyimpan Underlying PO');
    }
  };

  const handleDelete = async (id: string, poNum: string) => {
    setIsDeleting(id);
    const loadingToast = toast.loading(`Menghapus PO ${poNum}...`);
    try {
      await deleteDoc(doc(db, 'underlying_pos', id));
      toast.dismiss(loadingToast);
      toast.success('PO berhasil dihapus');
    } catch(err: any) {
      console.error('Delete error:', err);
      toast.dismiss(loadingToast);
      toast.error(err.message || 'Gagal menghapus PO');
    } finally {
      setIsDeleting(null);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('PERHATIAN: Apakah Anda yakin ingin menghapus SEMUA data Underlying PO?')) return;
    try {
      for (const p of pos) {
        await deleteDoc(doc(db, 'underlying_pos', p.id));
      }
      toast.success('Semua data Underlying PO berhasil dihapus!');
    } catch(err: any) {
      console.error(err);
      toast.error('Gagal menghapus semua data: ' + err.message);
    }
  };

  const handleVerify = async (id: string) => {
    try {
      await updateDoc(doc(db, 'underlying_pos', id), {
        status: 'Verified',
        verifiedAt: Date.now(),
        verifiedBy: appUser?.uid
      });
      // Log Audit
      addDoc(collection(db, 'audit_logs'), {
          user: appUser?.name || 'Unknown',
          action: 'Underlying PO Verified',
          module: 'Underlying PO',
          recordId: id,
          timestamp: Date.now()
      });
      toast.success('PO diverifikasi');
    } catch (error) {
      toast.error('Gagal verifikasi PO');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 leading-none">Underlying PO</h2>
          <p className="text-sm md:text-base text-slate-500 font-medium mt-2">Dokumen referensi utama yang berasal dari customer</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2">
          {isAdminOrManager && (
            <Button variant="destructive" onClick={handleClearAll} className="w-full sm:w-auto rounded-lg px-6 font-bold shadow-sm transition-all h-11">
              Hapus Semua
            </Button>
          )}
          {isAdminOrManager && (
            <Dialog open={isOpen} onOpenChange={(v) => { setIsOpen(v); if(!v) setEditPO(null); }}>
              <DialogTrigger nativeButton={true} render={
                <Button onClick={openAdd} className="w-full sm:w-auto bg-[#0C4196] hover:bg-[#0C4196]/90 text-white rounded-lg px-6 font-bold shadow-sm transition-all h-11">
                  <Plus className="w-4 h-4 mr-2" />
                  Tambah PO
                </Button>
              } />
            <DialogContent className="rounded-xl sm:max-w-[1200px] w-[95vw] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">{editPO ? 'Ubah Underlying PO' : 'Tambah Underlying PO'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={onSubmit} className="space-y-4 mt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-600 uppercase">Underlying PO Number</Label>
                    <Input name="poNumber" required placeholder="Contoh: PO-TELKOM-001" className="h-10 rounded-lg focus:border-[#0C4196]" defaultValue={editPO?.poNumber} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-600 uppercase">Nama Customer</Label>
                    <select name="customerId" required className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0C4196] outline-none" defaultValue={editPO?.customerId}>
                      <option value="">Pilih Customer...</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
                
                <div className="space-y-4 border p-4 rounded-lg bg-slate-50 border-slate-200">
                  <div className="flex justify-between items-center bg-slate-100 p-2 rounded-md">
                    <Label className="text-xs font-bold text-slate-600 uppercase">Item Produk</Label>
                    <Button type="button" size="sm" variant="outline" onClick={() => setItems([...items, { productId: '', qty: 1, shippingAddress: '', dueDeliveryDate: '' }])} className="h-8 text-xs font-bold bg-white">
                      <Plus className="w-3 h-3 mr-1" />
                      Tambah
                    </Button>
                  </div>
                  
                  {items.map((item, idx) => (
                    <div key={idx} className="space-y-3 p-3 border border-slate-200 bg-white rounded-lg relative">
                      {items.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => setItems(items.filter((_, i) => i !== idx))} className="absolute top-2 right-2 h-6 w-6 text-slate-400 hover:text-red-500 bg-slate-50">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pr-8">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold text-slate-600 uppercase">Product</Label>
                          <select required value={item.productId} onChange={(e) => {
                            const newItems = [...items];
                            newItems[idx].productId = e.target.value;
                            setItems(newItems);
                          }} className="flex h-10 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#0C4196] outline-none">
                            <option value="">Pilih Product...</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.sku} - {p.name}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1.5 focus-within:ring-1 focus-within:ring-[#0C4196] rounded-lg">
                          <Label className="text-xs font-bold text-slate-600 uppercase">Quantity</Label>
                          <Input type="number" required min="1" value={item.qty} onChange={(e) => {
                            const newItems = [...items];
                            newItems[idx].qty = Number(e.target.value);
                            setItems(newItems);
                          }} className="h-10 rounded-lg border-slate-200 focus:border-[#0C4196]" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold text-slate-600 uppercase italic text-[#0C4196]">Due Date Item</Label>
                          <Input type="date" value={item.dueDeliveryDate || ''} onChange={(e) => {
                            const newItems = [...items];
                            newItems[idx].dueDeliveryDate = e.target.value;
                            setItems(newItems);
                          }} className="h-10 rounded-lg border-slate-200 focus:border-[#0C4196]" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold text-slate-600 uppercase">Alamat Pengiriman (Item)</Label>
                          <Input placeholder="Alamat khusus item ini..." value={item.shippingAddress} onChange={(e) => {
                            const newItems = [...items];
                            newItems[idx].shippingAddress = e.target.value;
                            setItems(newItems);
                          }} className="h-10 rounded-lg border-slate-200 focus:border-[#0C4196]" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-600 uppercase">Owner Inventory</Label>
                    <select name="ownerId" required className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0C4196] outline-none" defaultValue={editPO?.ownerId}>
                      <option value="">Pilih Owner...</option>
                      {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-600 uppercase">Project Executor</Label>
                    <select name="executorId" required className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0C4196] outline-none" defaultValue={editPO?.executorId}>
                      <option value="">Pilih Executor...</option>
                      {executors.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-600 uppercase">Tanggal PO</Label>
                    <Input name="poDate" type="date" required className="h-10 rounded-lg focus:border-[#0C4196]" defaultValue={editPO?.poDate} />
                  </div>
                </div>

                <Button type="submit" className="w-full h-11 bg-[#0C4196] hover:bg-[#0C4196]/90 text-white rounded-lg font-bold mt-4 shadow-sm">
                  {editPO ? 'Simpan Perubahan' : 'Buat Underlying PO'}
                </Button>
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
               placeholder="Cari PO atau Project..." 
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               className="pl-9 h-10 rounded-lg bg-white border-slate-200 focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]" 
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table className="min-w-[1000px]">
            <TableHeader className="bg-slate-50 border-b border-slate-200">
              <TableRow className="hover:bg-transparent h-12">
                <TableHead className="font-bold text-slate-600 text-xs pl-6">No. PO</TableHead>
                <TableHead className="font-bold text-slate-600 text-xs">Customer</TableHead>
                <TableHead className="font-bold text-slate-600 text-xs">Produk & Pengiriman</TableHead>
                <TableHead className="font-bold text-slate-600 text-xs">Owner & Executor</TableHead>
                <TableHead className="font-bold text-slate-600 text-xs text-center whitespace-nowrap px-4">Tgl PO</TableHead>
                <TableHead className="font-bold text-slate-600 text-xs text-center">Status PO</TableHead>
                <TableHead className="text-right font-bold text-slate-600 text-xs pr-6">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPOs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-20 text-slate-400">
                    <FileText className="w-12 h-12 mx-auto text-slate-200 mb-3" />
                    <p className="text-sm font-bold text-slate-600">Underlying PO tidak ditemukan</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredPOs.map((po) => {
                  const customerName = customers.find(c => c.id === po.customerId)?.name || 'Unknown';
                  const ownerName = owners.find(o => o.id === po.ownerId)?.name || 'Unknown';
                  const executorName = executors.find(e => e.id === po.executorId)?.name || 'Unknown';
                  
                  const poItems: any[] = po.items && po.items.length > 0
                    ? po.items 
                    : po.productId ? [{ productId: po.productId, qty: po.qty || 1, shippingAddress: po.shippingAddress || '' }] : [];

                  let isLate = false;
                  if (po.dueDeliveryDate && po.status !== 'Closed') {
                    if (new Date(po.dueDeliveryDate).getTime() < Date.now()) {
                      isLate = true;
                    }
                  }

                  return (
                   <TableRow key={po.id} className="h-16 group hover:bg-slate-50/50">
                    <TableCell className="font-mono text-xs font-medium text-[#0C4196] pl-6 uppercase">{po.poNumber}</TableCell>
                    <TableCell className="font-bold text-slate-900 text-sm">{customerName}</TableCell>
                    <TableCell>
                      <div className="space-y-2">
                         {poItems.map((it, idx) => {
                           const pName = products.find(p => p.id === it.productId)?.name || 'Unknown Product';
                           return (
                             <div key={idx} className="bg-slate-50 rounded p-2 border border-slate-100 min-w-[200px]">
                               <div className="font-bold text-slate-900 text-sm">{pName}</div>
                               <div className="mt-1 flex flex-col gap-0.5">
                                  <div className="flex justify-between items-center">
                                     <span className="text-xs text-slate-500 font-bold">Qty: {it.qty}</span>
                                     {it.dueDeliveryDate && <span className="text-[10px] text-red-600 font-bold tracking-tighter uppercase">Due: {format(new Date(it.dueDeliveryDate), 'dd/MM/yy')}</span>}
                                  </div>
                                  {it.shippingAddress && <span className="text-[10px] text-slate-400 max-w-[180px] truncate" title={it.shippingAddress}>Kirim ke: {it.shippingAddress}</span>}
                               </div>
                             </div>
                           )
                         })}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                       <div><span className="font-bold text-slate-500">O:</span> {ownerName}</div>
                       <div className="mt-0.5"><span className="font-bold text-slate-500">E:</span> {executorName}</div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 font-bold text-center px-4">
                       {po.poDate ? format(new Date(po.poDate), 'dd/MM/yyyy') : '-'}
                    </TableCell>
                    <TableCell className="text-center space-y-1">
                      <div>
                        <span className={`inline-flex min-w-[70px] justify-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          po.status === 'Draft' ? 'bg-slate-100 text-slate-600 border-slate-200' :
                          po.status === 'Verified' ? 'bg-blue-50 text-[#0C4196] border-blue-100' :
                          po.status === 'Partial Sent' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                          po.status === 'Sent' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                          po.status === 'Partial Refund' ? 'bg-red-50 text-red-600 border-red-100' :
                          po.status === 'Completed' ? 'bg-emerald-600 text-white border-emerald-700 font-black' :
                          po.status === 'Closed' ? 'bg-slate-800 text-white border-slate-900' :
                          'bg-slate-50 text-slate-400 border-slate-100'
                         } border`}>
                          {po.status}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <div className="flex justify-end gap-1">
                        {(po.status === 'Draft' || po.status === 'Verified') && isAdminOrManager && (
                          <>
                            {po.status === 'Draft' && (
                              <Button variant="ghost" size="icon" onClick={() => handleVerify(po.id)} title="Verifikasi PO" className="h-8 w-8 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => openEdit(po)} title="Edit PO" className="h-8 w-8 text-slate-400 hover:text-[#0C4196] hover:bg-white">
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}

                        <Button variant="ghost" size="icon" onClick={() => { setViewingPO(po); setIsViewOpen(true); }} title="Lihat Detail & Pengiriman" className="h-8 w-8 text-slate-400 hover:text-[#0C4196] hover:bg-white">
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        
                        {isAdminOrManager && (
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(po.id, po.poNumber)} disabled={isDeleting === po.id} className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50">
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

      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="sm:max-w-[1200px] w-[95vw] rounded-xl max-h-[90vh] overflow-y-auto overflow-x-hidden shadow-2xl p-0">
          <div className="p-4 sm:p-6 md:p-10 w-full max-w-full min-w-0 overflow-x-hidden">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#0C4196]" />
                Detail Underlying PO & Pengiriman
              </DialogTitle>
            </DialogHeader>
            {viewingPO && (
              <div className="space-y-6 pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-slate-50 border border-slate-100 rounded-xl">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No. PO</span>
                    <p className="font-bold text-slate-900">{viewingPO.poNumber}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Customer</span>
                    <p className="font-bold text-slate-900">{customers.find(c => c.id === viewingPO.customerId)?.name || '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</span>
                    <div>
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        viewingPO.status === 'Draft' ? 'bg-slate-100 text-slate-600' :
                        viewingPO.status === 'Completed' ? 'bg-emerald-600 text-white' :
                        'bg-blue-50 text-[#0C4196]'
                      }`}>
                        {viewingPO.status}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1 sm:text-right">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tgl PO</span>
                    <p className="font-bold text-slate-900">{viewingPO.poDate ? format(new Date(viewingPO.poDate), 'dd/MM/yyyy') : '-'}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Item & Fulfillment</h4>
                  <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
                    <Table className="min-w-[800px]">
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead className="text-[10px] font-bold">Produk</TableHead>
                          <TableHead className="text-right text-[10px] font-bold">Pesanan (Qty)</TableHead>
                          <TableHead className="text-right text-[10px] font-bold">Dikirim</TableHead>
                          <TableHead className="text-right text-[10px] font-bold">Rusak/Refund</TableHead>
                          <TableHead className="text-right text-[10px] font-bold">Sisa</TableHead>
                          <TableHead className="text-right text-[10px] font-bold pr-4">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(viewingPO.items || (viewingPO.productId ? [{ productId: viewingPO.productId, qty: viewingPO.qty || 0, shippingAddress: viewingPO.shippingAddress || '' }] : [])).map((item: any, idx: number) => {
                          const pid = item.productId || item.product?.id;
                          const normalizedItemAddr = (item.shippingAddress || '').trim().toLowerCase();
                          const relatedDeliveries = deliveries.filter(d => d.underlyingPoId === viewingPO.id);
                          
                          const totalShipped = relatedDeliveries.reduce((sum, d) => {
                             const normalizedDeliAddr = (d.shippingAddress || '').trim().toLowerCase();
                             if (normalizedItemAddr && normalizedDeliAddr && normalizedItemAddr !== normalizedDeliAddr) return sum;
                             
                             const line = d.items?.find((it: any) => (it.productId === pid || it.product?.id === pid));
                             return sum + (line?.qty || 0);
                          }, 0);

                          const totalDamaged = ledgers.filter(l => 
                             l.referenceId && 
                             relatedDeliveries.some(d => {
                                const normalizedDeliAddr = (d.shippingAddress || '').trim().toLowerCase();
                                if (normalizedItemAddr && normalizedDeliAddr && normalizedItemAddr !== normalizedDeliAddr) return false;
                                return d.id === l.referenceId;
                             }) && 
                             l.productId === pid &&
                             l.transactionType === 'OUTBOUND_DAMAGE'
                          ).reduce((sum, l) => sum + (l.qtyChange || 0), 0);

                          const netShipped = totalShipped - totalDamaged;
                          const remaining = (item.qty || 0) - netShipped;

                          return (
                             <TableRow key={idx} className="hover:bg-slate-50/50">
                                <TableCell className="font-medium">
                                   <div className="flex flex-col">
                                      <span className="text-sm font-bold text-slate-900">{products.find(p => p.id === item.productId)?.name || 'Unknown'}</span>
                                      <span className="text-[10px] text-slate-400 uppercase font-mono">{products.find(p => p.id === item.productId)?.sku}</span>
                                      <div className="mt-1 flex flex-col gap-0.5">
                                        {item.shippingAddress && <span className="text-[10px] text-[#0C4196] font-bold uppercase tracking-wider">Kirim: {item.shippingAddress}</span>}
                                        {item.dueDeliveryDate && (
                                          <span className="text-[10px] text-red-600 font-bold uppercase tracking-wider">
                                            Due: {format(new Date(item.dueDeliveryDate), 'dd MMM yyyy')}
                                          </span>
                                        )}
                                      </div>
                                   </div>
                                </TableCell>
                                <TableCell className="text-right font-medium">{item.qty}</TableCell>
                                <TableCell className="text-right font-bold text-emerald-600">{totalShipped}</TableCell>
                                <TableCell className="text-right font-bold text-red-500">{totalDamaged}</TableCell>
                                <TableCell className="text-right font-bold text-[#0C4196]">{remaining < 0 ? 0 : remaining}</TableCell>
                                <TableCell className="text-right pr-4">
                                   {remaining > 0 && isAdminOrManager && (
                                      <Button 
                                         size="sm" 
                                         variant="outline" 
                                         className="h-7 text-[10px] font-bold border-blue-200 text-[#0C4196] hover:bg-blue-50"
                                         onClick={async () => {
                                            if (!window.confirm(`Buat alokasi sisa untuk ${remaining} unit?`)) return;
                                            const loadingToast = toast.loading('Menyiapkan Alokasi Sisa (Vendor PO)...');
                                            try {
                                               const spoNum = `VPO-${viewingPO.poNumber}-${Date.now().toString().slice(-4)}`;
                                               await addDoc(collection(db, 'supply_pos'), {
                                                  underlyingPoId: viewingPO.id,
                                                  supplyPoNumber: spoNum,
                                                  warehouseId: '', 
                                                  ownerId: viewingPO.ownerId,
                                                  status: 'Draft',
                                                  createdAt: Date.now(),
                                                  items: [{
                                                     productId: item.productId,
                                                     qty: remaining,
                                                     shippingAddress: item.shippingAddress || ''
                                                  }]
                                               });
                                               toast.dismiss(loadingToast);
                                               toast.success(`Berhasil membuat draft alokasi sisa (${remaining} unit). Cek menu Vendor PO.`);
                                            } catch (err: any) {
                                               toast.dismiss(loadingToast);
                                               toast.error('Gagal membuat alokasi: ' + err.message);
                                            }
                                         }}
                                      >
                                         Alokasi Sisa
                                      </Button>
                                   )}
                                </TableCell>
                             </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest pl-1">Riwayat Pengiriman (DO)</h4>
                  <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
                    <Table className="min-w-[800px]">
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead className="text-[10px] font-bold text-slate-400 uppercase">DO Number</TableHead>
                          <TableHead className="text-[10px] font-bold text-slate-400 uppercase">Tgl Kirim</TableHead>
                          <TableHead className="text-[10px] font-bold text-slate-400 uppercase">Alamat</TableHead>
                          <TableHead className="text-right text-[10px] font-bold text-slate-400 uppercase pr-4">Total Item</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deliveries.filter(d => d.underlyingPoId === viewingPO.id).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-10 text-slate-400 text-xs italic bg-white">
                              Belum ada data pengiriman.
                            </TableCell>
                          </TableRow>
                        ) : (
                          deliveries
                            .filter(d => d.underlyingPoId === viewingPO.id)
                            .sort((a,b) => b.createdAt - a.createdAt)
                            .map((deli, idx) => (
                              <TableRow key={idx} className="h-12 text-sm bg-white hover:bg-slate-50">
                                <TableCell className="font-bold text-[#0C4196] font-mono">{deli.doNumber}</TableCell>
                                <TableCell className="text-slate-500 text-xs">{format(new Date(deli.createdAt), 'dd MMM yyyy')}</TableCell>
                                <TableCell className="text-[10px] text-slate-600 max-w-[300px] truncate" title={deli.shippingAddress}>{deli.shippingAddress || '-'}</TableCell>
                                <TableCell className="text-right font-bold text-slate-900 pr-4">
                                   {deli.items?.reduce((sum: number, i: any) => sum + i.qty, 0) || 0}
                                </TableCell>
                              </TableRow>
                            ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="pt-6 border-t flex justify-end">
                  <Button onClick={() => setIsViewOpen(false)} className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-10 rounded-lg h-11 shadow-md transition-all">
                    Tutup Detail
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
