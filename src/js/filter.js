(() => {
  const list = document.querySelector("[data-filter-list]");
  const controls = list?.querySelector("[data-filter-controls]");
  if (!list || !controls) return;

  const items = [...list.querySelectorAll("[data-filter-item]")];
  const search = controls.querySelector("[data-filter-search]");
  const chips = [...controls.querySelectorAll("[data-topic]")];
  const count = controls.querySelector("[data-filter-count]");
  const empty = list.querySelector("[data-filter-empty]");
  const noun = list.querySelector(".notes-grid") ? "notes" : "essays";

  const params = new URLSearchParams(location.search);
  let topic = chips.some((chip) => chip.dataset.topic === params.get("topic")) ? params.get("topic") : "";
  search.value = params.get("q") || "";

  const apply = () => {
    const words = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    items.forEach((item) => {
      const match = (!topic || item.dataset.topic === topic) && words.every((word) => item.dataset.search.includes(word));
      item.hidden = !match;
      if (match) shown++;
    });
    chips.forEach((chip) => chip.setAttribute("aria-pressed", String(chip.dataset.topic === topic)));
    empty.hidden = shown > 0;
    const filtered = topic || words.length;
    count.textContent = filtered ? `${shown} of ${items.length} ${noun}` : "";

    // Keep the current filter in the address so it can be shared.
    const next = new URLSearchParams();
    if (topic) next.set("topic", topic);
    if (search.value.trim()) next.set("q", search.value.trim());
    const query = next.toString();
    history.replaceState(null, "", query ? `?${query}${location.hash}` : location.pathname + location.hash);
  };

  chips.forEach((chip) => chip.addEventListener("click", () => {
    topic = chip.dataset.topic;
    apply();
  }));
  search.addEventListener("input", apply);
  search.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && search.value) {
      search.value = "";
      apply();
    }
  });

  controls.hidden = false;
  apply();
})();
