// Helpers shared by the warehouse tools (defect-log.js, delay-analyzer.js).
window.ToolKit = (() => {
  // Storage (the tools work without it, for example in a private window).
  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  };
  const write = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  };

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
  const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
  const today = () => new Date().toISOString().slice(0, 10);

  // Parsing, for forms and for rows pasted from a spreadsheet.
  const parseNumber = (value) => {
    let text = String(value ?? "").replace(/[\s€]/g, "");
    if (!text) return NaN;
    const comma = text.lastIndexOf(",");
    const dot = text.lastIndexOf(".");
    // The later separator is the decimal one: 1.234,50 and 1,234.50 both work.
    text = comma > dot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
    return Number(text);
  };

  const iso = (year, month, day) => {
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(day) ? "" : date.toISOString().slice(0, 10);
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

  const splitLine = (line) => {
    const separator = line.includes("\t") ? "\t" : line.includes(";") ? ";" : ",";
    return line.split(separator).map((cell) => cell.trim().replace(/^"(.*)"$/, "$1"));
  };

  // Map a typed value onto a known option; unknown names are kept as they are.
  const canon = (options, value, empty) => {
    const text = String(value ?? "").trim();
    if (!text) return empty;
    const lower = text.toLowerCase();
    return options.find((option) => option.toLowerCase() === lower)
      || (lower.length >= 3 && options.find((option) => option.toLowerCase().startsWith(lower)))
      || text;
  };

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
  // Short-term sigma level with the usual 1.5 shift; 6 when there are no defects.
  const sigma = (rate) => (rate === 0 ? 6 : normInv(1 - rate) + 1.5);
  const sigmaText = (rate) => (rate === 0 ? "6+" : sigma(rate).toFixed(2));

  // Result pieces.
  const panel = (title, note) => {
    const box = el("article", "dl-panel");
    box.append(el("h3", "result-label", title));
    if (note) box.append(el("p", "dl-panel-note", note));
    return box;
  };

  const stat = (label, value, note) => {
    const box = el("div", "dl-stat");
    box.append(el("span", "dl-stat-label", label), el("strong", "dl-stat-value", value));
    if (note) box.append(el("span", "dl-stat-note", note));
    return box;
  };

  // Horizontal bars. Each item has key and value; options.label(item) returns
  // [bold value, rest of the text], options.title(item) the hover text.
  const barList = (items, options = {}) => {
    const list = el("div", "dl-bars");
    const max = Math.max(...items.map((item) => item.value), 0) || 1;
    items.forEach((item, index) => {
      const row = el("div", "dl-bar");
      const highlight = options.highlight ? options.highlight(item) : false;
      if (highlight) row.classList.add("is-top");
      if (options.title) row.title = options.title(item);
      const label = el("div", "dl-bar-label");
      const name = el("span", "dl-bar-name");
      if (options.ranked) name.append(el("span", "dl-rank", String(index + 1)));
      name.append(item.key);
      if (highlight && options.tag) name.append(el("span", "dl-tag", options.tag));
      label.append(name);
      const [strong, rest] = options.label ? options.label(item) : [int.format(item.value), ""];
      const value = el("span", "dl-bar-value");
      value.append(el("strong", null, strong), rest);
      label.append(value);
      const track = el("div", "bar-track");
      const fill = el("div", "bar-fill");
      fill.style.width = `${(item.value / max) * 100}%`;
      track.append(fill);
      row.append(label, track);
      list.append(row);
    });
    return list;
  };

  // "Start here" card: stage or reason advice from a tool's data file.
  const focusCard = ({ title, detail, lede, advice, extraLabel, extra, warning }) => {
    const focus = el("article", "result-card dl-focus");
    focus.append(el("p", "result-label", "Start here"));
    const heading = el("h3");
    heading.append(title);
    if (detail) heading.append(el("span", null, ` · ${detail}`));
    focus.append(heading);
    focus.append(el("p", "dl-focus-lede", lede));
    if (advice) {
      focus.append(el("p", null, advice.meaning));
      focus.append(el("p", "result-label", "First moves"));
      const moves = el("ol", "moves");
      advice.moves.forEach((move) => moves.append(el("li", null, move)));
      focus.append(moves);
    }
    if (extra) {
      focus.append(el("p", "result-label", extraLabel));
      focus.append(el("p", null, extra));
    }
    if (advice) {
      focus.append(el("p", "result-label", "Question for the floor"));
      focus.append(el("blockquote", null, advice.question));
    }
    if (warning) focus.append(el("p", "dl-warning", warning));
    return focus;
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

  // Copy, print and 5 Whys buttons under a result.
  const resultActions = (summary, problem) => {
    const actions = el("div", "tool-actions result-actions");
    const copyButton = el("button", "button-primary", "Copy summary");
    copyButton.type = "button";
    copyButton.addEventListener("click", () => copy(summary(), copyButton));
    const printButton = el("button", "button-secondary", "Print or save as PDF");
    printButton.type = "button";
    printButton.addEventListener("click", () => window.print());
    const whys = el("a", "button-secondary", "Take it to 5 Whys");
    // Every tool lives next to 5 Whys under /tools/.
    const url = new URL("../five-whys/", window.location.href);
    url.searchParams.set("problem", problem);
    whys.href = url.href;
    actions.append(copyButton, printButton, whys);
    return actions;
  };

  const flash = (node, message) => {
    node.textContent = message;
    clearTimeout(node.timer);
    node.timer = setTimeout(() => { node.textContent = ""; }, 2600);
  };

  const downloadCsv = (name, rows) => {
    const quote = (value) => {
      const text = String(value ?? "");
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const lines = rows.map((cells) => cells.map(quote).join(","));
    const blob = new Blob([`﻿${lines.join("\r\n")}\r\n`], { type: "text/csv;charset=utf-8" });
    const link = el("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${name}-${today()}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  // The floor check under each tool: ticks are kept per tool.
  const floorCheck = (section, key) => {
    const boxes = [...section.querySelectorAll("input[type=checkbox]")];
    const score = section.querySelector("[data-check-score]");
    const render = () => {
      const ticked = boxes.filter((box) => box.checked).length;
      const total = boxes.length;
      const verdict = ticked === total ? "The standard holds today."
        : ticked >= total - 2 ? "Close. Fix the open lines this shift."
        : ticked >= total / 2 ? "Gaps in the standard. Expect misses where lines are open."
        : "Not yet a standard. Start with the first three lines.";
      score.replaceChildren(el("strong", null, `${ticked} of ${total}`), ` in place. ${verdict}`);
    };
    const saved = read(key, []);
    boxes.forEach((box, index) => {
      box.checked = Boolean(saved[index]);
      box.addEventListener("change", () => {
        write(key, boxes.map((item) => item.checked));
        render();
      });
    });
    section.querySelector("[data-check-reset]").addEventListener("click", () => {
      boxes.forEach((box) => { box.checked = false; });
      write(key, []);
      render();
    });
    render();
    return () => {
      const ticked = boxes.filter((box) => box.checked).length;
      return ticked ? `Floor check: ${ticked} of ${boxes.length} standards in place` : "";
    };
  };

  return {
    read, write, el, int, euro, pct, plural, capital, today,
    parseNumber, parseDate, splitLine, canon, sigma, sigmaText,
    panel, stat, barList, focusCard, resultActions, flash, downloadCsv, floorCheck,
  };
})();
