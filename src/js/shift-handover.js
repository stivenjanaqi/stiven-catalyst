(() => {
  const form = document.querySelector("[data-handover]");
  if (!form) return;

  const KEY = "sc-shift-handover";
  const SHIFTS = ["Morning", "Evening", "Night"];
  const PRIORITIES = ["High", "Medium", "Low"];
  const STATUSES = ["Open", "Waiting", "Monitor", "Done"];
  const DEFAULT_CHECKS = [
    "Every open issue has an owner",
    "Risks were discussed face to face",
    "Keys, cash and equipment handed over",
    "The next shift knows where this handover is",
  ];

  // Each list: how a new row looks and which fields it has.
  const LISTS = {
    numbers: {
      empty: () => ({ label: "", value: "" }),
      fields: [
        { key: "label", label: "Figure", placeholder: "e.g. Occupancy", cls: "grow" },
        { key: "value", label: "Value", placeholder: "e.g. 92%", cls: "short" },
      ],
    },
    issues: {
      empty: () => ({ text: "", priority: "Medium", owner: "", due: "", status: "Open" }),
      labelled: true,
      fields: [
        { key: "text", label: "Issue", placeholder: "What is still open?", cls: "full" },
        { key: "priority", label: "Priority", options: PRIORITIES },
        { key: "owner", label: "Owner", placeholder: "Who takes it" },
        { key: "due", label: "By when", placeholder: "e.g. 10:00" },
        { key: "status", label: "Status", options: STATUSES },
      ],
    },
    risks: {
      empty: () => ({ text: "" }),
      fields: [{ key: "text", label: "Risk", placeholder: "e.g. Late delivery expected around 07:00", cls: "grow" }],
    },
    done: {
      empty: () => ({ text: "" }),
      fields: [{ key: "text", label: "Done", placeholder: "e.g. Night audit closed, reports sent", cls: "grow" }],
    },
    checks: {
      empty: () => ({ text: "", checked: false }),
      fields: [
        { key: "checked", label: "Done", type: "checkbox" },
        { key: "text", label: "Check", placeholder: "Add your own check", cls: "grow" },
      ],
    },
  };

  const localDate = (date = new Date()) => {
    const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return shifted.toISOString().slice(0, 10);
  };

  const guessShift = () => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 14) return "Morning";
    if (hour >= 14 && hour < 22) return "Evening";
    return "Night";
  };

  const blank = () => ({
    meta: { area: "", date: localDate(), shift: guessShift(), from: "", to: "", notes: "" },
    numbers: [LISTS.numbers.empty()],
    issues: [LISTS.issues.empty()],
    risks: [LISTS.risks.empty()],
    done: [LISTS.done.empty()],
    checks: DEFAULT_CHECKS.map((text) => ({ text, checked: false })),
  });

  const load = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (!saved || typeof saved !== "object") return blank();
      const base = blank();
      const merged = { ...base, meta: { ...base.meta, ...saved.meta } };
      Object.keys(LISTS).forEach((name) => {
        if (Array.isArray(saved[name])) merged[name] = saved[name].map((row) => ({ ...LISTS[name].empty(), ...row }));
      });
      return merged;
    } catch {
      return blank();
    }
  };

  let state = load();

  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
  };

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  // ---------- Rendering ----------

  const renderList = (name) => {
    const container = form.querySelector(`[data-list="${name}"]`);
    const spec = LISTS[name];
    container.replaceChildren();
    state[name].forEach((row, index) => {
      const line = el("div", `row row-${name}`);
      spec.fields.forEach((field) => {
        const wrap = el(spec.labelled ? "label" : "div", `cell ${field.cls || ""}`.trim());
        if (spec.labelled) wrap.append(el("span", "mini", field.label));
        let input;
        if (field.options) {
          input = el("select");
          field.options.forEach((option) => input.append(new Option(option, option)));
        } else {
          input = el("input");
          input.type = field.type || "text";
          if (field.placeholder) input.placeholder = field.placeholder;
          input.autocomplete = "off";
        }
        if (!spec.labelled) input.setAttribute("aria-label", `${field.label} ${index + 1}`);
        input.dataset.list = name;
        input.dataset.index = index;
        input.dataset.key = field.key;
        if (field.type === "checkbox") input.checked = Boolean(row[field.key]);
        else input.value = row[field.key] ?? "";
        wrap.append(input);
        line.append(wrap);
      });
      const remove = el("button", "row-remove", "×");
      remove.type = "button";
      remove.dataset.remove = name;
      remove.dataset.index = index;
      remove.setAttribute("aria-label", `Remove row ${index + 1}`);
      line.append(remove);
      if (name === "issues") line.dataset.priority = row.priority;
      container.append(line);
    });
  };

  const renderMeta = () => {
    form.querySelectorAll("[data-meta]").forEach((input) => {
      input.value = state.meta[input.dataset.meta] ?? "";
    });
  };

  const renderAll = () => {
    renderMeta();
    Object.keys(LISTS).forEach(renderList);
    renderQuality();
  };

  // ---------- Handover check ----------

  const openIssues = () => state.issues.filter((issue) => issue.text.trim() && issue.status !== "Done");

  const renderQuality = () => {
    const list = document.querySelector("[data-quality]");
    if (!list) return;
    const open = openIssues();
    const noOwner = open.filter((issue) => !issue.owner.trim()).length;
    const urgentNoTime = open.filter((issue) => issue.priority === "High" && !issue.due.trim()).length;
    const checks = state.checks.filter((check) => check.text.trim());
    const ticked = checks.filter((check) => check.checked).length;

    const items = [];
    items.push([true, open.length ? `${open.length} open ${open.length === 1 ? "issue" : "issues"}` : "No open issues listed"]);
    if (noOwner) items.push([false, `${noOwner} without an owner`]);
    if (urgentNoTime) items.push([false, `${urgentNoTime} high priority without a time`]);
    if (!state.meta.to.trim()) items.push([false, "Nobody named as receiving it"]);
    if (checks.length) items.push([ticked === checks.length, `${ticked} of ${checks.length} checks ticked`]);
    const ready = items.every(([ok]) => ok);

    list.replaceChildren();
    items.forEach(([ok, text]) => list.append(el("li", ok ? "is-ok" : "is-warn", text)));
    if (ready) list.append(el("li", "is-ready", "Ready to hand over."));
  };

  // ---------- Output ----------

  const filled = (name) => state[name].filter((row) => (row.text ?? row.label ?? "").trim());

  const heading = () => {
    const { area, shift, date } = state.meta;
    return [area.trim() || "Shift handover", shift, date].filter(Boolean).join(" · ");
  };

  const asText = () => {
    const { from, to, notes } = state.meta;
    const lines = [`SHIFT HANDOVER | ${heading()}`];
    if (from || to) lines.push(`From: ${from || "-"}  →  To: ${to || "-"}`);
    const section = (title, rows) => {
      if (!rows.length) return;
      lines.push("", title, ...rows);
    };
    section("KEY NUMBERS", filled("numbers").map((row) => `- ${row.label}: ${row.value || "-"}`));
    section("OPEN ISSUES", openIssues().map((issue, index) =>
      `${index + 1}. [${issue.priority.toUpperCase()}] ${issue.text} | Owner: ${issue.owner || "NONE"} | By: ${issue.due || "-"} | ${issue.status}`));
    section("RISKS FOR THE NEXT SHIFT", filled("risks").map((row) => `- ${row.text}`));
    section("DONE THIS SHIFT", [
      ...filled("done").map((row) => `- ${row.text}`),
      ...state.issues.filter((issue) => issue.text.trim() && issue.status === "Done").map((issue) => `- ${issue.text}`),
    ]);
    if (notes.trim()) lines.push("", "NOTES", notes.trim());
    section("CHECKS", filled("checks").map((check) => `[${check.checked ? "x" : " "}] ${check.text}`));
    return lines.join("\n");
  };

  const renderPrintSheet = () => {
    const sheet = document.querySelector("[data-print-sheet]");
    sheet.replaceChildren();
    sheet.append(el("p", "print-kicker", "Shift handover · Stiven Catalyst"));
    sheet.append(el("h2", null, heading()));
    const { from, to, notes } = state.meta;
    if (from || to) sheet.append(el("p", "print-meta", `Handed over by ${from || "-"} to ${to || "-"}`));

    const addList = (title, rows) => {
      if (!rows.length) return;
      sheet.append(el("h3", null, title));
      const list = el("ul");
      rows.forEach((text) => list.append(el("li", null, text)));
      sheet.append(list);
    };

    addList("Key numbers", filled("numbers").map((row) => `${row.label}: ${row.value || "-"}`));

    const open = openIssues();
    if (open.length) {
      sheet.append(el("h3", null, "Open issues"));
      const table = el("table");
      const head = el("tr");
      ["Issue", "Priority", "Owner", "By when", "Status"].forEach((text) => head.append(el("th", null, text)));
      table.append(head);
      open.forEach((issue) => {
        const tr = el("tr");
        [issue.text, issue.priority, issue.owner || "NONE", issue.due || "-", issue.status].forEach((text) => tr.append(el("td", null, text)));
        table.append(tr);
      });
      sheet.append(table);
    }

    addList("Risks for the next shift", filled("risks").map((row) => row.text));
    addList("Done this shift", [
      ...filled("done").map((row) => row.text),
      ...state.issues.filter((issue) => issue.text.trim() && issue.status === "Done").map((issue) => issue.text),
    ]);
    if (notes.trim()) {
      sheet.append(el("h3", null, "Notes"));
      sheet.append(el("p", null, notes.trim()));
    }
    addList("Checks", filled("checks").map((check) => `${check.checked ? "☑" : "☐"} ${check.text}`));
    sheet.append(el("p", "print-sign", "Signature (handed over) ______________________    Signature (received) ______________________"));
  };

  const flash = (message) => {
    const status = form.querySelector("[data-status]");
    status.textContent = message;
    clearTimeout(flash.timer);
    flash.timer = setTimeout(() => { status.textContent = "Your handover is kept only in this browser."; }, 2200);
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = el("textarea");
      area.value = text;
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
  };

  // ---------- Events ----------

  const update = (event) => {
    const input = event.target;
    if (input.dataset.meta) {
      state.meta[input.dataset.meta] = input.value;
    } else if (input.dataset.list) {
      const row = state[input.dataset.list][Number(input.dataset.index)];
      row[input.dataset.key] = input.type === "checkbox" ? input.checked : input.value;
      if (input.dataset.key === "priority") input.closest(".row").dataset.priority = input.value;
    } else {
      return;
    }
    save();
    renderQuality();
  };
  form.addEventListener("input", update);
  form.addEventListener("change", update);

  form.addEventListener("click", (event) => {
    const add = event.target.closest("[data-add]");
    const remove = event.target.closest("[data-remove]");
    if (add) {
      const name = add.dataset.add;
      state[name].push(LISTS[name].empty());
      renderList(name);
      form.querySelector(`[data-list="${name}"]`).lastElementChild?.querySelector("input[type=text]")?.focus();
    } else if (remove) {
      const name = remove.dataset.remove;
      state[name].splice(Number(remove.dataset.index), 1);
      if (!state[name].length) state[name].push(LISTS[name].empty());
      renderList(name);
    } else {
      return;
    }
    save();
    renderQuality();
  });

  form.querySelector("[data-print]").addEventListener("click", () => window.print());
  window.addEventListener("beforeprint", renderPrintSheet);

  form.querySelector("[data-copy]").addEventListener("click", async () => {
    await copy(asText());
    flash("Copied. Paste it into email, chat or your shift log.");
  });

  form.querySelector("[data-next]").addEventListener("click", () => {
    if (!window.confirm("Start the next shift? Open issues and risks are carried over; numbers, done items and ticks are cleared.")) return;
    const old = state;
    const index = SHIFTS.indexOf(old.meta.shift);
    const nextShift = SHIFTS[(index + 1) % SHIFTS.length];
    let date = old.meta.date;
    if (old.meta.shift === "Night" && date) {
      const next = new Date(`${date}T12:00:00`);
      next.setDate(next.getDate() + 1);
      date = localDate(next);
    }
    const carried = old.issues.filter((issue) => issue.text.trim() && issue.status !== "Done");
    const risks = old.risks.filter((risk) => risk.text.trim());
    state = {
      meta: { area: old.meta.area, date, shift: nextShift, from: old.meta.to, to: "", notes: "" },
      numbers: old.numbers.filter((row) => row.label.trim()).map((row) => ({ label: row.label, value: "" })),
      issues: carried.length ? carried : [LISTS.issues.empty()],
      risks: risks.length ? risks : [LISTS.risks.empty()],
      done: [LISTS.done.empty()],
      checks: old.checks.filter((check) => check.text.trim()).map((check) => ({ text: check.text, checked: false })),
    };
    if (!state.numbers.length) state.numbers = [LISTS.numbers.empty()];
    if (!state.checks.length) state.checks = [LISTS.checks.empty()];
    save();
    renderAll();
    flash(`New ${nextShift.toLowerCase()} shift started. ${carried.length} open ${carried.length === 1 ? "issue" : "issues"} carried over.`);
    window.scrollTo({ top: form.getBoundingClientRect().top + window.scrollY - 100, behavior: "smooth" });
  });

  form.querySelector("[data-clear]").addEventListener("click", () => {
    if (!window.confirm("Clear the whole handover?")) return;
    state = blank();
    try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
    renderAll();
    flash("Handover cleared.");
  });

  renderAll();
})();
