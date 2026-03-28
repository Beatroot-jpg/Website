import { api } from "./api.js";
import { getSession, saveSession } from "./session.js";
import { mountFormError, showToast } from "./ui.js";

const loginForm = document.querySelector("#loginForm");
const errorElement = document.querySelector("#loginError");
const setupHint = document.querySelector("#setupHint");

if (getSession()) {
  window.location.href = "./dashboard.html";
}

async function loadSetupStatus() {
  try {
    const { needsSetup } = await api("/meta/bootstrap-status", { auth: false });

    if (needsSetup) {
      setupHint.textContent = "No users exist yet. Set ADMIN_USERNAME and ADMIN_PASSWORD in Railway or your local .env before logging in.";
    }
  } catch (_error) {
    setupHint.textContent = "Unable to reach the live API. Check the deployed frontend API configuration and Railway CORS settings.";
  }
}

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  mountFormError(errorElement, "");

  const payload = Object.fromEntries(new FormData(loginForm).entries());

  try {
    const session = await api("/auth/login", {
      method: "POST",
      auth: false,
      body: payload
    });

    saveSession(session);
    window.location.href = "./dashboard.html";
  } catch (error) {
    mountFormError(errorElement, error.message);
    showToast(error.message, "error");
  }
});

loadSetupStatus();
