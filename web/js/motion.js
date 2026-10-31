// Motion layer: Lenis smooth scrolling, scroll-reveal, a slim progress line on page changes, and a header that tucks away while you read.
// Everything degrades to a plain static page if this file or the CDN fails, and is skipped for prefers-reduced-motion.
(function () {
  const still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const view = document.getElementById("view"), header = document.querySelector("header.top");
  const bar = document.createElement("div"); bar.id = "prog"; document.body.appendChild(bar);
  let lenis = null;

  // ---- smooth scroll (Lenis) ----
  function startLenis() {
    if (still || typeof Lenis === "undefined") return;
    try {
      lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95, smoothWheel: true, prevent: (n) => !!(n.closest && n.closest(".gpanel, .gcard, .tw, #gsr, textarea, select, .glabels")) });
      const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
      window.__lenis = lenis;
    } catch (e) { lenis = null; }
  }
  const s = document.createElement("script");
  s.src = "https://cdn.jsdelivr.net/npm/lenis@1.1.20/dist/lenis.min.js"; s.async = true; s.onload = startLenis;
  document.head.appendChild(s);

  // ---- scroll reveal ----
  const io = "IntersectionObserver" in window && !still ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -6% 0px", threshold: 0.06 }) : null;
  const SEL = "h1, h2, .hero > *, .card, .mod, .wid, .story, .tabs, .cards > *, .hz > *, .mods > *, .lesson > *";
  function reveal() {
    if (!io || !view) return;
    const els = [...view.querySelectorAll(SEL)].filter((el) => !el.classList.contains("rv") && !el.closest(".globe-wrap") && !(el.parentElement && el.parentElement.closest(".rv")));
    const seen = new Map();
    els.forEach((el) => {
      const p = el.parentElement, i = seen.get(p) || 0; seen.set(p, i + 1);
      el.style.setProperty("--d", Math.min(i, 8) * 0.07 + "s");           // siblings arrive one after another
      el.classList.add("rv"); io.observe(el);
    });
  }

  // ---- page change: fade the view in, run the progress line, reveal the new content ----
  let t = null;
  function begin() { bar.className = ""; void bar.offsetWidth; bar.classList.add("go"); clearTimeout(t); t = setTimeout(finish, 6000); }
  function finish() { clearTimeout(t); bar.classList.remove("go"); bar.classList.add("done"); }
  window.addEventListener("hashchange", () => { if (!still) begin(); });
  if (view) {
    new MutationObserver(() => {
      if (!still) { view.classList.remove("vin"); void view.offsetWidth; view.classList.add("vin"); }
      reveal(); finish();
      if (lenis && !(window.state && window.state.keepScroll)) lenis.scrollTo(0, { immediate: true });
    }).observe(view, { childList: true });
    reveal();
  }

  // ---- header tucks away on the way down, returns on the way up ----
  let last = window.scrollY;
  window.addEventListener("scroll", () => {
    const y = window.scrollY; if (!header) return;
    header.classList.toggle("hide", y > 160 && y > last + 4);
    if (y < last - 4 || y < 160) header.classList.remove("hide");
    last = y;
  }, { passive: true });
})();
