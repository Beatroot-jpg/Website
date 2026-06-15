const LOCAL_API_BASE_URL = "http://localhost:3000/api";
const DEPLOYED_API_BASE_URL = "https://yugomafia.up.railway.app/api";

function resolveApiBaseUrl() {
  const hostname = window.location.hostname.toLowerCase();

  if (
    hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "::1"
  ) {
    return LOCAL_API_BASE_URL;
  }

  return DEPLOYED_API_BASE_URL;
}

window.APP_CONFIG = {
  ...(window.APP_CONFIG || {}),
  API_BASE_URL: window.APP_CONFIG?.API_BASE_URL || resolveApiBaseUrl()
};
