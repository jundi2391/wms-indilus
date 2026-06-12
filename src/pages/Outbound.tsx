import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, writeBatch, runTransaction, onSnapshot } from 'firebase/firestore';
import { toast } from 'sonner';
import { ScanBarcode, Send, Eye, ArrowUpFromLine, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { deleteDoc } from 'firebase/firestore';
import { format } from 'date-fns';

export function Outbound() {
  const { appUser } = useAuthStore();
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [selectedWHId, setSelectedWHId] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const scannerRef = useRef<HTMLInputElement>(null);

  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [expeditions, setExpeditions] = useState<any[]>([]);
  const [owners, setOwners] = useState<any[]>([]);
  const [projectExecutors, setProjectExecutors] = useState<any[]>([]);
  const [underlyingPos, setUnderlyingPos] = useState<any[]>([]);
  const [supplyPos, setSupplyPos] = useState<any[]>([]);
  const [ledgers, setLedgers] = useState<any[]>([]);
  const [returnRequests, setReturnRequests] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [viewOutbound, setViewOutbound] = useState<any>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [selectedSPOId, setSelectedSPOId] = useState('');
  const [selectedAddress, setSelectedAddress] = useState('');
  const [isDamageDialogOpen, setIsDamageDialogOpen] = useState(false);
  const [damageTarget, setDamageTarget] = useState<any>(null);
  const [damageForm, setDamageForm] = useState({ productId: '', qty: 0 });

  // Replacement DO logic states
  const [doType, setDoType] = useState<'normal' | 'replacement'>('normal');
  const [selectedUPOIdReplacement, setSelectedUPOIdReplacement] = useState<string>('');

  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, 'products'), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubWarehouses = onSnapshot(collection(db, 'warehouses'), (snap) => {
      setWarehouses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubCustomers = onSnapshot(collection(db, 'customers'), (snap) => {
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubDeliveries = onSnapshot(collection(db, 'delivery_orders'), (snap) => {
      setDeliveries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubExpeditions = onSnapshot(collection(db, 'expeditions'), (snap) => {
      setExpeditions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubOwners = onSnapshot(collection(db, 'owners'), (snap) => {
      setOwners(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubExecutors = onSnapshot(collection(db, 'project_executors'), (snap) => {
      setProjectExecutors(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubUnderlyingPos = onSnapshot(collection(db, 'underlying_pos'), (snap) => {
      setUnderlyingPos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubSupplyPos = onSnapshot(collection(db, 'supply_pos'), (snap) => {
      setSupplyPos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubLedgers = onSnapshot(collection(db, 'inventory_ledgers'), (snap) => {
      setLedgers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubReturnRequests = onSnapshot(collection(db, 'return_requests'), (snap) => {
      setReturnRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => {
      unsubProducts();
      unsubWarehouses();
      unsubCustomers();
      unsubDeliveries();
      unsubExpeditions();
      unsubOwners();
      unsubExecutors();
      unsubUnderlyingPos();
      unsubSupplyPos();
      unsubLedgers();
      unsubReturnRequests();
    };
  }, []);

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scannedBarcode || !products) return;

    const matchedProduct = products.find((p: any) => p.barcode === scannedBarcode);
    
    if (matchedProduct) {
      setItems(prev => {
        const existing = prev.find(i => i.product.id === matchedProduct.id);
        if (existing) {
          return prev.map(i => i.product.id === matchedProduct.id ? { ...i, qty: i.qty + 1 } : i);
        }
        return [...prev, { product: matchedProduct, qty: 1 }];
      });
      toast.success(`Scanned Out: ${matchedProduct.name}`);
    } else {
      toast.error('Product not found: ' + scannedBarcode);
    }
    setScannedBarcode('');
  };

  const selectedSPO = useMemo(() => supplyPos.find(s => s.id === selectedSPOId), [selectedSPOId, supplyPos]);
  const selectedUPO = useMemo(() => underlyingPos.find(u => u.id === selectedSPO?.underlyingPoId), [selectedSPO, underlyingPos]);

  const uniqueAddresses = useMemo(() => {
    if (!selectedSPO) return [];
    const addrs = new Set<string>();
    selectedSPO.items?.forEach((it: any) => {
      if (it.shippingAddress) addrs.add(it.shippingAddress);
    });
    // If no specific addresses in items, check UPO wide address
    if (addrs.size === 0 && selectedUPO?.shippingAddress) {
      addrs.add(selectedUPO.shippingAddress);
    }
    return Array.from(addrs);
  }, [selectedSPO, selectedUPO]);

  const addressStatus = useMemo(() => {
    if (!selectedSPO) return {};
    const statusMap: Record<string, { totalOrdered: number, totalShipped: number, isFulfilled: boolean }> = {};
    
    const poItems = selectedSPO.items || [];
    
    uniqueAddresses.forEach(addr => {
      const totalOrdered = poItems
        .filter((it: any) => it.shippingAddress === addr)
        .reduce((sum: number, it: any) => sum + (it.qty || 0), 0);
      
      const totalShipped = deliveries
        .filter(d => d.underlyingPoId === selectedSPO.underlyingPoId && d.shippingAddress === addr)
        .reduce((sum, d) => sum + (d.items?.reduce((s: number, i: any) => s + (i.qty || 0), 0) || 0), 0);

      const totalDamaged = ledgers.filter(l => 
        l.referenceId && 
        deliveries.some(d => d.id === l.referenceId && d.underlyingPoId === selectedSPO.underlyingPoId && d.shippingAddress === addr) &&
        l.transactionType === 'OUTBOUND_DAMAGE'
      ).reduce((sum, l) => sum + (l.qtyChange || 0), 0);

      const netShipped = totalShipped - totalDamaged;
        
      statusMap[addr] = {
        totalOrdered,
        totalShipped: netShipped,
        isFulfilled: netShipped >= totalOrdered && totalOrdered > 0
      };
    });
    return statusMap;
  }, [selectedSPO, uniqueAddresses, deliveries, ledgers]);

  // Filter shipping area for Replacement DO based on return/damage history
  const selectableShippingAreas = useMemo(() => {
    if (doType !== 'replacement' || !selectedUPOIdReplacement) return [];
    
    const matchingReqs = returnRequests.filter(r => 
      (r.underlying_po_id === selectedUPOIdReplacement || r.underlyingPoId === selectedUPOIdReplacement) &&
      r.status === 'Pending'
    );
    const uniqueAreas = new Set<string>();
    matchingReqs.forEach(r => {
      if (r.shippingAddress) uniqueAreas.add(r.shippingAddress);
      if (r.shipping_area_id) uniqueAreas.add(r.shipping_area_id);
    });
    return Array.from(uniqueAreas);
  }, [doType, selectedUPOIdReplacement, returnRequests]);

  useEffect(() => {
    setSelectedAddress(prev => {
      if (doType === 'normal') {
        if (uniqueAddresses.length === 1) return uniqueAddresses[0];
        if (!uniqueAddresses.includes(prev)) return '';
        return prev;
      } else {
        if (selectableShippingAreas.length === 1) return selectableShippingAreas[0];
        if (!selectableShippingAreas.includes(prev)) return '';
        return prev;
      }
    });
  }, [uniqueAddresses, doType, selectableShippingAreas]);

  // Group and autofill items from all pending return requests for selected UPO
  const autoItems = useMemo(() => {
    if (doType !== 'replacement' || !selectedUPOIdReplacement) return [];
    
    const matchedReqs = returnRequests.filter(r => 
      (r.underlyingPoId === selectedUPOIdReplacement || r.underlying_po_id === selectedUPOIdReplacement) && 
      r.status === 'Pending'
    );
    
    const grouped: Record<string, number> = {};
    matchedReqs.forEach(r => {
      grouped[r.productId] = (grouped[r.productId] || 0) + (Number(r.qty) || 0);
    });

    return Object.keys(grouped).map(pId => {
      const prod = products.find(p => p.id === pId);
      return {
        product: prod,
        qty: grouped[pId]
      };
    }).filter(item => item.product);
  }, [doType, selectedUPOIdReplacement, returnRequests, products]);

  useEffect(() => {
    if (doType === 'replacement' && autoItems.length > 0) {
      setItems(autoItems);
    } else if (doType === 'replacement' && autoItems.length === 0) {
      setItems([]);
    }
  }, [doType, autoItems]);

  const spoData = useMemo(() => {
    if (!selectedSPO || !selectedUPO) return null;
    const customer = customers.find(c => c.id === selectedUPO.customerId)?.name || '-';
    const owner = owners.find(o => o.id === selectedUPO.ownerId)?.name || '-';
    const executor = projectExecutors.find(e => e.id === selectedUPO.executorId)?.name || '-';
    
    // Calculate Fulfillment of UPO (based on ALL completed deliveries for this UPO)
    const relatedDeliveries = deliveries.filter(d => d.underlyingPoId === selectedUPO.id);
    const deliveredQty: Record<string, number> = {};
    relatedDeliveries.forEach(d => {
      d.items?.forEach((it: any) => {
        deliveredQty[it.product.id] = (deliveredQty[it.product.id] || 0) + it.qty;
      });
    });

    let totalUPOItems = 0;
    let totalDelivered = 0;
    selectedUPO.items?.forEach((it: any) => {
       totalUPOItems += it.qty;
       totalDelivered += deliveredQty[it.productId] || 0;
    });
    const fulfillment = totalUPOItems > 0 ? (totalDelivered / totalUPOItems) * 100 : 0;

    return {
      upoNumber: selectedUPO.poNumber,
      customer,
      owner,
      executor,
      dueDeliveryDate: selectedUPO.dueDeliveryDate,
      fulfillment: Math.round(fulfillment),
      items: selectedSPO.items || []
    };
  }, [selectedSPO, selectedUPO, customers, owners, projectExecutors, deliveries]);

  useEffect(() => {
    if (selectedSPO) {
      setSelectedWHId(selectedSPO.warehouseId || '');
    }
  }, [selectedSPO]);

  const submitOutbound = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (doType === 'replacement') {
      if (!selectedUPOIdReplacement) {
        toast.error('Pilih Referensi Underlying PO terlebih dahulu');
        return;
      }
      if (!selectedWHId) {
        toast.error('Pilih Gudang Asal terlebih dahulu');
        return;
      }
      if (!selectedAddress) {
        toast.error('Pilih Alamat Pengiriman terlebih dahulu');
        return;
      }
      if (items.length === 0) {
        toast.error('Tidak ada item yang dapat dikirim (Harus ada laporan retur status Pending)');
        return;
      }

      const upo = underlyingPos.find(u => u.id === selectedUPOIdReplacement);
      if (!upo) {
        toast.error('Data Underlying PO tidak valid');
        return;
      }

      const form = e.currentTarget;
      const fd = new FormData(form);
      const warehouseId = selectedWHId;
      const doNumber = fd.get('doNumber') as string || 'DO-' + Date.now();
      const ownerId = upo.ownerId;

      try {
        const now = Date.now();
        const deliveryRef = doc(collection(db, 'delivery_orders'));

        await runTransaction(db, async (transaction) => {
          const invRefs = items.map(item => doc(db, 'inventory', `${ownerId}_${warehouseId}_${item.product.id}`));
          const invDocs = await Promise.all(invRefs.map(ref => transaction.get(ref)));

          // Validate enough stock (Available check ONLY)
          invDocs.forEach((invDoc, index) => {
            const item = items[index];
            const whName = warehouses.find(w => w.id === warehouseId)?.name || warehouseId;
            const ownerName = owners.find(o => o.id === ownerId)?.name || ownerId;

            if (!invDoc.exists()) {
               throw new Error(`Record inventory tidak ditemukan untuk [${ownerName}] di [${whName}] untuk produk [${item.product.name}]. Pastikan stok sudah tersedia di gudang ini.`);
            }
            
            const availableQty = Number(invDoc.data().availableQty) || 0;

            if (availableQty < item.qty) {
               throw new Error(`Stok available tidak cukup di ${whName} untuk ${item.product.name}. Tersedia: ${availableQty}, Diminta: ${item.qty}.`);
            }
          });

          // Write phases
          transaction.set(deliveryRef, {
            underlyingPoId: selectedUPOIdReplacement,
            underlying_po_id: selectedUPOIdReplacement,
            ownerId,
            executorId: upo.executorId || '',
            customerId: upo.customerId || '',
            warehouseId,
            warehouse_id: warehouseId,
            expeditionId: fd.get('expeditionId'),
            doNumber,
            shippingAddress: selectedAddress,
            shipping_area_id: selectedAddress,
            notes: fd.get('notes'),
            status: 'Completed',
            createdBy: appUser?.uid,
            createdAt: now,
            type: 'replacement',
            items
          });

          // Update inventory
          items.forEach((item, index) => {
            const invRef = invRefs[index];
            const invDoc = invDocs[index];
            
            const currentOH = Number(invDoc.data().onHandQty) || 0;
            const currentAvailable = Number(invDoc.data().availableQty) || 0;

            const newOH = currentOH - item.qty;
            const newAvailable = currentAvailable - item.qty;

            transaction.update(invRef, {
              onHandQty: newOH,
              availableQty: newAvailable,
              updatedAt: now
            });

            const ledgerRef = doc(collection(db, 'inventory_ledgers'));
            transaction.set(ledgerRef, {
              transactionNumber: 'TRX-REP-' + now + '-' + index,
              transactionType: 'OUTBOUND_SEND',
              type: 'replacement',
              productId: item.product.id,
              ownerId,
              warehouseId,
              qtyBefore: currentOH,
              qtyChange: -item.qty,
              qtyAfter: newOH,
              referenceType: 'DELIVERY_ORDER',
              referenceId: deliveryRef.id,
              createdBy: appUser?.uid,
              createdAt: now
            });
          });

          // Update all matching return requests of this UPO that are Pending to 'Replaced'
          const matchingReturnRequests = returnRequests.filter(r =>
            (r.underlyingPoId === selectedUPOIdReplacement || r.underlying_po_id === selectedUPOIdReplacement) &&
            r.status === 'Pending'
          );

          matchingReturnRequests.forEach(retReq => {
            const returnReqRef = doc(db, 'return_requests', retReq.id);
            transaction.update(returnReqRef, {
              status: 'Replaced',
              replacementDoId: deliveryRef.id,
              replacedAt: now,
              replacedBy: appUser?.uid
            });
          });

          // Write Audit Logs
          const auditRef = doc(collection(db, 'audit_logs'));
          transaction.set(auditRef, {
              user: appUser?.name || 'Unknown',
              action: 'Outbound Replacement DO Created (Stock Reduced)',
              module: 'Outbound',
              recordId: deliveryRef.id,
              timestamp: now
          });
        });

        toast.success('Pengiriman Replacement berhasil diproses. Stok dikurangi secara langsung.');
        setItems([]);
        setSelectedUPOIdReplacement('');
        setSelectedAddress('');
        form.reset();
      } catch (err: any) {
        toast.error(err.message || 'Gagal memproses pengiriman');
      }
      return;
    }

    // Normal DO Flow (Existing Logic)
    if (!selectedSPO) {
      toast.error('Pilih Vendor PO terlebih dahulu');
      return;
    }
    if (items.length === 0) {
      toast.error('Belum ada item yang di-scan');
      return;
    }
    const form = e.currentTarget;
    const fd = new FormData(form);
    
    const warehouseId = selectedWHId || selectedSPO.warehouseId;
    const doNumber = fd.get('doNumber') as string || 'DO-' + Date.now();
    const ownerId = selectedSPO.ownerId;
    
    try {
      const now = Date.now();
      const deliveryRef = doc(collection(db, 'delivery_orders'));

      await runTransaction(db, async (transaction) => {
        // Read phases
        const invRefs = items.map(item => doc(db, 'inventory', `${ownerId}_${warehouseId}_${item.product.id}`));
        const invDocs = await Promise.all(invRefs.map(ref => transaction.get(ref)));

        // Validate enough stock (Available + Reserved check)
        invDocs.forEach((invDoc, index) => {
          const item = items[index];
          
          const whName = warehouses.find(w => w.id === warehouseId)?.name || warehouseId;
          const ownerName = owners.find(o => o.id === ownerId)?.name || ownerId;

          if (!invDoc.exists()) {
              throw new Error(`Record inventory tidak ditemukan untuk [${ownerName}] di [${whName}] untuk produk [${item.product.name}]. Pastikan stok sudah di-Inbound atau di-Allocation ke gudang ini.`);
          }
          
          const reservedQty = Number(invDoc.data().reservedQty) || 0;
          const availableQty = Number(invDoc.data().availableQty) || 0;
          const effectiveStock = reservedQty + availableQty;

          if (effectiveStock < item.qty) {
            throw new Error(`Stok tidak cukup di ${whName} untuk ${item.product.name}. Total Tersedia (Available+Reserved): ${effectiveStock}, Diminta: ${item.qty}.`);
          }
        });

        // Write phases
        transaction.set(deliveryRef, {
          supplyPoId: selectedSPOId,
          underlyingPoId: selectedSPO.underlyingPoId,
          ownerId,
          executorId: selectedUPO?.executorId,
          customerId: selectedUPO?.customerId,
          warehouseId,
          expeditionId: fd.get('expeditionId'),
          doNumber,
          shippingAddress: selectedAddress || selectedSPO?.items?.[0]?.shippingAddress || selectedUPO?.shippingAddress || '', 
          notes: fd.get('notes'),
          status: 'Completed',
          createdBy: appUser?.uid,
          createdAt: now,
          items
        });

        items.forEach((item, index) => {
          const invRef = invRefs[index];
          const invDoc = invDocs[index];
          
          const currentOH = Number(invDoc.data().onHandQty) || 0;
          const currentReserved = Number(invDoc.data().reservedQty) || 0;
          const currentAvailable = Number(invDoc.data().availableQty) || 0;

          // Consume from Reserved first, then Available
          const toDeductFromReserved = Math.min(currentReserved, item.qty);
          const toDeductFromAvailable = item.qty - toDeductFromReserved;

          const newOH = currentOH - item.qty;
          const newReserved = Math.max(0, currentReserved - toDeductFromReserved);
          const newAvailable = Math.max(0, currentAvailable - toDeductFromAvailable);

          transaction.update(invRef, {
            onHandQty: newOH,
            reservedQty: newReserved,
            availableQty: newAvailable,
            updatedAt: now
          });

          const ledgerRef = doc(collection(db, 'inventory_ledgers'));
          transaction.set(ledgerRef, {
            transactionNumber: 'TRX-OUT-' + now + '-' + index,
            transactionType: 'OUTBOUND_SEND',
            productId: item.product.id,
            ownerId,
            warehouseId,
            qtyBefore: currentOH,
            qtyChange: -item.qty,
            qtyAfter: newOH,
            referenceType: 'DELIVERY_ORDER',
            referenceId: deliveryRef.id,
            createdBy: appUser?.uid,
            createdAt: now
          });
        });

        // Write Audit Logs
        const auditRef = doc(collection(db, 'audit_logs'));
        transaction.set(auditRef, {
            user: appUser?.name || 'Unknown',
            action: 'Outbound DO Created (Reserved Stock Shipped)',
            module: 'Outbound',
            recordId: deliveryRef.id,
            timestamp: now
        });
      });

      toast.success('Pengiriman diproses. Stok On Hand & Reserved dikurangi.');
      setItems([]);
      setSelectedSPOId('');
      setSelectedAddress('');
      form.reset();
    } catch(err: any) {
      toast.error(err.message || 'Gagal memproses barang keluar');
    }
  };

  const filteredDeliveries = useMemo(() => {
    return deliveries.filter(deli => {
      let deliveryMonth = '';
      if (deli.createdAt) {
        try {
          const d = new Date(deli.createdAt);
          if (!isNaN(d.getTime())) {
            deliveryMonth = format(d, 'yyyy-MM');
          }
        } catch (e) {}
      }
      const matchesMonth = deliveryMonth === selectedMonth;
      
      const poNum = underlyingPos.find(u => u.id === deli.underlyingPoId)?.poNumber || '';
      
      const matchesSearch = 
        deli.doNumber?.toLowerCase().includes(searchQuery.toLowerCase()) || 
        poNum.toLowerCase().includes(searchQuery.toLowerCase());
      
      return matchesMonth && matchesSearch;
    }).sort((a, b) => {
      const valA = a.createdAt || 0;
      const valB = b.createdAt || 0;
      return valB - valA;
    });
  }, [deliveries, selectedMonth, searchQuery, underlyingPos]);

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    deliveries.forEach(d => {
      if (d.createdAt) {
        try {
          const dt = new Date(d.createdAt);
          if (!isNaN(dt.getTime())) {
            months.add(format(dt, 'yyyy-MM'));
          }
        } catch (e) {}
      }
    });
    months.add(format(new Date(), 'yyyy-MM'));
    return Array.from(months).sort().reverse();
  }, [deliveries]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 leading-none">Barang Keluar</h2>
          <p className="text-sm md:text-base text-slate-500 font-medium mt-2">Kelola pesanan keluar dan riwayat pengiriman</p>
        </div>
      </div>

      <Tabs defaultValue="outbound" className="w-full">
        <TabsList className="mb-6 bg-slate-100 p-1 rounded-xl">
          <TabsTrigger value="outbound" className="rounded-lg px-6 py-2 data-[state=active]:bg-white data-[state=active]:text-[#0C4196] data-[state=active]:shadow-sm transition-all font-bold text-xs uppercase tracking-wider">Kirim Barang</TabsTrigger>
          <TabsTrigger value="history" className="rounded-lg px-6 py-2 data-[state=active]:bg-white data-[state=active]:text-[#0C4196] data-[state=active]:shadow-sm transition-all font-bold text-xs uppercase tracking-wider">Riwayat Pengiriman</TabsTrigger>
        </TabsList>
        <TabsContent value="outbound">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm border-t-4 border-t-[#0C4196] flex flex-col">
              <div className="p-6 flex-1 flex flex-col">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-50 pb-4 mb-6 uppercase tracking-wider">
                  <ScanBarcode className="w-4 h-4 text-[#0C4196]" /> PDA Picking
                </h3>
                {doType === 'replacement' ? (
                  <div className="bg-amber-50/70 border border-amber-200/60 text-amber-900 p-5 rounded-xl text-xs space-y-3/2 flex-1 flex flex-col justify-center text-center animate-in fade-in duration-300">
                    <div className="mx-auto w-10 h-10 bg-amber-100/80 rounded-full flex items-center justify-center text-amber-600 mb-3">
                      <ScanBarcode className="w-5 h-5" />
                    </div>
                    <p className="font-bold text-sm text-amber-800">Mode Replacement DO Aktif</p>
                    <p className="text-slate-600 leading-relaxed text-[11px] max-w-xs mx-auto">
                      Item pengiriman secara otomatis diambil dari tiket retur/damage yang dipilih. Tidak diperbolehkan melakukan penambahan produk manual demi keakuratan pencatatan.
                    </p>
                  </div>
                ) : (
                  <>
                    <form onSubmit={handleScan} className="space-y-3 mb-8">
                      <Label className="text-xs font-bold text-slate-600 uppercase">Scan Barcode Produk</Label>
                      <Input
                        ref={scannerRef}
                        autoFocus
                        placeholder="Scan atau ketik barcode..."
                        value={scannedBarcode}
                        onChange={e => setScannedBarcode(e.target.value)}
                        className="h-12 text-lg font-mono rounded-lg focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]"
                      />
                      <p className="text-[10px] text-slate-400 font-medium">Input menangkap event keyboard PDA scanner secara otomatis.</p>
                    </form>

                    <div className="border-t border-slate-50 mt-auto pt-6">
                      <h4 className="text-xs font-bold text-slate-900 mb-4 uppercase tracking-wider">Atau Pilih Manual</h4>
                      <form onSubmit={(e) => {
                        e.preventDefault();
                        const form = e.currentTarget;
                        const fd = new FormData(form);
                        const productId = fd.get('productId') as string;
                        const qty = parseInt(fd.get('qty') as string) || 1;
                        
                        if (!productId || qty < 1) return;
                        const matchedProduct = products?.find((p: any) => p.id === productId);
                        if (matchedProduct) {
                          setItems(prev => {
                            const existing = prev.find(i => i.product.id === matchedProduct.id);
                            if (existing) {
                              return prev.map(i => i.product.id === matchedProduct.id ? { ...i, qty: i.qty + qty } : i);
                            }
                            return [...prev, { product: matchedProduct, qty }];
                          });
                          toast.success(`Berhasil ditambah: ${qty}x ${matchedProduct.name}`);
                          form.reset();
                        }
                      }} className="space-y-4">
                        <div className="space-y-1.5">
                           <Label className="text-[10px] font-bold text-slate-500 uppercase">Pilih Produk</Label>
                           <select name="productId" required className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0C4196] outline-none">
                             <option value="">Pilih produk...</option>
                             {products?.map((p: any) => (
                               <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                             ))}
                           </select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-slate-500 uppercase">Jumlah</Label>
                          <Input type="number" name="qty" min="1" defaultValue="1" required className="h-10 rounded-lg focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]" />
                        </div>
                        <Button type="submit" variant="outline" className="w-full h-10 rounded-lg font-bold border-slate-200 text-slate-700 hover:bg-slate-50">Tambah Item</Button>
                      </form>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
              <div className="p-6 h-full flex flex-col">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-6">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Detail Pengiriman</h3>
                  <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
                    <button
                      type="button"
                      onClick={() => { setDoType('normal'); setSelectedUPOIdReplacement(''); setSelectedSPOId(''); setItems([]); }}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${doType === 'normal' ? 'bg-[#0C4196] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      Normal DO
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDoType('replacement'); setSelectedSPOId(''); setSelectedUPOIdReplacement(''); setItems([]); }}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${doType === 'replacement' ? 'bg-[#0C4196] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      Replacement DO
                    </button>
                  </div>
                </div>
                
                <form onSubmit={submitOutbound} className="space-y-6 flex-1 flex flex-col">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {doType === 'normal' ? (
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-600 uppercase">1. Referensi Vendor PO (Allocation)</Label>
                        <select name="selectedSPOId" value={selectedSPOId} onChange={e => setSelectedSPOId(e.target.value)} required className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0C4196] outline-none">
                          <option value="">Pilih Vendor PO...</option>
                          {supplyPos?.filter(s => s.status === 'Verified' || s.status === 'Sent').map((s: any) => (
                            <option key={s.id} value={s.id}>{s.supplyPoNumber}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-[#0C4196] uppercase">1. Referensi Underlying PO (Retur/Damage)</Label>
                        <select 
                          name="selectedUPOIdReplacement" 
                          value={selectedUPOIdReplacement} 
                          onChange={e => {
                            setSelectedUPOIdReplacement(e.target.value);
                            const matchedRes = returnRequests.find(r => (r.underlyingPoId === e.target.value || r.underlying_po_id === e.target.value));
                            if (matchedRes && matchedRes.warehouseId) {
                              setSelectedWHId(matchedRes.warehouseId);
                            }
                          }} 
                          required 
                          className="flex h-10 w-full rounded-lg border border-[#0C4196] bg-white px-3 py-2 text-sm focus:border-[#0C4196] outline-none font-bold"
                        >
                          <option value="">Pilih Underlying PO...</option>
                          {underlyingPos.filter(upo => {
                            return returnRequests.some(r => r.status === 'Pending' && (r.underlyingPoId === upo.id || r.underlying_po_id === upo.id));
                          }).map((upo: any) => (
                            <option key={upo.id} value={upo.id}>
                              {upo.poNumber} ({owners.find(o => o.id === upo.ownerId)?.name || 'Owner'})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="space-y-1.5">
                       <Label className="text-xs font-bold text-slate-600 uppercase">2. Nomor DO</Label>
                       <Input name="doNumber" placeholder="DO-2023-XXXX" className="h-10 rounded-lg focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]" />
                    </div>
                  </div>
 
                  {doType === 'normal' && spoData && (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl relative animate-in fade-in duration-300">
                      <div className="absolute top-2 right-2 flex items-center gap-1">
                        <div className="h-2 w-20 sm:w-32 bg-slate-200 rounded-full overflow-hidden">
                           <div className="h-full bg-[#0C4196]" style={{ width: `${spoData.fulfillment}%` }}></div>
                        </div>
                        <span className="text-[10px] font-bold text-[#0C4196]">{spoData.fulfillment}%</span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Underlying PO</span>
                        <p className="text-xs font-bold text-slate-900">{spoData.upoNumber}</p>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Customer</span>
                        <p className="text-xs font-bold text-slate-800">{spoData.customer}</p>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Owner</span>
                        <p className="text-xs font-bold text-slate-800">{spoData.owner}</p>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Due Delivery</span>
                        <p className="text-xs font-bold text-slate-800">{spoData.dueDeliveryDate ? format(new Date(spoData.dueDeliveryDate), 'dd/MM/yy') : '-'}</p>
                      </div>
                    </div>
                  )}

                  {doType === 'replacement' && selectedUPOIdReplacement && (() => {
                    const upo = underlyingPos.find(u => u.id === selectedUPOIdReplacement);
                    const matchingReqs = returnRequests.filter(r => 
                      (r.underlying_po_id === selectedUPOIdReplacement || r.underlyingPoId === selectedUPOIdReplacement) &&
                      r.status === 'Pending'
                    );
                    if (matchingReqs.length === 0) return null;
                    return (
                      <div className="p-4 bg-[#0C4196]/5 border border-[#0C4196]/20 rounded-xl space-y-3 animate-in fade-in duration-300">
                        <div className="flex justify-between items-center border-b border-[#0C4196]/10 pb-2">
                          <span className="text-xs font-bold text-[#0C4196] uppercase tracking-wide font-sans">Daftar Barang Retur / Damage ({upo?.poNumber})</span>
                          <span className="px-2.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-black rounded-full uppercase">Status: Pending Replacement</span>
                        </div>
                        <div className="space-y-2 font-sans text-xs">
                          {matchingReqs.map((ret, index) => {
                            const prodName = products.find(p => p.id === ret.productId)?.name || 'Produk';
                            return (
                              <div key={ret.id} className="flex justify-between items-start py-1 border-b border-dashed border-[#0C4196]/10 last:border-b-0">
                                <div>
                                  <span className="font-bold text-slate-800">{prodName}</span>
                                  {ret.notes && <p className="text-[10px] text-slate-500 italic">Catatan: {ret.notes}</p>}
                                </div>
                                <div className="text-right">
                                  <span className="font-bold text-red-600 block">{ret.qty} Unit</span>
                                  <span className="text-[9px] text-slate-400 font-mono uppercase">{ret.category || 'Retur'}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
 
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-600 uppercase">Ekspedisi / Kurir</Label>
                      <select name="expeditionId" required className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0C4196] outline-none">
                        <option value="">Pilih Ekspedisi...</option>
                        {expeditions?.map((e: any) => (
                          <option key={e.id} value={e.id}>{e.name} ({e.code})</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-600 uppercase">Gudang Asal</Label>
                        <select 
                          name="warehouseId" 
                          value={selectedWHId} 
                          onChange={(e) => setSelectedWHId(e.target.value)}
                          required 
                          className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0C4196] outline-none"
                        >
                          <option value="">Pilih Gudang...</option>
                          {warehouses.map(wh => (
                            <option key={wh.id} value={wh.id}>{wh.name}</option>
                          ))}
                        </select>
                    </div>
                  </div>
 
                  <div className="space-y-1.5 font-sans">
                    <Label className="text-xs font-bold text-slate-600 uppercase text-[#0C4196]">Pilih Alamat Pengiriman (Shipping Address)</Label>
                    {doType === 'replacement' ? (
                      <select 
                        name="shippingAddress" 
                        required 
                        value={selectedAddress} 
                        onChange={e => setSelectedAddress(e.target.value)}
                        className="flex h-10 w-full rounded-lg border border-[#0C4196] bg-white px-3 py-2 text-sm focus:border-[#0C4196] outline-none font-bold"
                      >
                        <option value="">Pilih Alamat Pengiriman...</option>
                        {selectableShippingAreas.map(addr => (
                          <option key={addr} value={addr}>
                            {addr}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select 
                        name="shippingAddress" 
                        required 
                        value={selectedAddress} 
                        onChange={e => setSelectedAddress(e.target.value)}
                        className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0C4196] outline-none"
                      >
                        <option value="">Pilih Alamat...</option>
                        {uniqueAddresses.map(addr => {
                          const stats = addressStatus[addr];
                          const isFulfilled = stats?.isFulfilled;
                          return (
                            <option key={addr} value={addr} disabled={isFulfilled} className={isFulfilled ? 'text-slate-300' : ''}>
                              {addr} {isFulfilled ? '(FULFILLED)' : `(${stats?.totalShipped}/${stats?.totalOrdered})`}
                            </option>
                          );
                        })}
                      </select>
                    )}
                    {doType === 'normal' && selectedAddress && addressStatus[selectedAddress] && (
                       <p className="text-[10px] font-bold text-[#0C4196] mt-1 uppercase italic">
                         Progress pengiriman ke alamat ini: {addressStatus[selectedAddress].totalShipped} dari {addressStatus[selectedAddress].totalOrdered} unit.
                       </p>
                    )}
                  </div>
 
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-600 uppercase">Catatan</Label>
                    <Input name="notes" placeholder="Instruksi pengiriman..." className="h-10 rounded-lg focus:border-[#0C4196] focus:ring-1 focus:ring-[#0C4196]" />
                  </div>

                  <div className="border border-slate-100 rounded-xl mt-6 flex-1 bg-slate-50/10 overflow-hidden shadow-inner min-h-[200px]">
                    <div className="overflow-x-auto">
                      <Table className="min-w-[500px]">
                        <TableHeader className="bg-slate-50/50 border-b border-slate-100">
                          <TableRow className="h-10">
                            <TableHead className="font-bold text-slate-600 text-[10px] uppercase pl-4">SKU</TableHead>
                            <TableHead className="font-bold text-slate-600 text-[10px] uppercase">Produk</TableHead>
                            <TableHead className="text-right font-bold text-slate-600 text-[10px] uppercase">Jumlah Diambil</TableHead>
                            <TableHead className="pr-4"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center py-20 text-slate-400 bg-white">
                                <ScanBarcode className="w-12 h-12 mx-auto text-slate-100 mb-2" />
                                <p className="text-sm font-bold text-slate-500">Belum ada item yang diambil.</p>
                              </TableCell>
                            </TableRow>
                          ) : (
                            items.map((item, idx) => (
                              <TableRow key={idx} className="bg-white hover:bg-slate-50/50 h-14">
                                <TableCell className="font-mono text-xs font-bold text-[#0C4196] pl-4">{item.product.sku}</TableCell>
                                <TableCell className="font-bold text-slate-900 text-sm">{item.product.name}</TableCell>
                                <TableCell className="text-right text-lg font-bold text-[#0C4196]">{item.qty}</TableCell>
                                <TableCell className="text-right pr-4">
                                   <Button type="button" variant="ghost" size="sm" onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 px-3 rounded-lg font-bold text-xs uppercase">Hapus</Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  <div className="flex justify-end pt-6 border-t mt-auto">
                    <Button type="submit" size="lg" disabled={items.length === 0} className="w-full sm:w-auto bg-[#0C4196] hover:bg-[#0C4196]/90 text-white shadow-sm rounded-lg px-10 font-bold h-12">
                      <Send className="w-5 h-5 mr-2" />
                      Proses Pengiriman
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="history">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-slate-50/50 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider whitespace-nowrap">Riwayat Pengiriman</h3>
                <Input 
                  placeholder="Cari No. DO atau PO..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 w-full md:w-64 bg-white border-slate-200 focus:border-[#0C4196] focus:ring-[#0C4196] text-xs"
                />
              </div>
              <select
                className="flex h-9 w-full md:w-44 rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm focus:border-[#0C4196] outline-none"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              >
                {availableMonths.map(month => (
                  <option key={month} value={month}>{format(new Date(month + '-01'), 'MMMM yyyy')}</option>
                ))}
              </select>
            </div>
            <div className="overflow-x-auto">
              <Table className="min-w-[1000px]">
                <TableHeader className="bg-slate-50 border-b border-slate-200">
                  <TableRow className="h-12 hover:bg-transparent">
                    <TableHead className="font-bold text-slate-600 text-xs pl-6">Tanggal</TableHead>
                    <TableHead className="font-bold text-slate-600 text-xs">Nomor DO</TableHead>
                    <TableHead className="font-bold text-slate-600 text-xs">Jenis DO</TableHead>
                    <TableHead className="font-bold text-slate-600 text-xs">Nomor PO</TableHead>
                    <TableHead className="font-bold text-slate-600 text-xs">Ekspedisi</TableHead>
                    <TableHead className="font-bold text-slate-600 text-xs">Gudang</TableHead>
                    <TableHead className="font-bold text-slate-600 text-xs">Pelanggan</TableHead>
                    <TableHead className="text-right font-bold text-slate-600 text-xs text-center pr-6">Total Item</TableHead>
                    <TableHead className="text-right font-bold text-slate-600 text-xs text-center pr-6">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDeliveries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-20 text-slate-400">
                        Tidak ada riwayat pengiriman ditemukan.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredDeliveries.map(deli => {
                      const poNum = underlyingPos.find(u => u.id === deli.underlyingPoId)?.poNumber || '-';
                      return (
                      <TableRow key={deli.id} className="h-16 group hover:bg-slate-50/50">
                        <TableCell className="text-xs text-slate-500 pl-6">
                          {deli.createdAt ? (() => {
                            try {
                              const d = new Date(deli.createdAt);
                              return isNaN(d.getTime()) ? '-' : format(d, 'dd/MM/yyyy HH:mm');
                            } catch (e) {
                              return '-';
                            }
                          })() : '-'}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-[#0C4196] uppercase font-bold">
                          {deli.doNumber}
                        </TableCell>
                        <TableCell>
                          {deli.type === 'replacement' ? (
                            <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-black uppercase bg-amber-50 text-amber-700 border border-amber-200">
                              Replacement DO
                            </span>
                          ) : (
                            <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-black uppercase bg-[#0C4196]/10 text-[#0C4196] border border-[#0C4196]/20">
                              Normal DO
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-bold text-slate-700 uppercase">{poNum}</TableCell>
                        <TableCell className="text-sm font-bold text-slate-900">
                          {expeditions.find(e => e.id === deli.expeditionId)?.name || '-'}
                        </TableCell>
                        <TableCell className="text-sm text-slate-700 font-medium">
                          {warehouses.find(w => w.id === deli.warehouseId)?.name || 'Tidak Diketahui'}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600 font-medium">
                          {customers.find(c => c.id === deli.customerId)?.name || 'Pelanggan Umum'}
                        </TableCell>
                        <TableCell className="text-center font-bold text-slate-900 border-x border-slate-50">
                          {deli.items?.reduce((sum: number, i: any) => sum + i.qty, 0) || 0}
                        </TableCell>
                        <TableCell className="text-right pr-6">
                           <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => { setViewOutbound(deli); setIsViewOpen(true); }} title="View Details" className="h-8 w-8 text-slate-400 hover:text-[#0C4196] hover:bg-white">
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => { setDamageTarget(deli); setIsDamageDialogOpen(true); }} title="Report Damage Post-Outbound" className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-white">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                           </div>
                        </TableCell>
                      </TableRow>
                    )})
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Damage Report Dialog */}
      <Dialog open={isDamageDialogOpen} onOpenChange={setIsDamageDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-red-600 flex items-center gap-2">
              <Trash2 className="w-5 h-5" /> Report Damaged Item (Post-Outbound)
            </DialogTitle>
          </DialogHeader>
          {damageTarget && (
            <form onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const productId = fd.get('productId') as string;
              const damagedQty = Number(fd.get('damagedQty'));
              const category = fd.get('category') as string;
              const desc = fd.get('description') as string;
              
              if (!productId || damagedQty <= 0) return;

              // Validation: Already reported damage for this DO + this damage report should not exceed shipped qty
              const shippedItem = damageTarget.items?.find((it: any) => (it.product?.id || it.productId) === productId);
              const shippedQty = shippedItem?.qty || 0;
              
              const prevDamaged = ledgers.filter(l => 
                l.referenceId === damageTarget.id && 
                l.productId === productId && 
                l.transactionType === 'OUTBOUND_DAMAGE'
              ).reduce((sum, l) => sum + (l.qtyChange || 0), 0);

              if (damagedQty + prevDamaged > shippedQty) {
                toast.error(`Gagal: Total rusak (${damagedQty + prevDamaged}) melebihi jumlah yang dikirim (${shippedQty}).`);
                return;
              }

              try {
                const now = Date.now();
                await runTransaction(db, async (transaction) => {
                  const ledgerRef = doc(collection(db, 'inventory_ledgers'));
                  const returnNo = (category === 'Returned' ? 'RET-' : 'DAM-') + now;
                  
                  transaction.set(ledgerRef, {
                    transactionNumber: returnNo,
                    transactionType: 'OUTBOUND_DAMAGE',
                    productId,
                    ownerId: damageTarget.ownerId,
                    warehouseId: damageTarget.warehouseId,
                    qtyChange: damagedQty,
                    referenceType: 'DELIVERY_ORDER',
                    referenceId: damageTarget.id,
                    notes: `Category: ${category}. ${desc}`,
                    createdBy: appUser?.uid,
                    createdAt: now
                  });

                  // Write return_requests document (Return/damage record)
                  const returnRequestRef = doc(collection(db, 'return_requests'));
                  const matchedSpo = supplyPos.find(s => s.id === damageTarget.supplyPoId);
                  const spoNo = matchedSpo ? matchedSpo.supplyPoNumber : '';

                  transaction.set(returnRequestRef, {
                    returnNumber: returnNo,
                    underlying_po_id: damageTarget.underlyingPoId || '',
                    underlyingPoId: damageTarget.underlyingPoId || '',
                    supplyPoId: damageTarget.supplyPoId || '',
                    supplyPoNumber: spoNo || '',
                    do_id: damageTarget.id || '',
                    doNumber: damageTarget.doNumber || '',
                    productId,
                    qty: damagedQty,
                    category: category || 'Damaged',
                    notes: desc,
                    shippingAddress: damageTarget.shippingAddress || '',
                    shipping_area_id: damageTarget.shippingAddress || '',
                    status: 'Pending',
                    warehouseId: damageTarget.warehouseId,
                    ownerId: damageTarget.ownerId,
                    createdAt: now,
                    createdBy: appUser?.uid
                  });

                  // Update inventory (Status stock menjadi damaged)
                  const invId = `${damageTarget.ownerId}_${damageTarget.warehouseId}_${productId}`;
                  const invRef = doc(db, 'inventory', invId);
                  const invSnap = await transaction.get(invRef);
                  
                  let currentOnHand = invSnap.exists() ? (Number(invSnap.data().onHandQty) || 0) : 0;
                  let currentDamaged = invSnap.exists() ? (Number(invSnap.data().damagedQty) || 0) : 0;
                  let currentAvailable = invSnap.exists() ? (Number(invSnap.data().availableQty) || 0) : 0;
                  let currentReserved = invSnap.exists() ? (Number(invSnap.data().reservedQty) || 0) : 0;

                  const newOnHand = currentOnHand + damagedQty;
                  const newDamaged = currentDamaged + damagedQty;
                  const newAvailable = newOnHand - currentReserved - newDamaged; // availableQty stays unchanged

                  transaction.set(invRef, {
                    onHandQty: newOnHand,
                    damagedQty: newDamaged,
                    availableQty: newAvailable,
                    updatedAt: now
                  }, { merge: true });

                  const auditRef = doc(collection(db, 'audit_logs'));
                  transaction.set(auditRef, {
                      user: appUser?.name || 'Unknown',
                      action: 'Outbound Damage Reported',
                      module: 'Outbound',
                      recordId: damageTarget.id,
                      timestamp: now
                  });
                });

                toast.success('Laporan kerusakan berhasil disimpan. Stok Damaged & On Hand ditambah.');
                setIsDamageDialogOpen(false);
                setDamageTarget(null);
                setDamageForm({ productId: '', qty: 0 });
              } catch (err: any) {
                toast.error('Gagal lapor kerusakan: ' + err.message);
              }
            }} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                   <Label className="text-xs font-bold uppercase text-slate-500">Pilih Produk</Label>
                   <select 
                     name="productId" 
                     required 
                     value={damageForm.productId}
                     onChange={(e) => setDamageForm({ ...damageForm, productId: e.target.value })}
                     className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0C4196] outline-none"
                   >
                      <option value="">Pilih produk...</option>
                      {damageTarget.items?.map((it: any) => (
                        <option key={it.product?.id || it.productId} value={it.product?.id || it.productId}>
                          {it.product?.name || 'Unknown'}
                        </option>
                      ))}
                   </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase text-slate-500">Jumlah Rusak / Retur</Label>
                  <Input name="damagedQty" type="number" min="1" required className="h-10 rounded-lg" />
                </div>
              </div>

              {damageForm.productId && (() => {
                  const item = damageTarget.items?.find((it: any) => (it.product?.id || it.productId) === damageForm.productId);
                  const shipped = item?.qty || 0;
                  const prevDamaged = ledgers.filter(l => 
                    l.referenceId === damageTarget.id && 
                    l.productId === damageForm.productId && 
                    l.transactionType === 'OUTBOUND_DAMAGE'
                  ).reduce((sum, l) => sum + (l.qtyChange || 0), 0);
                  const availableToReport = shipped - prevDamaged;

                  return (
                    <div className="p-3 bg-red-50 border border-red-100 rounded-lg animate-in fade-in slide-in-from-top-2">
                       <p className="text-xs font-bold text-red-700 uppercase tracking-wider mb-1">Fulfillment Info:</p>
                       <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="bg-white p-2 rounded border border-red-200">
                             <span className="block text-[8px] text-slate-400 uppercase font-black">Shipped</span>
                             <span className="text-sm font-black text-slate-900">{shipped}</span>
                          </div>
                          <div className="bg-white p-2 rounded border border-red-200">
                             <span className="block text-[8px] text-slate-400 uppercase font-black">Reported</span>
                             <span className="text-sm font-black text-red-600">{prevDamaged}</span>
                          </div>
                          <div className="bg-white p-2 rounded border border-red-200">
                             <span className="block text-[8px] text-slate-400 uppercase font-black">Remaining</span>
                             <span className="text-sm font-black text-[#0C4196]">{availableToReport}</span>
                          </div>
                       </div>
                       {availableToReport <= 0 && <p className="text-[10px] text-red-600 font-bold mt-2 text-center italic">! Seluruh item ini sudah dilaporkan rusak/retur.</p>}
                    </div>
                  )
              })()}

              <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase text-slate-500">Kategori Kerusakan</Label>
                  <select name="category" required className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0C4196] outline-none">
                      <option value="Packaging">Kemasan Rusak</option>
                      <option value="Function">Fungsi Bermasalah</option>
                      <option value="Cosmetic">Cacat Fisik / Kosmetik</option>
                      <option value="Expired/Spoiled">Kadaluarsa / Busuk</option>
                      <option value="Broken">Pecah / Hancur</option>
                      <option value="Returned">Retur (Batal Terima)</option>
                  </select>
              </div>
              <div className="space-y-1.5">
                 <Label className="text-xs font-bold uppercase text-slate-500">Deskripsi Detail</Label>
                 <textarea name="description" className="flex min-h-[80px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0C4196] outline-none" placeholder="Jelaskan kondisi kerusakan..."></textarea>
              </div>
              <div className="pt-4 border-t flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setIsDamageDialogOpen(false)}>Batal</Button>
                <Button type="submit" className="bg-red-600 hover:bg-red-700 text-white font-bold px-8">Simpan Laporan</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="sm:max-w-5xl rounded-2xl p-0 overflow-hidden border-none shadow-2xl">
          <DialogHeader className="p-4 sm:p-6 bg-[#0C4196] text-white">
            <DialogTitle className="text-xl font-bold flex items-center gap-3">
              <ArrowUpFromLine className="w-6 h-6" /> Detail Barang Keluar
            </DialogTitle>
          </DialogHeader>
          {viewOutbound && (
            <div className="p-4 sm:p-8 space-y-6 sm:space-y-8 max-h-[80vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 text-sm">
                <div className="space-y-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No. Outbound / DO</span>
                    <span className="font-mono text-[#0C4196] font-bold text-base">{viewOutbound.doNumber}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pelanggan</span>
                    <span className="font-bold text-slate-900">{customers.find(c => c.id === viewOutbound.customerId)?.name || 'Pelanggan Umum'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gudang Asal</span>
                    <span className="font-bold text-slate-900">{warehouses.find(w => w.id === viewOutbound.warehouseId)?.name || 'Gudang Umum'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ekspedisi / Kurir</span>
                    <span className="font-bold text-slate-900">{expeditions.find(e => e.id === viewOutbound.expeditionId)?.name || '-'}</span>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tanggal</span>
                    <span className="font-bold text-slate-900">
                      {viewOutbound.createdAt ? (() => {
                        try {
                          const d = new Date(viewOutbound.createdAt);
                          return isNaN(d.getTime()) ? '-' : format(d, 'dd MMMM yyyy HH:mm');
                        } catch (e) {
                          return '-';
                        }
                      })() : '-'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Underlying PO</span>
                    <span className="font-bold text-slate-900">
                      {underlyingPos.find(u => u.id === viewOutbound.underlyingPoId)?.poNumber || '-'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vendor PO (Allocation)</span>
                    <span className="font-bold text-slate-900">
                      {viewOutbound.type === 'replacement' ? (
                        <span className="text-amber-600 font-extrabold uppercase">
                          Bypassed (Replacement DO)
                        </span>
                      ) : (
                        supplyPos.find(s => s.id === viewOutbound.supplyPoId)?.supplyPoNumber || '-'
                      )}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Alamat Pengiriman</span>
                    <span className="font-medium text-slate-700 text-xs">{viewOutbound.shippingAddress || '-'}</span>
                  </div>
                </div>
              </div>

              <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="text-[10px] font-bold text-slate-500 uppercase py-3 pl-4">Produk</TableHead>
                      <TableHead className="text-[10px] font-bold text-slate-500 uppercase py-3 text-right pr-4">Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewOutbound.items?.map((item: any, idx: number) => (
                      <TableRow key={idx} className="hover:bg-slate-50/50">
                        <TableCell className="py-4 pl-4">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-900">{item.product?.name}</span>
                            <span className="text-[10px] font-mono text-slate-400 uppercase leading-none mt-1">{item.product?.sku}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right py-4 pr-4 font-bold text-lg text-[#0C4196]">{item.qty} <span className="text-[10px] text-slate-400 font-medium">Unit</span></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {viewOutbound.notes && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Catatan</span>
                  <p className="text-sm text-slate-600">{viewOutbound.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

