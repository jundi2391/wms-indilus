import React, { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, writeBatch, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Tag, Pencil, Trash2, Printer, Download } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import Barcode from 'react-barcode';
import { toJpeg } from 'html-to-image';

export function Products() {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stickerProduct, setStickerProduct] = useState<any>(null);
  const stickerRef = useRef<HTMLDivElement>(null);

  const { data: products, refetch, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'products'));
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async (): Promise<any[]> => {
      const snap = await getDocs(collection(db, 'categories'));
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  });

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      sku: fd.get('sku'),
      barcode: fd.get('barcode'),
      name: fd.get('name'),
      categoryId: fd.get('categoryId') || '',
      unit: fd.get('unit'),
      weight: Number(fd.get('weight')),
      price: Number(fd.get('price')),
      status: 'Active',
      updatedAt: Date.now()
    };

    try {
      if (editProduct) {
        await updateDoc(doc(db, 'products', editProduct.id), payload);
        toast.success('Produk berhasil diperbarui');
      } else {
        await addDoc(collection(db, 'products'), { ...payload, createdAt: Date.now() });
        toast.success('Produk berhasil ditambahkan');
      }
      setIsOpen(false);
      setEditProduct(null);
      refetch();
    } catch(err: any) {
      toast.error(err.message || 'Gagal menyimpan produk');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus ${name}? Ini juga akan menghapus inventaris terkait.`)) return;
    
    try {
      // Find all inventory items for this product
      const q = query(collection(db, 'inventory'), where('productId', '==', id));
      const inventorySnap = await getDocs(q);
      
      const batch = writeBatch(db);
      inventorySnap.docs.forEach((d) => {
        batch.delete(d.ref);
      });
      batch.delete(doc(db, 'products', id));
      
      await batch.commit();
      toast.success('Produk dan inventaris terkait telah dihapus');
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Gagal menghapus produk');
    }
  };

  const openEdit = (product: any) => {
    setEditProduct(product);
    setIsOpen(true);
  };

  const downloadSticker = async () => {
    if (!stickerRef.current) return;
    try {
      const dataUrl = await toJpeg(stickerRef.current, { quality: 0.95, backgroundColor: '#fff' });
      const link = document.createElement('a');
      link.download = `label-${stickerProduct?.sku || 'barcode'}.jpeg`;
      link.href = dataUrl;
      link.click();
      toast.success('Label berhasil diunduh');
    } catch (err) {
      toast.error('Gagal membuat gambar label');
    }
  };

  const filtered = products?.filter((p: any) => 
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.sku?.toLowerCase().includes(search.toLowerCase()) ||
    p.barcode?.includes(search)
  ) || [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Produk</h2>
          <p className="text-slate-500 text-sm mt-1">Kelola katalog produk dan barcode</p>
        </div>
        <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) setEditProduct(null); }}>
          <DialogTrigger render={
            <Button className="bg-[#0C4196] hover:bg-[#0C4196]/90 text-white rounded-lg px-6 font-bold shadow-sm transition-all">
              <Plus className="w-4 h-4 mr-2" />
              Tambah Produk
            </Button>
          } />
          <DialogContent className="sm:max-w-5xl rounded-xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">{editProduct ? 'Ubah Produk' : 'Tambah Produk Baru'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={onSubmit} className="space-y-6 mt-4">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-600 uppercase">Nama Produk</Label>
                    <Input name="name" required placeholder="Contoh: Kertas A4" className="h-10 rounded-lg" defaultValue={editProduct?.name} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-600 uppercase">Kategori</Label>
                    <select name="categoryId" required defaultValue={editProduct?.categoryId || ''} className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0C4196] outline-none">
                      <option value="" disabled>Pilih kategori...</option>
                      {categories?.map((cat: any) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-600 uppercase">SKU</Label>
                      <Input name="sku" required placeholder="SKU-001" className="h-10 rounded-lg" defaultValue={editProduct?.sku} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-600 uppercase">Barcode</Label>
                      <Input name="barcode" required placeholder="899123456" className="h-10 rounded-lg" defaultValue={editProduct?.barcode} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-600 uppercase">Satuan</Label>
                      <Input name="unit" required placeholder="PCS" className="h-10 rounded-lg" defaultValue={editProduct?.unit || 'PCS'} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-600 uppercase">Berat (kg)</Label>
                      <Input name="weight" type="number" step="0.01" required placeholder="0.5" className="h-10 rounded-lg" defaultValue={editProduct?.weight} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-600 uppercase">Harga (Rp)</Label>
                    <Input name="price" type="number" required placeholder="10000" className="h-10 rounded-lg" defaultValue={editProduct?.price} />
                  </div>
                </div>
                
                <div className="bg-slate-50 rounded-xl p-6 flex flex-col items-center justify-center border border-dashed border-slate-200">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Preview Label</p>
                  <div className="bg-white p-4 border border-slate-200 shadow-sm rounded flex flex-col items-center">
                    <div className="text-center mb-1">
                      <p className="text-[10px] font-bold uppercase text-slate-800">{editProduct?.name || 'NAMA PRODUK'}</p>
                    </div>
                    <Barcode 
                      value={editProduct?.barcode || '123456789'} 
                      width={1.2} 
                      height={40} 
                      fontSize={10} 
                      margin={5}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-4 text-center px-4">Simpan produk untuk mengunduh label barcode</p>
                </div>
              </div>

              <Button type="submit" className="w-full bg-[#0C4196] hover:bg-[#0C4196]/90 h-11 text-sm font-bold rounded-lg shadow-sm" disabled={isSubmitting}>
                {editProduct ? 'Simpan Perubahan' : 'Simpan Produk'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-slate-50/50">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari produk berdasarkan SKU, nama, atau barcode..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196] outline-none"
            />
          </div>
        </div>
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow className="hover:bg-transparent h-12">
              <TableHead className="font-bold text-slate-600 text-xs pl-6">Produk</TableHead>
              <TableHead className="font-bold text-slate-600 text-xs">SKU</TableHead>
              <TableHead className="font-bold text-slate-600 text-xs">Kategori</TableHead>
              <TableHead className="font-bold text-slate-600 text-xs">Barcode</TableHead>
              <TableHead className="font-bold text-slate-600 text-xs text-right">Harga</TableHead>
              <TableHead className="font-bold text-slate-600 text-xs text-right pr-6">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center py-20 text-slate-400">Memuat data...</TableCell></TableRow>}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-20 text-slate-400">
                  <Tag className="w-12 h-12 mx-auto text-slate-200 mb-3" />
                  <p className="text-sm font-bold text-slate-600">Produk tidak ditemukan</p>
                </TableCell>
              </TableRow>
            )}
            {filtered.map((item: any) => (
              <TableRow key={item.id} className="h-16 group hover:bg-slate-50/50">
                <TableCell className="font-bold text-slate-900 pl-6 text-sm">{item.name}</TableCell>
                <TableCell className="text-xs font-medium text-[#0C4196] font-mono">{item.sku}</TableCell>
                <TableCell className="text-sm text-slate-600">{categories?.find((c: any) => c.id === item.categoryId)?.name || '-'}</TableCell>
                <TableCell className="text-xs font-mono text-slate-500">{item.barcode}</TableCell>
                <TableCell className="text-right text-sm font-bold text-slate-900">Rp {item.price?.toLocaleString('id-ID') || 0}</TableCell>
                <TableCell className="text-right pr-6">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setStickerProduct(item)} className="h-8 w-8 text-slate-400 hover:text-[#0C4196] hover:bg-white" title="Cetak Barcode">
                      <Printer className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(item)} className="h-8 w-8 text-slate-400 hover:text-[#0C4196] hover:bg-white">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id, item.name)} className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!stickerProduct} onOpenChange={(open) => !open && setStickerProduct(null)}>
        <DialogContent className="max-w-[350px] rounded-xl">
          <DialogHeader>
            <DialogTitle className="font-bold">Label Barcode</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-6">
            <div ref={stickerRef} className="bg-white p-6 border border-slate-200 shadow-sm rounded flex flex-col items-center w-[250px]">
              <div className="text-center mb-2">
                <p className="text-[12px] font-bold uppercase text-slate-800 line-clamp-1">{stickerProduct?.name}</p>
              </div>
              <Barcode 
                value={stickerProduct?.barcode || '000000'} 
                width={1.2} 
                height={50} 
                fontSize={10}
                margin={5}
              />
            </div>
            
            <div className="mt-8 w-full space-y-3">
              <Button onClick={downloadSticker} className="w-full bg-[#0C4196] hover:bg-[#0C4196]/90 h-11 font-bold rounded-lg shadow-sm">
                <Download className="w-4 h-4 mr-2" />
                Unduh Label (JPEG)
              </Button>
              <Button variant="ghost" onClick={() => setStickerProduct(null)} className="w-full h-11 font-bold text-slate-400">
                Tutup
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

