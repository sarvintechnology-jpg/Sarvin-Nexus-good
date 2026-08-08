/* ---------- Footer year ---------- */
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

/* ---------- Page-load fade-in ---------- */
document.documentElement.classList.add("page-loading");
window.addEventListener("DOMContentLoaded", () => {
  requestAnimationFrame(() => document.documentElement.classList.remove("page-loading"));
});
/* Failsafe: no matter what else goes wrong on the page (a slow/blocked
   network request, a third-party script error, etc.), never leave the
   page invisible for more than a couple of seconds. */
setTimeout(() => document.documentElement.classList.remove("page-loading"), 2500);

/* ---------- Mobile nav toggle ---------- */
const hamburger = document.getElementById("hamburger");
const navMobile = document.getElementById("navMobile");
if (hamburger && navMobile) {
  hamburger.addEventListener("click", () => {
    navMobile.classList.toggle("open");
    hamburger.classList.toggle("is-open");
  });
  navMobile.querySelectorAll(".nav-link").forEach(link => {
    link.addEventListener("click", () => {
      navMobile.classList.remove("open");
      hamburger.classList.remove("is-open");
    });
  });
}

/* ---------- Scroll-reveal (auto-tags common elements, no HTML edits needed) ---------- */
(function initReveal() {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const autoTagSelectors = [
    ".hero-text", ".hero-visual", ".section-heading", ".service-card",
    ".project-card", ".blog-card", ".skill-pill", ".stat", ".about-visual",
    ".about-text", ".contact-form", ".stats-bar"
  ];
  document.querySelectorAll(autoTagSelectors.join(",")).forEach((el) => {
    if (!el.classList.contains("reveal")) el.classList.add("reveal");
  });

  // Stagger siblings that share a parent (grids, pills, cards) for a cascade effect
  const groupSelectors = [".services-grid", ".projects-grid", ".blog-grid", ".skills-grid", ".stats-bar"];
  groupSelectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(group => {
      Array.from(group.children).forEach((child, i) => {
        child.style.transitionDelay = prefersReduced ? "0ms" : `${i * 80}ms`;
      });
    });
  });

  if (prefersReduced) {
    document.querySelectorAll(".reveal").forEach(el => el.classList.add("in-view"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in-view");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: "0px 0px -60px 0px" });

  document.querySelectorAll(".reveal").forEach(el => observer.observe(el));
})();

/* ---------- Animated stat counters (10+, 8+, 3+, 5★ etc.) ---------- */
(function initCounters() {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const statEls = document.querySelectorAll(".stat strong");
  if (!statEls.length || prefersReduced) return;

  statEls.forEach(el => {
    const match = el.textContent.trim().match(/^(\d+)/);
    if (!match) return;
    const target = parseInt(match[1], 10);
    const suffixHTML = el.innerHTML.slice(match[1].length); // preserves "+" or the "<span class=star>★</span>" markup
    let started = false;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !started) {
          started = true;
          el.innerHTML = `<span class="count-num">0</span>${suffixHTML}`;
          const numEl = el.querySelector(".count-num");
          const duration = 900;
          const startTime = performance.now();
          function tick(now) {
            const progress = Math.min((now - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            numEl.textContent = Math.round(eased * target);
            if (progress < 1) requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
          observer.unobserve(el);
        }
      });
    }, { threshold: 0.5 });
    observer.observe(el);
  });
})();

/* ---------- Scroll progress bar (thin gradient bar under the header) ---------- */
(function initScrollProgress() {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const bar = document.createElement("div");
  bar.className = "scroll-progress";
  document.body.appendChild(bar);

  function update() {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const pct = height > 0 ? (scrollTop / height) * 100 : 0;
    bar.style.width = pct + "%";
  }
  update();
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  if (prefersReduced) bar.style.transition = "none";
})();

/* ---------- Header: shrink + shadow once the page is scrolled ---------- */
(function initHeaderScrollState() {
  const header = document.querySelector(".site-header");
  if (!header) return;
  function update() {
    if ((window.scrollY || document.documentElement.scrollTop) > 12) {
      header.classList.add("scrolled");
    } else {
      header.classList.remove("scrolled");
    }
  }
  update();
  window.addEventListener("scroll", update, { passive: true });
})();

/* ---------- Ripple effect on buttons ---------- */
(function initRipples() {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) return;
  const rippleSelectors = ".btn, .btn-portal, .icon-btn, .skill-pill";
  document.addEventListener("click", (e) => {
    const target = e.target.closest(rippleSelectors);
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const ripple = document.createElement("span");
    const size = Math.max(rect.width, rect.height) * 1.6;
    ripple.className = "ripple";
    ripple.style.width = ripple.style.height = size + "px";
    ripple.style.left = (e.clientX - rect.left - size / 2) + "px";
    ripple.style.top = (e.clientY - rect.top - size / 2) + "px";
    target.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove());
  });
})();

/* ---------- Floating background orbs (subtle parallax drift on mouse move) ---------- */
(function initOrbParallax() {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const orbs = document.querySelectorAll(".bg-orbs .orb");
  const isFinePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (!orbs.length || prefersReduced || !isFinePointer) return;

  window.addEventListener("mousemove", (e) => {
    const xRatio = (e.clientX / window.innerWidth) - 0.5;
    const yRatio = (e.clientY / window.innerHeight) - 0.5;
    orbs.forEach((orb, i) => {
      const strength = (i + 1) * 10;
      orb.style.setProperty("--parallax-x", `${xRatio * strength}px`);
      orb.style.setProperty("--parallax-y", `${yRatio * strength}px`);
    });
  });
})();
