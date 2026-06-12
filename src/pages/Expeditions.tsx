import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plane, Search, Plus, Trash2, Pencil } from 'lucide-react';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/authStore';
import { Skeleton } from '@/components/ui/skeleton';

export function Expeditions() {
  const [expeditions, setExpeditions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [editExpedition, setEditExpedition] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const { appUser } = useAuthStore();
  const isAdminOrManager = appUser?.role === 'Warehouse Manager' || appUser?.role === 'Super Admin';
  const isAdmin = appUser?.role === 'Super Admin';

  useEffect(() => {
    const q = query(collection(db, 'expeditions'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setExpeditions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      console.error(error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const openAdd = () => {
    setEditExpedition(null);
    setIsOpen(true);
  };

  const openEdit = (exp: any) => {
    setEditExpedition(exp);
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
      if (editExpedition) {
        await setDoc(doc(db, 'expeditions', editExpedition.id), { ...editExpedition, ...data });
        toast.success('Ekspedisi berhasil diperbarui');
      } else {
        await addDoc(collection(db, 'expeditions'), { ...data, createdAt: Date.now() });
        toast.success('Ekspedisi berhasil ditambahkan');
      }
      setIsOpen(false);
      setEditExpedition(null);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Gagal menyimpan ekspedisi');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!isAdmin) {
      toast.error('Hanya Super Admin yang dapat menghapus ekspedisi');
      return;
    }
    if (!window.confirm(`Apakah Anda yakin ingin menghapus ${name}?`)) return;
    
    setIsDeleting(id);
    try {
      await deleteDoc(doc(db, 'expeditions', id));
      toast.success('Ekspedisi dihapus');
    } catch(err: any) {
      console.error(err);
      toast.error(err.message || 'Gagal menghapus ekspedisi');
    } finally {
      setIsDeleting(null);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 leading-none">Ekspedisi</h2>
          <p className="text-sm md:text-base text-slate-500 font-medium mt-2">Kelola perusahaan pengiriman & kurir</p>
        </div>
        
        {isAdminOrManager && (
          <Dialog open={isOpen} onOpenChange={(v) => { setIsOpen(v); if(!v) setEditExpedition(null); }}>
            <DialogTrigger render={
              <Button onClick={openAdd} className="w-full sm:w-auto bg-[#0C4196] hover:bg-[#0C4196]/90 text-white rounded-lg px-6 font-bold shadow-sm transition-all h-11">
                <Plus className="w-4 h-4 mr-2" />
                Tambah Ekspedisi
              </Button>
            } />
            <DialogContent className="rounded-xl">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">{editExpedition ? 'Ubah Ekspedisi' : 'Tambah Ekspedisi Baru'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={onSubmit} className="space-y-4 mt-6">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase">Kode Ekspedisi</Label>
                  <Input name="code" required placeholder="Contoh: JNE / J&T / SICEPAT" className="h-10 rounded-lg focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]" defaultValue={editExpedition?.code} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase">Nama Perusahaan</Label>
                  <Input name="name" required placeholder="Contoh: PT. Jalur Nugraha Ekakurir" className="h-10 rounded-lg focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]" defaultValue={editExpedition?.name} />
                </div>
                <Button type="submit" className="w-full h-11 bg-[#0C4196] hover:bg-[#0C4196]/90 text-white rounded-lg font-bold mt-4 shadow-sm">
                  {editExpedition ? 'Simpan Perubahan' : 'Simpan Ekspedisi'}
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
            <Input placeholder="Cari ekspedisi..." className="pl-9 h-10 rounded-lg bg-white border-slate-200 focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table className="min-w-[600px]">
          <TableHeader className="bg-slate-50 border-b border-slate-200">
            <TableRow className="hover:bg-transparent h-12">
              <TableHead className="font-bold text-slate-600 text-xs pl-6">Kode</TableHead>
              <TableHead className="font-bold text-slate-600 text-xs">Nama Perusahaan</TableHead>
              <TableHead className="font-bold text-slate-600 text-xs">Status</TableHead>
              {isAdminOrManager && <TableHead className="text-right font-bold text-slate-600 text-xs pr-6">Aksi</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, idx) => (
                <TableRow key={idx} className="h-16">
                  <TableCell className="pl-6">
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-14 rounded" />
                  </TableCell>
                  {isAdminOrManager && (
                    <TableCell className="text-right pr-6">
                      <div className="flex justify-end gap-2">
                        <Skeleton className="h-8 w-8 rounded-lg" />
                        <Skeleton className="h-8 w-8 rounded-lg" />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            ) : expeditions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdminOrManager ? 4 : 3} className="text-center py-20 text-slate-400">
                  <Plane className="w-12 h-12 mx-auto text-slate-200 mb-3" />
                  <p className="text-sm font-bold text-slate-600">Ekspedisi tidak ditemukan</p>
                </TableCell>
              </TableRow>
            ) : (
              expeditions.map((c) => (
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
