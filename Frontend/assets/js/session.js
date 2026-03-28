const SESSION_KEY = "ops-suite-session";

export function getSession() {
  try {
    return JSON.parse(window.localStorage.getItem(SESSION_KEY) || "null");
  } catch (_error) {
    return null;
  }
}

export function getToken() {
  return getSession()?.token || null;
}

export function getUser() {
  return getSession()?.user || null;
}

export function saveSession(session) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  window.localStorage.removeItem(SESSION_KEY);
}

export function hasPermission(permissionKey) {
  const user = getUser();

  if (!user) {
    return false;
  }

  return user.role === "ADMIN" || user.permissions.includes(permissionKey);
}

export function requireAuth(permissionKey) {
  const session = getSession();

  if (!session?.token || !session?.user) {
    window.location.href = "./index.html";
    throw new Error("Authentication required.");
  }

  if (permissionKey && !hasPermission(permissionKey)) {
    window.location.href = `./forbidden.html?permission=${permissionKey}`;
    throw new Error("Permission denied.");
  }

  return session.user;
}
