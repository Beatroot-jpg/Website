const CHANNEL_NAME = "ops-live-sync";
const STORAGE_KEY = "ops-live-sync-event";

let channel = null;

function getChannel() {
  if (channel || typeof window.BroadcastChannel !== "function") {
    return channel;
  }

  channel = new window.BroadcastChannel(CHANNEL_NAME);
  return channel;
}

export function announceMutation(resources = [], detail = {}) {
  const event = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    resources,
    detail,
    at: Date.now()
  };
  const syncChannel = getChannel();

  if (syncChannel) {
    syncChannel.postMessage(event);
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(event));
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (_error) {
    // Ignore storage sync issues and rely on the active tab refresh.
  }
}

export function subscribeToMutations(watchedResources, callback) {
  const resources = new Set(watchedResources);
  let debounceTimer = null;

  function handleEvent(event) {
    if (!event?.resources?.some((resource) => resources.has(resource))) {
      return;
    }

    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => callback(event), 120);
  }

  const syncChannel = getChannel();

  if (syncChannel) {
    syncChannel.addEventListener("message", (messageEvent) => {
      handleEvent(messageEvent.data);
    });
  }

  function onStorage(event) {
    if (event.key !== STORAGE_KEY || !event.newValue) {
      return;
    }

    try {
      handleEvent(JSON.parse(event.newValue));
    } catch (_error) {
      // Ignore malformed fallback events.
    }
  }

  window.addEventListener("storage", onStorage);
}
