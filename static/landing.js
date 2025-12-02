// ===== NAVBAR TOGGLE =====
const navToggle = document.getElementById("nav-toggle");
const navMenu = document.querySelector(".nav-menu");

if (navToggle) {
  navToggle.addEventListener("click", () => {
    navMenu.classList.toggle("active");
  });
}

// ===== SCROLL PROGRESS BAR =====
window.addEventListener("scroll", () => {
  const scrollProgress = document.getElementById("scroll-progress");
  const scrollTop = window.scrollY;
  const docHeight = document.body.scrollHeight - window.innerHeight;
  const scrollPercent = (scrollTop / docHeight) * 100;
  scrollProgress.style.width = scrollPercent + "%";
});

// ===== BACK TO TOP BUTTON =====
const backToTop = document.getElementById("back-to-top");
window.addEventListener("scroll", () => {
  if (window.scrollY > 400) {
    backToTop.style.display = "block";
  } else {
    backToTop.style.display = "none";
  }
});
backToTop.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// ===== CTA BUTTON REDIRECT =====
const ctaButton = document.getElementById("cta-button");
if (ctaButton) {
  ctaButton.addEventListener("click", () => {
    // Flask route redirect for login page
    window.location.href = "/login";
  });
}

// ===== STREAM MODAL HANDLING =====
const modal = document.getElementById("stream-modal");
const modalTitle = document.getElementById("modal-title");
const modalBody = document.getElementById("modal-body");

function showStreamInfo(streamType) {
  modal.style.display = "flex";

  if (streamType === "class10") {
    modalTitle.textContent = "After Class 10th";
    modalBody.innerHTML = `
      <ul>
        <li><strong>Science Stream (PCM / PCB)</strong> - Physics, Chemistry, Math, Biology</li>
        <li><strong>Commerce Stream</strong> - Accountancy, Business Studies, Economics</li>
        <li><strong>Arts / Humanities Stream</strong> - History, Literature, Political Science</li>
        <li><strong>Vocational Courses</strong> - Skill-oriented programs</li>
      </ul>
      <p>AI will help you match your interests with the right stream and future career options.</p>
    `;
  } else if (streamType === "class12") {
    modalTitle.textContent = "After Class 12th";
    modalBody.innerHTML = `
      <ul>
        <li><strong>Engineering and Technology</strong> - Software, AI, Robotics, etc.</li>
        <li><strong>Medical and Life Sciences</strong> - MBBS, Nursing, Biotech</li>
        <li><strong>Commerce, Finance & Business</strong> - B.Com, BBA, CA</li>
        <li><strong>Arts, Design & Media</strong> - Fine Arts, Journalism, Design</li>
        <li><strong>AI, Data Science, and ML</strong> - Specialized degrees for tech-driven careers</li>
      </ul>
      <p>AI Career Hub recommends top careers and skill paths tailored to your strengths.</p>
    `;
  }
}

function closeStreamInfo() {
  modal.style.display = "none";
}

// Close modal when clicking outside
window.addEventListener("click", (event) => {
  if (event.target === modal) {
    modal.style.display = "none";
  }
});

// ===== SCROLL ANIMATIONS =====
const sections = document.querySelectorAll(".section");

function revealSections() {
  sections.forEach((section) => {
    const sectionTop = section.getBoundingClientRect().top;
    if (sectionTop < window.innerHeight - 100) {
      section.classList.add("visible");
    }
  });
}

window.addEventListener("scroll", revealSections);
revealSections();

// ===== SMOOTH SCROLLING =====
document.querySelectorAll('.nav-link[href^="#"]').forEach((link) => {
  link.addEventListener("click", function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute("href"));
    if (target) {
      window.scrollTo({
        top: target.offsetTop - 80,
        behavior: "smooth",
      });
    }
  });
});
