(() => {
  const bar = document.querySelector("[data-reading-progress]");
  const article = document.querySelector("[data-article]");
  if (!bar || !article) return;

  let ticking = false;
  const update = () => {
    const rect = article.getBoundingClientRect();
    const total = rect.height - window.innerHeight * 0.6;
    const read = Math.min(Math.max(-rect.top + window.innerHeight * 0.2, 0), Math.max(total, 1));
    bar.style.transform = `scaleX(${total > 0 ? read / total : 1})`;
    ticking = false;
  };

  const request = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };

  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", request);
  update();
})();
