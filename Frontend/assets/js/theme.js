const THEME_KEY = "the-shites-theme";

function normalizeTheme(theme) {
  return theme === "light" ? "light" : "dark";
}

export function getStoredTheme() {
  try {
    return normalizeTheme(window.localStorage.getItem(THEME_KEY));
  } catch (_error) {
    return "dark";
  }
}

export function applyTheme(theme) {
  const nextTheme = normalizeTheme(theme);
  document.documentElement.dataset.theme = nextTheme;
  return nextTheme;
}

export function initializeTheme() {
  return applyTheme(getStoredTheme());
}

export function saveTheme(theme) {
  const nextTheme = normalizeTheme(theme);

  try {
    window.localStorage.setItem(THEME_KEY, nextTheme);
  } catch (_error) {
    // Ignore storage failures and still apply the in-memory theme.
  }

  return applyTheme(nextTheme);
}

export function initThemeToggle(button) {
  const updateButton = (theme) => {
    if (!button) {
      return;
    }

    const isLight = theme === "light";
    button.textContent = isLight ? "Switch to dark" : "Switch to light";
    button.setAttribute("aria-pressed", String(isLight));
    button.dataset.theme = theme;
  };

  let activeTheme = initializeTheme();
  updateButton(activeTheme);

  if (!button) {
    return activeTheme;
  }

  button.addEventListener("click", () => {
    activeTheme = saveTheme(activeTheme === "light" ? "dark" : "light");
    updateButton(activeTheme);
  });

  return activeTheme;
}
