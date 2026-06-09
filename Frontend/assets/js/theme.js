const STORAGE_KEY = "the-shites-theme";

export function getTheme() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || "dark";
  } catch (_error) {
    return "dark";
  }
}

export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;

  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch (_error) {}
}

export function initThemeToggle(button) {
  if (!button) {
    return;
  }

  function syncLabel() {
    const currentTheme = document.documentElement.dataset.theme || getTheme();
    const nextTheme = currentTheme === "light" ? "dark" : "light";
    button.textContent = `${nextTheme.charAt(0).toUpperCase()}${nextTheme.slice(1)} mode`;
    button.setAttribute("aria-pressed", currentTheme === "light" ? "true" : "false");
  }

  setTheme(getTheme());
  syncLabel();

  button.addEventListener("click", () => {
    const currentTheme = document.documentElement.dataset.theme || "dark";
    setTheme(currentTheme === "light" ? "dark" : "light");
    syncLabel();
  });
}
