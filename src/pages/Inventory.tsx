import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Package, Search, Plus, Filter, LayoutGrid, Building2 } from 'lucide-react';
import { collection, query, onSnapshot, doc, setDoc, getDocs, runTransaction } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';

export function Inventory() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [inventory, setInventory] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState(searchParams.get('warehouseId') || '');
  const [productFilter, setProductFilter] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, 'products'), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubWarehouses = onSnapshot(collection(db, 'warehouses'), (snap) => {
      setWarehouses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const q = query(collection(db, 'inventory'));
    const unsubInventory = onSnapshot(q, (snapshot) => {
      setInventory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => {
      unsubProducts();
      unsubWarehouses();
      unsubInventory();
    }
  }, []);

  const enhancedInventory = inventory.map(inv => ({
    ...inv,
    productName: products.find(p => p.id === inv.productId)?.name || 'Produk Tidak Diketahui',
    sku: products.find(p => p.id === inv.productId)?.sku || '-',
    warehouseName: warehouses.find(w => w.id === inv.warehouseId)?.name || 'Gudang Tidak Diketahui',
  }));

  const filteredInventory = enhancedInventory.filter(inv => {
    const matchesSearch = inv.productName.toLowerCase().includes(search.toLowerCase()) || inv.sku.toLowerCase().includes(search.toLowerCase());
    const matchesWH = warehouseFilter ? inv.warehouseId === warehouseFilter : true;
    const matchesProduct = productFilter ? inv.productId === productFilter : true;
    return matchesSearch && matchesWH && matchesProduct;
  });

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const warehouseId = fd.get('warehouseId') as string;
      const productId = fd.get('productId') as string;
      const adjustType = fd.get('adjustType') as string;
      const inputQty = parseInt(fd.get('qty') as string) || 0;
      const inventoryId = `${warehouseId}_${productId}`;
      
      try {
        await runTransaction(db, async (transaction) => {
          const invRef = doc(db, 'inventory', inventoryId);
          const txRef = doc(collection(db, 'inventory_transactions'));
          const invSnap = await transaction.get(invRef);
          
          let currentQty = 0;
          if (invSnap.exists()) {
            currentQty = invSnap.data().availableQty || 0;
          }

          let balanceAfter = currentQty;
          if (adjustType === 'add') {
             balanceAfter += inputQty;
          } else if (adjustType === 'reduce') {
             balanceAfter -= inputQty;
             if (balanceAfter < 0) throw new Error('Stok tidak dapat dikurangi di bawah 0');
          }

          if (invSnap.exists()) {
            transaction.update(invRef, {
              availableQty: balanceAfter,
              updatedAt: Date.now()
            });
          } else {
            transaction.set(invRef, {
              warehouseId,
              productId,
              availableQty: balanceAfter,
              updatedAt: Date.now()
            });
          }

          transaction.set(txRef, {
            warehouseId,
            productId,
            transactionType: adjustType === 'add' ? 'inbound' : 'outbound',
            referenceType: 'adjustment',
            referenceId: txRef.id,
            qtyIn: adjustType === 'add' ? inputQty : 0,
            qtyOut: adjustType === 'reduce' ? inputQty : 0,
            balanceAfter: balanceAfter,
            createdAt: Date.now()
          });

        });
        toast.success('Inventaris berhasil disesuaikan');
        setIsOpen(false);
      } catch (error: any) {
        console.error(error);
        toast.error(error.message || 'Gagal menyesuaikan inventaris');
      }
    };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Status Inventaris</h2>
          <p className="text-slate-500 text-sm mt-1">Pantau ketersediaan stok di seluruh gudang</p>
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger render={
            <Button className="bg-[#0C4196] hover:bg-[#0C4196]/90 text-white rounded-lg px-6 font-bold shadow-sm transition-all">
              <Plus className="w-4 h-4 mr-2" />
              Penyesuaian Stok
            </Button>
          } />
          <DialogContent className="rounded-xl p-8">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">Penyesuaian Stok Manual</DialogTitle>
            </DialogHeader>
            <form onSubmit={onSubmit} className="space-y-4 mt-6">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase">Gudang</Label>
                <select name="warehouseId" required className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196] outline-none">
                  <option value="">Pilih gudang...</option>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
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

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[250px] relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input 
            placeholder="Cari SKU atau nama produk..." 
            className="pl-9 h-10 rounded-lg bg-white border-slate-200 focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-2">
           <select 
             value={warehouseFilter}
             onChange={(e) => setWarehouseFilter(e.target.value)}
             className="h-10 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 outline-none focus:border-[#0C4196] min-w-[160px]"
           >
             <option value="">Semua Gudang</option>
             {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
           </select>
           
           <select 
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              className="h-10 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 outline-none focus:border-[#0C4196] min-w-[160px]"
           >
             <option value="">Semua Produk</option>
             {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
           </select>

          {(warehouseFilter || productFilter || search) && (
            <Button 
              variant="ghost" 
              onClick={() => {setSearch(''); setWarehouseFilter(''); setProductFilter('');}}
              className="text-slate-400 hover:text-red-600 font-bold text-xs uppercase px-2"
            >
              Reset
            </Button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50 border-b border-slate-200">
            <TableRow className="hover:bg-transparent h-12">
              <TableHead className="font-bold text-slate-600 text-xs pl-6">Produk</TableHead>
              <TableHead className="font-bold text-slate-600 text-xs">SKU</TableHead>
              <TableHead className="font-bold text-slate-600 text-xs">Gudang</TableHead>
              <TableHead className="text-right font-bold text-slate-600 text-xs pr-6">Stok Tersedia</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredInventory.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-20 text-slate-400">
                  <Package className="w-12 h-12 mx-auto text-slate-200 mb-3" />
                  <p className="text-sm font-bold text-slate-600">Tidak ada data ditemukan</p>
                </TableCell>
              </TableRow>
            ) : (
              filteredInventory.map((inv) => (
                <TableRow key={inv.id} className="h-16 group hover:bg-slate-50/50">
                  <TableCell className="font-bold text-slate-900 pl-6 text-sm">{inv.productName}</TableCell>
                  <TableCell className="text-xs font-medium text-slate-500 font-mono">{inv.sku}</TableCell>
                  <TableCell>
                    <span className="text-sm text-slate-600">{inv.warehouseName}</span>
                  </TableCell>
                  <TableCell className="text-right pr-6">
                    <span className="font-bold text-sm text-[#0C4196]">
                      {inv.availableQty}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
