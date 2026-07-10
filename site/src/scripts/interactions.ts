/**
 * Cadastrum — Site Interaction System
 *
 * Principles (impeccable + design-motion-principles):
 * - Every element that moves has physical weight.
 * - Motion communicates state, not decoration.
 * - Spring physics for entry, ease-out for rest.
 * - Magnetic effects: subtle, felt but not seen.
 * - prefers-reduced-motion respected everywhere.
 */

const reduceMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ─────────────────────────────────────────────────────────────────────────────
 * SCROLL REVEAL — IntersectionObserver
 * ───────────────────────────────────────────────────────────────────────────── */
function initScrollReveal() {
  const els = document.querySelectorAll<HTMLElement>(
    "[data-reveal], [data-reveal-stagger]"
  );
  if (!els.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          // Unobserve after reveal — no re-animation on scroll back
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );

  els.forEach((el) => observer.observe(el));
}

/* ─────────────────────────────────────────────────────────────────────────────
 * BENTO CARD TILT — 3D perspective tilt on mouse move
 * Physical principle: card has mass, tilts toward cursor like a physical object.
 * Max tilt: 6deg. Perspective: 800px. Spring reset on leave.
 * ───────────────────────────────────────────────────────────────────────────── */
function initBentoTilt() {
  if (reduceMotion()) return;

  const cards = document.querySelectorAll<HTMLElement>(".bento-card");
  cards.forEach((card) => {
    let rafId = 0;
    let isInside = false;

    card.addEventListener("mouseenter", () => {
      isInside = true;
      card.classList.remove("tilt-reset");
    });

    card.addEventListener("mousemove", (e: MouseEvent) => {
      if (!isInside) return;
      if (rafId) return; // throttle to rAF

      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const rect = card.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = (e.clientX - cx) / (rect.width / 2);   // -1 to 1
        const dy = (e.clientY - cy) / (rect.height / 2);  // -1 to 1

        const maxTilt = 5; // degrees
        const rx = (-dy * maxTilt).toFixed(2);
        const ry = (dx * maxTilt).toFixed(2);

        card.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(4px)`;
        // Highlight — simulates light hitting tilted surface
        const lightX = 50 + dx * 20;
        const lightY = 50 + dy * 20;
        card.style.setProperty(
          "--card-light",
          `radial-gradient(circle at ${lightX}% ${lightY}%, rgba(255,255,255,0.06), transparent 60%)`
        );
      });
    });

    card.addEventListener("mouseleave", () => {
      isInside = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      card.classList.add("tilt-reset");
      card.style.transform = "";
      card.style.removeProperty("--card-light");
    });
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
 * MAGNETIC BUTTONS — subtle pull toward cursor
 * Physical: button has a weak magnetic field. Cursor gets close → pulls.
 * Strength: 0.22 (22% of cursor displacement). Max: 8px.
 * ───────────────────────────────────────────────────────────────────────────── */
function initMagneticButtons() {
  if (reduceMotion()) return;

  const buttons = document.querySelectorAll<HTMLElement>(
    ".btn-primary, .btn-champagne, [data-magnetic]"
  );

  buttons.forEach((btn) => {
    let rafId = 0;

    btn.addEventListener("mousemove", (e: MouseEvent) => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const rect = btn.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;

        const strength = 0.22;
        const maxPull = 8;
        const tx = Math.max(-maxPull, Math.min(maxPull, dx * strength));
        const ty = Math.max(-maxPull, Math.min(maxPull, dy * strength));

        btn.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px)`;
      });
    });

    btn.addEventListener("mouseleave", () => {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      // Spring back — CSS handles the spring transition
      btn.style.transform = "";
    });
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
 * COUNT-UP NUMBERS — spring easing, thousands separator
 * Triggers when element enters viewport.
 * ───────────────────────────────────────────────────────────────────────────── */
function initCounters() {
  const counters = document.querySelectorAll<HTMLElement>("[data-counter]");
  if (!counters.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);

        const el = entry.target as HTMLElement;
        const target = parseInt(el.dataset.counter || "0", 10);
        const suffix = el.dataset.counterSuffix ?? "";
        const duration = reduceMotion() ? 0 : 1400;

        if (duration === 0) {
          el.textContent = formatNumber(target) + suffix;
          return;
        }

        const start = performance.now();
        const update = (now: number) => {
          const elapsed = now - start;
          const progress = Math.min(elapsed / duration, 1);
          // Spring-inspired easing: decelerate sharply at end
          const eased = 1 - Math.pow(1 - progress, 3.5);
          const current = Math.round(eased * target);
          el.textContent = formatNumber(current) + suffix;
          if (progress < 1) requestAnimationFrame(update);
        };

        requestAnimationFrame(update);
      });
    },
    { threshold: 0.5 }
  );

  counters.forEach((el) => observer.observe(el));
}

function formatNumber(n: number): string {
  if (n >= 1000) {
    return n.toLocaleString("tr-TR");
  }
  return String(n);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * BENTO CARD LIGHT — CSS variable driven highlight
 * Applied via inline style from tilt handler above.
 * We also need to inject the ::before overlay that reads --card-light.
 * ───────────────────────────────────────────────────────────────────────────── */
function injectBentoLightStyle() {
  if (reduceMotion()) return;
  const id = "bento-light-style";
  if (document.getElementById(id)) return;

  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    .bento-card::before {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: var(--card-light, transparent);
      pointer-events: none;
      z-index: 1;
      transition: background 80ms ease;
    }
  `;
  document.head.appendChild(style);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * FOCUS RING POLISH — keyboard vs pointer distinction
 * Shows focus ring only for keyboard navigation (not pointer clicks).
 * ───────────────────────────────────────────────────────────────────────────── */
function initFocusRingMode() {
  const id = "focus-ring-style";
  if (document.getElementById(id)) return;

  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    /* Keyboard focus: visible ring */
    :focus-visible {
      outline: 2px solid #1B2A4A;
      outline-offset: 3px;
      border-radius: 4px;
    }
    /* Pointer click: no ring */
    :focus:not(:focus-visible) {
      outline: none;
    }
  `;
  document.head.appendChild(style);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * LINK HOVER — underline draw effect for body text links
 * ───────────────────────────────────────────────────────────────────────────── */
function injectLinkHoverStyle() {
  if (reduceMotion()) return;
  const id = "link-hover-style";
  if (document.getElementById(id)) return;

  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    /* Prose links — underline draws in on hover, erases on leave */
    .prose a, .body-link {
      text-decoration: none;
      background-image: linear-gradient(currentColor, currentColor);
      background-position: 0% 100%;
      background-repeat: no-repeat;
      background-size: 0% 1px;
      transition: background-size 300ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    .prose a:hover, .body-link:hover {
      background-size: 100% 1px;
    }
  `;
  document.head.appendChild(style);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * INIT — runs on every Astro page load
 * ───────────────────────────────────────────────────────────────────────────── */
function init() {
  initScrollReveal();
  initBentoTilt();
  initMagneticButtons();
  initCounters();
  injectBentoLightStyle();
  initFocusRingMode();
  injectLinkHoverStyle();
}

// Astro view transitions + initial load
document.addEventListener("astro:page-load", init);
if (document.readyState !== "loading") {
  init();
} else {
  document.addEventListener("DOMContentLoaded", init);
}
