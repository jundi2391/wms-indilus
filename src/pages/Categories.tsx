import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Layers, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/store/authStore';

export function Categories() {
  const [categories, setCategories] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [editCategory, setEditCategory] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const { appUser } = useAuthStore();
  const isAdminOrManager = appUser?.role === 'Warehouse Manager' || appUser?.role === 'Super Admin';
  const isAdmin = appUser?.role === 'Super Admin';

  useEffect(() => {
    const q = query(collection(db, 'categories'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const openAdd = () => {
    setEditCategory(null);
    setIsOpen(true);
  };

  const openEdit = (cat: any) => {
    setEditCategory(cat);
    setIsOpen(true);
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isAdminOrManager) {
      toast.error('Hanya manajer yang dapat menambah/mengubah kategori');
      return;
    }
    const fd = new FormData(e.currentTarget);
    const categoryData = {
      name: fd.get('name') as string,
      updatedAt: Date.now()
    };

    try {
      if (editCategory) {
        await setDoc(doc(db, 'categories', editCategory.id), { ...editCategory, ...categoryData });
        toast.success('Kategori berhasil diperbarui');
      } else {
        const categoryId = Math.random().toString(36).substring(2, 10);
        await setDoc(doc(db, 'categories', categoryId), { ...categoryData, createdAt: Date.now() });
        toast.success('Kategori berhasil ditambahkan');
      }
      setIsOpen(false);
      setEditCategory(null);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Error saving category');
    }
  };

  const deleteCategory = async (id: string, name: string) => {
    if (!isAdmin) return toast.error('Hanya Super Admin yang dapat menghapus kategori');
    if (!window.confirm(`Apakah Anda yakin ingin menghapus ${name}?`)) return;
    setIsDeleting(id);
    try {
      await deleteDoc(doc(db, 'categories', id));
      toast.success('Kategori dihapus');
    } catch (e: any) {
      toast.error(e.message || 'Gagal menghapus');
    }
    setIsDeleting(null);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 leading-none">Kategori</h2>
          <p className="text-sm md:text-base text-slate-500 font-medium mt-2">Kelola kategori produk</p>
        </div>
        
        {isAdminOrManager && (
          <Dialog open={isOpen} onOpenChange={(v) => { setIsOpen(v); if(!v) setEditCategory(null); }}>
            <DialogTrigger render={
              <Button onClick={openAdd} className="w-full sm:w-auto bg-[#0C4196] hover:bg-[#0C4196]/90 text-white rounded-lg px-6 font-bold shadow-sm transition-all h-11">
                <Plus className="w-4 h-4 mr-2" />
                Tambah Kategori
              </Button>
            } />
            <DialogContent className="rounded-xl">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">{editCategory ? 'Ubah Kategori' : 'Tambah Kategori Baru'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={onSubmit} className="space-y-4 mt-6">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase">Nama Kategori</Label>
                  <Input name="name" required placeholder="Contoh: Elektronik" className="h-10 rounded-lg focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]" defaultValue={editCategory?.name} />
                </div>
                <Button type="submit" className="w-full h-11 bg-[#0C4196] hover:bg-[#0C4196]/90 text-white rounded-lg font-bold mt-4 shadow-sm">
                  {editCategory ? 'Simpan Perubahan' : 'Simpan Kategori'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="min-w-[500px]">
          <TableHeader className="bg-slate-50 border-b border-slate-200">
            <TableRow className="hover:bg-transparent h-12">
              <TableHead className="font-bold text-slate-600 text-xs pl-6">Nama Kategori</TableHead>
              <TableHead className="font-bold text-slate-600 text-xs">Dibuat Pada</TableHead>
              {isAdminOrManager && <TableHead className="text-right font-bold text-slate-600 text-xs pr-6">Aksi</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdminOrManager ? 3 : 2} className="text-center py-20 text-slate-400">
                  <Layers className="w-12 h-12 mx-auto text-slate-200 mb-3" />
                  <p className="text-sm font-bold text-slate-600">Kategori tidak ditemukan</p>
                </TableCell>
              </TableRow>
            ) : (
              categories.map((c) => (
                <TableRow key={c.id} className="h-16 group hover:bg-slate-50/50">
                  <TableCell className="font-bold text-slate-900 pl-6 text-sm">{c.name}</TableCell>
                  <TableCell className="text-sm text-slate-500">
                    {new Date(c.createdAt).toLocaleDateString('id-ID')}
                  </TableCell>
                  {isAdminOrManager && (
                    <TableCell className="text-right pr-6">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-[#0C4196] hover:bg-white" onClick={() => openEdit(c)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        {isAdmin && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50" onClick={() => deleteCategory(c.id, c.name)} disabled={isDeleting === c.id}>
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
