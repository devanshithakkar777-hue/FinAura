import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

/**
 * Throws a clear error if a required env variable is missing,
 * rather than silently falling back to a broken demo value.
 */
function requireEnv(key) {
  const val = import.meta.env[key];
  if (!val) {
    throw new Error(
      `Missing required environment variable: ${key}\n` +
      'Create a .env file in the project root with your Firebase config.'
    );
  }
  return val;
}

let firebaseConfig;
try {
  firebaseConfig = {
    apiKey:            requireEnv('VITE_FIREBASE_API_KEY'),
    authDomain:        requireEnv('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId:         requireEnv('VITE_FIREBASE_PROJECT_ID'),
    storageBucket:     requireEnv('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: requireEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId:             requireEnv('VITE_FIREBASE_APP_ID'),
  };
} catch (e) {
  // In development without a .env file, log clearly and use demo stubs
  // so the app still loads for UI development.
  if (import.meta.env.DEV) {
    console.warn('[FinAura] Firebase env vars missing — running in demo mode (auth disabled).\n', e.message);
    firebaseConfig = {
      apiKey:            'demo-api-key',
      authDomain:        'demo.firebaseapp.com',
      projectId:         'finaura-demo',
      storageBucket:     'finaura-demo.appspot.com',
      messagingSenderId: '000000000000',
      appId:             '1:000000000000:web:demo',
    };
  } else {
    // In production, hard-fail so misconfiguration is obvious.
    throw e;
  }
}

const app = initializeApp(firebaseConfig);

export const auth           = getAuth(app);
export const db             = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
