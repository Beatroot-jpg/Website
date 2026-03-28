import { clearSession, getToken } from "./session.js";

const API_BASE_URL = window.APP_CONFIG?.API_BASE_URL;

function buildApiUrl(path) {
  if (!API_BASE_URL) {
    throw new Error("API base URL is not configured.");
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

export async function api(path, options = {}) {
  const {
    method = "GET",
    body,
    auth = true
  } = options;

  const headers = {};
  const token = getToken();

  if (auth && token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  let response;

  try {
    response = await fetch(buildApiUrl(path), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch (_error) {
    throw new Error(`Unable to reach the API at ${API_BASE_URL}.`);
  }

  const text = await response.text();
  let data = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch (_error) {
      data = { message: text };
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearSession();

      if (!window.location.pathname.endsWith("/index.html") && !window.location.pathname.endsWith("/")) {
        window.location.href = "./index.html";
      }
    }

    const error = new Error(data.message || "Request failed.");
    error.status = response.status;
    throw error;
  }

  return data;
}
