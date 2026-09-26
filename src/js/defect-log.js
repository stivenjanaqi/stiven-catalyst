(() => {
  // Shared by Damage Control and Incomplete Control. Each page supplies its
  // fields, wording, advice and example in #defect-log-data. The fields are
  // always shift, stage, type and cause, in that order.
  const root = document.querySelector("[data-defect-log]");
  const dataEl = document.getElementById("defect-log-data");
  if (!root || !dataEl || !window.ToolKit) return;

  const {
    read, write, isObject, str, loadState, el, int, euro, pct, plural, capital, today,
    parseNumber, parseDate, splitLine, canon, sigma, sigmaText,
    panel, stat, barList, focusCard, resultActions, flash, downloadCsv, floorCheck, LOG_LIMIT, shownNote, renderOnPause,
  } = window.ToolKit;

  const data = JSON.parse(dataEl.textContent);
  const t = data.text;
  const KEY = data.storageKey;
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
  const pasteArea = root.querySelector("#dl-paste");
  const results = document.querySelector("[data-results]");

  const state = loadState(KEY, { period: "", volume: "", target: "", rows: [] });
  state.rows = state.rows.filter(isObject).map((row) => {
    const units = Math.round(Number(row.units));
    const cost = Number(row.cost);
    return {
      date: parseDate(row.date),
      ...Object.fromEntries(fields.map((f) => [f.name, str(row[f.name]).trim() || NOT_RECORDED])),
      units: units > 0 ? units : 1,
      cost: row.cost != null && row.cost !== "" && cost >= 0 ? cost : null,
      note: str(row.note),
    };
  });
  const save = () => write(KEY, state);

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
        shift: canon(field.shift.options, shift, NOT_RECORDED),
        stage: canon(field.stage.options, stage, NOT_RECORDED),
        type: canon(field.type.options, type, NOT_RECORDED),
        cause: canon(field.cause.options, cause, NOT_RECORDED),
        units: Math.round(count),
        cost: value >= 0 ? value : null,
        note: note.join(", ").trim(),
      });
    });
    return { added, skipped };
  };

  // Tallies: item.value is the count of units (or orders) behind each name.
  const tally = (rows, name) => {
    const map = new Map();
    rows.forEach((row) => {
      const key = row[name] || NOT_RECORDED;
      const item = map.get(key) || { key, value: 0, entries: 0 };
      item.value += row.units;
      item.entries += 1;
      map.set(key, item);
    });
    return map;
  };
  // Known options in process order, then any other names by size.
  const inOrder = (map, name) => {
    const known = field[name].options.filter((option) => map.has(option)).map((option) => map.get(option));
    const rest = [...map.values()].filter((item) => !field[name].options.includes(item.key)).sort((a, b) => b.value - a.value);
    return [...known, ...rest];
  };
  const bySize = (map) => [...map.values()].sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));

  const analyse = () => {
    const rows = state.rows;
    const total = rows.reduce((sum, row) => sum + row.units, 0);
    const costed = rows.filter((row) => row.cost != null);
    const cost = costed.reduce((sum, row) => sum + row.cost, 0);
    const volume = parseNumber(state.volume);
    const target = parseNumber(state.target) / 100;
    const hasVolume = volume > 0 && total <= volume;
    const rate = hasVolume ? total / volume : null;

    const causes = bySize(tally(rows, "cause"));
    let running = 0;
    causes.forEach((item) => {
      item.share = item.value / total;
      item.vital = running < 0.8;
      running += item.share;
      item.cumulative = running;
    });

    const topStage = bySize(tally(rows, "stage"))[0];
    const topStageCause = bySize(tally(rows.filter((row) => row.stage === topStage.key), "cause"))[0];
    const unknown = rows.filter((row) => row.cause === "Unknown" || row.cause === NOT_RECORDED).reduce((sum, row) => sum + row.units, 0);

    return {
      rows,
      total,
      cost: costed.length ? cost : null,
      volume: hasVolume ? volume : null,
      volumeTooLow: volume > 0 && total > volume,
      rate,
      dpmo: rate === null ? null : rate * 1e6,
      target: hasVolume && target > 0 ? target : null,
      causes,
      stages: inOrder(tally(rows, "stage"), "stage"),
      shifts: inOrder(tally(rows, "shift"), "shift"),
      types: inOrder(tally(rows, "type"), "type"),
      topStage,
      topStageCause,
      unknownShare: unknown / total,
      days: new Set(rows.map((row) => row.date).filter(Boolean)).size,
    };
  };

  // The log table.
  const renderLog = () => {
    const rows = state.rows;
    logBody.replaceChildren();
    rows.map((row, index) => [row, index]).reverse().slice(0, LOG_LIMIT).forEach(([row, index]) => {
      const tr = el("tr");
      tr.append(el("td", "nowrap", row.date || "-"));
      fields.forEach((f) => tr.append(el("td", null, row[f.name])));
      tr.append(el("td", "num", int.format(row.units)));
      tr.append(el("td", "num", row.cost == null ? "" : row.cost.toFixed(2)));
      tr.append(el("td", "dl-note", row.note || ""));
      const cell = el("td");
      const remove = el("button", "dl-remove", "×");
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
    logCount.textContent = rows.length ? `${plural(rows.length, "entry", "entries")} · ${plural(units, t.one, t.many)}${shownNote(rows.length)}` : "";
  };

  // Results.
  const bars = (items, total, options = {}) => barList(items, {
    ...options,
    title: (item) => `${item.key}: ${plural(item.value, t.one, t.many)} in ${plural(item.entries, "entry", "entries")}, ${pct(item.value / total)} of all ${t.allNoun}`,
    label: (item) => [int.format(item.value), ` · ${pct(item.value / total, 0)}${options.cumulative ? ` · ${pct(item.cumulative, 0)} cum.` : ""}`],
  });

  const matrix = (result) => {
    const wrap = el("div", "dl-table-wrap");
    const table = el("table", "dl-table dl-matrix");
    const head = el("tr");
    head.append(el("th", null, `${fields[1].label} \\ ${fields[2].label.toLowerCase()}`));
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
          // One hue, stronger with a higher count; the number is always shown.
          td.style.setProperty("--heat", `${Math.round(12 + (value / max) * 58)}%`);
          td.classList.add("is-heat");
          if (value === max) td.classList.add("is-max");
          td.title = `${stage.key} · ${type.key}: ${plural(value, t.one, t.many)}`;
        }
        tr.append(td);
      });
      tbody.append(tr);
    });
    table.append(thead, tbody);
    wrap.append(table);
    return wrap;
  };

  const targetText = (result) => {
    if (!result.target) return null;
    const allowed = Math.floor(result.target * result.volume);
    const gap = result.total - allowed;
    return gap > 0
      ? { value: `${int.format(gap)} over`, note: `${int.format(gap)} fewer ${t.many} reach ${pct(result.target, 2)}` }
      : { value: "On target", note: `${int.format(-gap)} ${t.volumeNoun} inside ${pct(result.target, 2)}` };
  };

  const problemText = (result) => {
    const stage = result.topStage;
    const when = state.period ? `${state.period}: ` : "";
    const why = result.topStageCause ? `, mostly ${result.topStageCause.key.toLowerCase()}` : "";
    return `${when}${plural(stage.value, t.one, t.many)} ${t.stagePhrase} ${stage.key} (${pct(stage.value / result.total, 0)} of all ${t.allNoun})${why}.`;
  };

  let checkSummary = () => "";

  const summaryText = (result) => {
    const lines = [`${t.tool} | Stiven Catalyst`];
    if (state.period) lines.push(`Period: ${state.period}`);
    lines.push("", `${capital(t.many)}: ${int.format(result.total)} in ${plural(result.rows.length, "entry", "entries")}`);
    if (result.volume) {
      lines.push(`${t.volumeLabel}: ${int.format(result.volume)}`);
      lines.push(`${t.rateLabel}: ${pct(result.rate, 2)} · DPMO: ${int.format(Math.round(result.dpmo))} · Sigma level: ${sigma(result.rate).toFixed(2)}`);
      if (t.complement) lines.push(`${t.complement.label}: ${pct(1 - result.rate, 2)}`);
    }
    const target = targetText(result);
    if (target) lines.push(`Target ${pct(result.target, 2)}: ${target.note}`);
    if (result.cost != null) lines.push(`Recorded cost: ${euro.format(result.cost)}`);
    lines.push("", "Pareto of causes:");
    result.causes.forEach((item) => lines.push(`- ${item.key}: ${item.value} (${pct(item.share, 0)}, cum. ${pct(item.cumulative, 0)})${item.vital ? " [vital few]" : ""}`));
    lines.push("", `${t.stageTitle}:`);
    result.stages.forEach((item) => lines.push(`- ${item.key}: ${item.value} (${pct(item.value / result.total, 0)})`));
    lines.push("", "By shift:");
    result.shifts.forEach((item) => lines.push(`- ${item.key}: ${item.value} (${pct(item.value / result.total, 0)})`));
    lines.push("", `Start here: ${problemText(result)}`);
    const advice = data.stages[result.topStage.key];
    if (advice) {
      lines.push("First moves:");
      advice.moves.forEach((move) => lines.push(`- ${move}`));
      lines.push(`Question for the floor: ${advice.question}`);
    }
    const check = checkSummary();
    if (check) lines.push("", check);
    return lines.join("\n");
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
      title.append(`${t.rateLabel} `, el("span", null, pct(result.rate, 2)));
    } else {
      title.append(el("span", null, int.format(result.total)), ` ${result.total === 1 ? t.one : t.many}`);
    }
    head.append(title);
    results.append(head);

    const stats = el("div", "dl-stats");
    stats.append(stat(capital(t.many), int.format(result.total), `${plural(result.rows.length, "entry", "entries")}${result.days ? ` over ${plural(result.days, "day")}` : ""}`));
    if (result.volume) {
      if (t.complement) stats.append(stat(t.complement.label, pct(1 - result.rate, 2), t.complement.note));
      stats.append(stat("DPMO", int.format(Math.round(result.dpmo)), `${t.many} per million ${t.volumeNoun}`));
      stats.append(stat("Sigma level", sigmaText(result.rate), "short term, with 1.5 shift"));
      const target = targetText(result);
      if (target) stats.append(stat("Target", target.value, target.note));
    }
    if (result.cost != null) stats.append(stat("Recorded cost", euro.format(result.cost), "only entries with a cost"));
    results.append(stats);

    if (result.volumeTooLow) {
      results.append(el("p", "dl-warning", `The log holds more ${t.many} than ${t.volumeLabel.toLowerCase()}. Check the volume to see the rate, DPMO and sigma level.`));
    } else if (!result.volume) {
      results.append(el("p", "dl-warning", `Add the ${t.volumeLabel.toLowerCase()} in this period to see the ${t.rateLabel.toLowerCase()}, DPMO and sigma level.`));
    }

    const grid = el("div", "dl-result-grid");

    const vital = result.causes.filter((item) => item.vital);
    const pareto = panel("Pareto of causes", `${vital.length} of ${result.causes.length} causes carry ${pct(vital.at(-1).cumulative, 0)} of the ${t.allNoun}. Fix these first.`);
    pareto.append(bars(result.causes, result.total, { ranked: true, cumulative: true, highlight: (item) => item.vital, tag: "Vital few" }));
    grid.append(pareto);

    const flow = panel(t.stageTitle, t.stageNote);
    flow.append(bars(result.stages, result.total, { highlight: (item) => item.key === result.topStage.key, tag: "Most" }));
    grid.append(flow);

    const types = panel(t.matrixTitle, `Each cell counts ${t.many}. The darkest cell is the most specific place to look.`);
    types.append(matrix(result));
    grid.append(types);

    const shifts = panel("By shift", `Counts only. A shift that handles more volume will log more ${t.allNoun}, so compare with its share of the work.`);
    shifts.append(bars(result.shifts, result.total));
    grid.append(shifts);

    results.append(grid);

    // Where to start: the stage with the highest count, and its main cause.
    const cause = result.topStageCause;
    results.append(focusCard({
      title: result.topStage.key,
      detail: cause?.key,
      lede: problemText(result),
      advice: data.stages[result.topStage.key],
      extraLabel: cause ? `About ${cause.key.toLowerCase()}` : "",
      extra: cause && cause.key !== "Unknown" ? data.causes[cause.key] : "",
      warning: result.unknownShare > 0.15 ? `${pct(result.unknownShare, 0)} of ${t.many} have no known cause. ${data.causes.Unknown}` : "",
    }));

    results.append(resultActions(() => summaryText(result), problemText(result)));
  };

  const render = () => {
    renderLog();
    renderResults();
  };

  // Period settings.
  const renderSetting = renderOnPause(renderResults, () => state.rows.length);
  root.querySelectorAll("[data-setting]").forEach((input) => {
    input.value = state[input.name] ?? "";
    input.addEventListener("input", () => {
      state[input.name] = input.value;
      save();
      renderSetting();
    });
  });

  // Log an entry.
  entry.elements.date.value = today();
  entry.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = entry.elements;
    const units = Math.round(parseNumber(form.units.value));
    if (!(units > 0)) {
      form.units.focus();
      flash(entryStatus, `Enter at least one ${t.one}.`);
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
    // Keep date, shift and stage: the next entry is usually from the same place.
    form.units.value = 1;
    form.cost.value = "";
    form.note.value = "";
    flash(entryStatus, `Added ${plural(units, t.one, t.many)} at ${form.stage.value}.`);
    form.type.focus();
  });

  root.querySelector("[data-import]").addEventListener("click", () => {
    const { added, skipped } = importRows(pasteArea.value);
    if (!added.length) {
      flash(importStatus, `No rows found. Check that ${t.countShort} are in the sixth column.`);
      return;
    }
    state.rows.push(...added);
    save();
    render();
    pasteArea.value = "";
    flash(importStatus, `Imported ${plural(added.length, "row")}${skipped ? `, skipped ${skipped} without ${t.countShort}` : ""}.`);
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
    if (!state.rows.length || !window.confirm(`Clear the whole ${t.tool} log?`)) return;
    state.rows = [];
    save();
    render();
  });

  root.querySelector("[data-csv]").addEventListener("click", () => {
    if (!state.rows.length) return;
    downloadCsv(t.csv, [
      ["Date", ...fields.map((f) => f.label), capital(t.countShort), "Cost", "Note"],
      ...state.rows.map((row) => [row.date, ...fields.map((f) => row[f.name]), row.units, row.cost ?? "", row.note]),
    ]);
  });

  checkSummary = floorCheck(document.querySelector("[data-floor-check]"), `${KEY}-check`);
  render();
})();
