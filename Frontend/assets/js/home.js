import { api } from "./api.js";
import { clearSession, getSession, saveSession } from "./session.js";
import { initThemeToggle } from "./theme.js";

const FLASH_MESSAGE_KEY = "the-shites-flash-message";
const themeToggleButton = document.querySelector("#themeToggleButton");
const loginButton = document.querySelector("#loginButton");
const loginModal = document.querySelector("#loginModal");
const closeLoginButton = document.querySelector("#closeLoginButton");
const closeLoginBackdrop = document.querySelector("#closeLoginBackdrop");
const loginForm = document.querySelector("#loginForm");
const loginError = document.querySelector("#loginError");
const loginHint = document.querySelector("#loginHint");
const loginSubmitButton = document.querySelector("#loginSubmitButton");
const adminLauncherCard = document.querySelector("#adminLauncherCard");
const adminLauncherState = document.querySelector("#adminLauncherState");
const scrollCue = document.querySelector("#scrollCue");
const launcherStage = document.querySelector(".launcher-stage");
const compactViewportQuery = window.matchMedia("(max-width: 980px), (max-height: 760px)");

function showToast(message, tone = "success") {
  const stack = document.querySelector("#toastStack");

  if (!stack) {
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast ${tone}`;
  toast.textContent = message;
  stack.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 3200);
}

function consumeFlashMessage() {
  try {
    const message = window.sessionStorage.getItem(FLASH_MESSAGE_KEY);

    if (!message) {
      return "";
    }

    window.sessionStorage.removeItem(FLASH_MESSAGE_KEY);
    return message;
  } catch (_error) {
    return "";
  }
}

function setFormMessage(message = "") {
  loginError.textContent = message;
  loginError.classList.toggle("hidden", !message);
}

function setLoginLoadingState(loading) {
  if (loginSubmitButton) {
    loginSubmitButton.classList.toggle("is-loading", loading);
    loginSubmitButton.disabled = loading;
    loginSubmitButton.textContent = loading ? "Entering" : "Enter";
  }
}

function openLoginModal() {
  loginModal.classList.remove("hidden");
  loginModal.setAttribute("aria-hidden", "false");
  setFormMessage("");
  window.requestAnimationFrame(() => {
    loginForm?.elements.username?.focus();
  });
}

function closeLoginModal() {
  loginModal.classList.add("hidden");
  loginModal.setAttribute("aria-hidden", "true");
}

function syncLoginButton() {
  const session = getSession();

  if (session?.user?.name) {
    loginButton.textContent = session.user.name;
    loginHint.textContent = "You are already signed in. Close this window or clear the session below.";
    loginButton.dataset.state = "session";
  } else {
    loginButton.textContent = "Login";
    loginHint.textContent = "Private access for trusted members of The Shites Fight Club.";
    loginButton.dataset.state = "login";
  }
}

function syncAdminLauncher() {
  const session = getSession();
  const isLoggedIn = Boolean(session?.token);

  if (!adminLauncherCard || !adminLauncherState) {
    return;
  }

  if (isLoggedIn) {
    adminLauncherCard.classList.remove("is-locked");
    adminLauncherCard.setAttribute("href", "./admin.html");
    adminLauncherCard.removeAttribute("aria-disabled");
    adminLauncherCard.tabIndex = 0;
    adminLauncherState.textContent = "Access available";
    return;
  }

  adminLauncherCard.classList.add("is-locked");
  adminLauncherCard.removeAttribute("href");
  adminLauncherCard.setAttribute("aria-disabled", "true");
  adminLauncherCard.tabIndex = -1;
  adminLauncherState.textContent = "Login required";
}

function syncScrollCue() {
  document.body.classList.toggle("has-scrolled", window.scrollY > 24);
}

function syncViewportMode() {
  document.body.classList.toggle("compact-viewport", compactViewportQuery.matches);
}

loginButton?.addEventListener("click", () => {
  if (loginButton.dataset.state === "session") {
    if (window.confirm("Log out of the current session?")) {
      clearSession();
      syncLoginButton();
      syncAdminLauncher();
      showToast("Logged out.", "success");
    }
    return;
  }

  openLoginModal();
});

adminLauncherCard?.addEventListener("click", (event) => {
  if (adminLauncherCard.classList.contains("is-locked")) {
    event.preventDefault();
    showToast("Login required to access Admin.", "info");
    openLoginModal();
  }
});

closeLoginButton?.addEventListener("click", closeLoginModal);
closeLoginBackdrop?.addEventListener("click", closeLoginModal);

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !loginModal.classList.contains("hidden")) {
    closeLoginModal();
  }
});

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setFormMessage("");
  setLoginLoadingState(true);

  const payload = Object.fromEntries(new FormData(loginForm).entries());

  try {
    const session = await api("/auth/login", {
      method: "POST",
      body: payload
    });

    saveSession(session);
    syncLoginButton();
    syncAdminLauncher();
    closeLoginModal();
    loginForm.reset();
    showToast("Logged in successfully.", "success");
  } catch (error) {
    setFormMessage(error.message);
    showToast(error.message, "error");
  } finally {
    setLoginLoadingState(false);
  }
});

scrollCue?.addEventListener("click", () => {
  launcherStage?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
});

initThemeToggle(themeToggleButton);
syncLoginButton();
syncAdminLauncher();
syncScrollCue();
syncViewportMode();
window.addEventListener("scroll", syncScrollCue, { passive: true });
compactViewportQuery.addEventListener("change", syncViewportMode);
window.requestAnimationFrame(() => {
  document.body.classList.remove("is-loading");
});

const flashMessage = consumeFlashMessage();

if (flashMessage === "admin-login-required") {
  showToast("Login required to access Admin.", "info");
  openLoginModal();
}
