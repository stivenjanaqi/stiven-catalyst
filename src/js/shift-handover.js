(() => {
  const form = document.querySelector("[data-handover]");
  const dataEl = document.getElementById("shift-handover-data");
  if (!form || !dataEl || !window.ToolKit) return;

  const { read, write, isObject, str, el, today } = window.ToolKit;
  const data = JSON.parse(dataEl.textContent);
  const KEY = data.storageKey;
  const HISTORY_MAX = 30;
  const PRIORITY_ORDER = Object.fromEntries(data.priorities.map((p, i) => [p, i]));

  const metricsBox = form.querySelector("[data-metrics]");
  const issuesBox = form.querySelector("[data-issues]");
  const checklistBox = form.querySelector("[data-checklist]");
  const emptyNote = form.querySelector("[data-empty]");
  const output = document.querySelector("[data-output]");
  const outputTitle = output.querySelector("[data-output-title]");
  const sheet = output.querySelector("[data-sheet]");
  const quality = output.querySelector("[data-quality]");
  const ackText = output.querySelector("[data-ack-text]");
  const status = output.querySelector("[data-status]");
  const historySection = document.querySelector("[data-history-section]");
  const historyBox = document.querySelector("[data-history]");

  const template = (key) => data.templates[key] || data.templates[Object.keys(data.templates)[0]];

  const blank = (key, date = today(), shift = data.shifts[0]) => ({
    template: key,
    date,
    shift,
    area: "",
    from: "",
    to: "",
    metrics: template(key).metrics.map((label) => [label, "", ""]),
    issues: [],
    headsUp: "",
    safety: "",
    checks: template(key).checklist.map(() => false),
    ackAt: "",
  });

  // Rebuild a saved handover field by field, so damaged data cannot break the page.
  const clean = (h) => {
    const key = data.templates[h.template] ? h.template : Object.keys(data.templates)[0];
    const base = blank(key, str(h.date) || today(), data.shifts.includes(h.shift) ? h.shift : data.shifts[0]);
    const metrics = Array.isArray(h.metrics) ? h.metrics.filter(Array.isArray).map((m) => [str(m[0]), str(m[1]), str(m[2])]) : base.metrics;
    const issues = Array.isArray(h.issues) ? h.issues.filter(isObject).map((issue) => ({
      text: str(issue.text),
      priority: data.priorities.includes(issue.priority) ? issue.priority : "Medium",
      owner: str(issue.owner),
      due: str(issue.due),
      done: issue.done === true,
      carried: Number.isInteger(issue.carried) && issue.carried > 0 ? issue.carried : 0,
    })) : [];
    const checks = base.checks.map((_, i) => Array.isArray(h.checks) && h.checks[i] === true);
    return { ...base, area: str(h.area), from: str(h.from), to: str(h.to), headsUp: str(h.headsUp), safety: str(h.safety), ackAt: str(h.ackAt), metrics, issues, checks };
  };
  const saved = read(KEY, {});
  const state = {
    current: isObject(saved) && isObject(saved.current) ? clean(saved.current) : blank(Object.keys(data.templates)[0]),
    history: isObject(saved) && Array.isArray(saved.history)
      ? saved.history.filter((entry) => isObject(entry) && isObject(entry.handover) && typeof entry.text === "string")
        .map((entry) => ({ ...entry, handover: clean(entry.handover) }))
      : [],
  };
  const save = () => write(KEY, state);
  const cur = () => state.current;

  const hasContent = (h) => Boolean(h.area || h.from || h.to || h.headsUp || h.safety
    || h.issues.length || h.metrics.some(([, value]) => value));

  const nextShift = (h) => {
    const index = data.shifts.indexOf(h.shift);
    const shift = data.shifts[(index + 1) % data.shifts.length];
    let date = h.date;
    if (index === data.shifts.length - 1 && date) {
      const next = new Date(`${date}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      date = next.toISOString().slice(0, 10);
    }
    return { shift, date };
  };

  const longDate = (iso) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : "No date");
  const clock = (iso) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const openIssues = (h) => h.issues.filter((issue) => !issue.done && issue.text.trim())
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9) || b.carried - a.carried);
  const solvedIssues = (h) => h.issues.filter((issue) => issue.done && issue.text.trim());

  // Editor --------------------------------------------------------------------
  const input = ({ ariaLabel, ...props }) => {
    const node = el("input");
    Object.assign(node, props);
    if (ariaLabel) node.setAttribute("aria-label", ariaLabel);
    node.autocomplete = "off";
    return node;
  };
  const removeButton = (label, kind, index) => {
    const button = el("button", "dl-remove", "×");
    button.type = "button";
    button.dataset.remove = kind;
    button.dataset.index = index;
    button.setAttribute("aria-label", label);
    return button;
  };

  const renderMetrics = () => {
    metricsBox.replaceChildren();
    cur().metrics.forEach(([label, value, note], i) => {
      const row = el("div", "sh-metric");
      row.append(
        input({ value: label, placeholder: "Number", ariaLabel: `Name of number ${i + 1}`, className: "sh-in" }),
        input({ value, placeholder: "Value", ariaLabel: `${label || "Number"}: value`, className: "sh-in" }),
        input({ value: note, placeholder: "Note or target", ariaLabel: `${label || "Number"}: note`, className: "sh-in" }),
        removeButton(`Remove ${label || "this number"}`, "metric", i),
      );
      ["label", "value", "note"].forEach((field, j) => {
        row.children[j].dataset.metric = field;
        row.children[j].dataset.index = i;
      });
      metricsBox.append(row);
    });
  };

  const renderIssues = () => {
    issuesBox.replaceChildren();
    if (!cur().issues.length) issuesBox.append(el("p", "form-note sh-help", "No open issues yet."));
    cur().issues.forEach((issue, i) => {
      const row = el("div", "sh-issue");
      if (issue.done) row.classList.add("is-done");
      const done = input({ type: "checkbox", checked: issue.done, ariaLabel: `Solved: ${issue.text || `issue ${i + 1}`}` });
      done.dataset.issue = "done";
      const text = input({ value: issue.text, placeholder: "What is open, and what is the risk?", ariaLabel: `Issue ${i + 1}`, className: "sh-in sh-issue-text" });
      text.dataset.issue = "text";
      const priority = el("select", "sh-in");
      priority.setAttribute("aria-label", `Issue ${i + 1}: priority`);
      data.priorities.forEach((p) => {
        const option = el("option", null, p);
        option.selected = p === issue.priority;
        priority.append(option);
      });
      priority.dataset.issue = "priority";
      const owner = input({ value: issue.owner, placeholder: "Owner", ariaLabel: `Issue ${i + 1}: owner`, className: "sh-in" });
      owner.dataset.issue = "owner";
      const due = input({ value: issue.due, placeholder: "By when", ariaLabel: `Issue ${i + 1}: by when`, className: "sh-in" });
      due.dataset.issue = "due";
      [done, text, priority, owner, due].forEach((node) => { node.dataset.index = i; });
      const meta = el("div", "sh-issue-meta");
      meta.append(priority, owner, due);
      if (issue.carried) meta.append(el("span", `dl-tag${issue.carried >= 2 ? " is-warn" : ""}`, `Carried ${issue.carried}×`));
      meta.append(removeButton(`Remove issue ${i + 1}`, "issue", i));
      const main = el("div", "sh-issue-main");
      main.append(text, meta);
      row.append(done, main);
      issuesBox.append(row);
    });
  };

  const renderChecklist = () => {
    checklistBox.replaceChildren();
    template(cur().template).checklist.forEach((item, i) => {
      const li = el("li");
      const label = el("label", "dl-check-item");
      const box = input({ type: "checkbox", checked: Boolean(cur().checks[i]) });
      box.dataset.check = i;
      label.append(box, el("span", null, item));
      li.append(label);
      checklistBox.append(li);
    });
  };

  const renderFields = () => {
    ["template", "date", "shift", "area", "from", "to", "headsUp", "safety"].forEach((name) => {
      form.elements[name].value = cur()[name] ?? "";
    });
    form.elements.headsUp.placeholder = template(cur().template).headsUp;
  };

  const renderEditor = () => {
    renderFields();
    renderMetrics();
    renderIssues();
    renderChecklist();
  };

  // Output --------------------------------------------------------------------
  const problems = (h) => {
    const open = openIssues(h);
    const list = [];
    const noOwner = open.filter((issue) => !issue.owner.trim()).length;
    const noTime = open.filter((issue) => !issue.due.trim()).length;
    if (noOwner) list.push(`${noOwner} open ${noOwner === 1 ? "issue has" : "issues have"} no owner.`);
    if (noTime) list.push(`${noTime} open ${noTime === 1 ? "issue has" : "issues have"} no time.`);
    open.filter((issue) => issue.carried >= 2).forEach((issue) => list.push(`"${issue.text}" has been carried ${issue.carried} times. It is not a shift problem any more: take it through 5 Whys.`));
    if (!h.to.trim()) list.push("Nobody is named to take over.");
    const unticked = h.checks.filter((c) => !c).length;
    if (unticked === h.checks.length) list.push("No handover checks ticked yet.");
    else if (unticked) list.push(`${unticked} of ${h.checks.length} handover checks are not ticked.`);
    return list;
  };

  const asText = (h) => {
    const t = template(h.template);
    const next = nextShift(h);
    const lines = [`Shift handover${h.area ? ` | ${h.area}` : ""}`, `${longDate(h.date)} · ${h.shift} shift → ${next.shift}`];
    if (h.from || h.to) lines.push(`From ${h.from || "?"} to ${h.to || "?"}`);
    const numbers = h.metrics.filter(([label, value]) => label && value);
    if (numbers.length) {
      lines.push("", "NUMBERS");
      numbers.forEach(([label, value, note]) => lines.push(`- ${label}: ${value}${note ? ` (${note})` : ""}`));
    }
    const open = openIssues(h);
    lines.push("", `OPEN ISSUES (${open.length})`);
    if (!open.length) lines.push("- None");
    open.forEach((issue, i) => lines.push(`${i + 1}. [${issue.priority}] ${issue.text} · owner: ${issue.owner || "-"} · by: ${issue.due || "-"}${issue.carried ? ` · carried ${issue.carried}×` : ""}`));
    const solved = solvedIssues(h);
    if (solved.length) {
      lines.push("", "SOLVED THIS SHIFT");
      solved.forEach((issue) => lines.push(`- ${issue.text}`));
    }
    const heads = h.headsUp.split("\n").map((line) => line.trim()).filter(Boolean);
    if (heads.length) {
      lines.push("", "HEADS-UP");
      heads.forEach((line) => lines.push(`- ${line}`));
    }
    const safety = h.safety.split("\n").map((line) => line.trim()).filter(Boolean);
    if (safety.length) {
      lines.push("", "SAFETY AND PEOPLE");
      safety.forEach((line) => lines.push(`- ${line}`));
    }
    lines.push("", `Handover check: ${h.checks.filter(Boolean).length} of ${t.checklist.length}`);
    if (h.ackAt) lines.push(`Taken over by ${h.to} at ${clock(h.ackAt)}`);
    return lines.join("\n");
  };

  const block = (title, children) => {
    const section = el("section", "sh-block");
    section.append(el("h4", "result-label", title), ...children);
    return section;
  };
  const lines = (text) => {
    const list = el("ul", "sh-lines");
    text.split("\n").map((line) => line.trim()).filter(Boolean).forEach((line) => list.append(el("li", null, line)));
    return list;
  };

  const renderSheet = () => {
    const h = cur();
    const next = nextShift(h);
    sheet.replaceChildren();
    const head = el("header", "sh-sheet-head");
    head.append(el("p", "result-label", `${longDate(h.date)} · ${h.shift} shift → ${next.shift}`));
    head.append(el("h3", null, h.area || "Shift handover"));
    head.append(el("p", "sh-people", `From ${h.from || "?"} to ${h.to || "?"}`));
    sheet.append(head);

    const numbers = h.metrics.filter(([label, value]) => label && value);
    if (numbers.length) {
      const grid = el("dl", "sh-numbers");
      numbers.forEach(([label, value, note]) => {
        const item = el("div");
        item.append(el("dt", null, label), el("dd", null, value));
        if (note) item.append(el("dd", "sh-note", note));
        grid.append(item);
      });
      sheet.append(block("Numbers", [grid]));
    }

    const open = openIssues(h);
    const list = el("ol", "sh-open");
    if (!open.length) list.append(el("li", "sh-none", "No open issues."));
    open.forEach((issue) => {
      const li = el("li");
      li.append(el("span", `sh-priority is-${issue.priority.toLowerCase()}`, issue.priority));
      const body = el("div");
      body.append(el("strong", null, issue.text));
      const meta = [`Owner: ${issue.owner || "none"}`, `By: ${issue.due || "no time"}`];
      if (issue.carried) meta.push(`Carried ${issue.carried}×`);
      body.append(el("span", "sh-issue-info", meta.join(" · ")));
      li.append(body);
      list.append(li);
    });
    sheet.append(block(`Open issues (${open.length})`, [list]));

    const solved = solvedIssues(h);
    if (solved.length) sheet.append(block("Solved this shift", [lines(solved.map((issue) => issue.text).join("\n"))]));
    if (h.headsUp.trim()) sheet.append(block("Heads-up", [lines(h.headsUp)]));
    if (h.safety.trim()) sheet.append(block("Safety and people", [lines(h.safety)]));

    const foot = el("p", "sh-foot", `Handover check: ${h.checks.filter(Boolean).length} of ${h.checks.length}${h.ackAt ? ` · Taken over by ${h.to} at ${clock(h.ackAt)}` : " · Not yet confirmed"}`);
    sheet.append(foot);
  };

  const renderQuality = () => {
    const list = problems(cur());
    quality.replaceChildren(el("p", "kicker", "Before you hand over"));
    if (!hasContent(cur())) {
      quality.append(el("p", "sh-ok", "Fill in the shift, the numbers and the open issues. This panel then shows what is still missing."));
      return;
    }
    if (!list.length) {
      quality.append(el("p", "sh-ok", "Complete: every open issue has an owner and a time, and the checks are done."));
      return;
    }
    const ul = el("ul", "sh-problems");
    list.forEach((text) => ul.append(el("li", null, text)));
    quality.append(ul);
  };

  const renderOutput = () => {
    const h = cur();
    outputTitle.textContent = !hasContent(h) ? "Start with the numbers" : h.ackAt ? `Taken over by ${h.to}` : problems(h).length ? "Almost ready" : "Ready to hand over";
    ackText.textContent = h.ackAt
      ? `Confirmed by ${h.to} at ${clock(h.ackAt)}. Close the shift to start the next handover with the open issues carried over.`
      : "The person taking over confirms they have read it and asked their questions.";
    emptyNote.hidden = hasContent(h);
    renderSheet();
    renderQuality();
  };

  const renderHistory = () => {
    historyBox.replaceChildren();
    historySection.hidden = !state.history.length;
    state.history.forEach((entry, index) => {
      const h = entry.handover;
      const details = el("details", "dl-box sh-past");
      const summary = el("summary");
      summary.append(el("strong", null, `${longDate(h.date)} · ${h.shift}`), ` ${h.area ? `· ${h.area} ` : ""}· ${h.from || "?"} → ${h.to || "?"} · ${openIssues(h).length} open`);
      details.append(summary);
      details.append(el("pre", "sh-pre", entry.text));
      const copyButton = el("button", "button-secondary", "Copy as text");
      copyButton.type = "button";
      copyButton.dataset.copyHistory = index;
      const actions = el("div", "tool-actions");
      actions.append(copyButton);
      details.append(actions);
      historyBox.append(details);
    });
  };

  const renderAll = () => {
    renderEditor();
    renderOutput();
    renderHistory();
  };

  const note = (message) => {
    status.textContent = message;
    clearTimeout(note.timer);
    note.timer = setTimeout(() => { status.textContent = ""; }, 2600);
  };

  const copyText = async (text) => {
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

  // Events --------------------------------------------------------------------
  const commit = () => {
    save();
    renderOutput();
  };

  form.addEventListener("input", (event) => {
    const target = event.target;
    const h = cur();
    if (target.dataset.metric) {
      h.metrics[target.dataset.index][["label", "value", "note"].indexOf(target.dataset.metric)] = target.value;
    } else if (target.dataset.issue && target.type !== "checkbox") {
      h.issues[target.dataset.index][target.dataset.issue] = target.value;
    } else if (["date", "shift", "area", "from", "to", "headsUp", "safety"].includes(target.name)) {
      h[target.name] = target.value;
      if (target.name === "to") h.ackAt = "";
    } else {
      return;
    }
    commit();
  });

  form.addEventListener("change", (event) => {
    const target = event.target;
    const h = cur();
    if (target.dataset.issue === "done") {
      h.issues[target.dataset.index].done = target.checked;
      target.closest(".sh-issue").classList.toggle("is-done", target.checked);
      commit();
    } else if (target.dataset.check !== undefined) {
      h.checks[target.dataset.check] = target.checked;
      commit();
    } else if (target.dataset.issue === "priority") {
      h.issues[target.dataset.index].priority = target.value;
      commit();
    } else if (target.name === "template") {
      const next = template(target.value);
      const filled = h.metrics.some(([, value]) => value);
      if (filled && !window.confirm(`Switch the numbers and checks to ${next.name}? Values you typed in the numbers are cleared.`)) {
        target.value = h.template;
        return;
      }
      h.template = target.value;
      h.metrics = next.metrics.map((label) => [label, "", ""]);
      h.checks = next.checklist.map(() => false);
      save();
      renderAll();
    }
  });

  form.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove]");
    if (!button) return;
    const list = button.dataset.remove === "metric" ? cur().metrics : cur().issues;
    list.splice(Number(button.dataset.index), 1);
    save();
    renderEditor();
    renderOutput();
  });

  form.querySelector("[data-add-metric]").addEventListener("click", () => {
    cur().metrics.push(["", "", ""]);
    save();
    renderMetrics();
    metricsBox.lastElementChild.querySelector("input").focus();
  });

  form.querySelector("[data-add-issue]").addEventListener("click", () => {
    cur().issues.push({ text: "", priority: "Medium", owner: "", due: "", done: false, carried: 0 });
    save();
    renderIssues();
    renderOutput();
    issuesBox.lastElementChild.querySelector(".sh-issue-text").focus();
  });

  form.querySelector("[data-example]").addEventListener("click", () => {
    const ex = data.example;
    state.current = {
      ...blank(ex.template, ex.date, ex.shift),
      area: ex.area,
      from: ex.from,
      to: ex.to,
      metrics: ex.metrics.map((row) => [...row]),
      issues: ex.issues.map((issue) => ({ ...issue })),
      headsUp: ex.headsUp,
      safety: ex.safety,
      checks: [...ex.checks],
    };
    save();
    renderAll();
    output.scrollIntoView({ behavior: "smooth", block: "start" });
    output.focus({ preventScroll: true });
  });

  output.querySelector("[data-ack]").addEventListener("click", () => {
    const h = cur();
    if (!h.to.trim()) {
      note("Name who takes over first.");
      form.elements.to.focus();
      return;
    }
    h.ackAt = new Date().toISOString();
    commit();
    note(`Confirmed by ${h.to}.`);
  });

  output.querySelector("[data-copy]").addEventListener("click", async () => {
    await copyText(asText(cur()));
    note("Copied. Paste it into your team chat or email.");
  });

  output.querySelector("[data-print]").addEventListener("click", () => window.print());

  output.querySelector("[data-close]").addEventListener("click", () => {
    const h = cur();
    if (!hasContent(h)) {
      note("There is nothing to close yet.");
      return;
    }
    const open = openIssues(h);
    if (!window.confirm(`Close the ${h.shift.toLowerCase()} shift? It moves to the history, and ${open.length} open ${open.length === 1 ? "issue carries" : "issues carry"} over to the next handover.`)) return;
    state.history.unshift({ closedAt: new Date().toISOString(), handover: JSON.parse(JSON.stringify(h)), text: asText(h) });
    state.history = state.history.slice(0, HISTORY_MAX);
    const next = nextShift(h);
    state.current = {
      ...blank(h.template, next.date, next.shift),
      area: h.area,
      from: h.to,
      metrics: h.metrics.map(([label]) => [label, "", ""]),
      issues: open.map((issue) => ({ ...issue, carried: (issue.carried || 0) + 1 })),
    };
    save();
    renderAll();
    note(`Started the ${next.shift.toLowerCase()} shift handover with ${open.length} carried ${open.length === 1 ? "issue" : "issues"}.`);
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  output.querySelector("[data-clear]").addEventListener("click", () => {
    if (!window.confirm("Clear this handover? The history stays.")) return;
    state.current = blank(cur().template, cur().date, cur().shift);
    save();
    renderAll();
  });

  historyBox.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-copy-history]");
    if (!button) return;
    await copyText(state.history[Number(button.dataset.copyHistory)].text);
    button.textContent = "Copied";
    setTimeout(() => { button.textContent = "Copy as text"; }, 1600);
  });

  document.querySelector("[data-clear-history]").addEventListener("click", () => {
    if (!window.confirm("Delete all earlier handovers on this device?")) return;
    state.history = [];
    save();
    renderHistory();
  });

  if (!cur().date) cur().date = today();
  renderAll();
})();
