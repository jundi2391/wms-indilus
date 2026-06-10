import React, { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuthStore } from '@/store/authStore';

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setAppUser, setReady } = useAuthStore();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        // Fetch or create user document
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        
        const userData = {
          name: user.displayName || user.email?.split('@')[0] || 'User',
          email: user.email,
          role: 'Super Admin',
          status: 'Active',
        };

        if (userSnap.exists()) {
          try {
            await setDoc(userRef, { role: 'Super Admin' }, { merge: true });
            setAppUser({ uid: user.uid, ...userSnap.data(), role: 'Super Admin' } as any);
          } catch(e) {
            console.error('Failed to update user role', e);
            setAppUser({ uid: user.uid, ...userSnap.data() } as any);
          }
        } else {
          const newUser = {
            ...userData,
            createdAt: Date.now()
          };
          try {
            await setDoc(userRef, newUser);
            setAppUser({ uid: user.uid, ...newUser } as any);
          } catch(e) {
            console.error('Failed to create user doc', e);
            setAppUser({ uid: user.uid, ...newUser } as any);
          }
        }
      } else {
        setAppUser(null);
      }
      setReady(true);
    });

    return () => unsub();
  }, []);

  return <>{children}</>;
}
