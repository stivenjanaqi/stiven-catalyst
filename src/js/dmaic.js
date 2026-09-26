(() => {
  const dataEl = document.getElementById("dmaic-data");
  if (!dataEl || !window.ToolKit) return;

  const { read, write } = window.ToolKit;
  const data = JSON.parse(dataEl.textContent);
  const KEY = data.storageKey;
  const state = { answers: {}, checks: {}, charter: {}, ...read(KEY, {}) };
  const save = () => write(KEY, state);
  const total = data.modules.reduce((sum, m) => sum + m.quiz.length, 0);

  // Quiz ----------------------------------------------------------------------
  const isRight = (module, index) => state.answers[`${module.id}-${index}`] === module.quiz[index].answer;

  const showFeedback = (module, index) => {
    const set = document.querySelector(`[data-quiz="${module.id}"] [data-question="${index}"]`);
    const feedback = set.querySelector("[data-feedback]");
    const chosen = state.answers[`${module.id}-${index}`];
    set.querySelectorAll(".dm-option").forEach((option, i) => {
      option.classList.toggle("is-right", chosen !== undefined && i === chosen && isRight(module, index));
      option.classList.toggle("is-wrong", chosen !== undefined && i === chosen && !isRight(module, index));
    });
    if (chosen === undefined) {
      feedback.hidden = true;
      return;
    }
    feedback.hidden = false;
    feedback.className = `dm-feedback ${isRight(module, index) ? "is-right" : "is-wrong"}`;
    feedback.textContent = isRight(module, index) ? `Right. ${module.quiz[index].why}` : "Not quite. Read the step again and try another answer.";
  };

  const renderProgress = () => {
    let right = 0;
    let done = 0;
    data.modules.forEach((module) => {
      const moduleRight = module.quiz.filter((_, i) => isRight(module, i)).length;
      right += moduleRight;
      const complete = moduleRight === module.quiz.length;
      if (complete) done++;
      document.querySelector(`[data-step="${module.id}"]`)?.classList.toggle("is-done", complete);
      const score = document.querySelector(`[data-quiz="${module.id}"] [data-score]`);
      const answered = module.quiz.filter((_, i) => state.answers[`${module.id}-${i}`] !== undefined).length;
      score.textContent = answered ? `${moduleRight} of ${module.quiz.length} right${complete ? ": step complete." : "."}` : "";
    });
    document.querySelector("[data-progress-bar]").style.width = `${(right / total) * 100}%`;
    document.querySelector("[data-progress-text]").textContent = right
      ? `${right} of ${total} questions right · ${done} of ${data.modules.length} steps complete${done === data.modules.length ? ". Well done: now start your own project below." : ""}`
      : "Answer the questions to track your progress.";
  };

  data.modules.forEach((module) => {
    const quiz = document.querySelector(`[data-quiz="${module.id}"]`);
    module.quiz.forEach((_, index) => {
      const chosen = state.answers[`${module.id}-${index}`];
      if (chosen !== undefined) {
        const input = quiz.querySelector(`input[name="q-${module.id}-${index}"][value="${chosen}"]`);
        if (input) input.checked = true;
        showFeedback(module, index);
      }
    });
    quiz.addEventListener("change", (event) => {
      const input = event.target.closest("input[type=radio]");
      if (!input) return;
      const index = Number(input.closest("[data-question]").dataset.question);
      state.answers[`${module.id}-${index}`] = Number(input.value);
      save();
      showFeedback(module, index);
      renderProgress();
    });
  });

  // Step checklists.
  document.querySelectorAll("[data-check]").forEach((box) => {
    box.checked = Boolean(state.checks[box.dataset.check]);
    box.addEventListener("change", () => {
      state.checks[box.dataset.check] = box.checked;
      save();
    });
  });

  // Mark the step being read in the course nav.
  const links = [...document.querySelectorAll("[data-step]")];
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.filter((entry) => entry.isIntersecting).forEach((entry) => {
        links.forEach((link) => link.classList.toggle("is-current", link.dataset.step === entry.target.dataset.module));
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    document.querySelectorAll("[data-module]").forEach((section) => observer.observe(section));
  }

  // Charter -------------------------------------------------------------------
  const charter = document.querySelector("[data-charter]");
  const status = charter.querySelector("[data-charter-status]");
  const fields = data.charter.map(([name, label]) => ({ name, label, input: charter.elements[name] }));
  const saveCharter = () => {
    state.charter = Object.fromEntries(fields.map((f) => [f.name, f.input.value]));
    save();
  };
  fields.forEach((f) => {
    f.input.value = state.charter[f.name] || "";
    f.input.addEventListener("input", saveCharter);
  });
  const note = (message) => {
    status.textContent = message;
    clearTimeout(note.timer);
    note.timer = setTimeout(() => { status.textContent = "Your charter is kept only in this browser."; }, 2200);
  };

  charter.querySelector("[data-charter-print]").addEventListener("click", () => {
    document.body.classList.add("print-charter");
    window.print();
  });
  window.addEventListener("afterprint", () => document.body.classList.remove("print-charter"));

  charter.querySelector("[data-charter-copy]").addEventListener("click", async () => {
    const text = ["DMAIC project charter | Stiven Catalyst", "", ...fields.map((f) => `${f.label}: ${f.input.value.trim() || "-"}`)].join("\n");
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
    note("Copied to the clipboard.");
  });

  charter.querySelector("[data-charter-example]").addEventListener("click", () => {
    if (fields.some((f) => f.input.value.trim()) && !window.confirm("Replace your charter with the course case?")) return;
    fields.forEach((f) => { f.input.value = data.charterExample[f.name] || ""; });
    saveCharter();
    note("Filled with the course case.");
  });

  charter.querySelector("[data-charter-clear]").addEventListener("click", () => {
    if (!window.confirm("Clear the whole charter?")) return;
    fields.forEach((f) => { f.input.value = ""; });
    saveCharter();
    note("Charter cleared.");
    fields[0].input.focus();
  });

  renderProgress();
})();
