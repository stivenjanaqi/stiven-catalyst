(() => {
  const root = document.documentElement;

  const readTheme = () => {
    try { return localStorage.getItem("sc-theme"); } catch { return null; }
  };
  const saveTheme = (theme) => {
    try { localStorage.setItem("sc-theme", theme); } catch { /* storage unavailable */ }
  };

  // The inline script in <head> sets the theme before first paint; this is a fallback.
  root.dataset.theme = root.dataset.theme || readTheme() || "dark";

  const themeButton = document.querySelector("[data-theme-toggle]");
  const setThemeLabel = () => {
    if (!themeButton) return;
    const isDark = root.dataset.theme === "dark";
    themeButton.setAttribute("aria-label", isDark ? "Use light theme" : "Use dark theme");
  };
  setThemeLabel();

  themeButton?.addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    saveTheme(root.dataset.theme);
    setThemeLabel();
  });

  const menuButton = document.querySelector("[data-menu-toggle]");
  const panel = document.querySelector("[data-mobile-panel]");

  const setMenu = (open) => {
    if (panel) panel.dataset.open = String(open);
    menuButton?.setAttribute("aria-expanded", String(open));
    menuButton?.setAttribute("aria-label", open ? "Close menu" : "Menu");
  };

  menuButton?.addEventListener("click", () => {
    setMenu(panel?.dataset.open !== "true");
  });

  panel?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setMenu(false));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panel?.dataset.open === "true") {
      setMenu(false);
      menuButton?.focus();
    }
  });

  document.querySelectorAll("[data-year]").forEach((node) => {
    node.textContent = new Date().getFullYear();
  });
})();
