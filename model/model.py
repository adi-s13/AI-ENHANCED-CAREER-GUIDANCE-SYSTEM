# model.py
# Hybrid recommender: SBERT + trait alignment + marks alignment (upgraded - Moderate uplift)
# - Improved trait alignment (keyword fraction OR trait-embedding similarity)
# - Extra title emphasis (title repeated for embedding to increase importance)
# - Final score dynamic uplift (exponent 0.6) to produce more high-quality top matches
# - Robust career JSON handling (accepts strings, dicts, list, mapping)
# - Backwards-compatible output fields for frontend

import os
import json
from functools import lru_cache

import torch
from sentence_transformers import SentenceTransformer, util

# -------------------------
# Config / Tunables
# -------------------------
MODEL_NAME = os.getenv("SBERT_MODEL", "all-MiniLM-L6-v2")
# Prefer enriched JSON if present; fallback to the original name
CAREERS_JSON = os.getenv("CAREERS_JSON", "model/careers_india_enriched.json")

# Weights for combining signals (should sum ~1.0)
WEIGHT_SBERT = float(os.getenv("WEIGHT_SBERT", 0.65))
WEIGHT_TRAIT = float(os.getenv("WEIGHT_TRAIT", 0.25))
WEIGHT_MARKS = float(os.getenv("WEIGHT_MARKS", 0.10))

# Exponent applied to final_norm to uplift top scores (moderate uplift -> 0.6)
FINAL_UPLIFT_EXP = float(os.getenv("FINAL_UPLIFT_EXP", 0.6))

# Label thresholds on final_score (0-100)
LABELS = [
    (80, "Excellent match"),
    (60, "Great match"),
    (40, "Good match"),
    (20, "Fair match"),
    (0,  "Low match"),
]

# Mapping traits -> keywords used to detect trait relevance in career text/skills/path
TRAIT_KEYWORDS = {
    "Analytical": ["analysis", "analyze", "analytical", "data", "statistics", "research", "modeling"],
    "Logical":    ["logic", "logical", "reasoning", "patterns", "algorithm", "deductive", "pattern"],
    "Technical":  ["programming", "software", "engineer", "technology", "technical", "coding", "developer", "it"],
    "Practical":  ["hands-on", "practical", "mechanical", "craft", "field", "construction", "repair", "technician"],
    "Social":     ["communication", "community", "counseling", "social", "customer", "service", "people"],
    "Leadership": ["manage", "manager", "lead", "leadership", "coordinate", "supervise", "director"],
    "Creative":   ["design", "creative", "art", "visual", "writer", "content", "innovation"],
}

# Subjects -> keywords to match to career.path or skills (for marks alignment)
SUBJECT_KEYWORDS = {
    "math": ["math", "mathematics", "calculus", "algebra", "statistics"],
    "physics": ["physics", "mechanics", "thermodynamics", "electromagnetics"],
    "chemistry": ["chemistry", "chemical", "biochemistry", "organic"],
    "biology": ["biology", "biological", "life science", "microbiology"],
    "computer": ["computer", "programming", "computer science", "cs", "software", "coding"],
    "english": ["communication", "writing", "english", "language", "literature"],
    "science": ["science"],
    "social": ["history", "geography", "political", "economics", "social"],
}

# -------------------------
# Lazy singletons
# -------------------------
_model = None
_career_list = None
_career_texts = None
_career_embeddings = None
_trait_embs = None


def _load_model():
    global _model
    if _model is None:
        _model = SentenceTransformer(MODEL_NAME)
    return _model


def _load_careers_and_embeddings():
    """
    Loads careers JSON and creates embeddings (title emphasized + description + skills + path).
    Title is repeated to give it extra weight in the embedding (simple and effective).
    Returns (career_list, career_texts, career_embeddings_tensor)
    """
    global _career_list, _career_texts, _career_embeddings

    # return cached if present
    if _career_list is not None and _career_embeddings is not None:
        return _career_list, _career_texts, _career_embeddings

    chosen_path = CAREERS_JSON
    if not os.path.exists(chosen_path):
        alt = "model/careers_india.json"
        if os.path.exists(alt):
            chosen_path = alt
        else:
            raise FileNotFoundError(f"Careers JSON not found at {CAREERS_JSON} or model/careers_india.json")

    with open(chosen_path, "r", encoding="utf-8") as f:
        careers_raw = json.load(f)

    # Normalize to list of dicts
    if isinstance(careers_raw, dict) and "careers" in careers_raw:
        career_list = careers_raw["careers"]
    elif isinstance(careers_raw, list):
        career_list = careers_raw
    else:
        career_list = []
        for k, v in careers_raw.items():
            if isinstance(v, dict):
                entry = v.copy()
                entry.setdefault("career_id", k)
                entry.setdefault("title", k)
                career_list.append(entry)
            else:
                # fallback if value isn't dict: treat key as id/title
                career_list.append({"career_id": k, "title": str(v)})

    # ensure fields exist and build texts
    texts = []
    for i, c in enumerate(career_list):
        # guard: sometimes list items might be plain strings
        if isinstance(c, str):
            c = {"career_id": f"career_{i}", "title": c}
            career_list[i] = c

        c.setdefault("career_id", c.get("career_id", f"career_{i}"))
        c.setdefault("title", c.get("title", c.get("career_id")))
        c.setdefault("description", c.get("description", ""))
        c.setdefault("skills_required", c.get("skills_required", c.get("skills", [])))
        c.setdefault("path", c.get("path", c.get("career_path", [])))

        # Build the text with title repeated (emphasis)
        title = str(c.get("title", "")).strip()
        description = str(c.get("description", "")).strip()
        parts = []
        if title:
            # repeat title twice to emphasize it
            parts.extend([title, title])
        if description:
            parts.append(description)
        if isinstance(c.get("skills_required"), list):
            parts.extend([str(s) for s in c.get("skills_required") if s])
        if isinstance(c.get("path"), list):
            parts.extend([str(p) for p in c.get("path") if p])
        joined = " . ".join(parts)
        texts.append(joined)

    model = _load_model()
    embeddings = model.encode(texts, convert_to_tensor=True)

    _career_list = career_list
    _career_texts = texts
    _career_embeddings = embeddings
    return _career_list, _career_texts, _career_embeddings


# -------------------------
# Trait embedding cache (for trait->career embedding similarity)
# -------------------------
def _get_trait_embeddings():
    """Return dict trait->embedding tensor (cached)."""
    global _trait_embs
    if _trait_embs is not None:
        return _trait_embs
    model = _load_model()
    _trait_embs = {}
    for trait, keywords in TRAIT_KEYWORDS.items():
        text = " ".join(keywords)
        # safe fallback
        if not text:
            text = trait
        _trait_embs[trait] = model.encode(text, convert_to_tensor=True)
    return _trait_embs


# -------------------------
# Utility scoring helpers
# -------------------------
def _cosine_similarities(profile_text):
    """Return raw sims tensor and python floats list aligned with careers order"""
    _, _, career_embeddings = _load_careers_and_embeddings()
    model = _load_model()
    user_emb = model.encode(str(profile_text), convert_to_tensor=True)
    sims = util.cos_sim(user_emb, career_embeddings)[0]  # tensor
    sims_list = sims.detach().cpu().tolist()
    return sims, sims_list


def _keyword_fraction_for_trait(trait, career_text):
    """Simple fraction of trait keywords found in career_text (0..1)"""
    keywords = TRAIT_KEYWORDS.get(trait, []) or []
    if not keywords:
        return 0.0
    found = 0
    text = career_text.lower()
    for kw in keywords:
        if kw.lower() in text:
            found += 1
    return found / max(1, len(keywords))


def _trait_alignment_score(trait_scores, career, career_emb=None):
    """
    Improved trait alignment:
      - For each trait compute max(keyword_frac, embedding_similarity(trait_keywords, career_text))
      - Weight by trait value (0..10 normalized to 0..1)
      - Return a weighted average 0..1
    """
    if not trait_scores:
        return 0.0

    # Prepare career searchable text
    text = " ".join([
        str(career.get("title", "")),
        str(career.get("description", "")),
        " ".join(career.get("skills_required", []) or []),
        " ".join(career.get("path", []) or []),
    ]).strip().lower()

    # Compute emb similarity fallback
    trait_embs = _get_trait_embeddings()

    # If career_emb not provided, attempt to get it from cached embeddings
    if career_emb is None:
        # try to extract the embedding from loaded careers
        try:
            _, career_texts, career_embeddings = _load_careers_and_embeddings()
            career_emb = None
        except Exception:
            career_emb = None

    total_weight = 0.0
    accum = 0.0
    for trait, raw_val in trait_scores.items():
        if trait not in TRAIT_KEYWORDS and trait not in trait_embs:
            continue
        trait_norm = max(0.0, min(10.0, float(raw_val))) / 10.0  # 0..1
        if trait_norm <= 0.0:
            continue

        kw_frac = _keyword_fraction_for_trait(trait, text)

        emb_sim = 0.0
        try:
            if career_emb is not None:
                trait_emb = trait_embs.get(trait)
                if trait_emb is not None:
                    sim = util.cos_sim(trait_emb, career_emb).item()
                    emb_sim = max(0.0, min(1.0, (sim + 1.0) / 2.0))
        except Exception:
            emb_sim = 0.0

        per_trait_score = max(kw_frac, emb_sim)

        accum += trait_norm * per_trait_score
        total_weight += trait_norm

    if total_weight <= 0.0:
        return 0.0
    return accum / total_weight


def _marks_alignment_score(marks, career):
    """
    marks: normalized marks dict like {'tenth': {'math': 90,...}, 'twelfth': {...}}
    career: career dict
    Returns 0..1
    """
    if not marks or not isinstance(marks, dict):
        return 0.0

    text = " ".join([
        str(career.get("title", "")),
        str(career.get("description", "")),
        " ".join(career.get("skills_required", []) or []),
        " ".join(career.get("path", []) or []),
    ]).lower()

    subj_scores = {}
    for level in ("twelfth", "tenth"):
        lvl = marks.get(level) or marks.get(level[:2]) or {}
        if isinstance(lvl, dict):
            for k, v in lvl.items():
                key = k.lower()
                try:
                    subj_score = float(v)
                except:
                    continue
                subj_scores[key] = max(subj_scores.get(key, 0.0), subj_score)

    if not subj_scores:
        return 0.0

    total_weight = 0.0
    match_accum = 0.0
    for subj, val in subj_scores.items():
        matched_kw_list = SUBJECT_KEYWORDS.get(subj, None)
        if not matched_kw_list:
            matched_kw_list = [subj]
        found = 0
        for kw in matched_kw_list:
            if kw.lower() in text:
                found += 1
        frac = found / max(1, len(matched_kw_list))
        importance = max(0.0, min(100.0, float(val))) / 100.0
        match_accum += importance * frac
        total_weight += importance

    if total_weight <= 0.0:
        return 0.0
    return match_accum / total_weight


def _scale_sims_to_0_1(sims_list):
    """Min-max scale sims_list to [0,1], fallback heuristic if flat."""
    if not sims_list:
        return []
    s_min = min(sims_list)
    s_max = max(sims_list)
    span = s_max - s_min
    scaled = []
    if span > 1e-9:
        for s in sims_list:
            scaled.append((s - s_min) / span)
    else:
        for s in sims_list:
            scaled.append(max(0.0, min(1.0, s / 0.6 if 0.6 > 0 else 0.0)))
    return scaled


# -------------------------
# Small helper to synthesize explanation if JSON doesn't provide one
# -------------------------
def _synthesize_explanation(career, trait_scores, sbert_norm, trait_score, marks_score):
    top_traits = sorted(trait_scores.items(), key=lambda x: x[1], reverse=True) if trait_scores else []
    top = ", ".join([t for t, _ in top_traits[:2]]) if top_traits else "your strengths"
    skills = career.get("skills_required", []) or career.get("skills", []) or []
    skills_snippet = ", ".join(skills[:3]) if skills else ""
    parts = []
    parts.append(f"This career aligns with {top}.")
    if skills_snippet:
        parts.append(f"Key skills: {skills_snippet}.")
    parts.append(f"Model signals — semantic match: {round(float(sbert_norm),3)}, trait alignment: {round(float(trait_score),3)}, marks alignment: {round(float(marks_score),3)}.")
    return " ".join(parts)


# -------------------------
# Public API
# -------------------------
def recommend(profile_text, trait_scores=None, marks=None, top_k=6,
              weight_sbert=WEIGHT_SBERT, weight_trait=WEIGHT_TRAIT, weight_marks=WEIGHT_MARKS):
    """
    profile_text: textual summary of user (from build_profile_text)
    trait_scores: dict trait->0..10 (from your psychometric)
    marks: normalized marks dict (same shape app uses)
    top_k: number of recommendations to return
    returns list of rec dicts sorted by final_score desc
    """
    # load careers + embeddings
    career_list, career_texts, career_embeddings = _load_careers_and_embeddings()

    # 1) SBERT sims (raw)
    _, sims_list = _cosine_similarities(profile_text)
    sims_scaled = _scale_sims_to_0_1(sims_list)

    trait_scores = trait_scores or {}
    marks = marks or {}

    recs = []
    # iterate careers and compute signals
    for i, c in enumerate(career_list):
        # obtain normalized sbt sim
        s_norm = sims_scaled[i] if i < len(sims_scaled) else 0.0

        # career embedding for trait-embedding similarity
        career_emb = None
        try:
            career_emb = career_embeddings[i] if i < career_embeddings.size(0) else None
        except Exception:
            # fallback: encode the career text (slower)
            try:
                model = _load_model()
                career_emb = model.encode(career_texts[i], convert_to_tensor=True)
            except Exception:
                career_emb = None

        trait_score = _trait_alignment_score(trait_scores, c, career_emb)  # 0..1
        marks_score = _marks_alignment_score(marks, c)                     # 0..1

        # Combine signals
        final_norm = (
            (weight_sbert * float(s_norm)) +
            (weight_trait * float(trait_score)) +
            (weight_marks * float(marks_score))
        )

        # apply uplift exponent (moderate uplift)
        final_norm = max(0.0, min(1.0, float(final_norm)))
        try:
            final_norm = final_norm ** FINAL_UPLIFT_EXP
        except Exception:
            pass

        final_score = int(round(max(0.0, min(1.0, final_norm)) * 100.0))

        # label selection
        label = "Low match"
        for thresh, lab in LABELS:
            if final_score >= thresh:
                label = lab
                break

        # -------------------------------------------------------
        # 🔥 FIXED BLOCK — Correct future_scope / salary fields
        # -------------------------------------------------------
        explanation = (
            c.get("explanation_text")
            or c.get("explanation")
            or c.get("why_match")
            or None
        )

        industry_fit = (
            c.get("industry_fit")
            or c.get("industry")
            or None
        )

        future_scope = (
            c.get("future_scope_india")
            or c.get("future_scope")
            or c.get("future_outlook")
            or None
        )

        salary_info = (
            c.get("salary_range_india")
            or c.get("salary_breakdown")
            or c.get("salary_range")
            or c.get("salary_info")
            or c.get("salary")
            or None
        )

        subjects_needed = (
            c.get("subjects_needed")
            or c.get("required_subjects")
            or c.get("subjects")
            or []
        )
        # -------------------------------------------------------

        # Synthesize explanation if none provided
        sbert_val = float(sims_list[i]) if i < len(sims_list) else 0.0
        sbert_norm_val = float(s_norm)
        trait_score_val = float(trait_score)
        marks_score_val = float(marks_score)

        if not explanation:
            explanation = _synthesize_explanation(c, trait_scores or {}, sbert_norm_val, trait_score_val, marks_score_val)

        # Build rec dict (provides both legacy and enriched keys for frontend compatibility)
        rec = {
            "career_id": c.get("career_id"),
            "career": c.get("title"),
            "title": c.get("title"),
            "description": c.get("description", ""),
            "skills": c.get("skills_required", []),
            "skills_required": c.get("skills_required", []),
            "path": c.get("path", []),
            "subjects_needed": subjects_needed,

            # enrichment
            "explanation_text": explanation,
            "industry_fit": industry_fit if industry_fit is not None else "Industry insights not available.",
            "future_scope": future_scope if future_scope is not None else "Future scope data not available.",
            "salary_info": salary_info if salary_info is not None else "Salary info not available.",

            # hybrid scores
            "similarity": round(float(sbert_val), 6),
            "sbert_norm": round(float(sbert_norm_val), 4),
            "trait_score": round(float(trait_score_val), 4),
            "marks_score": round(float(marks_score_val), 4),

            "final_score": final_score,
            "match_label": label,
        }

        recs.append(rec)

    # sort by final_score desc and pick top_k
    recs.sort(key=lambda x: x.get("final_score", 0), reverse=True)
    return recs[:min(top_k, len(recs))]
