import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

/* Credentials live in firebase-config.json (loaded at runtime).
   IMPORTANT: this must ONLY ever contain the public Firebase *web app*
   config (apiKey, authDomain, projectId, storageBucket, messagingSenderId,
   appId) — the same values you get from Firebase Console > Project Settings
   > General > Your apps > SDK setup and configuration.
   NEVER put a service-account JSON (the one with "private_key" in it) here.
   That file is a server-only secret and must never ship to a browser. */
async function loadFirebaseConfig() {
  const res = await fetch("./firebase-config.json");
  if (!res.ok) {
    throw new Error(`Could not load firebase-config.json (HTTP ${res.status})`);
  }
  const config = await res.json();
  if (!config.apiKey || !config.authDomain || !config.projectId) {
    throw new Error("firebase-config.json is missing required fields (apiKey/authDomain/projectId).");
  }
  return config;
}

/* If config loading fails for ANY reason — wrong path, a server that
   doesn't serve the file, or opening this page directly as a local file
   (file://) where fetch() of local files is blocked by the browser — every
   button on the login page (Google included) would previously just do
   nothing, with the only clue buried in the browser console. Surface it
   on the page instead so it's obvious what's wrong. */
function showFatalBanner(message) {
  const existing = document.getElementById("loginError");
  if (existing) {
    existing.textContent = message;
    return;
  }
  const banner = document.createElement("div");
  banner.textContent = message;
  banner.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:9999;background:#7f1d1d;" +
    "color:#fff;padding:12px 20px;font:14px/1.5 system-ui,sans-serif;text-align:center;";
  document.body.prepend(banner);
}

let firebaseConfig;
try {
  firebaseConfig = await loadFirebaseConfig();
} catch (err) {
  console.error("Firebase config failed to load:", err);
  showFatalBanner(
    "Couldn't connect to the sign-in system. If you're opening this file " +
    "directly from your computer (a file:// address), that's why — serve the " +
    "site through a local web server or your real hosting instead, then reload. " +
    `(${err.message})`
  );
  throw err;
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

/* A second, isolated Firebase app instance. Used only so the Admin can
   create a new Client account (createUserWithEmailAndPassword) without
   that action signing the Admin themselves out — Firebase Auth otherwise
   switches the *current* session to whichever user was just created. */
export function getSecondaryAuthApp() {
  const secondaryApp = initializeApp(firebaseConfig, "Secondary-" + Date.now());
  return getAuth(secondaryApp);
}
