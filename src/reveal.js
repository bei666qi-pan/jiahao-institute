// Scroll-reveal for the main site: observes stable section selectors and adds
// .is-visible as they enter the viewport. CSS lives in ui-upgrade.css and is
// gated behind html.reveal-ready + prefers-reduced-motion: no-preference, so
// without this script (or with reduced motion) every element renders normally.

const REVEAL_SELECTORS = [
  '.scale',
  '.how-it-works > div',
  '.species-stage',
  '.species-rail button',
  '.evidence-copy',
  '.commentary',
  '.quote-presets',
  '.result-grid > *',
].join(',');

export function startReveal() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!('IntersectionObserver' in window)) return;

  document.documentElement.classList.add('reveal-ready');

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );

  const seen = new WeakSet();
  const attach = (root) => {
    const nodes = root.matches?.(REVEAL_SELECTORS)
      ? [root]
      : Array.from(root.querySelectorAll?.(REVEAL_SELECTORS) ?? []);
    for (const node of nodes) {
      if (seen.has(node)) continue;
      seen.add(node);
      node.classList.add('reveal');
      io.observe(node);
    }
  };

  attach(document.body);

  // The app is an SPA: result pages and quote panels mount later, so watch
  // for new matching subtrees and attach reveal to them as they appear.
  const mo = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) attach(node);
      }
    }
  });
  mo.observe(document.getElementById('root'), { childList: true, subtree: true });
}
