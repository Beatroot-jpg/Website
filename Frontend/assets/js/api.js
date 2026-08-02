const LOCAL_API_BASE_URL = "http://localhost:3000/api";
const DEPLOYED_API_BASE_URL = "https://yugomafia.up.railway.app/api";

function resolveApiBaseUrl() {
  const hostname = window.location.hostname.toLowerCase();
  const isLocalDevelopment = ["localhost", "127.0.0.1", "::1"].includes(hostname);
  const configuredUrl = `${window.APP_CONFIG?.API_BASE_URL || ""}`.trim().replace(/\/+$/, "");

  // Static uploads and misconfigured Netlify builds used to fall back to localhost.
  // A non-local page must always call the deployed Railway API instead.
  if (configuredUrl && (isLocalDevelopment || configuredUrl !== LOCAL_API_BASE_URL)) {
    return configuredUrl;
  }

  return isLocalDevelopment ? LOCAL_API_BASE_URL : DEPLOYED_API_BASE_URL;
}

const API_BASE_URL = resolveApiBaseUrl();

export async function api(path, options = {}) {
  const requestUrl = path.startsWith("http") ? path : `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(options.headers || {});

  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(requestUrl, {
    ...options,
    headers,
    body: options.body && !(options.body instanceof FormData)
      ? JSON.stringify(options.body)
      : options.body
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof payload === "object" && payload?.message
      ? payload.message
      : "Request failed.";
    throw new Error(message);
  }

  return payload;
}
