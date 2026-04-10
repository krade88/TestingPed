(function () {
  const baseQuestions = Array.isArray(window.PILOT_QUESTIONS) ? window.PILOT_QUESTIONS : [];

  const startBtn = document.getElementById("start-btn");
  const submitBtn = document.getElementById("submit-btn");
  const restartBtn = document.getElementById("restart-btn");
  const exportJsonBtn = document.getElementById("export-json-btn");
  const exportCsvBtn = document.getElementById("export-csv-btn");
  const exportPanel = document.getElementById("export-panel");
  const logNote = document.getElementById("log-note");
  const quizContainer = document.getElementById("quiz-container");
  const resultBox = document.getElementById("quiz-result");
  const timerEl = document.getElementById("timer");
  const fontIncBtn = document.getElementById("font-inc-btn");
  const fontDecBtn = document.getElementById("font-dec-btn");
  const pilotTitle = document.getElementById("pilot-title");
  const pilotDesc = document.getElementById("pilot-desc");
  const limitSec = 45 * 60;
  const autosaveKey = "it_teacher_pilot_autosave_v1";

  let questions = [];
  let leftSec = limitSec;
  let timerId = null;
  let started = false;
  let sessionStartMs = 0;
  let resultPayload = null;

  function formatTime(totalSec) {
    const m = String(Math.floor(totalSec / 60)).padStart(2, "0");
    const s = String(totalSec % 60).padStart(2, "0");
    return m + ":" + s;
  }

  function shuffle(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function normalizeText(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function buildShuffledQuestions() {
    const shuffledQuestions = baseQuestions.map((q, idx) => {
      const optionObjects = q.options.map((option, optionIdx) => ({ option, isAnswer: optionIdx === q.answer }));
      const mixedOptions = shuffle(optionObjects);
      return {
        id: "Q" + (idx + 1),
        dimension: q.dimension || "Hard Skills",
        level: q.level || "basic",
        module: q.module || "core",
        kind: q.kind || "single",
        match: Array.isArray(q.match) ? q.match : null,
        media: Array.isArray(q.media) ? q.media : null,
        acceptedAnswers: Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : null,
        block: q.block,
        text: q.text,
        options: mixedOptions.map((o) => o.option),
        answer: mixedOptions.findIndex((o) => o.isAnswer)
      };
    });
    return shuffledQuestions;
  }

  function renderQuestions() {
    quizContainer.innerHTML = questions.map((q, idx) => {
      const mediaHtml = Array.isArray(q.media) && q.media.length
        ? (
          '<div class="question-media-grid">' +
            q.media.map((m) => (
              '<figure class="question-media-item">' +
                '<figcaption>' + (m.label || "") + "</figcaption>" +
                '<img src="' + m.src + '" alt="' + (m.alt || "") + '">' +
              "</figure>"
            )).join("") +
          "</div>"
        )
        : "";
      let optionsHtml = "";
      if (q.kind === "matching" && Array.isArray(q.match) && q.match.length) {
        const rightItems = shuffle(q.match.map((pair) => pair.right));
        optionsHtml = q.match.map((pair, pairIdx) => {
          const selectOptions = ['<option value="">Выберите соответствие</option>']
            .concat(rightItems.map((item) => '<option value="' + item + '">' + item + "</option>"))
            .join("");
          return (
            '<div class="matching-row">' +
              '<div class="matching-left">' + pair.left + "</div>" +
              '<div class="matching-arrow">→</div>' +
              '<select class="matching-select" data-match="1" data-question-index="' + idx + '" data-pair-index="' + pairIdx + '">' +
                selectOptions +
              "</select>" +
            "</div>"
          );
        }).join("");
      } else if (q.kind === "open") {
        optionsHtml =
          '<label class="open-answer-label">' +
            '<span class="mini">Введите развернутый ответ:</span>' +
            '<textarea class="open-answer-input" data-open="1" data-question-index="' + idx + '" rows="4" placeholder="Введите ваш ответ..."></textarea>' +
          "</label>";
      } else if (q.kind === "fill_blank") {
        optionsHtml =
          '<label class="open-answer-label">' +
            '<span class="mini">Впишите термин:</span>' +
            '<input class="fill-blank-input" data-fill="1" data-question-index="' + idx + '" type="text" placeholder="Введите ответ">' +
          "</label>";
      } else {
        optionsHtml = q.options.map((option, optionIdx) => (
          '<label class="option-label">' +
            '<input type="radio" name="q-' + idx + '" value="' + optionIdx + '">' +
            "<span>" + option + "</span>" +
          "</label>"
        )).join("");
      }
      return (
        '<div class="question" data-question-index="' + idx + '">' +
          (q.kind === "matching" ? '<span class="pill kind-pill">Сопоставление</span><br>' : "") +
          (q.kind === "open" ? '<span class="pill kind-pill">Открытый ответ</span><br>' : "") +
          (q.kind === "fill_blank" ? '<span class="pill kind-pill">Заполнить поле</span><br>' : "") +
          "<b>" + (idx + 1) + ".</b><br>" +
          "<span>" + q.text + "</span>" +
          mediaHtml +
          '<div class="options">' + optionsHtml + "</div>" +
        "</div>"
      );
    }).join("");

    const controls = quizContainer.querySelectorAll("input[type='radio'], select[data-match='1'], textarea[data-open='1'], input[data-fill='1']");
    controls.forEach((control) => {
      const eventName = control.tagName === "TEXTAREA" || targetIsTextInput(control) ? "input" : "change";
      control.addEventListener(eventName, function (event) {
        const target = event.target;
        let idx = -1;
        if (target.getAttribute("data-match") === "1") {
          idx = Number(target.getAttribute("data-question-index"));
        } else if (target.getAttribute("data-open") === "1" || target.getAttribute("data-fill") === "1") {
          idx = Number(target.getAttribute("data-question-index"));
        } else {
          const name = target.name || "";
          idx = Number(name.replace("q-", ""));
        }
        if (Number.isNaN(idx)) return;
        const now = Date.now();
        questions[idx].lastChangedAtMs = now;
        questions[idx].changeCount += 1;
        saveProgress();
      });
    });
  }

  function targetIsTextInput(control) {
    return control.tagName === "INPUT" && (control.getAttribute("data-fill") === "1");
  }

  function saveProgress() {
    if (!started) return;
    const selectedAnswers = questions.map((q, idx) => {
      if (q.kind === "matching" && Array.isArray(q.match)) {
        return q.match.map(function (_, pairIdx) {
          const select = document.querySelector('select[data-match="1"][data-question-index="' + idx + '"][data-pair-index="' + pairIdx + '"]');
          return select ? String(select.value || "") : "";
        });
      }
      if (q.kind === "open") {
        const textarea = document.querySelector('textarea[data-open="1"][data-question-index="' + idx + '"]');
        return textarea ? String(textarea.value || "") : "";
      }
      if (q.kind === "fill_blank") {
        const input = document.querySelector('input[data-fill="1"][data-question-index="' + idx + '"]');
        return input ? String(input.value || "") : "";
      }
      const picked = document.querySelector('input[name="q-' + idx + '"]:checked');
      return picked ? Number(picked.value) : -1;
    });
    const payload = {
      leftSec: leftSec,
      sessionStartMs: sessionStartMs,
      selectedAnswers: selectedAnswers,
      questions: questions
    };
    localStorage.setItem(autosaveKey, JSON.stringify(payload));
  }

  function restoreProgress() {
    const raw = localStorage.getItem(autosaveKey);
    if (!raw) return false;
    try {
      const saved = JSON.parse(raw);
      if (!saved || !Array.isArray(saved.questions) || !saved.questions.length) return false;
      questions = saved.questions;
      leftSec = typeof saved.leftSec === "number" ? saved.leftSec : limitSec;
      sessionStartMs = typeof saved.sessionStartMs === "number" ? saved.sessionStartMs : Date.now();
      renderQuestions();
      if (Array.isArray(saved.selectedAnswers)) {
        saved.selectedAnswers.forEach((val, idx) => {
          const question = questions[idx];
          if (!question) return;
          if (question.kind === "matching" && Array.isArray(question.match) && Array.isArray(val)) {
            val.forEach(function (pickedValue, pairIdx) {
              const select = document.querySelector('select[data-match="1"][data-question-index="' + idx + '"][data-pair-index="' + pairIdx + '"]');
              if (select && typeof pickedValue === "string") select.value = pickedValue;
            });
            return;
          }
          if (question.kind === "open" && typeof val === "string") {
            const textarea = document.querySelector('textarea[data-open="1"][data-question-index="' + idx + '"]');
            if (textarea) textarea.value = val;
            return;
          }
          if (question.kind === "fill_blank" && typeof val === "string") {
            const input = document.querySelector('input[data-fill="1"][data-question-index="' + idx + '"]');
            if (input) input.value = val;
            return;
          }
          if (typeof val === "number" && val >= 0) {
            const radio = document.querySelector('input[name="q-' + idx + '"][value="' + val + '"]');
            if (radio) radio.checked = true;
          }
        });
      }
      started = true;
      startBtn.disabled = true;
      submitBtn.disabled = false;
      restartBtn.classList.add("hidden");
      exportPanel.classList.add("hidden");
      logNote.classList.add("hidden");
      timerEl.textContent = "Осталось: " + formatTime(leftSec);
      timerId = setInterval(() => {
        leftSec -= 1;
        timerEl.textContent = "Осталось: " + formatTime(Math.max(leftSec, 0));
        saveProgress();
        if (leftSec <= 0) finishQuiz(true);
      }, 1000);
      return true;
    } catch (e) {
      localStorage.removeItem(autosaveKey);
      return false;
    }
  }

  function getCategory(percent) {
    if (percent >= 85) return { label: "Готов к преподаванию", cls: "ok", tip: "Можно планировать стандартный онбординг и точечный методический коучинг." };
    if (percent >= 75) return { label: "Условно готов, требуется наставничество", cls: "warn", tip: "Рекомендуется наставник на 6-8 недель и адресная проработка слабых блоков." };
    return { label: "Требуется дополнительная подготовка", cls: "bad", tip: "Нужен индивидуальный план подготовки и повторное тестирование до самостоятельных занятий." };
  }

  function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function toCsvRows(payload) {
    const rows = [
      ["session_id", payload.sessionId],
      ["completed_at", payload.completedAt],
      ["total_questions", String(payload.totalQuestions)],
      ["correct_answers", String(payload.correctAnswers)],
      ["score_percent", String(payload.scorePercent)],
      ["category", payload.category],
      ["spent_seconds_total", String(payload.spentSecondsTotal)],
      []
    ];
    rows.push(["question_id", "dimension", "level", "module", "block", "question", "selected_option", "correct_option", "is_correct", "time_to_answer_sec", "answer_change_count"]);
    payload.questions.forEach((q) => {
      rows.push([
        q.id,
        q.dimension,
        q.level,
        q.module,
        q.block,
        q.text,
        q.selectedOptionText,
        q.correctOptionText,
        String(q.isCorrect),
        String(q.timeToAnswerSec),
        String(q.answerChangeCount)
      ]);
    });
    return rows.map((row) => row.map((cell) => '"' + String(cell).replace(/"/g, '""') + '"').join(",")).join("\n");
  }

  function finishQuiz(auto) {
    if (!started) return;
    clearInterval(timerId);
    started = false;

    let correct = 0;
    let autoGradableTotal = 0;
    let manualQuestionsCount = 0;
    const byBlock = {};
    const byDimension = {};
    questions.forEach((q) => {
      byBlock[q.block] = byBlock[q.block] || { ok: 0, total: 0, manual: 0 };
      byDimension[q.dimension] = byDimension[q.dimension] || { ok: 0, total: 0, manual: 0 };
      if (q.kind === "open") {
        byBlock[q.block].manual += 1;
        byDimension[q.dimension].manual += 1;
        manualQuestionsCount += 1;
      } else {
        byBlock[q.block].total += 1;
        byDimension[q.dimension].total += 1;
        autoGradableTotal += 1;
      }
    });

    const questionLogs = questions.map((q, idx) => {
      let selectedOptionIndex = -1;
      let selectedOptionText = "";
      let correctOptionText = q.options[q.answer];
      let isCorrect = false;
      let requiresManualReview = false;

      if (q.kind === "matching" && Array.isArray(q.match)) {
        const selectedPairs = q.match.map(function (_, pairIdx) {
          const select = document.querySelector('select[data-match="1"][data-question-index="' + idx + '"][data-pair-index="' + pairIdx + '"]');
          return select ? String(select.value || "") : "";
        });
        isCorrect = selectedPairs.every(function (val, pairIdx) { return val === q.match[pairIdx].right; });
        selectedOptionText = selectedPairs.map(function (val, pairIdx) {
          return q.match[pairIdx].left + " -> " + (val || "—");
        }).join(" | ");
        correctOptionText = q.match.map(function (pair) {
          return pair.left + " -> " + pair.right;
        }).join(" | ");
      } else if (q.kind === "fill_blank") {
        const input = document.querySelector('input[data-fill="1"][data-question-index="' + idx + '"]');
        const userValue = input ? String(input.value || "") : "";
        selectedOptionText = userValue;
        const normalizedUserValue = normalizeText(userValue);
        const accepted = Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : [];
        isCorrect = accepted.map(normalizeText).includes(normalizedUserValue);
        correctOptionText = accepted.join(" / ");
      } else if (q.kind === "open") {
        const textarea = document.querySelector('textarea[data-open="1"][data-question-index="' + idx + '"]');
        selectedOptionText = textarea ? String(textarea.value || "") : "";
        correctOptionText = "Ручная проверка";
        requiresManualReview = true;
      } else {
        const picked = document.querySelector('input[name="q-' + idx + '"]:checked');
        selectedOptionIndex = picked ? Number(picked.value) : -1;
        isCorrect = selectedOptionIndex === q.answer;
        selectedOptionText = selectedOptionIndex >= 0 ? q.options[selectedOptionIndex] : "";
      }

      if (isCorrect) {
        correct += 1;
        byBlock[q.block].ok += 1;
        byDimension[q.dimension].ok += 1;
      }
      const answerAt = q.lastChangedAtMs || Date.now();
      const timeToAnswerSec = Math.max(0, Math.round((answerAt - q.renderedAtMs) / 1000));
      return {
        id: q.id,
        dimension: q.dimension,
        level: q.level,
        module: q.module,
        block: q.block,
        text: q.text,
        selectedOptionIndex: selectedOptionIndex,
        selectedOptionText: selectedOptionText,
        correctOptionIndex: q.answer,
        correctOptionText: correctOptionText,
        isCorrect: requiresManualReview ? null : isCorrect,
        requiresManualReview: requiresManualReview,
        timeToAnswerSec: timeToAnswerSec,
        answerChangeCount: q.changeCount
      };
    });

    const percent = autoGradableTotal > 0 ? Math.round((correct / autoGradableTotal) * 100) : 0;
    const category = getCategory(percent);
    const details = Object.keys(byBlock).map((block) => {
      if (byBlock[block].total > 0) {
        const p = Math.round((byBlock[block].ok / byBlock[block].total) * 100);
        return "<li>" + block + ": " + byBlock[block].ok + "/" + byBlock[block].total + " (" + p + "%)" + (byBlock[block].manual > 0 ? ", открытые: " + byBlock[block].manual : "") + "</li>";
      }
      return "<li>" + block + ": автопроверка не применяется, открытые: " + byBlock[block].manual + "</li>";
    }).join("");
    const detailsByDimension = Object.keys(byDimension).map((dimension) => {
      if (byDimension[dimension].total > 0) {
        const p = Math.round((byDimension[dimension].ok / byDimension[dimension].total) * 100);
        return "<li>" + dimension + ": " + byDimension[dimension].ok + "/" + byDimension[dimension].total + " (" + p + "%)" + (byDimension[dimension].manual > 0 ? ", открытые: " + byDimension[dimension].manual : "") + "</li>";
      }
      return "<li>" + dimension + ": автопроверка не применяется, открытые: " + byDimension[dimension].manual + "</li>";
    }).join("");
    const weakestBlocks = Object.keys(byBlock)
      .map((block) => {
        const p = byBlock[block].total > 0 ? Math.round((byBlock[block].ok / byBlock[block].total) * 100) : 100;
        return { block: block, score: p };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, 3);
    const planText = weakestBlocks.map((item, idx) => {
      if (idx === 0) return "30 дней: закрыть базовые пробелы по блоку '" + item.block + "' (чек-лист + 2 практики).";
      if (idx === 1) return "60 дней: провести пробное занятие с наставником по блоку '" + item.block + "'.";
      return "90 дней: повторная диагностика и корректировка методической траектории по блоку '" + item.block + "'.";
    }).join("<br>");

    const completedAt = new Date().toISOString();
    const spentSecondsTotal = Math.round((Date.now() - sessionStartMs) / 1000);
    resultPayload = {
      sessionId: "sess-" + Date.now(),
      completedAt: completedAt,
      autoCompleted: auto,
      totalQuestions: questions.length,
      autoGradableQuestions: autoGradableTotal,
      manualReviewQuestions: manualQuestionsCount,
      correctAnswers: correct,
      scorePercent: percent,
      category: category.label,
      spentSecondsTotal: spentSecondsTotal,
      byBlock: byBlock,
      byDimension: byDimension,
      questions: questionLogs
    };
    localStorage.removeItem(autosaveKey);

    resultBox.className = "question";
    resultBox.innerHTML =
      "<b>Результат автопроверки: " + correct + "/" + autoGradableTotal + " (" + percent + "%)</b><br>" +
      (manualQuestionsCount > 0 ? "<small>Открытые ответы для ручной проверки: " + manualQuestionsCount + ".</small><br>" : "") +
      'Категория: <span class="' + category.cls + '"><b>' + category.label + "</b></span><br>" +
      (auto ? "<small>Тест завершен автоматически по таймеру.</small><br>" : "") +
      "<b>Карта компетенций (3 измерения):</b><ul>" + detailsByDimension + "</ul>" +
      "<b>Детализация по блокам:</b><ul>" + details + "</ul>" +
      "<b>План адаптации 30-60-90:</b><br>" + planText + "<br>" +
      "<small>Рекомендована пересдача после периода подготовки.</small><br>" +
      "<b>Рекомендация:</b> " + category.tip;

    submitBtn.disabled = true;
    restartBtn.classList.remove("hidden");
    exportPanel.classList.remove("hidden");
    logNote.classList.remove("hidden");
  }

  function startQuiz() {
    if (!baseQuestions.length) {
      alert("Банк вопросов не загружен. Проверьте подключение файла questions.js");
      return;
    }
    questions = buildShuffledQuestions().map((q) => ({
      id: q.id,
      block: q.block,
      text: q.text,
      dimension: q.dimension,
      level: q.level,
      module: q.module,
      kind: q.kind,
      match: q.match,
      media: q.media,
      acceptedAnswers: q.acceptedAnswers,
      options: q.options,
      answer: q.answer,
      renderedAtMs: Date.now(),
      lastChangedAtMs: null,
      changeCount: 0
    }));
    sessionStartMs = Date.now();
    leftSec = limitSec;
    timerEl.textContent = "Осталось: " + formatTime(leftSec);
    resultBox.className = "question hidden";
    resultBox.innerHTML = "";
    resultPayload = null;
    renderQuestions();
    started = true;
    startBtn.disabled = true;
    submitBtn.disabled = false;
    restartBtn.classList.add("hidden");
    exportPanel.classList.add("hidden");
    logNote.classList.add("hidden");

    timerId = setInterval(() => {
      leftSec -= 1;
      timerEl.textContent = "Осталось: " + formatTime(Math.max(leftSec, 0));
      saveProgress();
      if (leftSec <= 0) finishQuiz(true);
    }, 1000);
    saveProgress();
  }

  startBtn.addEventListener("click", startQuiz);
  submitBtn.addEventListener("click", function () { finishQuiz(false); });
  restartBtn.addEventListener("click", function () {
    clearInterval(timerId);
    started = false;
    startBtn.disabled = false;
    submitBtn.disabled = true;
    quizContainer.innerHTML = "";
    resultBox.className = "question hidden";
    resultBox.innerHTML = "";
    timerEl.textContent = "Осталось: " + formatTime(limitSec);
    resultPayload = null;
    exportPanel.classList.add("hidden");
    logNote.classList.add("hidden");
    localStorage.removeItem(autosaveKey);
  });
  exportJsonBtn.addEventListener("click", function () {
    if (!resultPayload) return;
    downloadFile("pilot-test-result.json", JSON.stringify(resultPayload, null, 2), "application/json;charset=utf-8");
  });
  exportCsvBtn.addEventListener("click", function () {
    if (!resultPayload) return;
    const csv = toCsvRows(resultPayload);
    downloadFile("pilot-test-result.csv", csv, "text/csv;charset=utf-8");
  });

  if (pilotTitle) {
    pilotTitle.textContent = "Пробный тест (единый список вопросов)";
  }
  if (pilotDesc) {
    pilotDesc.textContent = "Формат пилота: объективные MCQ и прикладные кейсы. После завершения вы получите карту компетенций, план 30-60-90 и рекомендации.";
  }
  timerEl.textContent = "Осталось: " + formatTime(limitSec);

  if (fontIncBtn) {
    fontIncBtn.addEventListener("click", function () {
      const current = parseFloat(getComputedStyle(document.body).fontSize);
      document.body.style.fontSize = Math.min(current + 1, 22) + "px";
    });
  }
  if (fontDecBtn) {
    fontDecBtn.addEventListener("click", function () {
      const current = parseFloat(getComputedStyle(document.body).fontSize);
      document.body.style.fontSize = Math.max(current - 1, 14) + "px";
    });
  }
  restoreProgress();
})();
