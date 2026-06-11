import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ClipboardList, Plus, FileCheck, Save } from 'lucide-react';
import { collection, query, onSnapshot, getDocs, doc, writeBatch, runTransaction } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from 'date-fns';
import { useAuthStore } from '@/store/authStore';

export function StockOpname() {
  const { appUser } = useAuthStore();
  const [opnames, setOpnames] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'stock_opnames'));
    const unsubOpnames = onSnapshot(q, (snapshot) => {
      setOpnames(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    
    const unsubWarehouses = onSnapshot(collection(db, 'warehouses'), (snap) => {
      setWarehouses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubProducts = onSnapshot(collection(db, 'products'), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubOpnames();
      unsubWarehouses();
      unsubProducts();
    };
  }, []);

  const loadInventory = async (warehouseId: string) => {
    if (!warehouseId) {
      setInventoryItems([]);
      return;
    }
    const snap = await getDocs(collection(db, 'inventory'));
    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter((i: any) => i.warehouseId === warehouseId)
      .map((i: any) => ({
        ...i,
        actualQty: i.availableQty // Default to current
      }));
    setInventoryItems(items);
  };

  const handleWarehouseChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const wid = e.target.value;
    setSelectedWarehouseId(wid);
    loadInventory(wid);
  };

  const handleActualQtyChange = (inventoryId: string, value: string) => {
    setInventoryItems(prev => prev.map(item => 
      item.id === inventoryId ? { ...item, actualQty: parseInt(value) || 0 } : item
    ));
  };

  const submitOpname = async () => {
    if (!selectedWarehouseId || inventoryItems.length === 0) return;
    setIsSubmitting(true);
    
    try {
      const now = Date.now();
      const opnameRef = doc(collection(db, 'stock_opnames'));
      
      const itemsToUpdate = inventoryItems.filter(i => i.actualQty !== i.availableQty);

      await runTransaction(db, async (transaction) => {
        // Prepare Opname Doc
        const opnameData = {
          warehouseId: selectedWarehouseId,
          opnameNumber: 'OPN-' + now,
          status: 'Completed',
          createdBy: appUser?.uid,
          createdAt: now,
          items: itemsToUpdate.map(i => ({
            productId: i.productId,
            systemQty: i.availableQty,
            actualQty: i.actualQty,
            difference: i.actualQty - i.availableQty
          }))
        };
        transaction.set(opnameRef, opnameData);

        // Update inventory and create transactions
        for (const item of itemsToUpdate) {
          const invRef = doc(db, 'inventory', item.id);
          const difference = item.actualQty - item.availableQty;
          
          transaction.update(invRef, {
            availableQty: item.actualQty,
            updatedAt: now
          });

          const txRef = doc(collection(db, 'inventory_transactions'));
          transaction.set(txRef, {
            warehouseId: selectedWarehouseId,
            productId: item.productId,
            transactionType: 'opname_adjustment',
            referenceType: 'stock_opname',
            referenceId: opnameRef.id,
            qtyIn: difference > 0 ? difference : 0,
            qtyOut: difference < 0 ? Math.abs(difference) : 0,
            balanceAfter: item.actualQty,
            createdBy: appUser?.uid,
            createdAt: now
          });
        }
      });

      toast.success('Stock Opname saved successfully. Adjusted ' + itemsToUpdate.length + ' items.');
      setSelectedWarehouseId('');
      setInventoryItems([]);
    } catch (err: any) {
      toast.error('Failed to submit Stock Opname: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 leading-none">Stock Opname</h2>
          <p className="text-sm md:text-base text-slate-500 font-medium mt-2">Sesuaikan jumlah stok gudang dengan fisik</p>
        </div>
      </div>

      <Tabs defaultValue="new" className="w-full">
        <TabsList className="mb-6 bg-slate-100 p-1 rounded-xl">
          <TabsTrigger value="new" className="rounded-lg px-6 py-2 data-[state=active]:bg-white data-[state=active]:text-[#0C4196] data-[state=active]:shadow-sm transition-all font-bold text-xs uppercase tracking-wider">Opname Baru</TabsTrigger>
          <TabsTrigger value="history" className="rounded-lg px-6 py-2 data-[state=active]:bg-white data-[state=active]:text-[#0C4196] data-[state=active]:shadow-sm transition-all font-bold text-xs uppercase tracking-wider">Riwayat Opname</TabsTrigger>
        </TabsList>
        
        <TabsContent value="new">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-slate-50/50 flex flex-col sm:flex-row items-center gap-4 justify-between">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Lakukan Perhitungan Stok</h3>
              <div className="w-full max-w-xs">
                <select 
                  value={selectedWarehouseId} 
                  onChange={handleWarehouseChange}
                  className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0C4196] outline-none font-bold text-[#0C4196]"
                >
                  <option value="">Pilih Gudang...</option>
                  {warehouses?.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {selectedWarehouseId ? (
              <div className="overflow-x-auto">
                <Table className="min-w-[750px]">
                  <TableHeader className="bg-slate-50 border-b">
                    <TableRow className="h-12 hover:bg-transparent">
                      <TableHead className="font-bold text-slate-600 text-xs pl-6">Kode Produk (SKU)</TableHead>
                      <TableHead className="font-bold text-slate-600 text-xs text-left">Nama Produk</TableHead>
                      <TableHead className="text-right font-bold text-slate-600 text-xs">Stok Sistem</TableHead>
                      <TableHead className="text-right w-40 font-bold text-slate-600 text-xs">Stok Fisik</TableHead>
                      <TableHead className="text-right font-bold text-slate-600 text-xs pr-6">Selisih</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventoryItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-20 text-slate-400">
                          Tidak ada item inventaris di gudang ini.
                        </TableCell>
                      </TableRow>
                    ) : (
                      inventoryItems.map(item => {
                        const product = products.find(p => p.id === item.productId);
                        const diff = item.actualQty - item.availableQty;
                        return (
                          <TableRow key={item.id} className="h-16 group hover:bg-slate-50/50">
                            <TableCell className="font-mono text-xs font-bold text-[#0C4196] pl-6 uppercase">{product?.sku}</TableCell>
                            <TableCell className="font-bold text-slate-900 text-sm py-4">{product?.name}</TableCell>
                            <TableCell className="text-right font-bold text-slate-500">{item.availableQty}</TableCell>
                            <TableCell className="text-right px-4">
                              <Input 
                                type="number" 
                                value={item.actualQty} 
                                onChange={(e) => handleActualQtyChange(item.id, e.target.value)}
                                className="text-right h-10 w-24 ml-auto rounded-lg focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196] font-bold"
                              />
                            </TableCell>
                            <TableCell className={`text-right font-bold pr-6 ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                              {diff > 0 ? '+' : ''}{diff}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
                {inventoryItems.length > 0 && (
                  <div className="p-6 border-t flex justify-end bg-slate-50/30">
                    <Button onClick={submitOpname} disabled={isSubmitting} className="bg-[#0C4196] hover:bg-[#0C4196]/90 text-white rounded-lg px-10 font-bold h-11 shadow-sm">
                      <Save className="w-4 h-4 mr-2" />
                      Simpan Penyesuaian
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-32 text-slate-400">
                <FileCheck className="w-16 h-16 mx-auto text-slate-100 mb-4" />
                <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Pilih gudang untuk memulai stock opname</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="history">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-slate-50/50">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Riwayat Opname</h3>
            </div>
            <div className="overflow-x-auto">
              <Table className="min-w-[700px]">
                <TableHeader className="bg-slate-50 border-b border-slate-200">
                  <TableRow className="hover:bg-transparent h-12">
                    <TableHead className="font-bold text-slate-600 text-xs pl-6">Tanggal</TableHead>
                    <TableHead className="font-bold text-slate-600 text-xs">Nomor Opname</TableHead>
                    <TableHead className="font-bold text-slate-600 text-xs">Gudang</TableHead>
                    <TableHead className="text-right font-bold text-slate-600 text-xs">Item Disesuaikan</TableHead>
                    <TableHead className="font-bold text-slate-600 text-xs text-center pr-6">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {opnames.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-20 text-slate-400">
                        Riwayat opname kosong
                      </TableCell>
                    </TableRow>
                  ) : (
                    opnames.sort((a,b) => b.createdAt - a.createdAt).map((op) => (
                      <TableRow key={op.id} className="h-16 group hover:bg-slate-50/50">
                        <TableCell className="text-slate-500 text-xs pl-6">{format(new Date(op.createdAt), 'dd/MM/yyyy HH:mm')}</TableCell>
                        <TableCell className="font-mono text-xs font-bold text-[#0C4196] uppercase">{op.opnameNumber}</TableCell>
                        <TableCell className="font-bold text-slate-900 text-sm">{warehouses.find(w => w.id === op.warehouseId)?.name || 'Tidak Diketahui'}</TableCell>
                        <TableCell className="text-right font-bold text-slate-700">{op.items?.length || 0} items</TableCell>
                        <TableCell className="text-center pr-6">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-100">
                            Selesai
                          </span>
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
    </div>
  );
}
