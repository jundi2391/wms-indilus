import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Package, Search, Plus, Filter, LayoutGrid, Building2, Info, Trash2 } from 'lucide-react';
import { collection, query, onSnapshot, doc, setDoc, getDocs, runTransaction, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { Skeleton } from '@/components/ui/skeleton';

export function Inventory() {
  const { appUser } = useAuthStore();
  const isSuperAdmin = appUser?.role === 'Super Admin';
  const [searchParams, setSearchParams] = useSearchParams();
  const [inventory, setInventory] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [owners, setOwners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState(searchParams.get('warehouseId') || '');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [supplyPos, setSupplyPos] = useState<any[]>([]);

  useEffect(() => {
    let count = 0;
    const checkLoading = () => {
      count++;
      if (count >= 5) setLoading(false);
    };

    const unsubProducts = onSnapshot(collection(db, 'products'), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      checkLoading();
    }, (err) => { console.error(err); checkLoading(); });

    const unsubWarehouses = onSnapshot(collection(db, 'warehouses'), (snap) => {
      setWarehouses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      checkLoading();
    }, (err) => { console.error(err); checkLoading(); });

    const unsubOwners = onSnapshot(collection(db, 'owners'), (snap) => {
      setOwners(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      checkLoading();
    }, (err) => { console.error(err); checkLoading(); });

    const unsubSPOs = onSnapshot(collection(db, 'supply_pos'), (snap) => {
      setSupplyPos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      checkLoading();
    }, (err) => { console.error(err); checkLoading(); });

    const q = query(collection(db, 'inventory'));
    const unsubInventory = onSnapshot(q, (snapshot) => {
      setInventory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      checkLoading();
    }, (err) => { console.error(err); checkLoading(); });

    return () => {
      unsubProducts();
      unsubWarehouses();
      unsubOwners();
      unsubSPOs();
      unsubInventory();
    }
  }, []);

  const enhancedInventory = inventory.map(inv => ({
    ...inv,
    productName: products.find(p => p.id === inv.productId)?.name || 'Produk Tidak Diketahui',
    sku: products.find(p => p.id === inv.productId)?.sku || '-',
    warehouseName: warehouses.find(w => w.id === inv.warehouseId)?.name || 'Gudang Tidak Diketahui',
    ownerName: owners.find(o => o.id === inv.ownerId)?.name || 'Tidak Diketahui',
    onHandQty: Number(inv.onHandQty) || 0,
    availableQty: Number(inv.availableQty) || 0,
    reservedQty: Number(inv.reservedQty) || 0,
    damagedQty: Number(inv.damagedQty) || 0,
  }));

  const filteredInventory = enhancedInventory.filter(inv => {
    const matchesSearch = inv.productName.toLowerCase().includes(search.toLowerCase()) || inv.sku.toLowerCase().includes(search.toLowerCase());
    const matchesWH = warehouseFilter ? inv.warehouseId === warehouseFilter : true;
    const matchesProduct = productFilter ? inv.productId === productFilter : true;
    const matchesOwner = ownerFilter ? inv.ownerId === ownerFilter : true;
    return matchesSearch && matchesWH && matchesProduct && matchesOwner;
  });

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const warehouseId = fd.get('warehouseId') as string;
      const ownerId = fd.get('ownerId') as string;
      const productId = fd.get('productId') as string;
      const adjustType = fd.get('adjustType') as string;
      const inputQty = parseInt(fd.get('qty') as string) || 0;
      const inventoryId = `${ownerId}_${warehouseId}_${productId}`;
      
      try {
        await runTransaction(db, async (transaction) => {
          const invRef = doc(db, 'inventory', inventoryId);
          const ledgerRef = doc(collection(db, 'inventory_ledgers'));
          const invSnap = await transaction.get(invRef);
          
          let currentOnHand = 0;
          let currentAvailable = 0;
          let currentDamaged = 0;

          if (invSnap.exists()) {
            currentOnHand = Number(invSnap.data().onHandQty) || 0;
            currentAvailable = Number(invSnap.data().availableQty) || 0;
            currentDamaged = Number(invSnap.data().damagedQty) || 0;
          }

          let newOnHand = currentOnHand;
          let newDamaged = currentDamaged;
          
          if (adjustType === 'add') {
             newOnHand += inputQty;
          } else if (adjustType === 'reduce') {
             newOnHand -= inputQty;
             if (newOnHand < 0) throw new Error('Stok tidak dapat dikurangi di bawah 0');
          } else if (adjustType === 'mark_damaged') {
             newOnHand -= inputQty;
             newDamaged += inputQty;
             if (newOnHand < 0) {
               throw new Error('Jumlah rusak melebihi stok On Hand');
             }
          }

          // Recalculate Available: always equals On Hand because Damaged is excluded from On Hand
          const newAvailable = newOnHand;
          if (newAvailable < 0) {
            throw new Error('Penyesuaian gagal: Stok tersedia tidak bisa negatif');
          }

          const now = Date.now();
          if (invSnap.exists()) {
            transaction.update(invRef, {
              onHandQty: newOnHand,
              damagedQty: newDamaged,
              availableQty: newAvailable,
              updatedAt: now
            });
          } else {
            transaction.set(invRef, {
              ownerId,
              warehouseId,
              productId,
              onHandQty: newOnHand,
              availableQty: newAvailable,
              returnQty: 0,
              damagedQty: newDamaged,
              updatedAt: now
            });
          }

          transaction.set(ledgerRef, {
            transactionNumber: 'ADJ-' + now,
            transactionType: adjustType === 'add' ? 'MANUAL_ADD' : 
                             adjustType === 'reduce' ? 'MANUAL_REDUCE' : 'MARK_DAMAGED',
            referenceType: 'MANUAL_ADJUSTMENT',
            referenceId: 'N/A',
            ownerId,
            warehouseId,
            productId,
            qtyBefore: currentOnHand,
            qtyChange: adjustType === 'add' ? inputQty : -inputQty,
            qtyAfter: newOnHand,
            createdBy: 'manual', 
            createdAt: now
          });

        });
        toast.success('Inventaris berhasil disesuaikan secara manual');
        setIsOpen(false);
      } catch (error: any) {
        console.error(error);
        toast.error(error.message || 'Gagal menyesuaikan inventaris');
      }
    };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 leading-none">Status Inventaris</h2>
          <p className="text-sm md:text-base text-slate-500 font-medium mt-2">Pantau ketersediaan stok di seluruh gudang</p>
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger nativeButton={true} render={
            <Button className="w-full sm:w-auto bg-[#0C4196] hover:bg-[#0C4196]/90 text-white rounded-lg px-6 font-bold shadow-sm transition-all h-11">
              <Plus className="w-4 h-4 mr-2" />
              Penyesuaian Stok
            </Button>
          } />
          <DialogContent className="rounded-xl p-5 sm:p-8">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">Penyesuaian Stok Manual</DialogTitle>
            </DialogHeader>
            <form onSubmit={onSubmit} className="space-y-4 mt-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-600 uppercase">Owner</Label>
                    <select name="ownerId" required className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196] outline-none">
                    <option value="">Pilih owner...</option>
                    {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-600 uppercase">Gudang</Label>
                    <select name="warehouseId" required className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196] outline-none">
                    <option value="">Pilih gudang...</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase">Produk</Label>
                <select name="productId" required className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196] outline-none">
                  <option value="">Pilih produk...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase">Tipe Penyesuaian</Label>
                <select name="adjustType" required className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196] outline-none">
                  <option value="add">Tambah Stok (+)</option>
                  <option value="reduce">Kurangi Stok (-)</option>
                  <option value="mark_damaged">Pindah ke Rusak (Damaged)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase">Jumlah</Label>
                <Input type="number" name="qty" required placeholder="0" min="1" className="h-10 rounded-lg text-sm" />
              </div>
              <Button type="submit" className="w-full h-11 bg-[#0C4196] hover:bg-[#0C4196]/90 text-white rounded-lg font-bold mt-4">Simpan Perubahan</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1 relative w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input 
            placeholder="Cari SKU atau nama produk..." 
            className="pl-9 h-10 rounded-lg bg-white border-slate-200 focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex items-center gap-2">
           <select 
             value={ownerFilter}
             onChange={(e) => setOwnerFilter(e.target.value)}
             className="h-10 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 outline-none focus:border-[#0C4196]"
           >
             <option value="">Semua Owner</option>
             {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
           </select>

           <select 
             value={warehouseFilter}
             onChange={(e) => setWarehouseFilter(e.target.value)}
             className="h-10 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 outline-none focus:border-[#0C4196]"
           >
             <option value="">Semua Gudang</option>
             {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
           </select>
           
           <select 
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              className="h-10 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 outline-none focus:border-[#0C4196]"
           >
             <option value="">Semua Produk</option>
             {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
           </select>

          {(warehouseFilter || productFilter || ownerFilter || search) && (
            <Button 
              variant="ghost" 
              onClick={() => {setSearch(''); setWarehouseFilter(''); setProductFilter(''); setOwnerFilter('');}}
              className="text-slate-400 hover:text-red-600 font-bold text-xs uppercase px-2 w-full sm:w-auto"
            >
              Reset
            </Button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHeader className="bg-slate-50 border-b border-slate-200">
              <TableRow className="hover:bg-transparent h-12">
                <TableHead className="font-bold text-slate-600 text-xs pl-6">Produk</TableHead>
                <TableHead className="font-bold text-slate-600 text-xs">SKU</TableHead>
                <TableHead className="font-bold text-slate-600 text-xs">Owner & Gudang</TableHead>
                <TableHead className="text-right font-bold text-slate-600 text-xs">On Hand</TableHead>
                <TableHead className="text-right font-bold text-slate-600 text-xs">Damaged</TableHead>
                <TableHead className="text-right font-bold text-slate-600 text-xs">Total Stock</TableHead>
                {isSuperAdmin && <TableHead className="text-right font-bold text-slate-600 text-xs pr-6">Aksi</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <TableRow key={idx} className="h-16">
                    <TableCell className="pl-6">
                      <Skeleton className="h-4 w-40" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Skeleton className="h-3 w-28" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="h-4 w-10 ml-auto" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="h-4 w-10 ml-auto" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="h-4 w-10 ml-auto" />
                    </TableCell>
                    {isSuperAdmin && (
                      <TableCell className="text-right pr-6">
                        <Skeleton className="h-8 w-8 rounded-lg ml-auto" />
                      </TableCell>
                    )}
                  </TableRow>
                ))
              ) : filteredInventory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isSuperAdmin ? 7 : 6} className="text-center py-20 text-slate-400">
                    <Package className="w-12 h-12 mx-auto text-slate-200 mb-3" />
                    <p className="text-sm font-bold text-slate-600">Tidak ada data ditemukan</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredInventory.map((inv) => (
                  <TableRow key={inv.id} className="h-16 group hover:bg-slate-50/50">
                    <TableCell className="font-bold text-slate-900 pl-6 text-sm">{inv.productName}</TableCell>
                    <TableCell className="text-xs font-medium text-slate-500 font-mono">{inv.sku}</TableCell>
                    <TableCell className="text-xs">
                      <div><span className="font-bold text-slate-400">O:</span> {inv.ownerName}</div>
                      <div className="mt-0.5"><span className="font-bold text-slate-400">W:</span> {inv.warehouseName}</div>
                    </TableCell>
                    <TableCell className="text-right font-medium text-slate-600 text-sm">
                      {inv.onHandQty}
                    </TableCell>
                    <TableCell className="text-right font-medium text-red-600 text-sm">
                      {inv.damagedQty}
                    </TableCell>
                    <TableCell className="text-right font-bold text-sm text-[#0C4196]">
                      {(inv.onHandQty || 0) + (inv.damagedQty || 0)}
                    </TableCell>
                    {isSuperAdmin && (
                      <TableCell className="text-right pr-6">
                        <div className="flex items-center justify-end">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={async () => {
                              if(window.confirm('Hapus data inventaris ini?')) {
                                await deleteDoc(doc(db, 'inventory', inv.id));
                                toast.success('Data inventaris dihapus');
                              }
                            }}
                            className="h-8 w-8 text-slate-300 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
