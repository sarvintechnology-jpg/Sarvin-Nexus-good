import { db } from "./firebase-init.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ---------- Contact form -> Firestore ---------- */
const form = document.getElementById("contactForm");
const submitBtn = document.getElementById("submitBtn");
const statusEl = document.getElementById("formStatus");

function openThankYouWindow(name) {
  const popup = window.open("", "sarvinnexus-thanks", "width=520,height=560");
  if (!popup) {
    // Popup blocked — fall back to inline status message only.
    return;
  }
  const firstName = (name || "there").split(" ")[0];
  popup.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Message Sent | Sarvin Nexus</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css">
</head>
<body class="thanks-page">
  <div class="thanks-box">
    <div class="thanks-icon">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
    </div>
    <h1>Congratulations, ${firstName}! 🎉</h1>
    <p>Your message just landed in my inbox and I'll get back to you soon.</p>
    <p>Every great collaboration starts with a single message — thanks for taking that first step. Here's to a brighter, better future ahead, for both your project and mine!</p>
    <p style="margin-top:24px;"><button onclick="window.close()" class="btn btn-primary" style="margin:0 auto;">Close this window</button></p>
  </div>
</body>
</html>`);
  popup.document.close();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  statusEl.textContent = "";
  statusEl.className = "form-status";

  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const message = document.getElementById("message").value.trim();

  if (!name || !email || !message) {
    statusEl.textContent = "Please fill in all fields.";
    statusEl.classList.add("error");
    return;
  }

  submitBtn.disabled = true;
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = "Sending...";

  try {
    await addDoc(collection(db, "messages"), {
      name,
      email,
      message,
      createdAt: serverTimestamp()
    });
    statusEl.textContent = "Thanks! Your message has been sent.";
    statusEl.classList.add("success");
    openThankYouWindow(name);
    form.reset();
  } catch (err) {
    console.error("Firestore error:", err);
    statusEl.textContent = "Something went wrong. Please try again or email me directly.";
    statusEl.classList.add("error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
});
