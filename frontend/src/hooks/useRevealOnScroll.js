// src/hooks/useRevealOnScroll.js
import { useEffect } from "react";

export default function useRevealOnScroll(options = {}) {
  const { rootMargin = "0px 0px -10% 0px", threshold = 0.15 } = options;

  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll("[data-reveal]") || []);
    if (nodes.length === 0) return;

    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      nodes.forEach((n) => n.classList.add("is-visible"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        });
      },
      { root: null, rootMargin, threshold },
    );

    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [rootMargin, threshold]);
}
