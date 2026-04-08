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
  const limitSec = 20 * 60;

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

  function buildShuffledQuestions() {
    const shuffledQuestions = shuffle(baseQuestions).map((q, idx) => {
      const optionObjects = q.options.map((option, optionIdx) => ({ option, isAnswer: optionIdx === q.answer }));
      const mixedOptions = shuffle(optionObjects);
      return {
        id: "Q" + (idx + 1),
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
      const optionsHtml = q.options.map((option, optionIdx) => (
        '<label class="option-label">' +
          '<input type="radio" name="q-' + idx + '" value="' + optionIdx + '">' +
          "<span>" + option + "</span>" +
        "</label>"
      )).join("");
      return (
        '<div class="question" data-question-index="' + idx + '">' +
          "<b>" + (idx + 1) + ". [" + q.block + "]</b><br>" +
          "<span>" + q.text + "</span>" +
          '<div class="options">' + optionsHtml + "</div>" +
        "</div>"
      );
    }).join("");

    const radios = quizContainer.querySelectorAll("input[type='radio']");
    radios.forEach((radio) => {
      radio.addEventListener("change", function (event) {
        const target = event.target;
        const name = target.name || "";
        const idx = Number(name.replace("q-", ""));
        if (Number.isNaN(idx)) return;
        const now = Date.now();
        questions[idx].lastChangedAtMs = now;
        questions[idx].changeCount += 1;
      });
    });
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
    rows.push(["question_id", "block", "question", "selected_option", "correct_option", "is_correct", "time_to_answer_sec", "answer_change_count"]);
    payload.questions.forEach((q) => {
      rows.push([
        q.id,
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
    const byBlock = {};
    questions.forEach((q) => {
      byBlock[q.block] = byBlock[q.block] || { ok: 0, total: 0 };
      byBlock[q.block].total += 1;
    });

    const questionLogs = questions.map((q, idx) => {
      const picked = document.querySelector('input[name="q-' + idx + '"]:checked');
      const selectedOptionIndex = picked ? Number(picked.value) : -1;
      const isCorrect = selectedOptionIndex === q.answer;
      if (isCorrect) {
        correct += 1;
        byBlock[q.block].ok += 1;
      }
      const answerAt = q.lastChangedAtMs || Date.now();
      const timeToAnswerSec = Math.max(0, Math.round((answerAt - q.renderedAtMs) / 1000));
      return {
        id: q.id,
        block: q.block,
        text: q.text,
        selectedOptionIndex: selectedOptionIndex,
        selectedOptionText: selectedOptionIndex >= 0 ? q.options[selectedOptionIndex] : "",
        correctOptionIndex: q.answer,
        correctOptionText: q.options[q.answer],
        isCorrect: isCorrect,
        timeToAnswerSec: timeToAnswerSec,
        answerChangeCount: q.changeCount
      };
    });

    const percent = Math.round((correct / questions.length) * 100);
    const category = getCategory(percent);
    const details = Object.keys(byBlock).map((block) => {
      const p = Math.round((byBlock[block].ok / byBlock[block].total) * 100);
      return "<li>" + block + ": " + byBlock[block].ok + "/" + byBlock[block].total + " (" + p + "%)</li>";
    }).join("");

    const completedAt = new Date().toISOString();
    const spentSecondsTotal = Math.round((Date.now() - sessionStartMs) / 1000);
    resultPayload = {
      sessionId: "sess-" + Date.now(),
      completedAt: completedAt,
      autoCompleted: auto,
      totalQuestions: questions.length,
      correctAnswers: correct,
      scorePercent: percent,
      category: category.label,
      spentSecondsTotal: spentSecondsTotal,
      byBlock: byBlock,
      questions: questionLogs
    };

    resultBox.className = "question";
    resultBox.innerHTML =
      "<b>Результат: " + correct + "/" + questions.length + " (" + percent + "%)</b><br>" +
      'Категория: <span class="' + category.cls + '"><b>' + category.label + "</b></span><br>" +
      (auto ? "<small>Тест завершен автоматически по таймеру.</small><br>" : "") +
      "<ul>" + details + "</ul>" +
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
      if (leftSec <= 0) finishQuiz(true);
    }, 1000);
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
    timerEl.textContent = "Осталось: 20:00";
    resultPayload = null;
    exportPanel.classList.add("hidden");
    logNote.classList.add("hidden");
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
})();
