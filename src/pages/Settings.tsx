import React, { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/firebase";
import { collection, getDocs, writeBatch } from "firebase/firestore";
import { toast } from "sonner";
import { AlertTriangle, Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function Settings() {
  const [isClearing, setIsClearing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const handleClearDatabase = async () => {
    if (confirmText !== "CLEAR DATA") {
      toast.error("Teks konfirmasi tidak sesuai.");
      return;
    }

    setShowConfirm(false);
    setIsClearing(true);
    toast.info("Sedang mengosongkan database, mohon tunggu...", { duration: 5000 });

    const collections = [
      "products",
      "categories",
      "warehouses",
      "warehouse_locations",
      "inventory",
      "inventory_transactions",
      "inventory_ledgers",
      "inbounds",
      "delivery_orders",
      "stock_opnames",
      "suppliers",
      "customers",
      "warehouse_transfers",
      "owners",
      "project_executors",
      "underlying_pos",
      "supply_pos",
      "sales_orders",
      "return_requests",
      "damage_reports",
      "audit_logs",
    ];

    try {
      // Because Firestore has no "Drop Table", we must query all documents and batch delete them.
      for (const collName of collections) {
        const snap = await getDocs(collection(db, collName)).catch((e) => {
          throw new Error(`Failed to list ${collName}: ${e.message}`);
        });
        if (snap.empty) continue;

        let batch = writeBatch(db);
        let opCount = 0;

        for (const docSnap of snap.docs) {
          batch.delete(docSnap.ref);
          opCount++;

          if (opCount === 450) {
            await batch.commit().catch((e) => {
              throw new Error(
                `Failed to delete batch in ${collName}: ${e.message}`,
              );
            });
            batch = writeBatch(db);
            opCount = 0;
          }
        }

        if (opCount > 0) {
          await batch.commit().catch((e) => {
            throw new Error(
              `Failed to delete batch in ${collName}: ${e.message}`,
            );
          });
        }
      }

      toast.success("Database has been completely cleared!");
    } catch (err: any) {
      console.error(err);
      toast.error("Error: " + err.message);
    } finally {
      setIsClearing(false);
      setConfirmText("");
    }
  };

  const handleReset = async () => {
    toast.info("Database berhasil dikosongkan");
  }

  return (
    <div className="max-w-4xl space-y-6 mx-auto">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Pengaturan</h2>
          <p className="text-slate-500 text-sm mt-1">Kelola konfigurasi sistem dan database</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-red-100 shadow-sm overflow-hidden border-t-4 border-t-red-500">
        <div className="p-6 border-b bg-red-50/30">
          <h3 className="text-sm font-bold text-red-900 uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Area Berbahaya
          </h3>
          <p className="text-xs text-red-600 mt-1">Tindakan penghapusan yang tidak dapat dibatalkan.</p>
        </div>
        <div className="p-6">
          <div className="flex flex-col sm:flex-row items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-xl">
            <div>
              <h4 className="font-bold text-slate-900">Bersihkan Database</h4>
              <p className="text-sm text-slate-500 mt-1">
                Hapus semua data (Produk, Inventaris, Transaksi, Pengguna, dll).
              </p>
            </div>
            <Button
              variant="destructive"
              className="mt-4 sm:mt-0 flex items-center gap-2 font-bold rounded-lg px-6"
              onClick={() => setShowConfirm(true)}
              disabled={isClearing}
            >
              <Trash2 className="w-4 h-4" />
              {isClearing ? "Menghapus..." : "Hapus Semua Data"}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2 font-bold">
              <AlertTriangle className="w-5 h-5" />
              Pembersihan Database
            </DialogTitle>
            <DialogDescription className="text-slate-700 font-bold">
              Tindakan ini tidak dapat dibatalkan secara permanen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-slate-500">
              Harap ketik{" "}
              <strong className="text-red-600 select-all font-mono px-2 py-0.5 bg-red-50 rounded">CLEAR DATA</strong>{" "}
              di bawah ini untuk mengonfirmasi niat Anda.
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="CLEAR DATA"
              className="font-mono h-12 text-center rounded-lg focus:border-red-500 focus:ring-1 focus:ring-red-500 uppercase"
            />
          </div>
          <DialogFooter className="sm:justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              className="font-bold text-slate-500"
              onClick={() => {
                setShowConfirm(false);
                setConfirmText("");
              }}
            >
              <X className="w-4 h-4 mr-2" />
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="font-bold px-8 rounded-lg"
              disabled={confirmText !== "CLEAR DATA"}
              onClick={handleClearDatabase}
            >
              Ya, Hapus Semua
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
