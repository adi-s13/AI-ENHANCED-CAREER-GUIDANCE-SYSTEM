// static/psychometric.js
// Multi-step psychometric wizard (25 Likert + 3 puzzles).
// Replaces old wizard: injects questions, handles validation, grades puzzles,
// modifies answers based on puzzle correctness, then submits { answers: [...] }
// to /api/save_psychometric so backend computes traits normally.

(() => {
  // --- QUESTIONS (25) — same ordering expected by backend TRAIT_QUESTION_MAP ---
  const QUESTIONS = [
    // Analytical (A) — 4
    "I enjoy solving complex logical problems.",
    "I like understanding how systems work.",
    "I enjoy data analysis and patterns.",
    "I prefer tasks requiring logical thinking.",
    // Creative (C) — 4
    "I enjoy creative activities such as drawing or designing.",
    "I often come up with new ideas.",
    "I like imagining new possibilities.",
    "I prefer open-ended creative tasks.",
    // Social (S) — 4
    "I enjoy working with and helping people.",
    "I am empathetic toward others.",
    "I prefer group activities over working alone.",
    "I am good at communication.",
    // Leadership (L) — 4
    "I enjoy leading teams.",
    "I take initiative in group settings.",
    "I can make decisions under pressure.",
    "I like organizing tasks and people.",
    // Technical interest (T) — 4
    "I am interested in modern technology.",
    "I enjoy learning technical subjects.",
    "I explore gadgets or software on my own.",
    "I am strong in STEM subjects.",
    // Practical (P) — 4
    "I enjoy fixing or assembling things.",
    "I like practical, hands-on tasks.",
    "I prefer real-world application over theory.",
    "I enjoy using tools and machinery.",
    // Logical/Reasoning (LR) — 1
    "I can recognize patterns quickly.",
  ];

  // --- Setup DOM references ---
  const stepsContainer = document.getElementById("steps");
  const progressBar = document.getElementById("progress-bar");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const submitBtn = document.getElementById("submitBtn");
  const form = document.getElementById("psychWizard");
  const puzzlesStep = document.getElementById("puzzles-step");
  const puzzleSummary = document.getElementById("puzzle-summary");

  // create 5 steps of 5 questions each
  const QUESTIONS_PER_STEP = 5;
  const steps = [];

  for (
    let step = 0;
    step < Math.ceil(QUESTIONS.length / QUESTIONS_PER_STEP);
    step++
  ) {
    const start = step * QUESTIONS_PER_STEP;
    const end = Math.min(start + QUESTIONS_PER_STEP, QUESTIONS.length);
    const stepDiv = document.createElement("div");
    stepDiv.className = "step";
    stepDiv.dataset.step = String(step);
    stepDiv.style.display = step === 0 ? "block" : "none";

    // title
    const title = document.createElement("h2");
    title.className = "step-title";
    title.textContent = `Section ${step + 1}`;
    stepDiv.appendChild(title);

    // question blocks
    for (let i = start; i < end; i++) {
      const qb = document.createElement("div");
      qb.className = "question-block";
      qb.innerHTML = `
        <p><strong>${i + 1}.</strong> ${QUESTIONS[i]}</p>
        <select data-idx="${i}" data-key="q${i + 1}" required>
          <option value="">Select</option>
          <option value="1">1 — Strongly Disagree</option>
          <option value="2">2 — Disagree</option>
          <option value="3">3 — Neutral</option>
          <option value="4">4 — Agree</option>
          <option value="5">5 — Strongly Agree</option>
        </select>
      `;
      stepDiv.appendChild(qb);
    }

    steps.push(stepDiv);
    stepsContainer.appendChild(stepDiv);
  }

  // attach puzzles step (insert before nav)
  puzzlesStep.style.display = "none"; // hidden until reached

  let currentStep = 0;
  updateProgress();

  prevBtn.addEventListener("click", () => {
    if (currentStep === 0) return;
    showStep(currentStep - 1);
  });

  nextBtn.addEventListener("click", () => {
    if (!validateStep(currentStep)) {
      alert("Please answer all questions on this step.");
      return;
    }
    if (currentStep + 1 < steps.length) {
      showStep(currentStep + 1);
    } else {
      // move to puzzles step
      showPuzzlesStep();
    }
  });

  function showStep(n) {
    // hide puzzles
    puzzlesStep.style.display = "none";
    submitBtn.style.display = "none";
    nextBtn.style.display = "inline-block";
    steps.forEach((s, idx) => {
      s.style.display = idx === n ? "block" : "none";
    });
    currentStep = n;
    prevBtn.style.display = n === 0 ? "none" : "inline-block";
    updateProgress();
  }

  function showPuzzlesStep() {
    steps.forEach((s) => (s.style.display = "none"));
    puzzlesStep.style.display = "block";
    submitBtn.style.display = "inline-block";
    nextBtn.style.display = "none";
    prevBtn.style.display = "inline-block";
    updateProgress(steps.length); // last
  }

  function updateProgress(stepIndex = currentStep) {
    // progress ranges over (steps.length + 1) where last is puzzles
    const total = steps.length + 1;
    const pct = Math.round((stepIndex / (total - 1)) * 100);
    progressBar.style.width = `${pct}%`;
  }

  function validateStep(n) {
    const selects = steps[n].querySelectorAll("select");
    for (const sel of selects) {
      if (!sel.value) return false;
    }
    return true;
  }

  // Puzzle grading helpers
  const PUZZLE_ANSWERS = {
    p1: "b", // Some Zim are Zon
    p2: "b", // Sequence: 2,6,12,20 => next 30 — option 'b' corresponds to 30 (ensure HTML options order)
    p3: "c", // Carrot is the odd one out (vegetable)
  };

  function gradePuzzles() {
    const results = {};
    let correctCount = 0;
    for (const pid of ["p1", "p2", "p3"]) {
      const sel = document.querySelector(`input[name="${pid}"]:checked`);
      const choice = sel ? sel.value : null;
      const correct = choice && choice === PUZZLE_ANSWERS[pid];
      results[pid] = { choice, correct };
      if (correct) correctCount++;
    }
    return { results, correctCount };
  }

  // On submit: validate puzzles answered then compute final answers array,
  // adjust certain question values slightly based on puzzles, then send.
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // ensure all steps validated
    for (let i = 0; i < steps.length; i++) {
      if (!validateStep(i)) {
        alert("Please complete all Likert questions.");
        showStep(i);
        return;
      }
    }
    // ensure puzzles answered
    const puzzlesChecked = ["p1", "p2", "p3"].every(
      (pid) => !!document.querySelector(`input[name="${pid}"]:checked`)
    );
    if (!puzzlesChecked) {
      alert("Please answer all puzzles.");
      return;
    }

    // collect answers 0..24 -> numeric 1..5
    const answers = [];
    const selects = document.querySelectorAll("select[data-idx]");
    // sorts guaranteed by data-idx order from injection, but ensure correct mapping:
    const sorted = Array.from(selects).sort(
      (a, b) => Number(a.dataset.idx) - Number(b.dataset.idx)
    );
    for (const s of sorted) {
      const v = parseInt(s.value);
      answers.push(Number.isFinite(v) ? v : 3);
    }

    // grade puzzles
    const { results, correctCount } = gradePuzzles();

    // Apply puzzle influence:
    // For each correct answer, increment certain question values (cap at 5).
    // Mapping: puzzles boost Logical/Analytical questions => we'll bump q4, q24 and q25 (0-based indexes 3,23,24)
    const bumpTargets = {
      p1: [3], // q4 (index 3) - analytical
      p2: [23], // q24 (index 23) - logical
      p3: [24], // q25 (index 24) - logical/reasoning
    };

    for (const pid of Object.keys(results)) {
      if (results[pid].correct) {
        const targets = bumpTargets[pid] || [];
        targets.forEach((idx) => {
          if (idx >= 0 && idx < answers.length) {
            answers[idx] = Math.min(5, answers[idx] + 1); // small boost
          }
        });
      }
    }

    // show puzzle summary to user for transparency
    let summaryHtml = `<h4>Puzzle results</h4><ul>`;
    for (const pid of Object.keys(results)) {
      const res = results[pid];
      summaryHtml += `<li>${pid.toUpperCase()}: ${
        res.correct
          ? '<span class="correct">Correct</span>'
          : '<span class="wrong">Incorrect</span>'
      }</li>`;
    }
    summaryHtml += `</ul><p>Applied ${correctCount} puzzle boost(s) to your Likert answers before saving.</p>`;
    puzzleSummary.style.display = "block";
    puzzleSummary.innerHTML = summaryHtml;

    // final payload: send "answers" array to backend
    try {
      submitBtn.disabled = true;
      submitBtn.textContent = "Saving...";
      const res = await fetch("/api/save_psychometric", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        alert(
          "Psychometric saved! Personality: " +
            (json.psychometric
              ? json.psychometric.personality || ""
              : json.personality || "")
        );
        window.location.href = "/dashboard";
      } else {
        console.error("Save failed:", json);
        alert("Save failed: " + (json.message || "server error"));
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit & Save";
      }
    } catch (err) {
      console.error("Save error:", err);
      alert("Server error while saving psychometric data.");
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit & Save";
    }
  });

  // Initialize: put puzzles-step element after steps container for navigation convenience
  // (puzzlesStep already present in DOM)

  // showStep(0) initial done above
})();
