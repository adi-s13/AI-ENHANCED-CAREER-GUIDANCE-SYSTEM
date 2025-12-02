// =======================
// static/dashboard.js (D1 Enhanced)
// =======================

const navbar = document.getElementById("navbar");
const sidebar = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebar-toggle");
const sidebarClose = document.getElementById("sidebar-close");
const scrollProgress = document.getElementById("scroll-progress");
const backToTop = document.getElementById("back-to-top");

const runRecommendBtn = document.getElementById("run-recommend-btn");
const openPsychBtn = document.getElementById("open-psychometric-btn");
const submitPsychBtn = document.getElementById("submit-psychometric");
const saveMarksBtn = document.getElementById("save-marks-btn");
const logoutBtn = document.getElementById("logout-btn");
const reportBtn = document.getElementById("open-report-btn");

const recContainer = document.getElementById("recommendations-container");
const psychModal = document.getElementById("psychometric-modal");
const psychClose = document.getElementById("close-psychometric");

// -------------------- sidebar handlers --------------------
function initSidebar() {
  sidebarToggle?.addEventListener("click", () =>
    sidebar.classList.toggle("active")
  );
  sidebarClose?.addEventListener("click", () =>
    sidebar.classList.remove("active")
  );
  document.addEventListener("click", (e) => {
    if (!sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
      sidebar.classList.remove("active");
    }
  });
}

// -------------------- scroll effects --------------------
function initScroll() {
  window.addEventListener("scroll", () => {
    const scrollTop = window.pageYOffset;
    const docHeight = document.body.scrollHeight - window.innerHeight;
    scrollProgress.style.width = docHeight
      ? (scrollTop / docHeight) * 100 + "%"
      : "0%";

    if (scrollTop > 120) navbar.classList.add("scrolled");
    else navbar.classList.remove("scrolled");

    if (scrollTop > 500) backToTop.classList.add("visible");
    else backToTop.classList.remove("visible");
  });

  backToTop?.addEventListener("click", () =>
    window.scrollTo({ top: 0, behavior: "smooth" })
  );
}

// -------------------- psych modal --------------------
function initPsychometric() {
  openPsychBtn?.addEventListener("click", () =>
    psychModal.classList.add("show")
  );
  psychClose?.addEventListener("click", () =>
    psychModal.classList.remove("show")
  );
  window.addEventListener("click", (e) => {
    if (e.target === psychModal) psychModal.classList.remove("show");
  });
}

// -------------------- collect marks --------------------
function collectMarks() {
  return {
    tenth: {
      math: document.getElementById("m10-math")?.value || "",
      science: document.getElementById("m10-science")?.value || "",
      social: document.getElementById("m10-social")?.value || "",
      english: document.getElementById("m10-english")?.value || "",
    },
    twelfth: {
      math: document.getElementById("m12-math")?.value || "",
      physics: document.getElementById("m12-physics")?.value || "",
      chemistry: document.getElementById("m12-chem")?.value || "",
      biology: document.getElementById("m12-bio")?.value || "",
    },
  };
}

// -------------------- save marks --------------------
async function saveMarks() {
  const marks = collectMarks();
  try {
    const res = await fetch("/api/save_marks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marks }),
    });
    const data = await res.json();
    if (res.ok && data.success)
      showToast("Marks saved successfully!", "success");
    else showToast(data.message || "Failed to save marks", "error");
  } catch (err) {
    console.error("saveMarks:", err);
    showToast("Server error saving marks", "error");
  }
}

// -------------------- submit psychometric --------------------
async function submitPsychometric() {
  const answers = {};
  for (let i = 1; i <= 5; i++) {
    const el = document.querySelector(`input[name="q${i}"]:checked`);
    if (!el) {
      showToast("Please answer all psychometric questions", "error");
      return;
    }
    answers[`q${i}`] = el.value;
  }

  try {
    const res = await fetch("/api/save_psychometric", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(answers),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast("Psychometric saved!", "success");
      psychModal.classList.remove("show");
    } else showToast(data.message || "Failed to save psychometric", "error");
  } catch (err) {
    console.error("submitPsychometric:", err);
    showToast("Server error saving psychometric", "error");
  }
}

// -------------------- run recommendations --------------------
async function runRecommendations() {
  showToast("Generating recommendations...", "info");
  try {
    const res = await fetch("/api/generate_recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      showToast(data.message || "Could not generate recommendations", "error");
      return;
    }

    displayRecommendations(data.recommendations || []);
    showToast("Recommendations ready", "success");
  } catch (err) {
    console.error("runRecommendations:", err);
    showToast("Server error generating recommendations", "error");
  }
}

// =======================
// RENDERING OF CAREERS (D1)
// =======================

function displayRecommendations(items) {
  recContainer.innerHTML = "";
  if (!items || items.length === 0) {
    recContainer.innerHTML = "<p>No recommendations found</p>";
    return;
  }

  items.forEach((r, idx) => {
    const skills = safeList(r.skills || r.skills_required);
    const subjectsNeeded = safeList(r.path || r.subjects_needed);

    const explanation = r.explanation_text || "No explanation available.";
    const industryFit = r.industry_fit || "No industry insights.";
    const futureScope = r.future_scope || "No future scope data.";
    const salary = r.salary_info || "Salary info not available.";

    const card = document.createElement("div");
    card.className = "career-card";

    card.innerHTML = `
      <div class="career-icon"><i class="fas fa-briefcase"></i></div>
      <h3 class="career-title">${r.career || r.title || "Career"}</h3>

      <p class="career-description">${r.description || ""}</p>

      <div class="career-meta">
        <span><strong>${r.match_label}</strong></span>
      </div>

      <div class="score-bar">
        <div class="score-fill" style="width:${r.final_score}%;"></div>
      </div>
      <small><strong>Score:</strong> ${r.final_score}/100</small><br/>

      <button class="details-btn" data-id="${idx}">Show Details ▼</button>

      <div class="details-box" id="details-${idx}">
        <p><strong>Explanation:</strong> ${explanation}</p>
        <p><strong>Industry Fit:</strong> ${industryFit}</p>
        <p><strong>Future Scope:</strong> ${futureScope}</p>
        <p><strong>Salary Info:</strong> ${salary}</p>

        <hr/>
        <p><strong>Trait Alignment:</strong> ${r.trait_score}</p>
        <p><strong>Marks Alignment:</strong> ${r.marks_score}</p>
        <p><strong>SBERT Similarity:</strong> ${r.sbert_norm}</p>

        <hr/>
        <p><strong>Skills:</strong> ${skills.join(", ") || "—"}</p>
        <p><strong>Required Subjects:</strong> ${
          subjectsNeeded.join(", ") || "—"
        }</p>
      </div>
    `;

    recContainer.appendChild(card);
  });

  // Attach dropdown handlers
  document.querySelectorAll(".details-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const box = document.getElementById("details-" + btn.dataset.id);
      box.classList.toggle("open");
      btn.textContent = box.classList.contains("open")
        ? "Hide Details ▲"
        : "Show Details ▼";
    });
  });
}

function safeList(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x;
  if (typeof x === "string") return x.split(",").map((s) => s.trim());
  return [];
}

// -------------------- open report --------------------
reportBtn?.addEventListener("click", () => (window.location.href = "/report"));

// -------------------- logout --------------------
logoutBtn?.addEventListener("click", async () => {
  try {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  } catch (err) {
    showToast("Error logging out", "error");
  }
});

// -------------------- toast --------------------
function showToast(message, type = "success") {
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.innerHTML = `
    <div class="toast-content">
      <i class="fas ${
        type === "success"
          ? "fa-check-circle"
          : type === "error"
          ? "fa-exclamation-circle"
          : "fa-info-circle"
      }"></i>
      <span>${message}</span>
    </div>`;
  document.body.appendChild(t);

  setTimeout(() => t.classList.add("show"), 40);
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 300);
  }, 3500);
}

// -------------------- init --------------------
document.addEventListener("DOMContentLoaded", () => {
  initSidebar();
  initScroll();
  initPsychometric();

  runRecommendBtn?.addEventListener("click", runRecommendations);
  submitPsychBtn?.addEventListener("click", submitPsychometric);
  saveMarksBtn?.addEventListener("click", saveMarks);
});
