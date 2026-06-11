import React, { useState, useEffect } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Search, Database } from 'lucide-react';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format } from 'date-fns';

export function Ledger() {
  const [ledgers, setLedgers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [owners, setOwners] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [inbounds, setInbounds] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [underlyingPos, setUnderlyingPos] = useState<any[]>([]);
  const [supplyPos, setSupplyPos] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const qLedger = query(collection(db, 'inventory_ledgers'));
    const unsubL = onSnapshot(qLedger, sn => setLedgers(sn.docs.map(d => ({ id: d.id, ...d.data() }))));

    const unsubP = onSnapshot(query(collection(db, 'products')), sn => setProducts(sn.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubO = onSnapshot(query(collection(db, 'owners')), sn => setOwners(sn.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubW = onSnapshot(query(collection(db, 'warehouses')), sn => setWarehouses(sn.docs.map(d => ({ id: d.id, ...d.data() }))));
    
    // Referensi tambahan untuk melengkapi tabel
    const unsubIn = onSnapshot(query(collection(db, 'inbounds')), sn => setInbounds(sn.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubDel = onSnapshot(query(collection(db, 'delivery_orders')), sn => setDeliveries(sn.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubUpo = onSnapshot(query(collection(db, 'underlying_pos')), sn => setUnderlyingPos(sn.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubSpo = onSnapshot(query(collection(db, 'supply_pos')), sn => setSupplyPos(sn.docs.map(d => ({ id: d.id, ...d.data() }))));

    return () => { unsubL(); unsubP(); unsubO(); unsubW(); unsubIn(); unsubDel(); unsubUpo(); unsubSpo(); };
  }, []);

  const filteredLedgers = ledgers.filter(l => 
    l.transactionNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.referenceType?.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort((a,b) => b.createdAt - a.createdAt);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm border-t-4 border-t-[#0C4196]">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 leading-none">Inventory Ledger</h2>
          <p className="text-sm md:text-base text-slate-500 font-medium mt-2">Sistem pencatatan terpusat (Source of Truth) untuk pergerakan stok</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
        <div className="p-4 border-b bg-slate-50/50">
          <div className="relative w-full max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input 
               placeholder="Cari No Trx atau Tipe Referensi..." 
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               className="pl-9 h-10 rounded-lg bg-white border-slate-200 focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]" 
            />
          </div>
        </div>
        <div className="flex-1 overflow-x-auto">
            <Table className="min-w-[1000px]">
            <TableHeader className="bg-slate-50 border-b border-slate-200">
                <TableRow className="hover:bg-transparent h-12">
                <TableHead className="font-bold text-slate-600 text-xs pl-6">Tanggal</TableHead>
                <TableHead className="font-bold text-slate-600 text-xs">No. Transaksi</TableHead>
                <TableHead className="font-bold text-slate-600 text-xs">Produk</TableHead>
                <TableHead className="font-bold text-slate-600 text-xs">Owner & Gudang</TableHead>
                <TableHead className="font-bold text-slate-600 text-xs text-right">Awal</TableHead>
                <TableHead className="font-bold text-slate-600 text-xs text-right">Mutasi</TableHead>
                <TableHead className="font-bold text-slate-600 text-xs text-right">Akhir</TableHead>
                <TableHead className="font-bold text-slate-600 text-xs pr-6">Referensi Tambahan</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {filteredLedgers.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={8} className="text-center py-20 text-slate-400">
                    <Database className="w-12 h-12 mx-auto text-slate-200 mb-3" />
                    <p className="text-sm font-bold text-slate-600">Catatan ledger masih kosong</p>
                    </TableCell>
                </TableRow>
                ) : (
                filteredLedgers.map((l) => {
                    const prodName = products.find(p => p.id === l.productId)?.name || 'Unknown';
                    const ownerName = owners.find(o => o.id === l.ownerId)?.name || 'Unknown';
                    const whName = warehouses.find(w => w.id === l.warehouseId)?.name || 'Unknown';
                    const isPositive = l.qtyChange > 0;

                    let refText = l.referenceType || '';
                    let subText1 = '';
                    let subText2 = '';
                    let address = '';

                    if (l.referenceType === 'INBOUND_DO') {
                        const inb = inbounds.find(i => i.id === l.referenceId);
                        if (inb) {
                            subText1 = `Inbound: ${inb.inboundNumber}`;
                            const spo = supplyPos.find(s => s.id === inb.supplyPoId);
                            if (spo) subText2 = `Supply PO: ${spo.supplyPoNumber}`;
                        }
                    } else if (l.referenceType === 'DELIVERY_ORDER') {
                        const out = deliveries.find(d => d.id === l.referenceId);
                        if (out) {
                            subText1 = `Out: ${out.doNumber}`;
                            address = out.shippingAddress || '';
                            const upo = underlyingPos.find(u => u.id === out.underlyingPoId);
                            if (upo) subText2 = `U.PO: ${upo.poNumber}`;
                        }
                    }

                    return (
                    <TableRow key={l.id} className="h-16 hover:bg-slate-50/50 group">
                        <TableCell className="pl-6 text-xs text-slate-500">
                            {l.createdAt ? format(new Date(l.createdAt), 'dd MMM yy HH:mm') : '-'}
                        </TableCell>
                        <TableCell className="font-mono text-[10px] sm:text-xs font-bold text-[#0C4196] uppercase">{l.transactionNumber}</TableCell>
                        <TableCell className="text-sm font-bold text-slate-900">{prodName}</TableCell>
                        <TableCell className="text-xs text-slate-600">
                            <div><span className="font-bold text-slate-400">O:</span> {ownerName}</div>
                            <div><span className="font-bold text-slate-400">W:</span> {whName}</div>
                        </TableCell>
                        <TableCell className="text-right font-medium text-slate-500">{l.qtyBefore}</TableCell>
                        <TableCell className={`text-right font-bold ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
                            {isPositive ? '+' : ''}{l.qtyChange}
                        </TableCell>
                        <TableCell className="text-right font-bold text-slate-900">{l.qtyAfter}</TableCell>
                        <TableCell className="pr-6">
                            <span className="inline-flex px-2 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200 uppercase tracking-wider mb-1">
                                {refText}
                            </span>
                            {subText1 && <div className="text-[11px] font-medium text-slate-700">{subText1}</div>}
                            {subText2 && <div className="text-[11px] font-medium text-[#0C4196]">{subText2}</div>}
                            {address && <div className="text-[10px] text-slate-500 max-w-[150px] truncate mt-0.5">{address}</div>}
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
