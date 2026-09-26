(() => {
  const root = document.querySelector("[data-damage-control]");
  const dataEl = document.getElementById("damage-control-data");
  if (!root || !dataEl) return;

  const data = JSON.parse(dataEl.textContent);
  const KEY = data.storageKey;
  const CHECK_KEY = `${KEY}-check`;
  const NOT_RECORDED = "Not recorded";
  const fields = data.fields;
  const field = Object.fromEntries(fields.map((f) => [f.name, f]));

  const entry = root.querySelector("[data-entry]");
  const logBody = root.querySelector("[data-log]");
  const logWrap = root.querySelector("[data-log-wrap]");
  const logEmpty = root.querySelector("[data-log-empty]");
  const logCount = root.querySelector("[data-log-count]");
  const entryStatus = root.querySelector("[data-entry-status]");
  const importStatus = root.querySelector("[data-import-status]");
  const pasteArea = root.querySelector("#dc-paste");
  const results = document.querySelector("[data-results]");
  const checkSection = document.querySelector("[data-floor-check]");
  const checkboxes = [...checkSection.querySelectorAll("input[type=checkbox]")];
  const checkScore = checkSection.querySelector("[data-check-score]");

  // Storage (the page works without it, for example in a private window).
  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  };
  const write = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  };

  const state = { period: "", volume: "", target: "", rows: [], ...read(KEY, {}) };
  if (!Array.isArray(state.rows)) state.rows = [];
  const save = () => write(KEY, state);

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const int = new Intl.NumberFormat("en-GB");
  const euro = new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" });
  const pct = (value, digits = 1) => `${(value * 100).toFixed(digits)}%`;
  const plural = (count, word, many = `${word}s`) => `${int.format(count)} ${count === 1 ? word : many}`;

  // Parsing, for the form and for rows pasted from a spreadsheet.
  const parseNumber = (value) => {
    let text = String(value ?? "").replace(/[\s€]/g, "");
    if (!text) return NaN;
    const comma = text.lastIndexOf(",");
    const dot = text.lastIndexOf(".");
    // The later separator is the decimal one: 1.234,50 and 1,234.50 both work.
    text = comma > dot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
    return Number(text);
  };

  const parseDate = (value) => {
    const text = String(value ?? "").trim();
    let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) return iso(match[1], match[2], match[3]);
    match = text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
    if (match) return iso(match[3].length === 2 ? `20${match[3]}` : match[3], match[2], match[1]);
    // Excel sometimes pastes dates as serial numbers.
    if (/^\d{5}$/.test(text)) return new Date(Date.UTC(1899, 11, 30) + Number(text) * 864e5).toISOString().slice(0, 10);
    return "";
  };
  function iso(year, month, day) {
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(day) ? "" : date.toISOString().slice(0, 10);
  }

  // Map a typed value onto a known option; unknown names are kept as they are.
  const canon = (name, value) => {
    const text = String(value ?? "").trim();
    if (!text) return NOT_RECORDED;
    const lower = text.toLowerCase();
    const options = field[name].options;
    return options.find((option) => option.toLowerCase() === lower)
      || (lower.length >= 3 && options.find((option) => option.toLowerCase().startsWith(lower)))
      || text;
  };

  const splitLine = (line) => {
    const separator = line.includes("\t") ? "\t" : line.includes(";") ? ";" : ",";
    return line.split(separator).map((cell) => cell.trim().replace(/^"(.*)"$/, "$1"));
  };

  const importRows = (text) => {
    const added = [];
    let skipped = 0;
    text.split(/\r?\n/).filter((line) => line.trim()).forEach((line, index) => {
      const [date, shift, stage, type, cause, units, cost, ...note] = splitLine(line);
      const count = units ? parseNumber(units) : 1;
      if (!(count > 0)) {
        // A first row with words where numbers belong is a header.
        if (index > 0) skipped++;
        return;
      }
      const value = parseNumber(cost);
      added.push({
        date: parseDate(date),
        shift: canon("shift", shift),
        stage: canon("stage", stage),
        type: canon("type", type),
        cause: canon("cause", cause),
        units: Math.round(count),
        cost: value >= 0 ? value : null,
        note: note.join(", ").trim(),
      });
    });
    return { added, skipped };
  };

  // Tallies.
  const tally = (rows, name) => {
    const map = new Map();
    rows.forEach((row) => {
      const key = row[name] || NOT_RECORDED;
      const item = map.get(key) || { key, units: 0, count: 0 };
      item.units += row.units;
      item.count += 1;
      map.set(key, item);
    });
    return map;
  };
  // Known options in process order, then any other names by size.
  const inOrder = (map, name) => {
    const known = field[name].options.filter((option) => map.has(option)).map((option) => map.get(option));
    const rest = [...map.values()].filter((item) => !field[name].options.includes(item.key)).sort((a, b) => b.units - a.units);
    return [...known, ...rest];
  };
  const bySize = (map) => [...map.values()].sort((a, b) => b.units - a.units || a.key.localeCompare(b.key));

  // Inverse of the standard normal distribution (Acklam), for the sigma level.
  const normInv = (p) => {
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    const tail = (q) => (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    if (p < 0.02425) return tail(Math.sqrt(-2 * Math.log(p)));
    if (p > 1 - 0.02425) return -tail(Math.sqrt(-2 * Math.log(1 - p)));
    const q = p - 0.5;
    const r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  };

  const analyse = () => {
    const rows = state.rows;
    const damaged = rows.reduce((sum, row) => sum + row.units, 0);
    const costed = rows.filter((row) => row.cost != null);
    const cost = costed.reduce((sum, row) => sum + row.cost, 0);
    const volume = parseNumber(state.volume);
    const target = parseNumber(state.target) / 100;
    const hasVolume = volume > 0 && damaged <= volume;
    const rate = hasVolume ? damaged / volume : null;

    const causes = bySize(tally(rows, "cause"));
    let running = 0;
    causes.forEach((item) => {
      item.share = item.units / damaged;
      item.vital = running < 0.8;
      running += item.share;
      item.cumulative = running;
    });

    const stages = inOrder(tally(rows, "stage"), "stage");
    const topStage = bySize(tally(rows, "stage"))[0];
    const topStageRows = rows.filter((row) => row.stage === topStage.key);
    const topStageCause = bySize(tally(topStageRows, "cause"))[0];
    const unknown = rows.filter((row) => row.cause === "Unknown" || row.cause === NOT_RECORDED).reduce((sum, row) => sum + row.units, 0);

    return {
      rows,
      damaged,
      cost: costed.length ? cost : null,
      volume: hasVolume ? volume : null,
      volumeTooLow: volume > 0 && damaged > volume,
      rate,
      dpmo: rate === null ? null : rate * 1e6,
      sigma: rate === null ? null : rate === 0 ? 6 : normInv(1 - rate) + 1.5,
      target: hasVolume && target > 0 ? target : null,
      causes,
      stages,
      shifts: inOrder(tally(rows, "shift"), "shift"),
      types: inOrder(tally(rows, "type"), "type"),
      topStage,
      topStageCause,
      unknownShare: unknown / damaged,
      days: new Set(rows.map((row) => row.date).filter(Boolean)).size,
    };
  };

  // The log table.
  const renderLog = () => {
    const rows = state.rows;
    logBody.replaceChildren();
    rows.map((row, index) => [row, index]).reverse().forEach(([row, index]) => {
      const tr = el("tr");
      tr.append(el("td", "nowrap", row.date || "-"));
      fields.forEach((f) => tr.append(el("td", null, row[f.name])));
      tr.append(el("td", "num", int.format(row.units)));
      tr.append(el("td", "num", row.cost == null ? "" : row.cost.toFixed(2)));
      tr.append(el("td", "dc-note", row.note || ""));
      const cell = el("td");
      const remove = el("button", "dc-remove", "×");
      remove.type = "button";
      remove.dataset.remove = index;
      remove.setAttribute("aria-label", `Remove ${row.units} ${row.type} at ${row.stage}${row.date ? ` on ${row.date}` : ""}`);
      cell.append(remove);
      tr.append(cell);
      logBody.append(tr);
    });
    logWrap.hidden = !rows.length;
    logEmpty.hidden = rows.length > 0;
    const units = rows.reduce((sum, row) => sum + row.units, 0);
    logCount.textContent = rows.length ? `${plural(rows.length, "entry", "entries")} · ${plural(units, "unit")}` : "";
  };

  // Results.
  const barList = (items, total, options = {}) => {
    const list = el("div", "dc-bars");
    const max = Math.max(...items.map((item) => item.units));
    items.forEach((item, index) => {
      const row = el("div", "dc-bar");
      const highlight = options.highlight ? options.highlight(item) : false;
      if (highlight) row.classList.add("is-top");
      row.title = `${item.key}: ${plural(item.units, "unit")} in ${plural(item.count, "entry", "entries")}, ${pct(item.units / total)} of all damage`;
      const label = el("div", "dc-bar-label");
      const name = el("span", "dc-bar-name");
      if (options.ranked) name.append(el("span", "dc-rank", String(index + 1)));
      name.append(item.key);
      if (highlight && options.tag) name.append(el("span", "dc-tag", options.tag));
      label.append(name);
      const value = el("span", "dc-bar-value");
      value.append(el("strong", null, int.format(item.units)), ` · ${pct(item.units / total, 0)}`);
      if (options.cumulative) value.append(el("span", "dc-cum", ` · ${pct(item.cumulative, 0)} cum.`));
      label.append(value);
      const track = el("div", "bar-track");
      const fill = el("div", "bar-fill");
      fill.style.width = `${(item.units / max) * 100}%`;
      track.append(fill);
      row.append(label, track);
      list.append(row);
    });
    return list;
  };

  const panel = (title, note) => {
    const box = el("article", "dc-panel");
    box.append(el("h3", "result-label", title));
    if (note) box.append(el("p", "dc-panel-note", note));
    return box;
  };

  const matrix = (result) => {
    const wrap = el("div", "dc-table-wrap");
    const table = el("table", "dc-table dc-matrix");
    const head = el("tr");
    head.append(el("th", null, "Stage \\ type"));
    result.types.forEach((type) => {
      const th = el("th", "num", type.key);
      th.scope = "col";
      head.append(th);
    });
    const thead = el("thead");
    thead.append(head);
    const tbody = el("tbody");
    const cells = new Map();
    result.rows.forEach((row) => {
      const key = `${row.stage}\u0000${row.type}`;
      cells.set(key, (cells.get(key) || 0) + row.units);
    });
    const max = Math.max(...cells.values());
    result.stages.forEach((stage) => {
      const tr = el("tr");
      const th = el("th", null, stage.key);
      th.scope = "row";
      tr.append(th);
      result.types.forEach((type) => {
        const value = cells.get(`${stage.key}\u0000${type.key}`) || 0;
        const td = el("td", "num", value ? int.format(value) : "");
        if (value) {
          // One hue, stronger with more damage; the number is always shown.
          td.style.setProperty("--heat", `${Math.round(12 + (value / max) * 58)}%`);
          td.classList.add("is-heat");
          if (value === max) td.classList.add("is-max");
          td.title = `${stage.key} · ${type.key}: ${plural(value, "unit")}`;
        }
        tr.append(td);
      });
      tbody.append(tr);
    });
    table.append(thead, tbody);
    wrap.append(table);
    return wrap;
  };

  const stat = (label, value, note) => {
    const box = el("div", "dc-stat");
    box.append(el("span", "dc-stat-label", label), el("strong", "dc-stat-value", value));
    if (note) box.append(el("span", "dc-stat-note", note));
    return box;
  };

  const targetText = (result) => {
    if (!result.target) return null;
    const allowed = Math.floor(result.target * result.volume);
    const gap = result.damaged - allowed;
    return gap > 0
      ? { value: `${int.format(gap)} over`, note: `${int.format(gap)} fewer damaged units reach ${pct(result.target, 2)}` }
      : { value: "On target", note: `${int.format(-gap)} units inside ${pct(result.target, 2)}` };
  };

  const problemText = (result) => {
    const stage = result.topStage;
    const when = state.period ? `${state.period}: ` : "";
    const why = result.topStageCause ? `, mostly ${result.topStageCause.key.toLowerCase()}` : "";
    return `${when}${plural(stage.units, "damaged unit")} found at ${stage.key} (${pct(stage.units / result.damaged, 0)} of all damage)${why}.`;
  };

  const summaryText = (result) => {
    const lines = ["Damage Control | Stiven Catalyst"];
    if (state.period) lines.push(`Period: ${state.period}`);
    lines.push("", `Damaged units: ${int.format(result.damaged)} in ${plural(result.rows.length, "entry", "entries")}`);
    if (result.volume) {
      lines.push(`Units handled: ${int.format(result.volume)}`);
      lines.push(`Damage rate: ${pct(result.rate, 2)} · DPMO: ${int.format(Math.round(result.dpmo))} · Sigma level: ${result.sigma.toFixed(2)}`);
    }
    const target = targetText(result);
    if (target) lines.push(`Target ${pct(result.target, 2)}: ${target.note}`);
    if (result.cost != null) lines.push(`Recorded cost: ${euro.format(result.cost)}`);
    lines.push("", "Pareto of causes:");
    result.causes.forEach((item) => lines.push(`- ${item.key}: ${item.units} (${pct(item.share, 0)}, cum. ${pct(item.cumulative, 0)})${item.vital ? " [vital few]" : ""}`));
    lines.push("", "Where it was found:");
    result.stages.forEach((item) => lines.push(`- ${item.key}: ${item.units} (${pct(item.units / result.damaged, 0)})`));
    lines.push("", "By shift:");
    result.shifts.forEach((item) => lines.push(`- ${item.key}: ${item.units} (${pct(item.units / result.damaged, 0)})`));
    lines.push("", `Start here: ${problemText(result)}`);
    const advice = data.stages[result.topStage.key];
    if (advice) {
      lines.push("First moves:");
      advice.moves.forEach((move) => lines.push(`- ${move}`));
      lines.push(`Question for the floor: ${advice.question}`);
    }
    const ticked = checkboxes.filter((box) => box.checked).length;
    if (ticked) lines.push("", `Floor check: ${ticked} of ${checkboxes.length} standards in place`);
    return lines.join("\n");
  };

  const copy = async (text, button) => {
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
    const label = button.textContent;
    button.textContent = "Copied";
    setTimeout(() => { button.textContent = label; }, 1600);
  };

  const renderResults = () => {
    results.replaceChildren();
    results.hidden = !state.rows.length;
    if (!state.rows.length) return;
    const result = analyse();

    const head = el("div", "result-head");
    head.append(el("p", "kicker", state.period ? `Result · ${state.period}` : "Result"));
    const title = el("h2");
    if (result.rate !== null) {
      title.append("Damage rate ", el("span", null, pct(result.rate, 2)));
    } else {
      title.append(el("span", null, int.format(result.damaged)), ` damaged ${result.damaged === 1 ? "unit" : "units"}`);
    }
    head.append(title);
    results.append(head);

    const stats = el("div", "dc-stats");
    stats.append(stat("Damaged units", int.format(result.damaged), `${plural(result.rows.length, "entry", "entries")}${result.days ? ` over ${plural(result.days, "day")}` : ""}`));
    if (result.volume) {
      stats.append(stat("DPMO", int.format(Math.round(result.dpmo)), "damaged per million units"));
      stats.append(stat("Sigma level", result.rate === 0 ? "6+" : result.sigma.toFixed(2), "short term, with 1.5 shift"));
      const target = targetText(result);
      if (target) stats.append(stat("Target", target.value, target.note));
    }
    if (result.cost != null) stats.append(stat("Recorded cost", euro.format(result.cost), "only entries with a cost"));
    results.append(stats);

    if (result.volumeTooLow) {
      results.append(el("p", "dc-warning", "More units are logged as damaged than units handled. Check the volume to see the rate, DPMO and sigma level."));
    } else if (!result.volume) {
      results.append(el("p", "dc-warning", "Add the units handled in this period to see the damage rate, DPMO and sigma level."));
    }

    const grid = el("div", "dc-result-grid");

    const vital = result.causes.filter((item) => item.vital);
    const vitalShare = vital.at(-1).cumulative;
    const pareto = panel("Pareto of causes", `${vital.length} of ${result.causes.length} causes carry ${pct(vitalShare, 0)} of the damage. Fix these first.`);
    pareto.append(barList(result.causes, result.damaged, { ranked: true, cumulative: true, highlight: (item) => item.vital, tag: "Vital few" }));
    grid.append(pareto);

    const flow = panel("Where it is found", "In process order, from the dock door to the customer.");
    flow.append(barList(result.stages, result.damaged, { highlight: (item) => item.key === result.topStage.key, tag: "Most" }));
    grid.append(flow);

    const types = panel("Stage and damage type", "Each cell counts damaged units. The darkest cell is the most specific place to look.");
    types.append(matrix(result));
    grid.append(types);

    const shifts = panel("By shift", "Counts only. A shift that handles more volume will log more damage, so compare with its share of the work.");
    shifts.append(barList(result.shifts, result.damaged));
    grid.append(shifts);

    results.append(grid);

    // Where to start: the stage with most damage, and its main cause.
    const focus = el("article", "result-card dc-focus");
    focus.append(el("p", "result-label", "Start here"));
    const focusTitle = el("h3");
    focusTitle.append(result.topStage.key);
    if (result.topStageCause) focusTitle.append(el("span", null, ` · ${result.topStageCause.key}`));
    focus.append(focusTitle);
    focus.append(el("p", "dc-focus-lede", problemText(result)));
    const advice = data.stages[result.topStage.key];
    if (advice) {
      focus.append(el("p", null, advice.meaning));
      focus.append(el("p", "result-label", "First moves"));
      const moves = el("ol", "moves");
      advice.moves.forEach((move) => moves.append(el("li", null, move)));
      focus.append(moves);
    }
    const causeAdvice = result.topStageCause && data.causes[result.topStageCause.key];
    if (causeAdvice && result.topStageCause.key !== "Unknown") {
      focus.append(el("p", "result-label", `About ${result.topStageCause.key.toLowerCase()}`));
      focus.append(el("p", null, causeAdvice));
    }
    if (advice) {
      focus.append(el("p", "result-label", "Question for the floor"));
      focus.append(el("blockquote", null, advice.question));
    }
    if (result.unknownShare > 0.15) {
      focus.append(el("p", "dc-warning", `${pct(result.unknownShare, 0)} of damaged units have no known cause. ${data.causes.Unknown}`));
    }
    results.append(focus);

    const actions = el("div", "tool-actions result-actions");
    const copyButton = el("button", "button-primary", "Copy summary");
    copyButton.type = "button";
    copyButton.addEventListener("click", () => copy(summaryText(result), copyButton));
    const printButton = el("button", "button-secondary", "Print or save as PDF");
    printButton.type = "button";
    printButton.addEventListener("click", () => window.print());
    const whys = el("a", "button-secondary", "Take it to 5 Whys");
    const url = new URL(document.querySelector('.tool-aside a[href*="five-whys"]').href);
    url.searchParams.set("problem", problemText(result));
    whys.href = url.href;
    actions.append(copyButton, printButton, whys);
    results.append(actions);
  };

  const render = () => {
    renderLog();
    renderResults();
  };

  const flash = (node, message) => {
    node.textContent = message;
    clearTimeout(node.timer);
    node.timer = setTimeout(() => { node.textContent = ""; }, 2600);
  };

  // Period settings.
  root.querySelectorAll("[data-setting]").forEach((input) => {
    input.value = state[input.name] ?? "";
    input.addEventListener("input", () => {
      state[input.name] = input.value;
      save();
      renderResults();
    });
  });

  // Log a damage.
  entry.elements.date.value = new Date().toISOString().slice(0, 10);
  entry.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = entry.elements;
    const units = Math.round(parseNumber(form.units.value));
    if (!(units > 0)) {
      form.units.focus();
      flash(entryStatus, "Enter at least one damaged unit.");
      return;
    }
    const cost = parseNumber(form.cost.value);
    state.rows.push({
      date: form.date.value,
      ...Object.fromEntries(fields.map((f) => [f.name, form[f.name].value])),
      units,
      cost: cost >= 0 ? cost : null,
      note: form.note.value.trim(),
    });
    save();
    render();
    // Keep date, shift and stage: the next damage is usually from the same place.
    form.units.value = 1;
    form.cost.value = "";
    form.note.value = "";
    flash(entryStatus, `Added ${plural(units, "unit")} at ${form.stage.value}.`);
    form.type.focus();
  });

  root.querySelector("[data-import]").addEventListener("click", () => {
    const { added, skipped } = importRows(pasteArea.value);
    if (!added.length) {
      flash(importStatus, "No rows found. Check that units are in the sixth column.");
      return;
    }
    state.rows.push(...added);
    save();
    render();
    pasteArea.value = "";
    flash(importStatus, `Imported ${plural(added.length, "row")}${skipped ? `, skipped ${skipped} without units` : ""}.`);
  });

  logBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove]");
    if (!button) return;
    state.rows.splice(Number(button.dataset.remove), 1);
    save();
    render();
    (logBody.querySelector("[data-remove]") || entry.elements.date).focus();
  });

  root.querySelector("[data-example]").addEventListener("click", () => {
    const example = data.example;
    state.period = example.period;
    state.volume = String(example.volume);
    state.target = String(example.target);
    state.rows = importRows(example.rows.map((row) => row.replace(/\|/g, "\t")).join("\n")).added;
    root.querySelectorAll("[data-setting]").forEach((input) => { input.value = state[input.name]; });
    save();
    render();
    results.scrollIntoView({ behavior: "smooth", block: "start" });
    results.focus({ preventScroll: true });
  });

  root.querySelector("[data-clear]").addEventListener("click", () => {
    if (!state.rows.length || !window.confirm("Clear the whole damage log?")) return;
    state.rows = [];
    save();
    render();
  });

  root.querySelector("[data-csv]").addEventListener("click", () => {
    if (!state.rows.length) return;
    const quote = (value) => {
      const text = String(value ?? "");
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const header = ["Date", ...fields.map((f) => f.label), "Units", "Cost", "Note"];
    const lines = [header, ...state.rows.map((row) => [row.date, ...fields.map((f) => row[f.name]), row.units, row.cost ?? "", row.note])]
      .map((cells) => cells.map(quote).join(","));
    const blob = new Blob([`﻿${lines.join("\r\n")}\r\n`], { type: "text/csv;charset=utf-8" });
    const link = el("a");
    link.href = URL.createObjectURL(blob);
    link.download = `damage-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });

  // Floor check.
  const renderCheck = () => {
    const ticked = checkboxes.filter((box) => box.checked).length;
    const total = checkboxes.length;
    const verdict = ticked === total ? "The standard holds today."
      : ticked >= total - 2 ? "Close. Fix the open lines this shift."
      : ticked >= total / 2 ? "Gaps in the standard. Expect damage where lines are open."
      : "Not yet a standard. Start with the first three lines.";
    checkScore.replaceChildren(el("strong", null, `${ticked} of ${total}`), ` in place. ${verdict}`);
  };
  const saved = read(CHECK_KEY, []);
  checkboxes.forEach((box, index) => {
    box.checked = Boolean(saved[index]);
    box.addEventListener("change", () => {
      write(CHECK_KEY, checkboxes.map((item) => item.checked));
      renderCheck();
    });
  });
  checkSection.querySelector("[data-check-reset]").addEventListener("click", () => {
    checkboxes.forEach((box) => { box.checked = false; });
    write(CHECK_KEY, []);
    renderCheck();
  });

  renderCheck();
  render();
})();
