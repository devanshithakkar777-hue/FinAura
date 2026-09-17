import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from '../lib/firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const ref  = doc(db, 'users', firebaseUser.uid);
          const snap = await getDoc(ref);
          setProfile(snap?.exists() ? snap.data() : null);
        } catch {
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  /** Refresh profile from Firestore (call after onboarding completes) */
  const refreshProfile = async () => {
    if (!auth.currentUser) return;
    try {
      const ref  = doc(db, 'users', auth.currentUser.uid);
      const snap = await getDoc(ref);
      setProfile(snap?.exists() ? snap.data() : null);
    } catch {
      // Ignore offline errors
    }
  };

  /**
   * Upsert user document. Safe to call on every login —
   * only writes fields that are missing so existing data is preserved.
   */
  const upsertUserDoc = async (firebaseUser, extra = {}) => {
    const ref = doc(db, 'users', firebaseUser.uid);
    try {
      const snap = await getDoc(ref);
      if (!snap?.exists()) {
        await setDoc(ref, {
          uid:         firebaseUser.uid,
          email:       firebaseUser.email,
          name:        firebaseUser.displayName || extra.name || 'Investor',
          photoURL:    firebaseUser.photoURL || null,
          xp:          0,
          level:       1,
          riskProfile: null, // null signals onboarding is needed
          createdAt:   serverTimestamp(),
          ...extra,
        });
      }
    } catch {
      // Ignore if offline — doc will be created on next successful write
    }
  };

  const loginWithGoogle = async () => {
    const result = await signInWithPopup(auth, googleProvider);
    await upsertUserDoc(result.user);
    return result.user;
  };

  /**
   * Email login: authenticate then upsert doc so the profile
   * is guaranteed to exist even if it was somehow deleted.
   */
  const loginWithEmail = async (email, password) => {
    const result = await signInWithEmailAndPassword(auth, email, password);
    await upsertUserDoc(result.user);
    return result.user;
  };

  const registerWithEmail = async (email, password, name) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(result.user, { displayName: name });
    await upsertUserDoc(result.user, { name });
    return result.user;
  };

  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      loginWithGoogle,
      loginWithEmail,
      registerWithEmail,
      refreshProfile,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
