(() => {
  const DEFAULT_API_BASE_URL = "http://localhost:3000/api";
  const existingConfig = window.APP_CONFIG || {};

  function normalizeApiBaseUrl(value) {
    const trimmedValue = typeof value === "string" ? value.trim() : "";

    if (!trimmedValue) {
      return DEFAULT_API_BASE_URL;
    }

    const withoutTrailingSlash = trimmedValue.replace(/\/+$/, "");
    return withoutTrailingSlash.endsWith("/api") ? withoutTrailingSlash : `${withoutTrailingSlash}/api`;
  }

  window.APP_CONFIG = {
    ...existingConfig,
    API_BASE_URL: normalizeApiBaseUrl(existingConfig.API_BASE_URL)
  };
})();
