(() => {
  const dataEl = document.getElementById("sigma-chart-data");
  if (!dataEl || !window.ToolKit) return;

  const {
    read, write, isObject, str, loadState, el, int, pct, plural, today,
    parseNumber, parseDate, splitLine, sigma, sigmaText,
    panel, stat, resultActions, flash, downloadCsv, LOG_LIMIT, shownNote, renderOnPause,
  } = window.ToolKit;

  const data = JSON.parse(dataEl.textContent);
  const SVG = "http://www.w3.org/2000/svg";
  const svg = (tag, attrs = {}) => {
    const node = document.createElementNS(SVG, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  };
  const shortDate = (iso) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "-");
  const rate = (value, digits = 2) => `${(value * 100).toFixed(digits)}%`;

  // 1 · Calculator ----------------------------------------------------------
  const calcSigma = document.querySelector("[data-calc-sigma]");
  const calcPerfect = document.querySelector("[data-calc-perfect]");
  const sigmaOut = document.querySelector("[data-sigma-out]");
  const perfectOut = document.querySelector("[data-perfect-out]");
  const sigmaTable = document.querySelector("[data-sigma-table]");
  const CALC_KEY = `${data.storageKey}-calc`;
  const savedCalc = read(CALC_KEY, {});
  const calcState = isObject(savedCalc) ? savedCalc : {};

  const hint = (text) => el("p", "form-note sc-hint", text);

  const renderTable = (current) => {
    sigmaTable.replaceChildren();
    // Mark the highest level the current process reaches.
    const reached = current == null ? null : [...data.sigmaTable].reverse().find((row) => row.sigma <= current + 1e-9);
    data.sigmaTable.forEach((row) => {
      const tr = el("tr");
      if (row === reached) tr.classList.add("is-current");
      const level = el("th", null, row.sigma.toFixed(1));
      level.scope = "row";
      if (row === reached) level.append(el("span", "dl-tag", "You"));
      tr.append(level);
      tr.append(el("td", "num", row.dpmo < 10 ? String(row.dpmo) : int.format(row.dpmo)));
      tr.append(el("td", "num", `${(100 - row.dpmo / 1e4).toFixed(row.dpmo < 100 ? 4 : 2)}%`));
      tr.append(el("td", "num", (row.dpmo / 1000).toFixed(row.dpmo < 1000 ? 3 : 1)));
      sigmaTable.append(tr);
    });
  };

  const renderSigma = () => {
    const units = parseNumber(calcSigma.elements.units.value);
    const defects = parseNumber(calcSigma.elements.defects.value);
    const opportunities = Math.max(1, Math.round(parseNumber(calcSigma.elements.opportunities.value)) || 1);
    sigmaOut.replaceChildren();
    if (!(units > 0) || !(defects >= 0)) {
      sigmaOut.append(hint("Enter units and defects to see the sigma level."));
      renderTable(null);
      return null;
    }
    const chances = units * opportunities;
    if (defects > chances) {
      sigmaOut.append(hint("There are more defects than chances. Check the numbers or the chances per unit."));
      renderTable(null);
      return null;
    }
    const value = defects / chances;
    sigmaOut.append(
      stat("Defect rate", rate(value), `${int.format(defects)} of ${int.format(chances)}`),
      stat("DPMO", int.format(Math.round(value * 1e6)), "defects per million chances"),
      stat("Yield", rate(1 - value), "right first time"),
      stat("Sigma level", sigmaText(value), "short term, with 1.5 shift"),
    );
    renderTable(sigma(value));
    return value;
  };

  const renderPerfect = () => {
    const parts = [["On time", "onTime"], ["Undamaged", "undamaged"], ["Complete", "complete"]]
      .map(([label, name]) => ({ label, value: parseNumber(calcPerfect.elements[name].value) / 100 }))
      .filter((part) => part.value >= 0 && part.value <= 1);
    perfectOut.replaceChildren();
    if (!parts.length) {
      perfectOut.append(hint("Enter at least two of the three percentages."));
      return;
    }
    const perfect = parts.reduce((product, part) => product * part.value, 1);
    const weakest = [...parts].sort((a, b) => a.value - b.value)[0];
    perfectOut.append(
      stat("Perfect delivery", rate(perfect), parts.length < 3 ? `from ${parts.length} of 3 measures` : "on time, undamaged and complete"),
      stat("Fail at least once", `${(1000 * (1 - perfect)).toFixed(1)}`, "per 1,000 deliveries"),
      stat("Sigma level", sigmaText(1 - perfect), "of the whole delivery"),
      stat("Weakest link", weakest.label, `${rate(1 - weakest.value)} fail here`),
    );
  };

  [calcSigma, calcPerfect].forEach((form) => {
    form.addEventListener("submit", (event) => event.preventDefault());
    form.querySelectorAll("[data-calc]").forEach((input) => {
      if (typeof calcState[input.name] === "string") input.value = calcState[input.name];
      input.addEventListener("input", () => {
        calcState[input.name] = input.value;
        write(CALC_KEY, calcState);
        if (form === calcSigma) renderSigma();
        else renderPerfect();
      });
    });
  });
  renderSigma();
  renderPerfect();

  // 2 · Control chart (p-chart) ----------------------------------------------
  const root = document.querySelector("[data-control-chart]");
  const entry = root.querySelector("[data-entry]");
  const logBody = root.querySelector("[data-log]");
  const logWrap = root.querySelector("[data-log-wrap]");
  const logEmpty = root.querySelector("[data-log-empty]");
  const logCount = root.querySelector("[data-log-count]");
  const entryStatus = root.querySelector("[data-entry-status]");
  const importStatus = root.querySelector("[data-import-status]");
  const pasteArea = root.querySelector("#cc-paste");
  const results = document.querySelector("[data-results]");
  const KEY = data.storageKey;

  const state = loadState(KEY, { metric: "", unit: "", baseline: "", rows: [] });
  state.rows = state.rows.filter(isObject)
    .map((row) => ({ date: parseDate(row.date), n: Math.round(Number(row.n)), d: Math.round(Number(row.d)), note: str(row.note) }))
    .filter((row) => row.date && row.n > 0 && row.d >= 0 && row.d <= row.n);
  const save = () => write(KEY, state);
  const metric = () => state.metric.trim() || "Defects";
  const unit = () => state.unit.trim() || "Handled";

  // One row per date: a new value for a date replaces the old one.
  const upsert = (rows) => {
    const byDate = new Map(state.rows.map((row) => [row.date, row]));
    rows.forEach((row) => byDate.set(row.date, row));
    state.rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  };

  const importRows = (text) => {
    const added = [];
    let skipped = 0;
    text.split(/\r?\n/).filter((line) => line.trim()).forEach((line, index) => {
      const [date, n, d, ...note] = splitLine(line);
      const row = { date: parseDate(date), n: Math.round(parseNumber(n)), d: Math.round(parseNumber(d)), note: note.join(", ").trim() };
      if (!row.date || !(row.n > 0) || !(row.d >= 0) || row.d > row.n) {
        if (index > 0) skipped++;
        return;
      }
      added.push(row);
    });
    return { added, skipped };
  };

  // Limits, and the three signal rules.
  const analyse = () => {
    const rows = state.rows;
    const baseCount = Math.round(parseNumber(state.baseline));
    const useBase = baseCount >= 2 && baseCount < rows.length;
    const base = useBase ? rows.slice(0, baseCount) : rows;
    const pBar = base.reduce((sum, row) => sum + row.d, 0) / base.reduce((sum, row) => sum + row.n, 0);

    const points = rows.map((row, index) => {
      const p = row.d / row.n;
      const spread = 3 * Math.sqrt((pBar * (1 - pBar)) / row.n);
      return { ...row, index, p, ucl: pBar + spread, lcl: Math.max(0, pBar - spread), signals: [] };
    });

    const events = [];
    points.forEach((point) => {
      if (point.p > point.ucl) {
        point.signals.push({ rule: "beyond", worse: true });
        events.push({ rule: "beyond", worse: true, from: point, to: point, text: `${rate(point.p)} is above the upper limit of ${rate(point.ucl)}.` });
      } else if (point.lcl > 0 && point.p < point.lcl) {
        point.signals.push({ rule: "beyond", worse: false });
        events.push({ rule: "beyond", worse: false, from: point, to: point, text: `${rate(point.p)} is below the lower limit of ${rate(point.lcl)}.` });
      }
    });

    // Eight or more points in a row on one side of the centre line.
    const side = (point) => Math.sign(point.p - pBar);
    const shifts = [];
    let from = 0;
    for (let i = 1; i <= points.length; i++) {
      if (i < points.length && side(points[i - 1]) !== 0 && side(points[i - 1]) === side(points[i])) continue;
      if (i - from >= 8 && side(points[from]) !== 0) shifts.push(points.slice(from, i));
      from = i;
    }
    shifts.forEach((run) => {
      const worse = side(run[0]) > 0;
      run.forEach((point) => point.signals.push({ rule: "run", worse }));
      events.push({ rule: "run", worse, from: run[0], to: run.at(-1), text: `${run.length} days in a row ${worse ? "above" : "below"} the centre line.` });
    });
    // Six points each higher (or lower) than the one before. The turning
    // point of one trend is the first point of the next.
    const step = (a, b) => Math.sign(b.p - a.p);
    const trends = [];
    let start = 0;
    for (let i = 1; i <= points.length; i++) {
      const s = i < points.length ? step(points[i - 1], points[i]) : 0;
      const before = i - 1 > start ? step(points[i - 2], points[i - 1]) : null;
      if (s !== 0 && (before === null || before === s)) continue;
      if (i - start >= 6) trends.push(points.slice(start, i));
      start = s !== 0 ? i - 1 : i;
    }
    trends.forEach((run) => {
      const worse = step(run[0], run[1]) > 0;
      run.forEach((point) => point.signals.push({ rule: "trend", worse }));
      events.push({ rule: "trend", worse, from: run[0], to: run.at(-1), text: `${run.length} days in a row each ${worse ? "higher" : "lower"} than the one before.` });
    });
    events.sort((a, b) => a.from.index - b.from.index);

    const total = rows.reduce((sum, row) => sum + row.d, 0) / rows.reduce((sum, row) => sum + row.n, 0);
    const after = useBase ? rows.slice(baseCount) : [];
    const afterRate = after.length ? after.reduce((sum, row) => sum + row.d, 0) / after.reduce((sum, row) => sum + row.n, 0) : null;
    return { points, events, pBar, total, useBase, baseCount, afterRate };
  };

  const ruleName = (rule) => data.rules.find((item) => item.id === rule).name;
  const signalText = (point) => point.signals.map((s) => `${ruleName(s.rule)} (${s.worse ? "worse" : "better"})`).join(", ");
  const span = (event) => (event.from === event.to ? shortDate(event.from.date) : `${shortDate(event.from.date)} – ${shortDate(event.to.date)}`);

  // Round the axis to clean steps.
  const niceMax = (value) => {
    const raw = value / 4;
    const power = 10 ** Math.floor(Math.log10(raw));
    const stepSize = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw);
    return { step: stepSize, max: Math.ceil(value / stepSize) * stepSize };
  };

  const chart = (result, width) => {
    const { points, pBar } = result;
    const height = width < 560 ? 260 : 320;
    const m = { top: 18, right: width < 560 ? 44 : 56, bottom: 30, left: 48 };
    const w = width - m.left - m.right;
    const h = height - m.top - m.bottom;
    const peak = Math.max(...points.map((p) => Math.max(p.p, p.ucl)));
    const { step: yStep, max: yMax } = niceMax(peak * 1.08 || 0.01);
    const band = w / points.length;
    const x = (i) => m.left + band * (i + 0.5);
    const y = (v) => m.top + h - (v / yMax) * h;

    const root = svg("svg", { viewBox: `0 0 ${width} ${height}`, width, height, class: "sc-chart", role: "img", "aria-label": `Control chart of ${metric().toLowerCase()} rate by day. The table below lists every value.` });

    for (let v = 0; v <= yMax + 1e-12; v += yStep) {
      root.append(svg("line", { x1: m.left, x2: m.left + w, y1: y(v), y2: y(v), class: "sc-grid" }));
      const label = svg("text", { x: m.left - 8, y: y(v) + 4, class: "sc-axis", "text-anchor": "end" });
      label.textContent = `${(v * 100).toFixed(yStep * 100 < 0.1 ? 2 : yStep * 100 < 1 ? 1 : 0)}%`;
      root.append(label);
    }
    const every = Math.max(1, Math.ceil(points.length / Math.floor(w / 64)));
    points.forEach((point, i) => {
      if (i % every) return;
      const label = svg("text", { x: x(i), y: height - 8, class: "sc-axis", "text-anchor": "middle" });
      label.textContent = shortDate(point.date);
      root.append(label);
    });

    if (result.useBase) {
      const at = m.left + band * result.baseCount;
      root.append(svg("line", { x1: at, x2: at, y1: m.top, y2: m.top + h, class: "sc-divider" }));
      if (width >= 480) {
        const label = svg("text", { x: at - 6, y: m.top + 12, class: "sc-axis", "text-anchor": "end" });
        label.textContent = "Limits from here ←";
        root.append(label);
      }
    }

    // Limits follow each day's volume, so they are drawn as steps.
    const stepPath = (key) => points.map((p, i) => `${i ? "L" : "M"}${m.left + band * i},${y(p[key])}H${m.left + band * (i + 1)}`).join("");
    root.append(svg("path", { d: stepPath("ucl"), class: "sc-limit" }));
    if (points.some((p) => p.lcl > 0)) root.append(svg("path", { d: stepPath("lcl"), class: "sc-limit" }));
    root.append(svg("line", { x1: m.left, x2: m.left + w, y1: y(pBar), y2: y(pBar), class: "sc-center" }));
    const endLabel = (text, value) => {
      const label = svg("text", { x: m.left + w + 6, y: y(value) + 4, class: "sc-axis sc-end" });
      label.textContent = text;
      root.append(label);
    };
    endLabel("UCL", points.at(-1).ucl);
    endLabel("Avg", pBar);

    root.append(svg("path", { d: points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.p)}`).join(""), class: "sc-line" }));
    points.forEach((point, i) => {
      const worse = point.signals.some((s) => s.worse);
      const better = point.signals.some((s) => !s.worse);
      const cls = worse ? "sc-dot is-worse" : better ? "sc-dot is-better" : "sc-dot";
      const r = band < 12 ? 3 : 4;
      root.append(svg("circle", { cx: x(i), cy: y(point.p), r: worse || better ? r + 1.5 : r, class: cls }));
      // Label only the days outside the limits.
      if (point.signals.some((s) => s.rule === "beyond")) {
        const label = svg("text", { x: x(i), y: y(point.p) - 12, class: "sc-axis sc-callout", "text-anchor": "middle" });
        label.textContent = rate(point.p);
        root.append(label);
      }
    });

    // Hover: a crosshair that snaps to the nearest day, with one tooltip.
    const cross = svg("line", { y1: m.top, y2: m.top + h, class: "sc-cross", visibility: "hidden" });
    root.append(cross);
    const hit = svg("rect", { x: m.left, y: m.top, width: w, height: h, class: "sc-hit" });
    root.append(hit);
    return { node: root, x, y, band, left: m.left, cross, hit };
  };

  const tooltip = el("div", "sc-tooltip");
  tooltip.hidden = true;

  const attachHover = (wrap, drawn, points) => {
    wrap.append(tooltip);
    const show = (event) => {
      const box = drawn.node.getBoundingClientRect();
      const scale = box.width / drawn.node.viewBox.baseVal.width;
      const i = Math.min(points.length - 1, Math.max(0, Math.floor(((event.clientX - box.left) / scale - drawn.left) / drawn.band)));
      const point = points[i];
      drawn.cross.setAttribute("x1", drawn.x(i));
      drawn.cross.setAttribute("x2", drawn.x(i));
      drawn.cross.setAttribute("visibility", "visible");
      tooltip.replaceChildren(
        el("strong", "sc-tip-value", rate(point.p)),
        el("span", "sc-tip-date", shortDate(point.date)),
        el("span", null, `${int.format(point.d)} of ${int.format(point.n)}`),
        el("span", null, `Limits ${rate(point.lcl)} – ${rate(point.ucl)}`),
      );
      if (point.signals.length) tooltip.append(el("span", "sc-tip-signal", signalText(point)));
      if (point.note) tooltip.append(el("span", "sc-tip-note", point.note));
      tooltip.hidden = false;
      const wrapBox = wrap.getBoundingClientRect();
      const left = drawn.x(i) * scale + (box.left - wrapBox.left);
      const flip = left > wrapBox.width * 0.6;
      tooltip.style.left = `${flip ? left - tooltip.offsetWidth - 14 : left + 14}px`;
      tooltip.style.top = `${drawn.y(point.p) * scale + (box.top - wrapBox.top) - 20}px`;
    };
    const hide = () => {
      tooltip.hidden = true;
      drawn.cross.setAttribute("visibility", "hidden");
    };
    drawn.hit.addEventListener("pointermove", show);
    drawn.hit.addEventListener("pointerdown", show);
    drawn.hit.addEventListener("pointerleave", hide);
  };

  const legend = () => {
    const box = el("div", "sc-legend");
    [["sc-key-line", `${metric()} rate`], ["sc-key-center", "Average"], ["sc-key-limit", "Control limits"], ["sc-key-worse", "Signal, worse"], ["sc-key-better", "Signal, better"]]
      .forEach(([cls, text]) => {
        const item = el("span", "sc-legend-item");
        item.append(el("span", `sc-key ${cls}`), text);
        box.append(item);
      });
    return box;
  };

  const verdict = (result) => {
    const worse = result.events.some((e) => e.worse);
    const better = result.events.some((e) => !e.worse);
    const parts = [];
    if (!worse && !better) parts.push(data.verdicts.stable);
    if (worse) parts.push(data.verdicts.badSpecial);
    if (better) parts.push(data.verdicts.goodSpecial);
    if (result.points.length < 12) parts.push(data.verdicts.short);
    return { title: worse ? "Signals to investigate" : better ? "A real improvement" : "Stable: this is noise", text: parts.join(" ") };
  };

  const problemText = (result) => {
    const bad = result.events.find((e) => e.worse && e.rule === "beyond") || result.events.find((e) => e.worse);
    if (bad) return `${metric()}, ${span(bad)}: ${bad.text}`;
    return `${metric()} run at ${rate(result.pBar)} on average and the process is stable: the level itself comes from the way the work is done.`;
  };

  const summaryText = (result) => {
    const v = verdict(result);
    const lines = ["Control chart | Stiven Catalyst", "", `${metric()} out of ${unit().toLowerCase()}, ${plural(result.points.length, "day")} (${shortDate(result.points[0].date)} – ${shortDate(result.points.at(-1).date)})`];
    lines.push(`Average ${rate(result.pBar)}${result.useBase ? ` over the first ${result.baseCount} days` : ""} · sigma level ${sigmaText(result.pBar)}`);
    if (result.afterRate !== null) lines.push(`Since then: ${rate(result.afterRate)}`);
    lines.push("", `${v.title}. ${v.text}`);
    if (result.events.length) {
      lines.push("", "Signals:");
      result.events.forEach((e) => lines.push(`- ${span(e)}: ${ruleName(e.rule)}, ${e.worse ? "worse" : "better"}. ${e.text}`));
    }
    return lines.join("\n");
  };

  let lastWidth = 0;

  const renderResults = () => {
    results.replaceChildren();
    results.hidden = state.rows.length < 2;
    if (results.hidden) return;
    const result = analyse();

    const head = el("div", "result-head");
    head.append(el("p", "kicker", `Control chart · ${metric()}`));
    const v = verdict(result);
    const title = el("h2");
    const [first, ...rest] = v.title.split(": ");
    title.append(first, rest.length ? ": " : "");
    if (rest.length) title.append(el("span", null, rest.join(": ")));
    head.append(title);
    results.append(head);

    const stats = el("div", "dl-stats");
    stats.append(stat("Average rate", rate(result.pBar), result.useBase ? `first ${result.baseCount} days` : `${plural(result.points.length, "day")}`));
    if (result.afterRate !== null) {
      const change = (result.afterRate - result.pBar) / result.pBar;
      stats.append(stat("Since then", rate(result.afterRate), `${change > 0 ? "+" : ""}${(change * 100).toFixed(0)}% against the first ${result.baseCount} days`));
    }
    const last = result.points.at(-1);
    stats.append(stat("Latest day", rate(last.p), last.signals.length ? signalText(last) : "inside the limits, noise"));
    stats.append(stat("Signals", String(result.events.length), result.events.length ? `${result.events.filter((e) => e.worse).length} worse, ${result.events.filter((e) => !e.worse).length} better` : "nothing to chase"));
    stats.append(stat("Sigma level", sigmaText(result.pBar), "at the average rate"));
    results.append(stats);

    const chartPanel = panel(`${metric()} rate by day`, `Out of ${unit().toLowerCase()}. Hover a day for its numbers.`);
    chartPanel.classList.add("sc-chart-panel");
    chartPanel.append(legend());
    const wrap = el("div", "sc-chart-wrap");
    chartPanel.append(wrap);
    results.append(chartPanel);
    lastWidth = wrap.clientWidth;
    const drawn = chart(result, Math.max(240, lastWidth));
    wrap.append(drawn.node);
    attachHover(wrap, drawn, result.points);

    const card = el("article", "result-card dl-focus");
    card.append(el("p", "result-label", "What it says"));
    card.append(el("p", "sc-verdict", v.text));
    if (result.events.length) {
      card.append(el("p", "result-label", "Signals"));
      const list = el("ul", "sc-signals");
      result.events.forEach((e) => {
        const item = el("li");
        item.append(el("strong", null, `${span(e)} · ${ruleName(e.rule)}, ${e.worse ? "worse" : "better"}. `), e.text);
        const note = [...new Set(result.points.slice(e.from.index, e.to.index + 1).map((p) => p.note).filter(Boolean))].join("; ");
        if (note) item.append(el("span", "sc-signal-note", ` Note: ${note}`));
        list.append(item);
      });
      card.append(list);
    }
    results.append(card);

    const many = result.points.length > LOG_LIMIT;
    const tablePanel = panel(many ? `The latest ${LOG_LIMIT} days` : "Every day", many ? "The same numbers as the chart. Download the CSV for every day." : "The same numbers as the chart.");
    const tableWrap = el("div", "dl-table-wrap");
    const table = el("table", "dl-table");
    const thead = el("thead");
    const headRow = el("tr");
    ["Date", unit(), metric(), "Rate", "Lower", "Upper", "Signal", "Note"].forEach((text, i) => {
      const th = el("th", i && i < 6 ? "num" : null, text);
      th.scope = "col";
      headRow.append(th);
    });
    thead.append(headRow);
    const tbody = el("tbody");
    result.points.slice(-LOG_LIMIT).forEach((point) => {
      const tr = el("tr");
      if (point.signals.length) tr.classList.add("is-signal");
      [shortDate(point.date), int.format(point.n), int.format(point.d), rate(point.p), rate(point.lcl), rate(point.ucl)].forEach((text, i) => tr.append(el("td", i ? "num" : "nowrap", text)));
      tr.append(el("td", null, signalText(point)));
      tr.append(el("td", "dl-note", point.note || ""));
      tbody.append(tr);
    });
    table.append(thead, tbody);
    tableWrap.append(table);
    tablePanel.append(tableWrap);
    results.append(tablePanel);

    results.append(resultActions(() => summaryText(result), problemText(result)));
  };

  const renderLog = () => {
    logBody.replaceChildren();
    [...state.rows].reverse().slice(0, LOG_LIMIT).forEach((row) => {
      const tr = el("tr");
      tr.append(el("td", "nowrap", row.date), el("td", "num", int.format(row.n)), el("td", "num", int.format(row.d)), el("td", "num", rate(row.d / row.n)), el("td", "dl-note", row.note || ""));
      const cell = el("td");
      const remove = el("button", "dl-remove", "×");
      remove.type = "button";
      remove.dataset.remove = row.date;
      remove.setAttribute("aria-label", `Remove ${row.date}`);
      cell.append(remove);
      tr.append(cell);
      logBody.append(tr);
    });
    logWrap.hidden = !state.rows.length;
    logEmpty.hidden = state.rows.length > 0;
    logCount.textContent = state.rows.length ? `${plural(state.rows.length, "day")}${shownNote(state.rows.length)}` : "";
  };

  const render = () => {
    renderLog();
    renderResults();
  };

  const renderSetting = renderOnPause(renderResults, () => state.rows.length);
  root.querySelectorAll("[data-setting]").forEach((input) => {
    input.value = state[input.name] ?? "";
    input.addEventListener("input", () => {
      state[input.name] = input.value;
      save();
      renderSetting();
    });
  });

  entry.elements.date.value = today();
  entry.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = entry.elements;
    const row = { date: form.date.value, n: Math.round(parseNumber(form.n.value)), d: Math.round(parseNumber(form.d.value)), note: form.note.value.trim() };
    if (!row.date || !(row.n > 0) || !(row.d >= 0) || row.d > row.n) {
      flash(entryStatus, "Check the numbers: defects cannot be more than handled.");
      return;
    }
    const replaced = state.rows.some((item) => item.date === row.date);
    upsert([row]);
    save();
    render();
    // Move to the next day, the usual next entry.
    const next = new Date(`${row.date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    form.date.value = next.toISOString().slice(0, 10);
    form.n.value = "";
    form.d.value = "";
    form.note.value = "";
    flash(entryStatus, `${replaced ? "Replaced" : "Added"} ${row.date}: ${rate(row.d / row.n)}.`);
    form.n.focus();
  });

  root.querySelector("[data-import]").addEventListener("click", () => {
    const { added, skipped } = importRows(pasteArea.value);
    if (!added.length) {
      flash(importStatus, "No rows found. Check the order: date, handled, defects.");
      return;
    }
    upsert(added);
    save();
    render();
    pasteArea.value = "";
    flash(importStatus, `Imported ${plural(added.length, "day")}${skipped ? `, skipped ${skipped} that did not add up` : ""}.`);
  });

  logBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove]");
    if (!button) return;
    state.rows = state.rows.filter((row) => row.date !== button.dataset.remove);
    save();
    render();
    (logBody.querySelector("[data-remove]") || entry.elements.date).focus();
  });

  root.querySelector("[data-example]").addEventListener("click", () => {
    const { rows, ...settings } = data.example;
    Object.assign(state, settings);
    state.rows = [];
    upsert(importRows(rows.map((row) => row.replace(/\|/g, "\t")).join("\n")).added);
    root.querySelectorAll("[data-setting]").forEach((input) => { input.value = state[input.name]; });
    save();
    render();
    results.scrollIntoView({ behavior: "smooth", block: "start" });
    results.focus({ preventScroll: true });
  });

  root.querySelector("[data-clear]").addEventListener("click", () => {
    if (!state.rows.length || !window.confirm("Clear all days from the chart?")) return;
    state.rows = [];
    save();
    render();
  });

  root.querySelector("[data-csv]").addEventListener("click", () => {
    if (!state.rows.length) return;
    const result = state.rows.length > 1 ? analyse() : null;
    downloadCsv("control-chart", [
      ["Date", unit(), metric(), "Rate %", "Average %", "Lower limit %", "Upper limit %", "Signal", "Note"],
      ...state.rows.map((row, i) => {
        const point = result?.points[i];
        const fixed = (value) => (value == null ? "" : (value * 100).toFixed(3));
        return [row.date, row.n, row.d, fixed(row.d / row.n), fixed(result?.pBar), fixed(point?.lcl), fixed(point?.ucl), point ? signalText(point) : "", row.note];
      }),
    ]);
  });

  // Redraw the chart when its width changes.
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const wrap = results.querySelector(".sc-chart-wrap");
      if (wrap && Math.abs(wrap.clientWidth - lastWidth) > 8) renderResults();
    }, 150);
  });

  render();
})();
