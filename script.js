(() => {
  const root = document.documentElement;
  const saved = localStorage.getItem("sc-theme");
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = saved || (systemDark ? "dark" : "light");

  const themeButton = document.querySelector("[data-theme-toggle]");
  const setThemeIcon = () => {
    if (!themeButton) return;
    const isDark = root.dataset.theme === "dark";
    themeButton.textContent = isDark ? "☀" : "◐";
    themeButton.setAttribute("aria-label", isDark ? "Use light theme" : "Use dark theme");
  };
  setThemeIcon();

  themeButton?.addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem("sc-theme", root.dataset.theme);
    setThemeIcon();
  });

  const menuButton = document.querySelector("[data-menu-toggle]");
  const panel = document.querySelector("[data-mobile-panel]");

  menuButton?.addEventListener("click", () => {
    const next = panel?.dataset.open !== "true";
    if (panel) panel.dataset.open = String(next);
    menuButton.setAttribute("aria-expanded", String(next));
  });

  panel?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      panel.dataset.open = "false";
      menuButton?.setAttribute("aria-expanded", "false");
    });
  });

  document.querySelectorAll("[data-year]").forEach((node) => {
    node.textContent = new Date().getFullYear();
  });
})();