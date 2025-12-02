// ================================
// static/report.js  (HYBRID ENHANCED VERSION - Report C)
// ================================

async function loadReport() {
  try {
    const res = await fetch("/api/get_report");
    const j = await res.json();

    if (!res.ok || !j.success) {
      alert(j.message || "No report available.");
      return;
    }

    const r = j.report || {};

    fillProfile(r);
    fillPersonality(r);
    fillCognitive(r);
    fillPsychometric(r);
    fillMarks(r);

    fillCareerCards(r); // NEW: rich cards with collapsible insights
    fillCareerComparison(r); // NEW: comparison table

    fillRoadmap(r);
  } catch (e) {
    console.error("Report load failed:", e);
  }
}

// ================= PROFILE =================
function fillProfile(r) {
  document.getElementById("profile-box").innerHTML = `
    <div class="card">
      <h3>Name</h3>
      <p>${escapeHtml(r.name || "—")}</p>

      <h3>Email</h3>
      <p>${escapeHtml(r.email || "—")}</p>
    </div>
  `;
}

// ================= PERSONALITY =================
function fillPersonality(r) {
  const el = document.getElementById("personality-box");
  const traits =
    (r.psychometric && r.psychometric.psych_scores) ||
    r.psychometric_scores ||
    {};

  const entries = Object.entries(traits).sort((a, b) => b[1] - a[1]);
  const primary = entries[0] ? entries[0][0] : "Not determined";

  const top = entries
    .slice(0, 2)
    .map((x) => `${x[0]}: ${Number(x[1]).toFixed(1)}`);

  el.innerHTML = `
    <div class="card">
      <h3>Personality Overview</h3>
      <p><strong>Primary Trait:</strong> ${escapeHtml(primary)}</p>
      <p><strong>Top Traits:</strong> ${escapeHtml(top.join(", "))}</p>
    </div>
  `;
}

// ================= COGNITIVE =================
function fillCognitive(r) {
  const el = document.getElementById("cognitive-box");
  const cog = r.cognitive_scores || {};

  if (!Object.keys(cog).length) {
    el.innerHTML = `<div class="card"><p>No cognitive scores available</p></div>`;
    return;
  }

  el.innerHTML = "";
  for (const k in cog) {
    el.innerHTML += `
      <div class="card">
        <h3>${escapeHtml(k)}</h3>
        <p>${escapeHtml(String(cog[k]))}</p>
      </div>
    `;
  }
}

// ================= PSYCHOMETRIC =================
function fillPsychometric(r) {
  const el = document.getElementById("psychometric-box");
  const psycho = r.psychometric || {};
  const answers = psycho.answers || {};
  const scores = psycho.psych_scores || psycho.traits || {};

  let html = `<div class='card'><h3>Psychometric Answers</h3><ul>`;
  for (const q in answers) {
    html += `<li><strong>${q}:</strong> ${escapeHtml(String(answers[q]))}</li>`;
  }
  html += `</ul></div>`;

  html += `<div class='card'><h3>Trait Scores</h3><ul>`;
  for (const t in scores) {
    html += `<li><strong>${t}:</strong> ${escapeHtml(String(scores[t]))}</li>`;
  }
  html += `</ul></div>`;

  el.innerHTML = html;
}

// ================= MARKS =================
function fillMarks(r) {
  const el = document.getElementById("marks-box");
  const marks = r.marks || {};
  const tenth = marks.tenth || {};
  const twelfth = marks.twelfth || {};

  el.innerHTML = `
    <div class="card">
      <h3>10th Marks</h3>${formatSubjects(tenth)}
    </div>

    <div class="card">
      <h3>12th Marks</h3>${formatSubjects(twelfth)}
    </div>
  `;
}

function formatSubjects(obj) {
  if (!Object.keys(obj).length) return "<p>No data</p>";

  let html = "<ul>";
  for (const k in obj) html += `<li>${k}: ${obj[k]}%</li>`;
  html += "</ul>";

  return html;
}

// ===================================================
// 🚀 NEW — CAREER CARDS WITH INSIGHTS DROPDOWN
// ===================================================
function fillCareerCards(r) {
  const el = document.getElementById("career-box");
  const list = r.last_recommendations || [];

  if (!list.length) {
    el.innerHTML = "<div class='card'><p>No recommendations yet</p></div>";
    return;
  }

  el.innerHTML = "<h2>Top Career Recommendations</h2>";

  list.forEach((c, index) => {
    const title = c.career || c.title || `Career ${index + 1}`;
    const explanation = c.explanation_text || "No explanation available.";
    const industryFit = c.industry_fit || "No industry insights.";
    const futureScope = c.future_scope || "No future scope data.";
    const salary = c.salary_info || "Salary info not available.";

    const skills = cleanList(c.skills || c.skills_required);
    const subjects = cleanList(c.path || c.subjects_needed);

    el.innerHTML += `
      <div class="career-card">
        <h3>${escapeHtml(title)}</h3>

        <p><strong>Match:</strong> ${escapeHtml(c.match_label || "")}</p>
        <p><strong>Final Score:</strong> ${c.final_score}/100</p>
        
        <div class="score-bar">
          <div class="score-fill" style="width:${c.final_score}%;"></div>
        </div>

        <p>${escapeHtml(c.description || "")}</p>

        <button class="details-btn" data-id="${index}">Show Insights ▼</button>

        <div class="details-panel" id="details-${index}">
          <p><strong>Why this matches you:</strong> ${explanation}</p>
          <p><strong>Industry Fit:</strong> ${industryFit}</p>
          <p><strong>Future Scope:</strong> ${futureScope}</p>
          <p><strong>Salary Range:</strong> ${salary}</p>

          <hr/>

          <p><strong>Trait Alignment Score:</strong> ${c.trait_score}</p>
          <p><strong>Marks Alignment Score:</strong> ${c.marks_score}</p>
          <p><strong>SBERT Similarity:</strong> ${c.sbert_norm}</p>

          <hr/>

          <p><strong>Skills:</strong> ${skills.join(", ") || "—"}</p>
          <p><strong>Required Subjects:</strong> ${
            subjects.join(", ") || "—"
          }</p>
        </div>
      </div>
    `;
  });

  document.querySelectorAll(".details-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const panel = document.getElementById("details-" + btn.dataset.id);
      panel.classList.toggle("open");
      btn.textContent = panel.classList.contains("open")
        ? "Hide Insights ▲"
        : "Show Insights ▼";
    });
  });
}

// ===================================================
// 🚀 NEW — COMPARISON TABLE (Hybrid Report)
// ===================================================
function fillCareerComparison(r) {
  const tableEl = document.getElementById("career-comparison-box");
  const list = r.last_recommendations || [];

  if (!list.length) {
    tableEl.innerHTML = "";
    return;
  }

  let html = `
    <h2>Career Comparison Table</h2>
    <table class="comparison-table">
      <thead>
        <tr>
          <th>Career</th>
          <th>Final Score</th>
          <th>Trait Align</th>
          <th>Marks Align</th>
          <th>Similarity</th>
        </tr>
      </thead>
      <tbody>
  `;

  list.forEach((c) => {
    html += `
      <tr>
        <td>${escapeHtml(c.career || c.title)}</td>
        <td>${c.final_score}</td>
        <td>${c.trait_score}</td>
        <td>${c.marks_score}</td>
        <td>${c.sbert_norm}</td>
      </tr>
    `;
  });

  html += "</tbody></table>";

  tableEl.innerHTML = html;
}

// ================= ROADMAP =================
function fillRoadmap(r) {
  const el = document.getElementById("roadmap-box");
  const top = r.last_recommendations?.[0];

  if (!top) {
    el.innerHTML = "<p>No roadmap available.</p>";
    return;
  }

  const subjects = cleanList(top.path || top.subjects_needed);

  let html = "<div class='card'><h3>Suggested Roadmap</h3>";
  subjects.forEach((s, i) => {
    html += `<div class="roadmap-step"><strong>Step ${
      i + 1
    }:</strong> ${escapeHtml(s)}</div>`;
  });
  html += "</div>";

  el.innerHTML = html;
}

// ================= UTILITY =================
function cleanList(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x;
  if (typeof x === "string") return x.split(",").map((s) => s.trim());
  return [];
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

document.addEventListener("DOMContentLoaded", loadReport);
