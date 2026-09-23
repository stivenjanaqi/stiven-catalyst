(() => {
  const form = document.querySelector("[data-diagnostic]");
  const resultBox = document.querySelector("[data-result]");
  const progress = document.querySelector("[data-progress]");
  const data = JSON.parse(document.getElementById("kpi-diagnostic-data").textContent);
  if (!form || !resultBox) return;

  const total = data.statements.length;
  const maxPerCause = (data.scale.length - 1) * 2;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const answered = () => form.querySelectorAll("input[type=radio]:checked");

  const updateProgress = () => {
    progress.textContent = `${answered().length} of ${total} answered`;
  };
  form.addEventListener("change", updateProgress);

  const scores = () => {
    const result = Object.fromEntries(Object.keys(data.causes).map((key) => [key, 0]));
    answered().forEach((input) => {
      result[input.dataset.cause] += Number(input.value);
    });
    return Object.entries(result).sort((a, b) => b[1] - a[1]);
  };

  const summaryText = (kpi, ranked, top) => {
    const lines = ["KPI Diagnostic | Stiven Catalyst"];
    if (kpi) lines.push(`KPI: ${kpi}`);
    lines.push("");
    if (top.length) {
      lines.push(`Most likely cause: ${top.map((key) => data.causes[key].name).join(" + ")}`);
      top.forEach((key) => {
        const cause = data.causes[key];
        lines.push("", `${cause.name}: ${cause.meaning}`, "First moves:");
        cause.moves.forEach((move) => lines.push(`- ${move}`));
        lines.push(`Question for the floor: ${cause.question}`);
      });
    } else {
      lines.push("No clear pattern. Go and watch the work where the number is produced.");
    }
    lines.push("", "Scores:");
    ranked.forEach(([key, score]) => lines.push(`- ${data.causes[key].name}: ${score}/${maxPerCause}`));
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

  const render = () => {
    const kpi = form.elements.kpi.value.trim();
    const ranked = scores();
    const best = ranked[0][1];
    // Below a third of the maximum there is no pattern worth naming.
    const top = best > maxPerCause / 3 ? ranked.filter(([, score]) => score === best).map(([key]) => key) : [];

    resultBox.replaceChildren();
    const head = el("div", "result-head");
    head.append(el("p", "kicker", kpi ? `Result · ${kpi}` : "Result"));
    const title = el("h2");
    if (top.length) {
      title.append("Most likely: ");
      title.append(el("span", null, top.map((key) => data.causes[key].name).join(" + ")));
    } else {
      title.append("No single cause ");
      title.append(el("span", null, "stands out."));
    }
    head.append(title);
    resultBox.append(head);

    const grid = el("div", "result-grid");
    const detail = el("div", "result-detail");
    if (top.length) {
      top.forEach((key) => {
        const cause = data.causes[key];
        const card = el("article", "result-card");
        card.append(el("h3", null, cause.name));
        card.append(el("p", null, cause.meaning));
        card.append(el("p", "result-label", "First moves"));
        const list = el("ol", "moves");
        cause.moves.forEach((move) => list.append(el("li", null, move)));
        card.append(list);
        card.append(el("p", "result-label", "Question for the floor"));
        card.append(el("blockquote", null, cause.question));
        detail.append(card);
      });
    } else {
      const card = el("article", "result-card");
      card.append(el("h3", null, "Go and see the work"));
      card.append(el("p", null, "Your answers do not point strongly to one cause. That usually means the problem is not visible from where the number is reported. Spend one shift where the result is produced, follow one case from start to finish and note where it first deviates."));
      detail.append(card);
    }
    grid.append(detail);

    const bars = el("div", "result-bars");
    bars.append(el("p", "result-label", "All five causes"));
    ranked.forEach(([key, score]) => {
      const row = el("div", "bar-row");
      if (top.includes(key)) row.classList.add("is-top");
      const label = el("div", "bar-label");
      label.append(el("span", null, data.causes[key].name), el("span", null, `${score}/${maxPerCause}`));
      const track = el("div", "bar-track");
      const fill = el("div", "bar-fill");
      fill.style.width = `${(score / maxPerCause) * 100}%`;
      track.append(fill);
      row.append(label, track);
      bars.append(row);
    });
    const essay = el("a", "text-link", "Read the essay behind this tool ");
    essay.href = document.querySelector(".tool-aside .inline-link").href;
    const arrow = el("span", null, "→");
    arrow.setAttribute("aria-hidden", "true");
    essay.append(arrow);
    bars.append(essay);
    grid.append(bars);
    resultBox.append(grid);

    const actions = el("div", "tool-actions result-actions");
    const copyButton = el("button", "button-primary", "Copy summary");
    copyButton.type = "button";
    copyButton.addEventListener("click", () => copy(summaryText(kpi, ranked, top), copyButton));
    const printButton = el("button", "button-secondary", "Print or save as PDF");
    printButton.type = "button";
    printButton.addEventListener("click", () => window.print());
    const resetButton = el("button", "button-secondary", "Start again");
    resetButton.type = "button";
    resetButton.addEventListener("click", () => {
      form.reset();
      updateProgress();
      resultBox.hidden = true;
      document.body.classList.remove("has-result");
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      form.querySelector("input").focus({ preventScroll: true });
    });
    actions.append(copyButton, printButton, resetButton);
    resultBox.append(actions);

    resultBox.hidden = false;
    // When printing, show only the result.
    document.body.classList.add("has-result");
    resultBox.scrollIntoView({ behavior: "smooth", block: "start" });
    resultBox.focus({ preventScroll: true });
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const missing = [...form.querySelectorAll("fieldset.statement")].filter((set) => !set.querySelector("input:checked"));
    form.querySelectorAll(".statement.is-missing").forEach((set) => set.classList.remove("is-missing"));
    if (missing.length) {
      missing.forEach((set) => set.classList.add("is-missing"));
      progress.textContent = `${missing.length} ${missing.length === 1 ? "statement" : "statements"} left to answer`;
      missing[0].scrollIntoView({ behavior: "smooth", block: "center" });
      missing[0].querySelector("input").focus({ preventScroll: true });
      return;
    }
    render();
  });

  form.addEventListener("change", (event) => {
    event.target.closest(".statement")?.classList.remove("is-missing");
  });
})();
