(() => {
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
  };

  const confirm = (button, label) => {
    const original = button.dataset.label || (button.dataset.label = button.textContent);
    button.textContent = label;
    clearTimeout(button.timer);
    button.timer = setTimeout(() => { button.textContent = original; }, 1600);
  };

  document.querySelectorAll("[data-note-actions]").forEach((node) => { node.hidden = false; });

  document.querySelectorAll("[data-copy-text]").forEach((button) => {
    button.addEventListener("click", async () => {
      await copy(button.dataset.copyText);
      confirm(button, button.dataset.copiedLabel || "Copied");
    });
  });

  // Native share sheet on phones; LinkedIn elsewhere. No third-party scripts.
  document.querySelectorAll("[data-share-url]").forEach((button) => {
    if (button.hasAttribute("data-native-only")) {
      if (!navigator.share) return;
      button.hidden = false;
    }
    button.addEventListener("click", async () => {
      const { shareUrl: url, shareText: text } = button.dataset;
      if (navigator.share) {
        try { await navigator.share({ title: document.title, text, url }); } catch { /* dismissed */ }
        return;
      }
      window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, "_blank", "noopener");
    });
  });
})();
