# Setup guide — read this before deploying

## 1. Rotate your Firebase key (do this first, regardless of anything else)

The `firebase-config.json` you originally uploaded contained a **service account
private key**, not a web app config. That file has been shared in this
conversation, so treat it as compromised:

1. Go to [Google Cloud Console → IAM & Admin → Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts) for project `office-mangement-25565`.
2. Find `firebase-adminsdk-fbsvc@office-mangement-25565.iam.gserviceaccount.com`.
3. Delete the exposed key (`2afe846e1d703d805dc39e967b359768c5cd47db`) under its "Keys" tab.
4. Never place a service-account JSON in any file that ships to the browser (anything under your site's public folder). Service account keys belong only on a trusted server/backend, never in client-side code.

## 2. Add your real (safe) web app config

Open **Firebase Console → Project Settings → General → Your apps → SDK setup
and configuration**, copy the `firebaseConfig` object shown there, and paste
those values into `firebase-config.json` in place of the `REPLACE_WITH_...`
placeholders. This config (apiKey, authDomain, etc.) is meant to be public —
it identifies your project, it does not grant admin access.

## 3. Enable the sign-in methods you need

In **Firebase Console → Authentication → Sign-in method**, enable:
- **Email/Password**
- **Google**

## 4. Create your first Admin account

The login page now accepts a plain **username** (not just an email) for
Admin and Staff sign-in — e.g. typing `SarvinNexus` in the login field. Under
the hood, Firebase Auth still requires an email-shaped identifier, so
`login.js` deterministically converts any non-email input to
`<username-lowercased>@portal.sarvinnexus.local` before calling Firebase.
That converted address is never shown to the user and doesn't need to be a
real, working mailbox — it just gives Firebase a unique account ID. **Your
actual password is never written into any file in this project** — it is
only ever typed into the Firebase Console (which hashes and stores it) and
into the login form itself, which hands it straight to Firebase's own
`signInWithEmailAndPassword` call.

Client-side code can't safely create the *first* admin (there'd be nothing
to check permission against yet), so do this once, manually:

1. **Authentication → Users → Add user**.
   - Email: `sarvinnexus@portal.sarvinnexus.local` (i.e. your chosen admin
     username, lowercased, `@portal.sarvinnexus.local`).
   - Password: choose a strong password here directly in the Firebase
     Console — don't paste it into any project file.
2. Copy the new user's UID.
3. **Firestore Database → Start collection** → collection ID `admins` → document ID = that UID → add a field `email` (string) with `sarvinnexus@portal.sarvinnexus.local`.
4. Now go to `login.html` and sign in with username `SarvinNexus` (or
   whatever you chose) and the password you set in step 1.

From then on, use the Admin dashboard to create Client **and Staff**
accounts — it handles this correctly via a secondary Firebase app instance
so it doesn't create the "who can create admins" problem.

**Staff accounts** work the same way but are created entirely from the
Admin dashboard's new **Staff** panel — no manual Console step needed. Staff
can sign in and see every registered client and student (read-only); they
cannot add, edit, or delete anything. That restriction is enforced by the
Firestore rules below, not just hidden UI — so it holds even if someone
inspects or edits the page's JavaScript.

**Known limitation (shared with Client accounts too):** deleting a Client or
Staff row in the dashboard removes their Firestore profile and revokes their
in-app access immediately, but it does **not** delete the underlying
Firebase Auth account — client-side code cannot delete another user's Auth
account (that requires a backend with the Admin SDK, e.g. a Cloud Function).
If you want the Auth account fully gone too, delete it manually in
**Authentication → Users** in the Firebase Console.

## 5. Firestore security rules

Set these in **Firestore Database → Rules** so the app is actually secure
server-side (client-side checks alone can be bypassed):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAdmin() {
      return request.auth != null &&
        exists(/databases/$(database)/documents/admins/$(request.auth.uid));
    }

    function isStaff() {
      return request.auth != null &&
        exists(/databases/$(database)/documents/staff/$(request.auth.uid));
    }

    // Contact form: anyone can create a message, only admins can read/manage
    match /messages/{id} {
      allow create: if true;
      allow read, update, delete: if isAdmin();
    }

    // Only admins manage the admins list itself
    match /admins/{id} {
      allow read: if isAdmin();
      allow write: if false; // manage via Firebase Console only
    }

    // Staff: admins create/edit/delete staff profiles; a staff member can
    // read their own profile (so the login gate can identify them) but
    // cannot write anything, including their own record.
    match /staff/{id} {
      allow read: if isAdmin() || (request.auth != null && request.auth.uid == id);
      allow write: if isAdmin();
    }

    // Clients: admins manage; staff get read-only access to everyone;
    // a client can read their own record
    match /clients/{id} {
      allow read: if isAdmin() || isStaff() ||
        (request.auth != null && request.auth.token.email == resource.data.email);
      allow write: if isAdmin();
    }

    // Students: admins manage; staff get read-only access to everyone;
    // a client can read only their own students
    match /students/{id} {
      allow read: if isAdmin() || isStaff() ||
        (request.auth != null &&
          get(/databases/$(database)/documents/clients/$(resource.data.clientId)).data.email == request.auth.token.email);
      allow write: if isAdmin();
    }
  }
}
```

## 6. Data model

| Collection | Doc ID          | Fields |
|---|---|---|
| `admins`   | Firebase Auth UID | `email` |
| `staff`    | Firebase Auth UID (of the staff account the admin created) | `username`, `displayName`, `createdAt` |
| `clients`  | Firebase Auth UID (of the client account the admin created) | `name`, `email`, `createdAt` |
| `students` | auto-ID | `name`, `className`, `roll`, `clientId` (→ clients doc ID), `createdAt` |
| `messages` | auto-ID | `name`, `email`, `message`, `createdAt` (from the public contact form) |

## 7. What was added in this pass

- `admin.html` / `admin.js` — admin login, create/delete clients, add/edit/delete students per client.
- `client.html` / `client.js` — client login via Google or email/password (set by admin), read-only view of their own students.
- `common.js` — added the circular custom cursor (desktop only, respects `prefers-reduced-motion`).
- `contact.js` — successful submissions now open a small "Congratulations" popup window in addition to the inline success message.
- `style.css` — new styles for the cursor, login cards, and dashboards, built on your existing purple/blue theme.
- Discreet "Client Portal" link added to every page footer. The Admin page is intentionally **not** linked from the public nav — reach it directly at `/admin.html`. That's a mild deterrent only; the Firestore rules above are what actually secures it.

## 8. What was added in this second pass

- A round **Portal** icon (lock/briefcase icon) now sits next to "Let's Connect" in the header on every public page, linking to `login.html` — not just tucked in the footer.
- `login.html` / `login.js` — the login field now accepts either a real email (clients) or a plain **username** (admin / staff), auto-detected and converted internally to a Firebase Auth identifier (see section 4 above). No password is ever hardcoded in the JavaScript.
- New **Staff** role:
  - Added from the Admin dashboard's new **Staff** panel (username + temporary password + optional display name).
  - Staff sign in with their username/password and land on a read-only **Staff dashboard** showing every registered client and every student on file.
  - Staff cannot add, edit, or delete anything — enforced both in the UI and by the Firestore rules in section 5.
  - Admin can rename (display name) or remove a staff account from the same panel. See the "known limitation" note in section 4 about what "delete" does and doesn't do.
- Firestore rules updated with a `staff` collection and staff read access on `clients` and `students` — re-publish the rules in section 5 if you're upgrading from the previous pass.
