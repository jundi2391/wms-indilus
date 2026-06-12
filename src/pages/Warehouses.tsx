import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Building2, MapPin, Pencil, Trash2, LayoutGrid, List as ListIcon, Loader2, ArrowUpRight, Package } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/store/authStore';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';

export function Warehouses() {
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [editWarehouse, setEditWarehouse] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const { appUser } = useAuthStore();
  const isAdmin = appUser?.role === 'Super Admin';
  const navigate = useNavigate();

  useEffect(() => {
    let count = 0;
    const checkLoading = () => {
      count++;
      if (count >= 2) setLoading(false);
    };

    const q = query(collection(db, 'warehouses'));
    const unsubscribeWH = onSnapshot(q, (snapshot) => {
      setWarehouses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      checkLoading();
    }, (error) => {
      console.error(error);
      checkLoading();
    });

    const unsubscribeInv = onSnapshot(collection(db, 'inventory'), (snapshot) => {
      setInventory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      checkLoading();
    }, (error) => {
      console.error(error);
      checkLoading();
    });

    return () => {
      unsubscribeWH();
      unsubscribeInv();
    };
  }, []);

  const getWarehouseTotal = (whId: string) => {
    return inventory
      .filter(item => item.warehouseId === whId)
      .reduce((acc, curr) => acc + (curr.onHandQty || 0) + (curr.damagedQty || 0), 0);
  };

  const getDistinctProducts = (whId: string) => {
    return new Set(inventory.filter(item => item.warehouseId === whId).map(i => i.productId)).size;
  };

  const openAdd = () => {
    setEditWarehouse(null);
    setIsOpen(true);
  };

  const openEdit = (e: React.MouseEvent, wh: any) => {
    e.stopPropagation();
    setEditWarehouse(wh);
    setIsOpen(true);
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isAdmin) {
      toast.error('Hanya Super Admin yang dapat menambah/mengubah gudang');
      return;
    }
    const fd = new FormData(e.currentTarget);
    const warehouseData = {
      code: fd.get('code') as string,
      name: fd.get('name') as string,
      status: 'Active',
      updatedAt: Date.now()
    };

    try {
      if (editWarehouse) {
        await setDoc(doc(db, 'warehouses', editWarehouse.id), { ...editWarehouse, ...warehouseData });
        toast.success('Gudang berhasil diperbarui');
      } else {
        const warehouseId = Math.random().toString(36).substring(2, 10);
        await setDoc(doc(db, 'warehouses', warehouseId), { ...warehouseData, createdAt: Date.now() });
        toast.success('Gudang berhasil ditambahkan');
      }
      setIsOpen(false);
      setEditWarehouse(null);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Gagal menyimpan gudang');
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!isAdmin) {
      toast.error('Hanya Super Admin yang dapat menghapus gudang');
      return;
    }
    if (!window.confirm(`Apakah Anda yakin ingin menghapus ${name}?`)) return;
    
    setIsDeleting(id);
    try {
      await deleteDoc(doc(db, 'warehouses', id));
      toast.success('Gudang berhasil dihapus');
    } catch(err: any) {
      console.error(err);
      toast.error(err.message || 'Gagal menghapus gudang');
    } finally {
      setIsDeleting(null);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 leading-none">Gudang</h2>
          <p className="text-sm md:text-base text-slate-500 font-medium mt-2">Kelola daftar gudang dan lokasi penyimpanan</p>
        </div>
        
        {isAdmin && (
          <Dialog open={isOpen} onOpenChange={(v) => { setIsOpen(v); if(!v) setEditWarehouse(null); }}>
            <DialogTrigger render={
              <Button onClick={openAdd} className="w-full sm:w-auto bg-[#0C4196] hover:bg-[#0C4196]/90 text-white rounded-lg px-6 font-bold shadow-sm transition-all h-11">
                <Plus className="w-4 h-4 mr-2" />
                Tambah Gudang
              </Button>
            } />
            <DialogContent className="max-w-md rounded-xl p-8">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">{editWarehouse ? 'Ubah Gudang' : 'Tambah Gudang Baru'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={onSubmit} className="space-y-4 mt-6">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase">Kode Gudang</Label>
                  <Input name="code" required placeholder="Contoh: WH-JKT-01" className="h-10 rounded-lg border-slate-200 focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]" defaultValue={editWarehouse?.code} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase">Nama Gudang</Label>
                  <Input name="name" required placeholder="Contoh: Gudang Jakarta Pusat" className="h-10 rounded-lg border-slate-200 focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]" defaultValue={editWarehouse?.name} />
                </div>
                <Button type="submit" className="w-full h-11 bg-[#0C4196] hover:bg-[#0C4196]/90 text-white rounded-lg font-bold mt-4 shadow-sm">
                  {editWarehouse ? 'Simpan Perubahan' : 'Simpan Gudang'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-4">
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-6 w-40" />
                  </div>
                  <Skeleton className="h-5 w-12 rounded" />
                </div>
                <div className="flex gap-8 mb-6">
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-14" />
                    <Skeleton className="h-5 w-10" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-14" />
                    <Skeleton className="h-5 w-8" />
                  </div>
                </div>
              </div>
              <div className="flex justify-between items-center pt-4 border-t border-slate-50">
                <Skeleton className="h-4 w-28" />
                {isAdmin && (
                  <div className="flex gap-1">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <Skeleton className="h-8 w-8 rounded-lg" />
                  </div>
                )}
              </div>
            </div>
          ))
        ) : warehouses.length === 0 ? (
          <div className="col-span-full bg-white border border-dashed border-slate-300 rounded-xl py-16 text-center flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mb-4 border border-slate-100">
              <MapPin className="w-6 h-6 text-slate-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Belum ada gudang terdaftar</h3>
            <p className="text-slate-400 text-sm mt-1 max-w-[300px] mx-auto">Tambahkan gudang pertama Anda untuk mulai mengelola inventaris.</p>
          </div>
        ) : (
          warehouses.map((w) => {
            const totalQty = getWarehouseTotal(w.id);
            const productCount = getDistinctProducts(w.id);
            
            return (
              <div 
                key={w.id} 
                onClick={() => navigate(`/inventory?warehouseId=${w.id}`)}
                className="group cursor-pointer bg-white rounded-xl border border-slate-200 hover:border-[#0C4196] transition-all p-6 shadow-sm hover:shadow-md"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="text-[10px] font-bold text-[#0C4196] uppercase tracking-widest">{w.code}</span>
                    <h3 className="text-lg font-bold text-slate-900 group-hover:text-[#0C4196] transition-colors">{w.name}</h3>
                  </div>
                  <div className="bg-emerald-50 text-emerald-600 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-100 uppercase">
                    Aktif
                  </div>
                </div>

                <div className="flex gap-8 mb-6">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-0.5">Total Stok</p>
                    <p className="text-lg font-bold text-slate-800">{totalQty.toLocaleString('id-ID')}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-0.5">Varian SKU</p>
                    <p className="text-lg font-bold text-slate-800">{productCount}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                  <span className="text-xs font-bold text-[#0C4196] flex items-center">
                    Lihat Inventaris <ArrowUpRight className="w-3 h-3 ml-1" />
                  </span>
                  
                  {isAdmin && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={(e) => openEdit(e, w)} className="text-slate-400 hover:text-[#0C4196] h-8 w-8 rounded-lg">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={(e) => handleDelete(e, w.id, w.name)} disabled={isDeleting === w.id} className="text-slate-400 hover:text-red-600 h-8 w-8 rounded-lg">
                        {isDeleting === w.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  );
}
