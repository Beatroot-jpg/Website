import { api } from "./api.js";
import { clearSession, getSession, saveSession } from "./session.js";
import { initThemeToggle } from "./theme.js";

const themeToggleButton = document.querySelector("#themeToggleButton");
const loginButton = document.querySelector("#loginButton");
const scrollCue = document.querySelector("#scrollCue");
const availablePages = document.querySelector("#availablePages");
const loginModal = document.querySelector("#loginModal");
const closeLoginButton = document.querySelector("#closeLoginButton");
const closeLoginBackdrop = document.querySelector("#closeLoginBackdrop");
const loginForm = document.querySelector("#loginForm");
const loginError = document.querySelector("#loginError");
const loginSubmitButton = document.querySelector("#loginSubmitButton");

function showToast(message, tone = "success") {
  const stack = document.querySelector("#toastStack");

  if (!stack) {
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast ${tone}`;
  toast.textContent = message;
  stack.appendChild(toast);

  window.setTimeout(() => toast.remove(), 3200);
}

function toggleModal(visible) {
  loginModal.classList.toggle("hidden", !visible);
  loginModal.setAttribute("aria-hidden", visible ? "false" : "true");
}

function setFormMessage(message = "") {
  loginError.textContent = message;
  loginError.classList.toggle("hidden", !message);
}

function setLoginLoading(loading) {
  loginSubmitButton.disabled = loading;
  loginSubmitButton.textContent = loading ? "Entering" : "Enter";
}

function syncLoginButton() {
  const session = getSession();

  if (session?.user?.name) {
    loginButton.textContent = session.user.name;
    loginButton.dataset.state = "session";
    return;
  }

  loginButton.textContent = "Login";
  loginButton.dataset.state = "login";
}

function openLogin() {
  setFormMessage("");
  toggleModal(true);
  window.requestAnimationFrame(() => loginForm.elements.username.focus());
}

function syncScrollCue() {
  document.body.classList.toggle("has-scrolled", window.scrollY > 24);
}

loginButton.addEventListener("click", () => {
  if (loginButton.dataset.state === "session") {
    if (window.confirm("Log out of this account?")) {
      clearSession();
      syncLoginButton();
      showToast("Logged out.", "success");
    }
    return;
  }

  openLogin();
});

closeLoginButton.addEventListener("click", () => toggleModal(false));
closeLoginBackdrop.addEventListener("click", () => toggleModal(false));

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setFormMessage("");
  setLoginLoading(true);

  try {
    const session = await api("/auth/login", {
      method: "POST",
      body: Object.fromEntries(new FormData(loginForm).entries())
    });
    saveSession(session);
    toggleModal(false);
    loginForm.reset();
    syncLoginButton();
    showToast("Logged in successfully.", "success");
  } catch (error) {
    setFormMessage(error.message);
    showToast(error.message, "error");
  } finally {
    setLoginLoading(false);
  }
});

scrollCue.addEventListener("click", () => {
  availablePages.scrollIntoView({ behavior: "smooth", block: "start" });
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !loginModal.classList.contains("hidden")) {
    toggleModal(false);
  }
});

initThemeToggle(themeToggleButton);
syncLoginButton();
syncScrollCue();
window.addEventListener("scroll", syncScrollCue, { passive: true });
window.requestAnimationFrame(() => document.body.classList.remove("is-loading"));