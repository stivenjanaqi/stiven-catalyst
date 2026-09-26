(() => {
  const root = document.querySelector("[data-delay-analyzer]");
  const dataEl = document.getElementById("delay-analyzer-data");
  if (!root || !dataEl || !window.ToolKit) return;

  const {
    read, write, el, int, pct, plural, today,
    parseNumber, parseDate, splitLine, canon, sigmaText,
    panel, stat, barList, focusCard, resultActions, flash, downloadCsv, floorCheck, LOG_LIMIT, shownNote, renderOnPause,
  } = window.ToolKit;

  const data = JSON.parse(dataEl.textContent);
  const KEY = data.storageKey;
  const NOT_RECORDED = "Not recorded";
  const reasonNames = data.reasons.map((reason) => reason.name);
  const reasonInfo = Object.fromEntries(data.reasons.map((reason) => [reason.name, reason]));

  const entry = root.querySelector("[data-entry]");
  const logBody = root.querySelector("[data-log]");
  const logWrap = root.querySelector("[data-log-wrap]");
  const logEmpty = root.querySelector("[data-log-empty]");
  const logCount = root.querySelector("[data-log-count]");
  const entryStatus = root.querySelector("[data-entry-status]");
  const importStatus = root.querySelector("[data-import-status]");
  const pasteArea = root.querySelector("#da-paste");
  const results = document.querySelector("[data-results]");

  const state = { period: "", routes: "", departureGrace: "10", arrivalGrace: "15", target: "", rows: [], ...read(KEY, {}) };
  if (!Array.isArray(state.rows)) state.rows = [];
  const save = () => write(KEY, state);

  // Times: 07:45, 7.45, 0745, 07:45:00, or an Excel day fraction (0.3229).
  const parseTime = (value) => {
    const text = String(value ?? "").trim();
    let minutes = NaN;
    let match = text.match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?$/);
    if (match) minutes = Number(match[1]) * 60 + Number(match[2]);
    else if ((match = text.match(/^(\d{1,2})(\d{2})$/))) minutes = Number(match[1]) * 60 + Number(match[2]);
    else if (/^0?[.,]\d+$/.test(text)) minutes = Math.round(parseNumber(text) * 1440);
    if (!(minutes >= 0 && minutes < 1440) || (match && Number(match[2]) > 59)) return "";
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  };
  const toMinutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  // Actual minus planned, in minutes; a route that crosses midnight stays close.
  const diff = (planned, actual) => {
    if (!planned || !actual) return null;
    let value = toMinutes(actual) - toMinutes(planned);
    if (value < -720) value += 1440;
    if (value > 720) value -= 1440;
    return value;
  };
  const signed = (value) => (value === null ? "" : value > 0 ? `+${value}` : value < 0 ? `−${-value}` : "0");
  const minutes = (value) => `${int.format(Math.round(value))} min`;

  const importRows = (text) => {
    const added = [];
    let skipped = 0;
    text.split(/\r?\n/).filter((line) => line.trim()).forEach((line, index) => {
      const [date, shift, route, planDep, actDep, planArr, actArr, reason, ...note] = splitLine(line);
      const row = {
        date: parseDate(date),
        shift: canon(data.shifts, shift, NOT_RECORDED),
        route: (route || "").trim(),
        planDep: parseTime(planDep),
        actDep: parseTime(actDep),
        planArr: parseTime(planArr),
        actArr: parseTime(actArr),
        reason: canon(reasonNames, reason, ""),
        note: note.join(", ").trim(),
      };
      // Without both arrival times a route cannot be judged; a first row like that is a header.
      if (!row.planArr || !row.actArr) {
        if (index > 0) skipped++;
        return;
      }
      added.push(row);
    });
    return { added, skipped };
  };

  const analyse = () => {
    const depGrace = Math.max(0, parseNumber(state.departureGrace) || 0);
    const arrGrace = Math.max(0, parseNumber(state.arrivalGrace) || 0);
    const rows = state.rows.map((row) => {
      const dep = diff(row.planDep, row.actDep);
      const arr = diff(row.planArr, row.actArr);
      const late = arr > arrGrace;
      let dock = null;
      let side = null;
      if (late) {
        dock = dep === null ? null : Math.min(Math.max(dep, 0), arr);
        side = dep === null ? "Not known"
          : dep <= depGrace ? "Road"
          : dock >= arr - dock ? "Dock"
          : "Dock and road";
      }
      return { ...row, dep, arr, late, lateDep: dep !== null && dep > depGrace, dock, side };
    });

    const logged = rows.length;
    const setRoutes = Math.round(parseNumber(state.routes));
    const total = setRoutes > logged ? setRoutes : logged;
    const late = rows.filter((row) => row.late);
    const lateMinutes = late.reduce((sum, row) => sum + row.arr, 0);
    const split = late.filter((row) => row.dock !== null);
    const splitMinutes = split.reduce((sum, row) => sum + row.arr, 0);
    const dockMinutes = split.reduce((sum, row) => sum + row.dock, 0);
    const withDep = rows.filter((row) => row.dep !== null);
    const rate = late.length / total;
    const target = parseNumber(state.target) / 100;

    const group = (items, keyOf) => {
      const map = new Map();
      items.forEach((row) => {
        const key = keyOf(row);
        const item = map.get(key) || { key, routes: 0, late: 0, minutes: 0 };
        item.routes += 1;
        if (row.late) {
          item.late += 1;
          item.minutes += row.arr;
        }
        map.set(key, item);
      });
      return [...map.values()];
    };

    const reasons = group(late, (row) => row.reason || NOT_RECORDED)
      .map((item) => ({ ...item, value: item.late }))
      .sort((a, b) => b.value - a.value || b.minutes - a.minutes || a.key.localeCompare(b.key));
    let running = 0;
    reasons.forEach((item) => {
      item.share = item.value / late.length;
      item.vital = running < 0.8;
      running += item.share;
      item.cumulative = running;
    });

    const sides = ["Dock", "Dock and road", "Road", "Not known"]
      .map((key) => {
        const items = late.filter((row) => row.side === key);
        return { key, value: items.length, minutes: items.reduce((sum, row) => sum + row.arr, 0) };
      })
      .filter((item) => item.value || item.key !== "Not known");

    const withRate = (items) => items.map((item) => ({ ...item, value: item.late / item.routes }));
    const hours = withRate(group(rows.filter((row) => row.planDep), (row) => `${row.planDep.slice(0, 2)}:00`))
      .sort((a, b) => a.key.localeCompare(b.key));
    const shifts = withRate(group(rows, (row) => row.shift || NOT_RECORDED))
      .sort((a, b) => (data.shifts.indexOf(a.key) + 1 || 99) - (data.shifts.indexOf(b.key) + 1 || 99));
    const worstHour = hours.filter((item) => item.routes >= 3 && item.late).sort((a, b) => b.value - a.value)[0];

    const buckets = [[1, 15], [16, 30], [31, 60], [61, 120], [121, Infinity]].map(([low, high]) => ({
      key: high === Infinity ? `Over ${low - 1} min` : `${low}–${high} min`,
      value: late.filter((row) => row.arr >= low && row.arr <= high).length,
    }));

    // Start where most late minutes began, with the most frequent reason on that side.
    const dockShare = splitMinutes ? dockMinutes / splitMinutes : null;
    const side = dockShare === null
      ? (late.filter((row) => reasonInfo[row.reason]?.side === "dock").length >= late.length / 2 ? "dock" : "road")
      : dockShare >= 0.5 ? "dock" : "road";
    const topReason = reasons.find((item) => reasonInfo[item.key]?.side === side) || reasons[0];

    return {
      rows,
      logged,
      total,
      setRoutesIgnored: setRoutes > 0 && setRoutes < logged,
      late,
      lateMinutes,
      dockShare,
      rate,
      onTime: 1 - rate,
      depOnTime: withDep.length ? withDep.filter((row) => !row.lateDep).length / withDep.length : null,
      target: target > 0 && target <= 1 ? target : null,
      reasons,
      sides,
      hours,
      shifts,
      worstHour,
      buckets,
      side,
      topReason,
      noReason: late.filter((row) => !row.reason).length,
      noDeparture: late.length - split.length,
      days: new Set(rows.map((row) => row.date).filter(Boolean)).size,
    };
  };

  // The log table.
  const renderLog = () => {
    const depGrace = Math.max(0, parseNumber(state.departureGrace) || 0);
    const arrGrace = Math.max(0, parseNumber(state.arrivalGrace) || 0);
    const rows = state.rows;
    logBody.replaceChildren();
    rows.map((row, index) => [row, index]).reverse().slice(0, LOG_LIMIT).forEach(([row, index]) => {
      const dep = diff(row.planDep, row.actDep);
      const arr = diff(row.planArr, row.actArr);
      const tr = el("tr");
      tr.append(el("td", "nowrap", row.date || "-"));
      [row.shift, row.route, row.planDep, row.actDep, row.planArr, row.actArr].forEach((value) => tr.append(el("td", null, value || "")));
      const depCell = el("td", "num", signed(dep));
      if (dep > depGrace) depCell.classList.add("is-late");
      const arrCell = el("td", "num", signed(arr));
      if (arr > arrGrace) arrCell.classList.add("is-late");
      tr.append(depCell, arrCell);
      tr.append(el("td", null, row.reason || ""));
      tr.append(el("td", "dl-note", row.note || ""));
      const cell = el("td");
      const remove = el("button", "dl-remove", "×");
      remove.type = "button";
      remove.dataset.remove = index;
      remove.setAttribute("aria-label", `Remove route ${row.route || ""} planned ${row.planDep || row.planArr}${row.date ? ` on ${row.date}` : ""}`);
      cell.append(remove);
      tr.append(cell);
      logBody.append(tr);
    });
    logWrap.hidden = !rows.length;
    logEmpty.hidden = rows.length > 0;
    const late = rows.filter((row) => diff(row.planArr, row.actArr) > arrGrace).length;
    logCount.textContent = rows.length ? `${plural(rows.length, "route")} · ${int.format(late)} late${shownNote(rows.length)}` : "";
  };

  // Results.
  const sideText = (result) => {
    const share = result.side === "dock" ? result.dockShare : result.dockShare === null ? null : 1 - result.dockShare;
    return share === null
      ? `most late routes point to the ${result.side}`
      : `${pct(share, 0)} of late minutes ${data.sides[result.side].lede}`;
  };

  const problemText = (result) => {
    const when = state.period ? `${state.period}: ` : "";
    const why = result.topReason ? `, mostly ${result.topReason.key.toLowerCase()}` : "";
    return `${when}${int.format(result.late.length)} of ${plural(result.total, "route")} late (${pct(result.onTime, 1)} on time); ${sideText(result)}${why}.`;
  };

  const targetText = (result) => {
    if (!result.target) return null;
    const needed = Math.ceil(result.target * result.total - 1e-9);
    const gap = needed - (result.total - result.late.length);
    return gap > 0
      ? { value: `${int.format(gap)} short`, note: `${plural(gap, "more route")} on time reach ${pct(result.target, 1)}` }
      : { value: "On target", note: `${plural(-gap, "route")} to spare at ${pct(result.target, 1)}` };
  };

  let checkSummary = () => "";

  const summaryText = (result) => {
    const lines = ["Delay Analyzer | Stiven Catalyst"];
    if (state.period) lines.push(`Period: ${state.period}`);
    lines.push(
      "",
      `Routes: ${int.format(result.total)} · late: ${int.format(result.late.length)} · on time: ${pct(result.onTime, 1)} · sigma level: ${sigmaText(result.rate)}`,
      `Late means arrival more than ${state.arrivalGrace || 0} min after plan; late departure more than ${state.departureGrace || 0} min.`
    );
    if (result.late.length) {
      lines.push(`Average delay of late routes: ${minutes(result.lateMinutes / result.late.length)}`);
      if (result.dockShare !== null) lines.push(`Late minutes that started at the dock: ${pct(result.dockShare, 0)}`);
    }
    if (result.depOnTime !== null) lines.push(`On-time departures: ${pct(result.depOnTime, 1)}`);
    const target = targetText(result);
    if (target) lines.push(`Target ${pct(result.target, 1)} on time: ${target.note}`);
    if (result.late.length) {
      lines.push("", "Dock or road (late routes):");
      result.sides.forEach((item) => lines.push(`- ${item.key}: ${item.value} routes, ${minutes(item.minutes)}`));
      lines.push("", "Pareto of reasons:");
      result.reasons.forEach((item) => lines.push(`- ${item.key}: ${item.value} (${pct(item.share, 0)}, cum. ${pct(item.cumulative, 0)})${item.vital ? " [vital few]" : ""}`));
    }
    lines.push("", "Late by planned departure hour:");
    result.hours.forEach((item) => lines.push(`- ${item.key}: ${item.late} of ${item.routes} (${pct(item.value, 0)})`));
    lines.push("", "Late by shift:");
    result.shifts.forEach((item) => lines.push(`- ${item.key}: ${item.late} of ${item.routes} (${pct(item.value, 0)})`));
    if (result.late.length) {
      lines.push("", `Start here: ${problemText(result)}`);
      const advice = reasonInfo[result.topReason?.key];
      if (advice) {
        lines.push("First moves:");
        advice.moves.forEach((move) => lines.push(`- ${move}`));
        lines.push(`Question for the floor: ${advice.question}`);
      }
    }
    const check = checkSummary();
    if (check) lines.push("", check);
    return lines.join("\n");
  };

  const rateBars = (items, options = {}) => barList(items, {
    ...options,
    label: (item) => [`${item.late} of ${item.routes}`, ` late · ${pct(item.value, 0)}`],
    title: (item) => `${item.key}: ${item.late} of ${plural(item.routes, "route")} late${item.late ? `, ${minutes(item.minutes)} late in total` : ""}`,
  });

  const renderResults = () => {
    results.replaceChildren();
    results.hidden = !state.rows.length;
    if (!state.rows.length) return;
    const result = analyse();

    const head = el("div", "result-head");
    head.append(el("p", "kicker", state.period ? `Result · ${state.period}` : "Result"));
    const title = el("h2");
    title.append("On time ", el("span", null, pct(result.onTime, 1)));
    head.append(title);
    results.append(head);

    const stats = el("div", "dl-stats");
    stats.append(stat("Late routes", `${int.format(result.late.length)} of ${int.format(result.total)}`, `${plural(result.logged, "route")} logged${result.days ? ` over ${plural(result.days, "day")}` : ""}`));
    if (result.late.length) {
      stats.append(stat("Average delay", minutes(result.lateMinutes / result.late.length), "of the late routes"));
      if (result.dockShare !== null) stats.append(stat("Started at the dock", pct(result.dockShare, 0), "of late minutes"));
    }
    if (result.depOnTime !== null) stats.append(stat("On-time departures", pct(result.depOnTime, 1), `left within ${state.departureGrace || 0} min of plan`));
    stats.append(stat("Sigma level", sigmaText(result.rate), "short term, with 1.5 shift"));
    const target = targetText(result);
    if (target) stats.append(stat("Target", target.value, target.note));
    results.append(stats);

    if (result.setRoutesIgnored) {
      results.append(el("p", "dl-warning", "Routes in the period is lower than the routes in the log, so the log count is used."));
    }

    const grid = el("div", "dl-result-grid");
    if (result.late.length) {
      const sides = panel("Dock or road", result.dockShare === null
        ? "Add departure times to split late minutes between the dock and the road."
        : `${pct(result.dockShare, 0)} of late minutes started at the dock, before the vehicle left.`);
      const biggest = Math.max(...result.sides.map((item) => item.value));
      sides.append(barList(result.sides, {
        highlight: (item) => item.value === biggest,
        tag: "Most",
        label: (item) => [int.format(item.value), ` ${item.value === 1 ? "route" : "routes"} · ${minutes(item.minutes)}`],
        title: (item) => ({
          "Dock": "Left late, and most of the delay was already there at departure.",
          "Dock and road": "Left late, then lost even more time on the road.",
          "Road": "Left on time and lost the time on the road.",
          "Not known": "No departure times, so the delay cannot be split.",
        })[item.key],
      }));
      grid.append(sides);

      const vital = result.reasons.filter((item) => item.vital);
      const pareto = panel("Pareto of reasons", `${vital.length} of ${result.reasons.length} reasons carry ${pct(vital.at(-1).cumulative, 0)} of late routes. Fix these first.`);
      pareto.append(barList(result.reasons, {
        ranked: true,
        highlight: (item) => item.vital,
        tag: "Vital few",
        label: (item) => [int.format(item.value), ` · ${pct(item.share, 0)} · ${pct(item.cumulative, 0)} cum.`],
        title: (item) => `${item.key}${reasonInfo[item.key] ? ` (${reasonInfo[item.key].side})` : ""}: ${plural(item.value, "late route")}, ${minutes(item.minutes)} late in total`,
      }));
      grid.append(pareto);
    }

    const hours = panel("By planned departure hour", "Share of routes that arrived late, by the hour they were planned to leave.");
    hours.append(rateBars(result.hours, { highlight: (item) => item === result.worstHour, tag: "Worst" }));
    grid.append(hours);

    const shifts = panel("By shift", "Share of each shift's routes that arrived late.");
    shifts.append(rateBars(result.shifts));
    grid.append(shifts);

    if (result.late.length) {
      const spread = panel("How late", "Late routes by minutes after the planned arrival.");
      spread.append(barList(result.buckets, {
        label: (item) => [int.format(item.value), ` ${item.value === 1 ? "route" : "routes"}`],
        title: (item) => `${item.key}: ${plural(item.value, "route")}`,
      }));
      grid.append(spread);
    }
    results.append(grid);

    if (result.late.length) {
      const warnings = [];
      if (result.noReason / result.late.length > 0.15) warnings.push(`${pct(result.noReason / result.late.length, 0)} of late routes have no reason. Record it the same day, while people still remember.`);
      if (result.noDeparture) warnings.push(`${plural(result.noDeparture, "late route")} ${result.noDeparture === 1 ? "has" : "have"} no departure time, so ${result.noDeparture === 1 ? "its" : "their"} delay cannot be split between dock and road.`);
      const reason = result.topReason;
      results.append(focusCard({
        title: data.sides[result.side].name,
        detail: reason?.key,
        lede: problemText(result),
        advice: reasonInfo[reason?.key],
        extraLabel: `Why the ${result.side} first`,
        extra: data.sides[result.side].advice,
        warning: warnings.join(" "),
      }));
      results.append(resultActions(() => summaryText(result), problemText(result)));
    } else {
      const card = el("article", "result-card dl-focus");
      card.append(el("p", "result-label", "No late routes"));
      card.append(el("p", "dl-focus-lede", `Every logged route arrived within ${state.arrivalGrace || 0} minutes of plan.`));
      results.append(card);
    }
  };

  const render = () => {
    renderLog();
    renderResults();
  };

  // Period settings.
  const renderSetting = renderOnPause(render, () => state.rows.length);
  root.querySelectorAll("[data-setting]").forEach((input) => {
    input.value = state[input.name] ?? "";
    input.addEventListener("input", () => {
      state[input.name] = input.value;
      save();
      renderSetting();
    });
  });

  // Log a route.
  entry.elements.date.value = today();
  entry.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = entry.elements;
    const row = {
      date: form.date.value,
      shift: form.shift.value,
      route: form.route.value.trim(),
      planDep: parseTime(form.planDep.value),
      actDep: parseTime(form.actDep.value),
      planArr: parseTime(form.planArr.value),
      actArr: parseTime(form.actArr.value),
      reason: form.reason.value,
      note: form.note.value.trim(),
    };
    if (!row.planArr || !row.actArr) {
      flash(entryStatus, "Enter the planned and actual arrival.");
      return;
    }
    state.rows.push(row);
    save();
    render();
    // Keep date and shift: the next route is usually from the same wave.
    ["route", "planDep", "actDep", "planArr", "actArr", "note"].forEach((name) => { form[name].value = ""; });
    form.reason.value = "";
    const arr = diff(row.planArr, row.actArr);
    flash(entryStatus, `Added ${row.route || "route"}: ${signed(arr)} min at arrival.`);
    form.route.focus();
  });

  root.querySelector("[data-import]").addEventListener("click", () => {
    const { added, skipped } = importRows(pasteArea.value);
    if (!added.length) {
      flash(importStatus, "No rows found. Check that the arrival times are in columns six and seven.");
      return;
    }
    state.rows.push(...added);
    save();
    render();
    pasteArea.value = "";
    flash(importStatus, `Imported ${plural(added.length, "route")}${skipped ? `, skipped ${skipped} without arrival times` : ""}.`);
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
    const { rows, ...settings } = data.example;
    Object.assign(state, settings);
    state.rows = importRows(rows.map((row) => row.replace(/\|/g, "\t")).join("\n")).added;
    root.querySelectorAll("[data-setting]").forEach((input) => { input.value = state[input.name]; });
    save();
    render();
    results.scrollIntoView({ behavior: "smooth", block: "start" });
    results.focus({ preventScroll: true });
  });

  root.querySelector("[data-clear]").addEventListener("click", () => {
    if (!state.rows.length || !window.confirm("Clear the whole route log?")) return;
    state.rows = [];
    save();
    render();
  });

  root.querySelector("[data-csv]").addEventListener("click", () => {
    if (!state.rows.length) return;
    const { rows } = analyse();
    downloadCsv("delay-log", [
      ["Date", "Shift", "Route", "Planned departure", "Actual departure", "Planned arrival", "Actual arrival", "Departure delay (min)", "Arrival delay (min)", "Late", "Reason", "Note"],
      ...rows.map((row) => [row.date, row.shift, row.route, row.planDep, row.actDep, row.planArr, row.actArr, row.dep ?? "", row.arr ?? "", row.late ? "yes" : "no", row.reason, row.note]),
    ]);
  });

  checkSummary = floorCheck(document.querySelector("[data-floor-check]"), `${KEY}-check`);
  render();
})();
