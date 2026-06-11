import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Truck, Search, Plus, Trash2, Pencil } from 'lucide-react';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/authStore';

export function Suppliers() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const { appUser } = useAuthStore();
  const isAdminOrManager = appUser?.role === 'Warehouse Manager' || appUser?.role === 'Super Admin';
  const isAdmin = appUser?.role === 'Super Admin';

  useEffect(() => {
    const q = query(collection(db, 'suppliers'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSuppliers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const openAdd = () => {
    setEditSupplier(null);
    setIsOpen(true);
  };

  const openEdit = (sup: any) => {
    setEditSupplier(sup);
    setIsOpen(true);
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = {
      name: fd.get('name') as string,
      code: fd.get('code') as string,
      status: 'Active',
      updatedAt: Date.now()
    };

    try {
      if (editSupplier) {
        await setDoc(doc(db, 'suppliers', editSupplier.id), { ...editSupplier, ...data });
        toast.success('Pemasok berhasil diperbarui');
      } else {
        await addDoc(collection(db, 'suppliers'), { ...data, createdAt: Date.now() });
        toast.success('Pemasok berhasil ditambahkan');
      }
      setIsOpen(false);
      setEditSupplier(null);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Gagal menyimpan pemasok');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!isAdmin) {
      toast.error('Hanya Super Admin yang dapat menghapus pemasok');
      return;
    }
    if (!window.confirm(`Apakah Anda yakin ingin menghapus ${name}?`)) return;
    
    setIsDeleting(id);
    try {
      await deleteDoc(doc(db, 'suppliers', id));
      toast.success('Pemasok dihapus');
    } catch(err: any) {
      console.error(err);
      toast.error(err.message || 'Gagal menghapus pemasok');
    } finally {
      setIsDeleting(null);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 leading-none">Pemasok</h2>
          <p className="text-sm md:text-base text-slate-500 font-medium mt-2">Kelola pemasok untuk penerimaan barang</p>
        </div>
        
        {isAdminOrManager && (
          <Dialog open={isOpen} onOpenChange={(v) => { setIsOpen(v); if(!v) setEditSupplier(null); }}>
            <DialogTrigger render={
              <Button onClick={openAdd} className="w-full sm:w-auto bg-[#0C4196] hover:bg-[#0C4196]/90 text-white rounded-lg px-6 font-bold shadow-sm transition-all h-11">
                <Plus className="w-4 h-4 mr-2" />
                Tambah Pemasok
              </Button>
            } />
            <DialogContent className="rounded-xl">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">{editSupplier ? 'Ubah Pemasok' : 'Tambah Pemasok Baru'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={onSubmit} className="space-y-4 mt-6">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase">Kode</Label>
                  <Input name="code" required placeholder="Contoh: SUP-001" className="h-10 rounded-lg focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]" defaultValue={editSupplier?.code} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase">Nama Pemasok</Label>
                  <Input name="name" required placeholder="Contoh: PT. Sumber Makmur" className="h-10 rounded-lg focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]" defaultValue={editSupplier?.name} />
                </div>
                <Button type="submit" className="w-full h-11 bg-[#0C4196] hover:bg-[#0C4196]/90 text-white rounded-lg font-bold mt-4 shadow-sm">
                  {editSupplier ? 'Simpan Perubahan' : 'Simpan Pemasok'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-slate-50/50">
          <div className="relative w-full max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input placeholder="Cari pemasok..." className="pl-9 h-10 rounded-lg bg-white border-slate-200 focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table className="min-w-[600px]">
          <TableHeader className="bg-slate-50 border-b border-slate-200">
            <TableRow className="hover:bg-transparent h-12">
              <TableHead className="font-bold text-slate-600 text-xs pl-6">Kode</TableHead>
              <TableHead className="font-bold text-slate-600 text-xs">Nama Pemasok</TableHead>
              <TableHead className="font-bold text-slate-600 text-xs">Status</TableHead>
              {isAdminOrManager && <TableHead className="text-right font-bold text-slate-600 text-xs pr-6">Aksi</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdminOrManager ? 4 : 3} className="text-center py-20 text-slate-400">
                  <Truck className="w-12 h-12 mx-auto text-slate-200 mb-3" />
                  <p className="text-sm font-bold text-slate-600">Pemasok tidak ditemukan</p>
                </TableCell>
              </TableRow>
            ) : (
              suppliers.map((c) => (
                <TableRow key={c.id} className="h-16 group hover:bg-slate-50/50">
                  <TableCell className="font-mono text-xs font-medium text-[#0C4196] pl-6 uppercase">{c.code}</TableCell>
                  <TableCell className="font-bold text-slate-900 text-sm">{c.name}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100 uppercase">
                      Aktif
                    </span>
                  </TableCell>
                  {isAdminOrManager && (
                    <TableCell className="text-right pr-6">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)} className="h-8 w-8 text-slate-400 hover:text-[#0C4196] hover:bg-white">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        {isAdmin && (
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id, c.name)} disabled={isDeleting === c.id} className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
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
