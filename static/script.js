// ===== TOGGLE BETWEEN LOGIN & SIGNUP =====
const loginToggle = document.getElementById("login-toggle");
const signupToggle = document.getElementById("signup-toggle");
const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");

loginToggle.addEventListener("click", () => {
  loginToggle.classList.add("active");
  signupToggle.classList.remove("active");
  loginForm.classList.add("active");
  signupForm.classList.remove("active");
});

signupToggle.addEventListener("click", () => {
  signupToggle.classList.add("active");
  loginToggle.classList.remove("active");
  signupForm.classList.add("active");
  loginForm.classList.remove("active");
});

// ===== PASSWORD VISIBILITY TOGGLE =====
function togglePasswordVisibility(toggleId, inputId) {
  const toggle = document.getElementById(toggleId);
  const input = document.getElementById(inputId);

  toggle.addEventListener("click", () => {
    const type =
      input.getAttribute("type") === "password" ? "text" : "password";
    input.setAttribute("type", type);
    toggle.innerHTML =
      type === "password"
        ? '<i class="fas fa-eye"></i>'
        : '<i class="fas fa-eye-slash"></i>';
  });
}

togglePasswordVisibility("login-password-toggle", "login-password");
togglePasswordVisibility("signup-password-toggle", "signup-password");
togglePasswordVisibility(
  "signup-confirm-password-toggle",
  "signup-confirm-password"
);

// ===== LOGIN FORM SUBMISSION =====
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value.trim();

  if (!email || !password) {
    showToast("Please fill in all fields", "error");
    return;
  }

  const loginBtn = document.querySelector(".login-btn");
  const btnText = loginBtn.querySelector(".btn-text");
  const loader = loginBtn.querySelector(".btn-loader");

  btnText.style.display = "none";
  loader.style.display = "flex";

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const result = await response.json();

    if (result.success) {
      showToast("Login successful! Redirecting...", "success");
      setTimeout(() => {
        window.location.href = result.redirect || "/dashboard";
      }, 1200);
    } else {
      showToast(result.message || "Invalid credentials", "error");
    }
  } catch (err) {
    console.error("Login error:", err);
    showToast("Server error. Please try again later.", "error");
  } finally {
    btnText.style.display = "inline";
    loader.style.display = "none";
  }
});

// ===== SIGNUP FORM SUBMISSION =====
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("signup-name").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value.trim();
  const confirmPassword = document
    .getElementById("signup-confirm-password")
    .value.trim();

  if (!name || !email || !password || !confirmPassword) {
    showToast("Please fill in all fields", "error");
    return;
  }

  if (password !== confirmPassword) {
    showToast("Passwords do not match", "error");
    return;
  }

  const signupBtn = document.querySelector(".signup-btn");
  const btnText = signupBtn.querySelector(".btn-text");
  const loader = signupBtn.querySelector(".btn-loader");

  btnText.style.display = "none";
  loader.style.display = "flex";

  try {
    const response = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    const result = await response.json();

    if (result.success) {
      showToast("Account created successfully! Redirecting...", "success");
      setTimeout(() => {
        window.location.href = "/login";
      }, 1500);
    } else {
      showToast(result.message || "Signup failed", "error");
    }
  } catch (err) {
    console.error("Signup error:", err);
    showToast("Server error. Please try again later.", "error");
  } finally {
    btnText.style.display = "inline";
    loader.style.display = "none";
  }
});

// ===== TOAST NOTIFICATIONS =====
function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast-message ${type}`;
  toast.innerHTML = `
    <div class="toast-content">
      <i class="fas ${
        type === "success"
          ? "fa-check-circle"
          : type === "error"
          ? "fa-exclamation-circle"
          : "fa-info-circle"
      }"></i>
      <span>${message}</span>
    </div>
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("show");
  }, 100);

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}

// ===== BACKGROUND PARTICLE ANIMATION =====
const particles = document.querySelectorAll(".particle");
particles.forEach((particle) => {
  const x = Math.random() * window.innerWidth;
  const y = Math.random() * window.innerHeight;
  const duration = 15 + Math.random() * 10;
  particle.style.left = `${x}px`;
  particle.style.top = `${y}px`;
  particle.style.animationDuration = `${duration}s`;
});

// ===== SMOOTH PAGE LOAD =====
window.addEventListener("load", () => {
  document.body.classList.add("loaded");
});
