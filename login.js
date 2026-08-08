import { db, auth, getSecondaryAuthApp } from "./firebase-init.js";
import {
  signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider,
  signOut, onAuthStateChanged, createUserWithEmailAndPassword,
  signOut as secondarySignOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc, setDoc, collection, addDoc, deleteDoc, updateDoc,
  onSnapshot, query, where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ---------- Shared DOM refs ---------- */
const loginView = document.getElementById("loginView");
const adminDashView = document.getElementById("adminDashView");
const clientDashView = document.getElementById("clientDashView");
const staffDashView = document.getElementById("staffDashView");
const headerBadge = document.getElementById("headerBadge");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const googleLoginBtn = document.getElementById("googleLoginBtn");
const loginSubmitBtn = document.getElementById("loginSubmitBtn");

let unsubClientStudents = null;
let unsubAdminStudents = null;
let unsubClients = null;
let unsubStaff = null;
let unsubStaffClients = null;
let unsubStaffStudents = null;

/* ---------- Username -> synthetic email helper (admin / staff only) ----------
   Firebase Auth accounts always need an email-shaped identifier, even for
   "username" logins. A plain, non-email username is deterministically turned
   into <username>@PORTAL_DOMAIN so it can be created/signed-in through the
   real Firebase Auth system — the actual password is never stored or checked
   in this file, only Firebase's own hashed credential store handles it. */
const PORTAL_DOMAIN = "portal.sarvinnexus.local";
function toAuthEmail(identifier) {
  const trimmed = identifier.trim();
  if (trimmed.includes("@")) return trimmed.toLowerCase(); // real email (clients)
  return `${trimmed.toLowerCase().replace(/\s+/g, "")}@${PORTAL_DOMAIN}`; // username (admin/staff)
}

/* ---------- Role-aware auth gate ---------- */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    showView("login");
    return;
  }

  loginError.textContent = "";

  // 1. Is this an admin?
  const adminDoc = await getDoc(doc(db, "admins", user.uid));
  if (adminDoc.exists()) {
    document.getElementById("adminEmailLabel").textContent = user.email;
    headerBadge.textContent = "ADMIN";
    showView("admin");
    listenClients();
    return;
  }

  // 2. Is this staff?
  const staffDoc = await getDoc(doc(db, "staff", user.uid));
  if (staffDoc.exists()) {
    const staffData = staffDoc.data();
    document.getElementById("staffEmailLabel").textContent = staffData.username || user.email;
    headerBadge.textContent = "STAFF";
    showView("staff");
    listenStaffClients();
    listenStaffStudents();
    return;
  }

  // 3. Is this a client? (matched by email so both Google and email/password work)
  const q = query(collection(db, "clients"), where("email", "==", user.email));
  const clientSnap = await new Promise((resolve) => {
    const unsub = onSnapshot(q, (snap) => { unsub(); resolve(snap); });
  });

  if (!clientSnap.empty) {
    const clientDoc = clientSnap.docs[0];
    const client = clientDoc.data();
    document.getElementById("clientNameLabel").textContent = client.name || "Client";
    document.getElementById("clientEmailLabel").textContent = user.email;
    headerBadge.textContent = "CLIENT";
    showView("client");
    listenClientStudents(clientDoc.id);
    return;
  }

  // 4. Neither — no account provisioned for this email.
  loginError.textContent = "No account found for this email. Contact the admin to get access.";
  await signOut(auth);
  showView("login");
});

function showView(which) {
  loginView.style.display = which === "login" ? "flex" : "none";
  adminDashView.style.display = which === "admin" ? "block" : "none";
  clientDashView.style.display = which === "client" ? "block" : "none";
  staffDashView.style.display = which === "staff" ? "block" : "none";
  headerBadge.style.display = which === "login" ? "none" : "inline-flex";
  if (which !== "admin" && unsubClients) unsubClients();
  if (which !== "admin" && unsubAdminStudents) unsubAdminStudents();
  if (which !== "admin" && unsubStaff) unsubStaff();
  if (which !== "client" && unsubClientStudents) unsubClientStudents();
  if (which !== "staff" && unsubStaffClients) unsubStaffClients();
  if (which !== "staff" && unsubStaffStudents) unsubStaffStudents();
  if (which === "admin") listenStaff();
  if (which !== "login") {
    // trigger reveal animation on the view we just switched into
    const el = which === "admin" ? adminDashView : (which === "staff" ? staffDashView : clientDashView);
    el.classList.remove("in-view");
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("in-view")));
  }
}

/* ---------- Login actions ---------- */
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const identifier = document.getElementById("loginEmail").value.trim();
  const email = toAuthEmail(identifier);
  const password = document.getElementById("loginPassword").value;
  loginSubmitBtn.disabled = true;
  loginSubmitBtn.textContent = "Signing in...";
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    loginError.textContent = "Invalid username/email or password.";
  } finally {
    loginSubmitBtn.disabled = false;
    loginSubmitBtn.textContent = "Sign In";
  }
});

googleLoginBtn.addEventListener("click", async () => {
  loginError.textContent = "";
  googleLoginBtn.disabled = true;
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
    // onAuthStateChanged (above) takes it from here — it matches the signed-in
    // Google account's email against admins/staff/clients and shows the right
    // dashboard, or signs the user back out if no account is provisioned.
  } catch (err) {
    console.error("Google sign-in error:", err.code, err.message);
    const host = window.location.hostname;
    switch (err.code) {
      case "auth/operation-not-allowed":
        loginError.textContent = "Google sign-in isn't enabled for this project yet. In Firebase Console, go to Authentication → Sign-in method → Google, and enable it.";
        break;
      case "auth/unauthorized-domain":
        loginError.textContent = `This domain ("${host}") isn't authorized for Google sign-in. In Firebase Console, go to Authentication → Settings → Authorized domains, click "Add domain", and add "${host}" exactly.`;
        break;
      case "auth/popup-blocked":
        loginError.textContent = "Your browser blocked the Google sign-in popup. Allow popups for this site and try again.";
        break;
      case "auth/popup-closed-by-user":
      case "auth/cancelled-popup-request":
        // User closed the popup themselves — no need for an error message.
        break;
      case "auth/account-exists-with-different-credential":
        loginError.textContent = "An account already exists with this email using a different sign-in method (e.g. the admin set you up with a password). Sign in with that instead.";
        break;
      case "auth/network-request-failed":
        loginError.textContent = "Network error while contacting Google/Firebase. Check your internet connection and try again.";
        break;
      case "auth/internal-error":
      case "auth/invalid-api-key":
      case "auth/api-key-not-valid":
        loginError.textContent = "Firebase couldn't be reached with this project's configuration. Double-check the values in firebase-config.json against Firebase Console → Project Settings → General → Your apps.";
        break;
      default:
        loginError.textContent = `Google sign-in failed (${err.code || "unknown error"}). Please try again, or check the browser console for details.`;
    }
  } finally {
    googleLoginBtn.disabled = false;
  }
});

document.getElementById("adminLogoutBtn").addEventListener("click", async (e) => {
  e.preventDefault();
  await signOut(auth);
});
document.getElementById("clientLogoutBtn").addEventListener("click", async (e) => {
  e.preventDefault();
  await signOut(auth);
});
document.getElementById("staffLogoutBtn").addEventListener("click", async (e) => {
  e.preventDefault();
  await signOut(auth);
});

/* =========================================================
   ADMIN: clients + students management
   ========================================================= */
const createClientForm = document.getElementById("createClientForm");
const createClientError = document.getElementById("createClientError");
const clientList = document.getElementById("clientList");
const clientCount = document.getElementById("clientCount");
const createStudentForm = document.getElementById("createStudentForm");
const studentList = document.getElementById("studentList");
const studentCount = document.getElementById("studentCount");
const studentPanelHint = document.getElementById("studentPanelHint");
const studentFormSubmit = document.getElementById("studentFormSubmit");
const studentFormError = document.getElementById("studentFormError");
const cancelStudentEdit = document.getElementById("cancelStudentEdit");

let selectedClientId = null;
let selectedClientName = "";
let editingStudentId = null;

function listenClients() {
  if (unsubClients) unsubClients();
  const q = query(collection(db, "clients"), orderBy("createdAt", "desc"));
  unsubClients = onSnapshot(q, (snap) => {
    clientList.innerHTML = "";
    clientCount.textContent = snap.size;
    if (snap.empty) {
      clientList.innerHTML = `<div class="empty-state">No clients yet. Create one above.</div>`;
      return;
    }
    snap.forEach((docSnap) => {
      const c = docSnap.data();
      const row = document.createElement("div");
      row.className = "list-item" + (docSnap.id === selectedClientId ? " selected" : "");
      row.innerHTML = `
        <div class="li-main">
          <strong>${escapeHtml(c.name)}</strong>
          <span>${escapeHtml(c.email)}</span>
        </div>
        <div class="li-actions">
          <button class="icon-btn delete-btn" title="Delete client">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
          </button>
        </div>`;
      row.querySelector(".li-main").addEventListener("click", () => selectClient(docSnap.id, c.name));
      row.querySelector(".delete-btn").addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete client "${c.name}"? Their students will remain but be unassigned.`)) return;
        await deleteDoc(doc(db, "clients", docSnap.id));
        if (selectedClientId === docSnap.id) {
          selectedClientId = null;
          resetStudentPanel();
        }
      });
      clientList.appendChild(row);
    });
  });
}

createClientForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  createClientError.textContent = "";
  const name = document.getElementById("newClientName").value.trim();
  const email = document.getElementById("newClientEmail").value.trim();
  const password = document.getElementById("newClientPassword").value;

  const submitBtn = createClientForm.querySelector("button");
  submitBtn.disabled = true;
  submitBtn.textContent = "Creating...";

  try {
    const secondaryAuth = getSecondaryAuthApp();
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const newUid = cred.user.uid;
    await secondarySignOut(secondaryAuth);

    await setDoc(doc(db, "clients", newUid), {
      name, email,
      createdAt: serverTimestamp()
    });

    createClientForm.reset();
  } catch (err) {
    console.error(err);
    createClientError.textContent = err.code === "auth/email-already-in-use"
      ? "A client with this email already exists."
      : "Could not create client. Check the details and try again.";
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Create Client";
  }
});

function selectClient(clientId, clientName) {
  selectedClientId = clientId;
  selectedClientName = clientName;
  listenClients();
  studentPanelHint.textContent = `Managing students for ${clientName}.`;
  createStudentForm.style.display = "grid";
  resetStudentForm();
  listenAdminStudents();
}

function resetStudentPanel() {
  studentPanelHint.textContent = "Select a client on the left to view and manage their students.";
  createStudentForm.style.display = "none";
  studentList.innerHTML = "";
  studentCount.textContent = "0";
  if (unsubAdminStudents) unsubAdminStudents();
}

function resetStudentForm() {
  editingStudentId = null;
  createStudentForm.reset();
  studentFormSubmit.textContent = "Add Student";
  studentFormError.textContent = "";
  cancelStudentEdit.style.display = "none";
}

cancelStudentEdit.addEventListener("click", resetStudentForm);

function listenAdminStudents() {
  if (unsubAdminStudents) unsubAdminStudents();
  const q = query(collection(db, "students"), where("clientId", "==", selectedClientId), orderBy("createdAt", "desc"));
  unsubAdminStudents = onSnapshot(q, (snap) => {
    studentList.innerHTML = "";
    studentCount.textContent = snap.size;
    if (snap.empty) {
      studentList.innerHTML = `<div class="empty-state">No students added for ${escapeHtml(selectedClientName)} yet.</div>`;
      return;
    }
    snap.forEach((docSnap) => {
      const s = docSnap.data();
      const row = document.createElement("div");
      row.className = "list-item";
      row.innerHTML = `
        <div class="li-main">
          <strong>${escapeHtml(s.name)}</strong>
          <span>${escapeHtml(s.className || "—")} ${s.roll ? "• Roll " + escapeHtml(s.roll) : ""}</span>
        </div>
        <div class="li-actions">
          <button class="icon-btn edit-btn" title="Edit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
          </button>
          <button class="icon-btn delete-btn" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
          </button>
        </div>`;
      row.querySelector(".edit-btn").addEventListener("click", () => {
        editingStudentId = docSnap.id;
        document.getElementById("newStudentName").value = s.name || "";
        document.getElementById("newStudentClass").value = s.className || "";
        document.getElementById("newStudentRoll").value = s.roll || "";
        studentFormSubmit.textContent = "Save Changes";
        studentFormError.textContent = "";
        cancelStudentEdit.style.display = "inline-flex";
        document.getElementById("newStudentName").focus();
      });
      row.querySelector(".delete-btn").addEventListener("click", async () => {
        if (!confirm(`Remove ${s.name}?`)) return;
        try {
          await deleteDoc(doc(db, "students", docSnap.id));
        } catch (err) {
          console.error(err);
          alert("Could not remove this student. Please try again.");
        }
      });
      studentList.appendChild(row);
    });
  });
}

createStudentForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!selectedClientId) return;
  studentFormError.textContent = "";
  const name = document.getElementById("newStudentName").value.trim();
  const className = document.getElementById("newStudentClass").value.trim();
  const roll = document.getElementById("newStudentRoll").value.trim();
  if (!name) return;

  studentFormSubmit.disabled = true;
  const wasEditing = !!editingStudentId;
  studentFormSubmit.textContent = wasEditing ? "Saving..." : "Adding...";

  try {
    if (wasEditing) {
      await updateDoc(doc(db, "students", editingStudentId), { name, className, roll });
    } else {
      await addDoc(collection(db, "students"), {
        name, className, roll,
        clientId: selectedClientId,
        createdAt: serverTimestamp()
      });
    }
    resetStudentForm();
  } catch (err) {
    console.error(err);
    studentFormError.textContent = wasEditing
      ? "Could not save changes. Please try again."
      : "Could not add student. Please try again.";
    studentFormSubmit.textContent = wasEditing ? "Save Changes" : "Add Student";
  } finally {
    studentFormSubmit.disabled = false;
  }
});

/* =========================================================
   CLIENT: read-only student list
   ========================================================= */
function listenClientStudents(clientId) {
  if (unsubClientStudents) unsubClientStudents();
  const listEl = document.getElementById("clientStudentList");
  const countEl = document.getElementById("clientStudentCount");
  const q = query(collection(db, "students"), where("clientId", "==", clientId), orderBy("createdAt", "desc"));
  unsubClientStudents = onSnapshot(q, (snap) => {
    listEl.innerHTML = "";
    countEl.textContent = snap.size;
    if (snap.empty) {
      listEl.innerHTML = `<div class="empty-state">No students on file yet.</div>`;
      return;
    }
    snap.forEach((docSnap) => {
      const s = docSnap.data();
      const row = document.createElement("div");
      row.className = "list-item";
      row.style.cursor = "default";
      row.innerHTML = `
        <div class="li-main">
          <strong>${escapeHtml(s.name)}</strong>
          <span>${escapeHtml(s.className || "—")} ${s.roll ? "• Roll " + escapeHtml(s.roll) : ""}</span>
        </div>`;
      listEl.appendChild(row);
    });
  });
}

/* =========================================================
   ADMIN: staff management (add / edit / delete)
   Staff can view all clients + students, but cannot write anything —
   that is enforced by the Firestore security rules, not just the UI.
   ========================================================= */
const createStaffForm = document.getElementById("createStaffForm");
const createStaffError = document.getElementById("createStaffError");
const staffList = document.getElementById("staffList");
const staffCount = document.getElementById("staffCount");
const staffFormSubmit = document.getElementById("staffFormSubmit");
const cancelStaffEdit = document.getElementById("cancelStaffEdit");
let editingStaffId = null;

function listenStaff() {
  if (unsubStaff) unsubStaff();
  const q = query(collection(db, "staff"), orderBy("createdAt", "desc"));
  unsubStaff = onSnapshot(q, (snap) => {
    staffList.innerHTML = "";
    staffCount.textContent = snap.size;
    if (snap.empty) {
      staffList.innerHTML = `<div class="empty-state">No staff accounts yet. Add one above.</div>`;
      return;
    }
    snap.forEach((docSnap) => {
      const s = docSnap.data();
      const row = document.createElement("div");
      row.className = "list-item";
      row.style.cursor = "default";
      row.innerHTML = `
        <div class="li-main">
          <strong>${escapeHtml(s.displayName || s.username)}</strong>
          <span>@${escapeHtml(s.username)}</span>
        </div>
        <div class="li-actions">
          <button class="icon-btn edit-btn" title="Edit display name">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
          </button>
          <button class="icon-btn delete-btn" title="Remove staff access">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
          </button>
        </div>`;
      row.querySelector(".edit-btn").addEventListener("click", () => {
        editingStaffId = docSnap.id;
        document.getElementById("newStaffUsername").value = s.username || "";
        document.getElementById("newStaffUsername").disabled = true;
        document.getElementById("newStaffDisplayName").value = s.displayName || "";
        document.getElementById("newStaffPassword").placeholder = "(leave blank — see note below)";
        document.getElementById("newStaffPassword").required = false;
        staffFormSubmit.textContent = "Save Changes";
        createStaffError.textContent = "";
        cancelStaffEdit.style.display = "inline-flex";
      });
      row.querySelector(".delete-btn").addEventListener("click", async () => {
        if (!confirm(`Remove staff access for "${s.username}"? This revokes their portal access immediately. (Their sign-in credential itself must also be deleted from the Firebase Console if you want it fully gone.)`)) return;
        try {
          await deleteDoc(doc(db, "staff", docSnap.id));
        } catch (err) {
          console.error(err);
          alert("Could not remove this staff account. Please try again.");
        }
      });
      staffList.appendChild(row);
    });
  });
}

function resetStaffForm() {
  editingStaffId = null;
  createStaffForm.reset();
  document.getElementById("newStaffUsername").disabled = false;
  document.getElementById("newStaffPassword").placeholder = "Temporary password (min 6 chars)";
  document.getElementById("newStaffPassword").required = true;
  staffFormSubmit.textContent = "Add Staff";
  createStaffError.textContent = "";
  cancelStaffEdit.style.display = "none";
}

cancelStaffEdit.addEventListener("click", resetStaffForm);

createStaffForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  createStaffError.textContent = "";
  const username = document.getElementById("newStaffUsername").value.trim();
  const password = document.getElementById("newStaffPassword").value;
  const displayName = document.getElementById("newStaffDisplayName").value.trim();

  staffFormSubmit.disabled = true;

  // Editing: only the display name can be changed here. Changing another
  // user's password isn't possible from client-side code (by design — it
  // would require a trusted backend / Cloud Function with the Admin SDK).
  if (editingStaffId) {
    staffFormSubmit.textContent = "Saving...";
    try {
      await updateDoc(doc(db, "staff", editingStaffId), { displayName });
      resetStaffForm();
    } catch (err) {
      console.error(err);
      createStaffError.textContent = "Could not save changes.";
    } finally {
      staffFormSubmit.disabled = false;
    }
    return;
  }

  staffFormSubmit.textContent = "Creating...";
  try {
    const authEmail = toAuthEmail(username);
    const secondaryAuth = getSecondaryAuthApp();
    const cred = await createUserWithEmailAndPassword(secondaryAuth, authEmail, password);
    const newUid = cred.user.uid;
    await secondarySignOut(secondaryAuth);

    await setDoc(doc(db, "staff", newUid), {
      username: username.toLowerCase(),
      displayName,
      createdAt: serverTimestamp()
    });

    resetStaffForm();
  } catch (err) {
    console.error(err);
    createStaffError.textContent = err.code === "auth/email-already-in-use"
      ? "That username is already taken."
      : "Could not create staff account. Check the details and try again.";
  } finally {
    staffFormSubmit.disabled = false;
  }
});

/* =========================================================
   STAFF: read-only view of every client + every student
   ========================================================= */
function listenStaffClients() {
  if (unsubStaffClients) unsubStaffClients();
  const listEl = document.getElementById("staffClientList");
  const countEl = document.getElementById("staffClientCount");
  const q = query(collection(db, "clients"), orderBy("createdAt", "desc"));
  unsubStaffClients = onSnapshot(q, (snap) => {
    listEl.innerHTML = "";
    countEl.textContent = snap.size;
    if (snap.empty) {
      listEl.innerHTML = `<div class="empty-state">No registered clients yet.</div>`;
      return;
    }
    snap.forEach((docSnap) => {
      const c = docSnap.data();
      const row = document.createElement("div");
      row.className = "list-item";
      row.style.cursor = "default";
      row.innerHTML = `
        <div class="li-main">
          <strong>${escapeHtml(c.name)}</strong>
          <span>${escapeHtml(c.email)}</span>
        </div>`;
      listEl.appendChild(row);
    });
  });
}

function listenStaffStudents() {
  if (unsubStaffStudents) unsubStaffStudents();
  const listEl = document.getElementById("staffStudentList");
  const countEl = document.getElementById("staffStudentCount");
  const q = query(collection(db, "students"), orderBy("createdAt", "desc"));
  unsubStaffStudents = onSnapshot(q, (snap) => {
    listEl.innerHTML = "";
    countEl.textContent = snap.size;
    if (snap.empty) {
      listEl.innerHTML = `<div class="empty-state">No students on file yet.</div>`;
      return;
    }
    snap.forEach((docSnap) => {
      const s = docSnap.data();
      const row = document.createElement("div");
      row.className = "list-item";
      row.style.cursor = "default";
      row.innerHTML = `
        <div class="li-main">
          <strong>${escapeHtml(s.name)}</strong>
          <span>${escapeHtml(s.className || "—")} ${s.roll ? "• Roll " + escapeHtml(s.roll) : ""}</span>
        </div>`;
      listEl.appendChild(row);
    });
  });
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}
