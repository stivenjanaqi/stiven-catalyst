(() => {
  const form = document.querySelector("[data-worksheet]");
  if (!form) return;

  const KEY = "sc-five-whys";
  const MAX_WHYS = 9;
  const list = form.querySelector("[data-whys]");
  const addButton = form.querySelector("[data-add-why]");
  const status = form.querySelector("[data-status]");
  const causeField = form.elements.cause;

  const read = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
  };
  const write = (value) => {
    try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* storage unavailable */ }
  };
  const forget = () => {
    try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
  };

  const whyInputs = () => [...list.querySelectorAll("input")];

  const addWhy = () => {
    const number = whyInputs().length + 1;
    if (number > MAX_WHYS) return null;
    const item = document.createElement("li");
    item.className = "field why";
    const label = document.createElement("label");
    label.htmlFor = `ws-why-${number}`;
    label.textContent = `Why ${number}?`;
    const input = document.createElement("input");
    input.id = `ws-why-${number}`;
    input.name = `why${number}`;
    input.autocomplete = "off";
    input.dataset.store = "";
    item.append(label, input);
    list.append(item);
    addButton.hidden = number >= MAX_WHYS;
    return input;
  };

  // Suggest the deepest answer so far as the root cause.
  const suggestCause = () => {
    const last = whyInputs().map((input) => input.value.trim()).filter(Boolean).pop();
    causeField.placeholder = last ? `Suggested: ${last}` : "The last answer that you can act on";
  };

  const save = () => {
    const values = {};
    form.querySelectorAll("[data-store]").forEach((field) => { values[field.name] = field.value; });
    write(values);
    suggestCause();
  };

  const restore = () => {
    const values = read();
    Object.keys(values).forEach((name) => {
      if (!form.elements[name] && /^why\d+$/.test(name)) {
        while (whyInputs().length < Number(name.slice(3)) && addWhy());
      }
    });
    Object.entries(values).forEach(([name, value]) => {
      const field = form.elements[name];
      if (field) field.value = value;
    });
    suggestCause();
  };

  const asText = () => {
    const value = (name) => form.elements[name]?.value.trim() || "-";
    const lines = ["5 Whys | Stiven Catalyst", "", `Problem: ${value("problem")}`, ""];
    whyInputs().forEach((input, index) => {
      if (input.value.trim()) lines.push(`Why ${index + 1}: ${input.value.trim()}`);
    });
    lines.push(
      "",
      `Root cause: ${value("cause")}`,
      `Countermeasure: ${value("action")}`,
      `Owner: ${value("owner")}`,
      `Due: ${value("due")}`,
      `Check: ${value("check")}`
    );
    return lines.join("\n");
  };

  const flash = (message) => {
    status.textContent = message;
    clearTimeout(flash.timer);
    flash.timer = setTimeout(() => { status.textContent = "Your draft is kept only in this browser."; }, 2200);
  };

  form.addEventListener("input", save);

  addButton.addEventListener("click", () => {
    const input = addWhy();
    input?.focus();
    save();
  });

  form.querySelector("[data-print]").addEventListener("click", () => window.print());

  form.querySelector("[data-copy]").addEventListener("click", async () => {
    const text = asText();
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
    flash("Copied to the clipboard.");
  });

  form.querySelector("[data-clear]").addEventListener("click", () => {
    if (!window.confirm("Clear the whole worksheet?")) return;
    form.reset();
    whyInputs().slice(5).forEach((input) => input.closest("li").remove());
    addButton.hidden = false;
    forget();
    suggestCause();
    flash("Worksheet cleared.");
    form.elements.problem.focus();
  });

  restore();

  // Other tools link here with ?problem=... to start a worksheet from their result.
  const incoming = new URLSearchParams(location.search).get("problem")?.trim();
  if (incoming) {
    const current = form.elements.problem.value.trim();
    if (current !== incoming && (!current || window.confirm(`Start a new worksheet with this problem?\n\n${incoming}`))) {
      form.reset();
      whyInputs().slice(5).forEach((input) => input.closest("li").remove());
      addButton.hidden = false;
      form.elements.problem.value = incoming;
      save();
      form.elements.why1.focus();
    }
    history.replaceState(null, "", location.pathname + location.hash);
  }
})();
