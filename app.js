(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const categories = { foundations: "The foundations", mechanics: "Inside the model", language: "Language & trust", mixed: "Mixed signals" };
  const storageKey = "synapse-bests-v1";
  const state = { mode: "mixed", questions: [], index: 0, score: 0, streak: 0, maxStreak: 0, correct: 0, answered: false, finished: false, previousBest: 0 };
  let bests = {};
  let pendingMode = null;
  let storageAvailable = true;
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || "{}");
    if (stored && typeof stored === "object" && !Array.isArray(stored)) {
      for (const mode of Object.keys(categories)) {
        if (Number.isInteger(stored[mode]) && stored[mode] >= 0 && stored[mode] <= 1750) bests[mode] = stored[mode];
      }
    }
  } catch (error) {
    storageAvailable = false;
    storageNotice("Personal best storage is unavailable. You can still play; scores will last for this visit.");
    console.warn("AI Quiz could not read personal bests.", error);
  }

  function storageNotice(message) {
    $("storage-notice").textContent = message;
    $("storage-notice").hidden = false;
  }
  function shuffled(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function makeRound(mode) {
    let selected;
    if (mode === "mixed") {
      const core = ["bias", "parameter", "transformer", "perceptron"];
      selected = shuffled([...QUESTIONS.filter(q => core.includes(q.id)), ...shuffled(QUESTIONS.filter(q => !core.includes(q.id))).slice(0, 6)]);
    } else {
      selected = shuffled(QUESTIONS.filter(q => q.category === mode));
    }
    return selected.map(question => {
      const options = shuffled(question.answers.map((text, index) => ({ text, correct: index === question.correct })));
      return { ...question, options };
    });
  }
  function startRound(mode, focus = false) {
    Object.assign(state, { mode, questions: makeRound(mode), index: 0, score: 0, streak: 0, maxStreak: 0, correct: 0, answered: false, finished: false, previousBest: bests[mode] || 0 });
    $("mode").value = mode;
    $("question-view").hidden = false;
    $("result-view").hidden = true;
    $("share-status").textContent = "";
    updateScore();
    renderQuestion(focus);
  }
  function updateScore() {
    $("score").textContent = state.score.toLocaleString("en-US");
    $("streak").textContent = state.streak;
    $("personal-best").textContent = (bests[state.mode] || 0).toLocaleString("en-US");
    [...$("streak-dots").children].forEach((dot, i) => dot.classList.toggle("active", i < state.streak));
  }
  function renderQuestion(focus) {
    const question = state.questions[state.index];
    state.answered = false;
    $("question-view").classList.remove("answered");
    $("question-counter").textContent = `QUESTION ${String(state.index + 1).padStart(2, "0")} / 10`;
    $("topic-pill").textContent = categories[question.category].toUpperCase();
    $("progress-fill").style.width = `${state.index * 10}%`;
    $("progress").setAttribute("aria-valuenow", state.index);
    $("question-title").textContent = question.prompt;
    $("explanation").hidden = true;
    $("quiz-bottom").hidden = true;
    $("next-button").hidden = true;
    $("next-button").innerHTML = `${state.index === 9 ? "See my results" : "Next question"} <span aria-hidden="true">↗</span>`;
    $("answers").replaceChildren();
    question.options.forEach((option, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "answer";
      const letter = document.createElement("span");
      letter.className = "answer-letter";
      letter.setAttribute("aria-hidden", "true");
      letter.textContent = "ABCD"[i];
      const text = document.createElement("span");
      text.textContent = option.text;
      button.append(letter, text);
      button.addEventListener("click", () => answer(i));
      $("answers").append(button);
    });
    $("question-view").classList.remove("entering");
    requestAnimationFrame(() => $("question-view").classList.add("entering"));
    if (focus) $("question-title").focus({ preventScroll: true });
  }
  function answer(selectedIndex) {
    if (state.answered || state.finished) return;
    state.answered = true;
    const question = state.questions[state.index];
    const correct = question.options[selectedIndex].correct;
    let points = 0;
    if (correct) {
      state.streak++;
      state.correct++;
      points = 100 + Math.min(state.streak - 1, 4) * 25;
      state.score += points;
      state.maxStreak = Math.max(state.maxStreak, state.streak);
    } else {
      state.streak = 0;
    }
    [...$("answers").children].forEach((button, i) => {
      button.disabled = true;
      const isCorrect = question.options[i].correct;
      const isWrong = i === selectedIndex && !correct;
      if (isCorrect || isWrong) {
        button.classList.add(isCorrect ? "correct" : "wrong");
        const icon = document.createElement("span");
        icon.className = "answer-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = isCorrect ? "✓" : "×";
        button.append(icon);
        const description = document.createElement("span");
        description.className = "sr-only";
        description.textContent = isCorrect ? " (correct answer)" : " (your answer, incorrect)";
        button.append(description);
      }
    });
    $("answer-verdict").textContent = correct ? "Correct" : "Not quite";
    $("points-earned").textContent = correct ? `+${points} points` : "+0 points";
    $("explanation-text").textContent = question.explanation;
    $("analogy-text").textContent = question.analogy;
    $("explanation").hidden = false;
    $("quiz-bottom").hidden = false;
    $("next-button").hidden = false;
    $("question-view").classList.add("answered");
    $("progress-fill").style.width = `${(state.index + 1) * 10}%`;
    $("progress").setAttribute("aria-valuenow", state.index + 1);
    updateScore();
    $("score").classList.remove("score-pop");
    requestAnimationFrame(() => $("score").classList.add("score-pop"));
    const correctText = question.options.find(option => option.correct).text;
    $("announcer").textContent = `${correct ? `Correct. ${points} points.` : `Not quite. The correct answer is: ${correctText}.`} ${question.explanation} Think of it this way: ${question.analogy}`;
    $("next-button").focus({ preventScroll: true });
    $("explanation").scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "nearest" });
  }
  function saveBest() {
    if (state.score <= (bests[state.mode] || 0)) return;
    bests[state.mode] = state.score;
    if (!storageAvailable) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(bests));
    } catch (error) {
      storageAvailable = false;
      storageNotice("Your best is saved for this visit only. Browser storage could not be updated.");
      console.warn("AI Quiz could not save the personal best.", error);
    }
  }
  function finish() {
    state.finished = true;
    saveBest();
    updateScore();
    $("question-view").hidden = true;
    $("result-view").hidden = false;
    $("question-counter").textContent = "SESSION COMPLETE";
    $("topic-pill").textContent = categories[state.mode].toUpperCase();
    $("result-title").textContent = state.correct === 10 ? "Perfectly connected." : state.correct >= 7 ? "Look at those connections." : "A brighter mind.";
    $("result-message").textContent = state.correct >= 7 ? "The jargon is getting less mysterious. Take another lap and see how far your curiosity goes." : "Every explanation is a step forward. Give it another go: the best way to learn is to keep connecting.";
    $("final-score").textContent = state.score.toLocaleString("en-US");
    $("final-correct").textContent = `${state.correct}/10`;
    $("final-streak").textContent = state.maxStreak;
    $("record-message").textContent = state.score > state.previousBest ? "A new personal best. That's your curiosity paying off." : state.score === 1750 ? "The highest possible score. Beautifully done." : `Your next summit: ${(bests[state.mode] || 0).toLocaleString("en-US")} points.`;
    $("result-title").tabIndex = -1;
    $("result-title").focus({ preventScroll: true });
    $("announcer").textContent = `Quiz complete. ${state.score} points. ${state.correct} of 10 correct. Best streak ${state.maxStreak}.`;
    celebrate();
  }
  function celebrate() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (let i = 0; i < 38; i++) {
      const piece = document.createElement("span");
      piece.className = "confetti";
      piece.style.left = `${Math.random() * 100}vw`;
      piece.style.background = ["#d8f97a", "#8ba95c", "#ffb5a0", "#657a58"][i % 4];
      piece.style.animationDelay = `${Math.random() * .5}s`;
      piece.style.setProperty("--drift", `${(Math.random() - .5) * 220}px`);
      document.body.append(piece);
      piece.addEventListener("animationend", () => piece.remove(), { once: true });
    }
  }
  $("next-button").addEventListener("click", () => {
    if (!state.answered || state.finished) return;
    if (state.index === 9) finish();
    else {
      state.index++;
      renderQuestion(true);
      if ($("quiz-panel").getBoundingClientRect().top < 0) $("quiz-panel").scrollIntoView({ behavior: "instant", block: "start" });
    }
  });
  $("play-again").addEventListener("click", () => startRound(state.mode, true));
  $("mode").addEventListener("change", (event) => {
    const mode = event.target.value;
    if (!state.finished && (state.index > 0 || state.answered)) {
      pendingMode = mode;
      $("mode").value = state.mode;
      $("switch-dialog").showModal();
    } else startRound(mode, true);
  });
  $("confirm-switch").addEventListener("click", () => {
    const mode = pendingMode;
    pendingMode = null;
    $("switch-dialog").close();
    if (mode) startRound(mode, true);
  });
  $("cancel-switch").addEventListener("click", () => $("switch-dialog").close());
  $("switch-dialog").addEventListener("close", () => { pendingMode = null; });
  $("share-result").addEventListener("click", async () => {
    const text = `I scored ${state.score.toLocaleString("en-US")}/1,750 on AI Quiz (${categories[state.mode]})! ${state.correct}/10 correct, best streak: ${state.maxStreak}. Make a little sense of AI.`;
    try {
      await navigator.clipboard.writeText(text);
      $("share-status").textContent = "Result copied. Share a little curiosity.";
    } catch (error) {
      $("share-status").textContent = `Couldn't copy automatically. Your result: ${text}`;
      console.warn("AI Quiz could not copy the result.", error);
    }
  });
  const entries = [...QUESTIONS].sort((a, b) => a.term.localeCompare(b.term));
  function renderGlossary(query = "") {
    const matching = entries.filter(q => `${q.term} ${q.explanation}`.toLowerCase().includes(query.toLowerCase().trim()));
    $("glossary-list").replaceChildren();
    if (!matching.length) {
      const empty = document.createElement("p");
      empty.textContent = "No connections found. Try a different word.";
      $("glossary-list").append(empty);
    }
    matching.forEach(question => {
      const entry = document.createElement("article");
      entry.className = "glossary-entry";
      const heading = document.createElement("h3");
      heading.textContent = question.term;
      const body = document.createElement("p");
      body.textContent = question.explanation;
      entry.append(heading, body);
      $("glossary-list").append(entry);
    });
  }
  $("glossary-open").addEventListener("click", () => {
    $("glossary-search").value = "";
    renderGlossary();
    $("glossary-dialog").showModal();
    $("glossary-search").focus();
  });
  $("glossary-search").addEventListener("input", (event) => renderGlossary(event.target.value));
  $("rules-open").addEventListener("click", () => $("rules-dialog").showModal());
  document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => $(button.dataset.close).close()));
  document.querySelectorAll("dialog").forEach(dialog => dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  }));
  function drawNetwork() {
    const ns = "http://www.w3.org/2000/svg";
    const layers = [4, 5, 5, 4].map((count, layer) =>
      Array.from({ length: count }, (_, index) => ({
        x: 55 + layer * 170,
        y: 75 + (index - (count - 1) / 2) * 28
      }))
    );
    layers.forEach((layer, layerIndex) => {
      if (layerIndex < layers.length - 1) {
        layer.forEach((point, from) => layers[layerIndex + 1].forEach((next, to) => {
          const d = `M ${point.x} ${point.y} C ${point.x + 70} ${point.y}, ${next.x - 70} ${next.y}, ${next.x} ${next.y}`;
          const line = document.createElementNS(ns, "path");
          line.setAttribute("d", d);
          line.classList.add("network-link");
          $("network-lines").append(line);
          if ((from * 3 + to + layerIndex) % 4 === 0) {
            const pulse = document.createElementNS(ns, "circle");
            pulse.setAttribute("r", "3");
            pulse.classList.add("network-pulse");
            pulse.style.offsetPath = `path("${d}")`;
            pulse.style.animationDelay = `${-(layerIndex * .7 + from * .43 + to * .19)}s`;
            $("network-pulses").append(pulse);
          }
        }));
      }
      layer.forEach((point, index) => {
        const node = document.createElementNS(ns, "circle");
        node.setAttribute("cx", point.x);
        node.setAttribute("cy", point.y);
        node.setAttribute("r", "6");
        node.classList.add("network-node");
        node.style.animationDelay = `${-(layerIndex * .7 + index * .4)}s`;
        $("network-nodes").append(node);
      });
    });
  }
  drawNetwork();
  startRound("mixed");
})();
