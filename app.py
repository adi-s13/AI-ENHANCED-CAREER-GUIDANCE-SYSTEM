# app.py
# Final backend (enhanced psychometric + hybrid recommender using model.py)
from flask import Flask, render_template, request, jsonify, redirect, session, url_for
from pymongo import MongoClient
from werkzeug.security import generate_password_hash, check_password_hash
from sentence_transformers import SentenceTransformer, util
from datetime import timedelta
import json, os, torch
from dotenv import load_dotenv

# NEW IMPORT: hybrid recommender
from model import recommend as hybrid_recommend

# load .env
load_dotenv()

# Flask setup
app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "AdithSecret123")
app.permanent_session_lifetime = timedelta(days=7)

# MongoDB setup
MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    raise RuntimeError("MONGO_URI not set in environment (.env missing or not loaded)")

client = MongoClient(MONGO_URI)
db = client["careerClusterDB"]
users_col = db["users"]
print("🔥 MongoDB Connected")

# Load SBERT model + careers dataset
MODEL_NAME = "all-MiniLM-L6-v2"
print(f"Loading SBERT model {MODEL_NAME} (this may take a moment)...")
model = SentenceTransformer(MODEL_NAME)

# Load careers dataset robustly
with open("model/careers_india_enriched.json", "r", encoding="utf-8") as f:
    careers_raw = json.load(f)

# Normalize careers into list of dicts
if isinstance(careers_raw, dict) and "careers" in careers_raw:
    career_list = careers_raw["careers"]
elif isinstance(careers_raw, list):
    career_list = careers_raw
else:
    # convert mapping to list
    career_list = []
    for k, v in careers_raw.items():
        if isinstance(v, dict):
            entry = v.copy()
            entry.setdefault("career_id", k)
            entry.setdefault("title", k)
            career_list.append(entry)

# Ensure fields exist
for i, c in enumerate(career_list):
    c.setdefault("career_id", c.get("career_id", f"career_{i}"))
    c.setdefault("title", c.get("title", c.get("career_id")))
    c.setdefault("description", c.get("description", ""))
    # prefer skills_required or skills
    c.setdefault("skills_required", c.get("skills_required", c.get("skills", [])))
    c.setdefault("path", c.get("path", c.get("career_path", [])))

career_texts = [c.get("description", "") or c.get("title", "") for c in career_list]
career_embeddings = model.encode(career_texts, convert_to_tensor=True)
print(f"🧠 SBERT loaded, {len(career_list)} careers ready")

# ------------------------
# Psychometric scoring (25-question enhanced)
TRAITS = ["Analytical", "Logical", "Technical", "Practical", "Social", "Leadership", "Creative"]

TRAIT_QUESTION_MAP = [
    {"Analytical": 0.7, "Logical": 0.3},
    {"Analytical": 0.6, "Technical": 0.3, "Creative": 0.1},
    {"Analytical": 0.6, "Technical": 0.3, "Logical": 0.1},
    {"Analytical": 0.7, "Logical": 0.3},
    {"Creative": 0.8, "Practical": 0.2},
    {"Creative": 0.6, "Analytical": 0.2, "Social": 0.2},
    {"Creative": 0.6, "Analytical": 0.2, "Practical": 0.2},
    {"Creative": 0.7, "Social": 0.3},
    {"Social": 0.8, "Leadership": 0.2},
    {"Social": 0.7, "Practical": 0.3},
    {"Social": 0.6, "Leadership": 0.3, "Practical": 0.1},
    {"Social": 0.6, "Analytical": 0.2, "Leadership": 0.2},
    {"Leadership": 0.6, "Social": 0.3, "Analytical": 0.1},
    {"Leadership": 0.6, "Practical": 0.3, "Social": 0.1},
    {"Leadership": 0.6, "Analytical": 0.3, "Technical": 0.1},
    {"Technical": 0.7, "Analytical": 0.3},
    {"Technical": 0.6, "Practical": 0.3, "Analytical": 0.1},
    {"Technical": 0.6, "Creative": 0.2, "Analytical": 0.2},
    {"Technical": 0.7, "Logical": 0.3},
    {"Practical": 0.7, "Technical": 0.2, "Analytical": 0.1},
    {"Practical": 0.6, "Analytical": 0.2, "Creative": 0.2},
    {"Practical": 0.6, "Technical": 0.2, "Social": 0.2},
    {"Practical": 0.6, "Technical": 0.3, "Analytical": 0.1},
    {"Logical": 0.7, "Analytical": 0.3},
    {"Logical": 0.8, "Analytical": 0.2},
]

def normalize_answers_array(arr):
    res = []
    for i in range(len(arr)):
        try:
            v = float(arr[i])
            if v < 1: v = 1
            if v > 5: v = 5
            res.append(v)
        except:
            res.append(3.0)
    return res

def compute_trait_scores_from_array(answers_array):
    n_questions = max(len(TRAIT_QUESTION_MAP), len(answers_array))
    raw = {t: 0.0 for t in TRAITS}
    weight_sums = {t: 0.0 for t in TRAITS}

    for i in range(n_questions):
        wmap = TRAIT_QUESTION_MAP[i] if i < len(TRAIT_QUESTION_MAP) else {}
        val = answers_array[i] if i < len(answers_array) else 3.0
        for trait, w in wmap.items():
            if trait not in raw:
                continue
            raw[trait] += val * w
            weight_sums[trait] += w

    scores = {}
    for trait in TRAITS:
        denom = weight_sums.get(trait, 0.0) * 5.0
        if denom <= 0.0:
            scores[trait] = 5.0
        else:
            normalized = (raw[trait] / denom) * 10.0
            scores[trait] = round(max(0.0, min(normalized, 10.0)), 2)
    return scores

# ------------------------
# Cognitive + Academic
def compute_cognitive_from_traits(traits):
    logical = traits.get("Logical", 0.0)
    analytical = traits.get("Analytical", 0.0)
    creative = traits.get("Creative", 0.0)
    return {
        "LogicalReasoning": round(logical, 2),
        "AnalyticalAbility": round(analytical, 2),
        "CreativeThinking": round(creative, 2),
        "CognitiveIndex": round((0.5 * analytical + 0.3 * logical + 0.2 * creative), 2)
    }

def compute_academic_strengths(marks):
    def mean_of_dict(d):
        if not d or not isinstance(d, dict): return None
        vals = [v for v in d.values() if isinstance(v, (int, float))]
        if not vals: return None
        return sum(vals) / len(vals)

    tenth_mean = mean_of_dict(marks.get("tenth", {})) or 0
    twelfth_mean = mean_of_dict(marks.get("twelfth", {})) or 0

    def classify(avg):
        if avg >= 85: return "Excellent"
        if avg >= 70: return "Good"
        if avg >= 50: return "Average"
        if avg > 0: return "Needs Improvement"
        return "No Data"

    return {"10th": classify(tenth_mean), "12th": classify(twelfth_mean)}

# ------------------------
# Build profile text (SBERT)
def build_profile_text(trait_scores, cognitive, marks):
    parts = []
    sorted_traits = sorted(trait_scores.items(), key=lambda x: x[1], reverse=True)
    parts.append("TopTraits: " + ", ".join([f"{t}:{v}" for t, v in sorted_traits[:4]]))
    parts.append(" ".join([f"{k}:{v}" for k, v in cognitive.items()]))

    for level in ("tenth", "twelfth"):
        subs = marks.get(level, {})
        if isinstance(subs, dict) and subs:
            sorted_subs = sorted([(k, v) for k, v in subs.items()
                                  if isinstance(v, (int, float))],
                                 key=lambda x: x[1], reverse=True)
            top_subs = ", ".join([f"{s[0]}:{s[1]}" for s in sorted_subs[:3]])
            parts.append(f"{level}_strengths: {top_subs}")

    return " | ".join(parts)

# ------------------------
# SBERT recommend (unchanged)
def sbert_recommend(profile_text, top_k=6):
    if not profile_text:
        profile_text = "student seeking career guidance"
    user_emb = model.encode(profile_text, convert_to_tensor=True)
    sims = util.cos_sim(user_emb, career_embeddings)[0]
    top_k = int(min(top_k, len(career_list)))
    top_indices = torch.topk(sims, k=top_k).indices.tolist()

    recs = []
    sims_list = []
    for idx in top_indices:
        score = float(sims[idx])
        sims_list.append(score)
        c = career_list[idx]
        recs.append({
            "career_id": c.get("career_id"),
            "career": c.get("title"),
            "similarity": round(score, 6),
            "description": c.get("description", ""),
            "skills": c.get("skills_required", []),
            "path": c.get("path", [])
        })

    # scale to 0..100 relative to returned sims (human-friendly)
    if sims_list:
        s_min = min(sims_list)
        s_max = max(sims_list)
        span = s_max - s_min
        for r in recs:
            sim = r["similarity"]
            if span > 1e-9:
                scaled = (sim - s_min) / span
            else:
                scaled = 1.0
            final_score = int(round(max(0.0, min(scaled * 100.0, 100.0))))
            if final_score >= 80:
                label = "Excellent match"
            elif final_score >= 60:
                label = "Great match"
            elif final_score >= 40:
                label = "Good match"
            elif final_score >= 20:
                label = "Fair match"
            else:
                label = "Low match"
            r["final_score"] = final_score
            r["match_label"] = label
    else:
        recs = []
    return recs

# ------------------------
# Helper: normalize marks payload (ADDED — fixes NameError)
def normalize_marks_payload(payload):
    if not payload: return {}
    if "marks" in payload and isinstance(payload["marks"], dict):
        payload = payload["marks"]
    normalized = {}
    if "tenth" in payload:
        normalized["tenth"] = payload.get("tenth", {})
    elif "10th" in payload:
        normalized["tenth"] = payload.get("10th", {})
    else:
        tenth_keys = ["math", "science", "social", "english"]
        if any(k in payload for k in tenth_keys):
            normalized["tenth"] = {k: payload.get(k) for k in tenth_keys if k in payload}
    if "twelfth" in payload:
        normalized["twelfth"] = payload.get("twelfth", {})
    elif "12th" in payload:
        normalized["twelfth"] = payload.get("12th", {})
    else:
        twelfth_keys = ["math", "physics", "chemistry", "biology"]
        if any(k in payload for k in twelfth_keys):
            normalized["twelfth"] = {k: payload.get(k) for k in twelfth_keys if k in payload}
    return normalized

# ------------------------
# ROUTES (unchanged)
@app.route("/")
def landing():
    return render_template("landing.html")

@app.route("/login")
def login_page():
    return render_template("index.html")

@app.route("/dashboard")
def dashboard():
    if "user" not in session:
        return redirect("/login")
    return render_template("dashboard.html", user_name=session["user"].get("name", "Student"))

@app.route("/report")
def report_page():
    if "user" not in session:
        return redirect("/login")
    return render_template("results.html")

@app.route("/psychometric-test")
def psychometric_page():
    if "user" not in session:
        return redirect("/login")
    return render_template("psychometric.html")

@app.route("/enter-marks")
def enter_marks_page():
    if "user" not in session:
        return redirect("/login")
    return render_template("enter_marks.html")

# ------------------------
# AUTH APIs (unchanged)
@app.route("/api/signup", methods=["POST"])
def api_signup():
    data = request.json or {}
    name = data.get("name"); email = data.get("email"); password = data.get("password")
    if not (name and email and password):
        return jsonify({"success": False, "message": "Missing fields"}), 400
    if users_col.find_one({"email": email}):
        return jsonify({"success": False, "message": "Email exists"}), 400
    users_col.insert_one({
        "name": name,
        "email": email,
        "password": generate_password_hash(password),
        "marks": {},
        "psychometric": {},
        "last_recommendations": []
    })
    return jsonify({"success": True})

@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.json or {}
    email = data.get("email"); password = data.get("password")
    if not (email and password): return jsonify({"success": False}), 400
    user = users_col.find_one({"email": email})
    if not user or not check_password_hash(user.get("password",""), password):
        return jsonify({"success": False, "message": "Invalid credentials"}), 401
    session["user"] = {"email": user["email"], "name": user.get("name", "Student")}
    return jsonify({"success": True, "redirect": "/dashboard"})

@app.route("/api/logout", methods=["POST","GET"])
def api_logout():
    session.clear()
    return jsonify({"success": True})

# ------------------------
# Save marks APIs (unchanged)
@app.route("/api/save_marks", methods=["POST"])
@app.route("/api/submit_marks", methods=["POST"])
def api_save_marks():
    if "user" not in session:
        return jsonify({"success": False, "message": "Not logged in"}), 401
    payload = request.json or {}
    normalized = normalize_marks_payload(payload)
    if not normalized:
        return jsonify({"success": False, "message": "No marks provided"}), 400
    for level in ("tenth", "twelfth"):
        d = normalized.get(level, {})
        if isinstance(d, dict):
            for k, v in d.items():
                try: normalized[level][k] = float(v)
                except: normalized[level][k] = 0.0
    users_col.update_one({"email": session["user"]["email"]},
                         {"$set": {"marks": normalized}}, upsert=True)
    return jsonify({"success": True, "marks": normalized})


# ------------------------
# Save psychometric endpoint (unchanged)
@app.route("/api/save_psychometric", methods=["POST"])
@app.route("/api/save_psychometric_old", methods=["POST"])
def api_save_psychometric():
    if "user" not in session:
        return jsonify({"success": False, "message": "Not logged in"}), 401

    data = request.json or {}
    answers_list = []

    if isinstance(data.get("answers"), list):
        answers_list = normalize_answers_array(data.get("answers"))
    else:
        # collect q1..q25
        collected = []
        for i in range(1, 26):
            if f"q{i}" in data: collected.append(data[f"q{i}"])
        if collected:
            answers_list = normalize_answers_array(collected)

    if not answers_list:
        return jsonify({"success": False, "message": "No valid psychometric data"}), 400

    trait_scores = compute_trait_scores_from_array(answers_list)
    cognitive = compute_cognitive_from_traits(trait_scores)
    sorted_traits = sorted(trait_scores.items(), key=lambda x: x[1], reverse=True)
    personality_label = " / ".join([t for t, _ in sorted_traits[:2]])

    users_col.update_one(
        {"email": session["user"]["email"]},
        {"$set": {
            "psychometric": {
                "answers": answers_list,
                "traits": trait_scores,
                "personality": personality_label,
                "cognitive": cognitive
            }
        }},
        upsert=True
    )

    return jsonify({
        "success": True,
        "psychometric": {
            "answers": answers_list,
            "traits": trait_scores,
            "personality": personality_label,
            "cognitive": cognitive
        }
    })

# ------------------------
# 🔥 HYBRID RECOMMENDER (model.py) INTEGRATED HERE
@app.route("/api/generate_recommendations", methods=["GET", "POST"])
def api_generate_recommendations():
    if "user" not in session:
        return jsonify({"success": False, "message": "Not logged in"}), 401

    payload = request.json or {}
    psych_payload = payload.get("psych_scores") or payload.get("psychometric")
    marks_payload = payload.get("subject_scores") or payload.get("marks")

    # pull from DB
    user = users_col.find_one({"email": session["user"]["email"]}) or {}
    stored_psych = user.get("psychometric", {}) or {}
    stored_marks = user.get("marks", {}) or {}

    # extract trait scores (same logic)
    trait_scores = {}
    if isinstance(psych_payload, dict) and "traits" in psych_payload:
        trait_scores = psych_payload["traits"]
    else:
        if "traits" in stored_psych:
            trait_scores = stored_psych["traits"]
        elif "answers" in stored_psych:
            trait_scores = compute_trait_scores_from_array(
                normalize_answers_array(stored_psych.get("answers", []))
            )

    if not trait_scores:
        trait_scores = {t: 5.0 for t in TRAITS}

    # marks
    if isinstance(marks_payload, dict):
        marks = normalize_marks_payload(marks_payload)
    else:
        marks = stored_marks or {}

    # cognitive + academic
    cognitive = compute_cognitive_from_traits(trait_scores)
    academic_strengths = compute_academic_strengths(marks)

    # SBERT profile text
    profile_text = build_profile_text(trait_scores, cognitive, marks)

    # NEW: Hybrid recommender
    recommendations = hybrid_recommend(
        profile_text=profile_text,
        trait_scores=trait_scores,
        marks=marks,
        top_k=6
    )

    # save
    users_col.update_one(
        {"email": session["user"]["email"]},
        {"$set": {"last_recommendations": recommendations}},
        upsert=True
    )

    return jsonify({
        "success": True,
        "recommendations": recommendations,
        "diagnostic": {
            "profile_text": profile_text,
            "cognitive": cognitive,
            "academic_strengths": academic_strengths
        }
    })

# ------------------------
# REPORT (unchanged)
@app.route("/api/get_report", methods=["GET"])
def api_get_report():
    if "user" not in session:
        return jsonify({"success": False, "message": "Not logged in"}), 401

    user = users_col.find_one({"email": session["user"]["email"]}) or {}

    name = user.get("name", "")
    email = user.get("email", "")
    psych = user.get("psychometric", {})
    marks = user.get("marks", {})
    recs = user.get("last_recommendations", [])

    answers = psych.get("answers", [])
    traits = psych.get("traits", {})
    personality = psych.get("personality", "")
    cognitive = psych.get("cognitive", {})

    if not traits and answers:
        traits = compute_trait_scores_from_array(normalize_answers_array(answers))
        cognitive = compute_cognitive_from_traits(traits)

    academic = compute_academic_strengths(marks)

    report_obj = {
        "name": name,
        "email": email,
        "psychometric": {
            "answers": answers,
            "psych_scores": traits,
            "personality": personality,
            "cognitive": cognitive
        },
        "psychometric_scores": traits,
        "cognitive_scores": cognitive,
        "marks": marks,
        "academic_strengths": academic,
        "last_recommendations": recs
    }

    return jsonify({"success": True, "report": report_obj})

# ------------------------
# ERROR HANDLER
@app.errorhandler(404)
def handle_404(e):
    return jsonify({"success": False, "error": "Not found", "path": request.path}), 404

# ------------------------
# Run
if __name__ == "__main__":
    app.run(debug=True)
