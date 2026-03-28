const DRAFT_PREFIX = "ops-draft:";
const SAVED_VIEW_PREFIX = "ops-saved-view:";

function safeRead(key) {
  try {
    return JSON.parse(window.localStorage.getItem(key) || "null");
  } catch (_error) {
    return null;
  }
}

function safeWrite(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function collectNamedElements(form) {
  return [...form.elements].filter((element) => element.name);
}

function applyDraft(form, draft) {
  const groupedElements = collectNamedElements(form).reduce((accumulator, element) => {
    accumulator[element.name] = accumulator[element.name] || [];
    accumulator[element.name].push(element);
    return accumulator;
  }, {});

  Object.entries(draft).forEach(([name, value]) => {
    const elements = groupedElements[name] || [];

    elements.forEach((element) => {
      if (element.type === "checkbox") {
        if (Array.isArray(value)) {
          element.checked = value.includes(element.value);
        } else {
          element.checked = Boolean(value);
        }
        return;
      }

      if (element.type === "radio") {
        element.checked = element.value === value;
        return;
      }

      element.value = value ?? "";
    });
  });
}

export function bindDraftForm(form, storageKey) {
  if (!form) {
    return {
      restored: false,
      clearDraft() {}
    };
  }

  const key = `${DRAFT_PREFIX}${storageKey}`;
  const existingDraft = safeRead(key);

  if (existingDraft) {
    applyDraft(form, existingDraft);
  }

  function saveDraft() {
    const draft = {};
    const groupedElements = collectNamedElements(form).reduce((accumulator, element) => {
      accumulator[element.name] = accumulator[element.name] || [];
      accumulator[element.name].push(element);
      return accumulator;
    }, {});

    Object.entries(groupedElements).forEach(([name, elements]) => {
      if (elements[0].type === "checkbox") {
        if (elements.length === 1) {
          draft[name] = elements[0].checked;
          return;
        }

        draft[name] = elements
          .filter((element) => element.checked)
          .map((element) => element.value);
        return;
      }

      if (elements[0].type === "radio") {
        draft[name] = elements.find((element) => element.checked)?.value || "";
        return;
      }

      draft[name] = elements[0].value;
    });

    safeWrite(key, draft);
  }

  ["input", "change"].forEach((eventName) => {
    form.addEventListener(eventName, saveDraft);
  });

  return {
    restored: Boolean(existingDraft),
    clearDraft() {
      window.localStorage.removeItem(key);
    }
  };
}

export function restoreDraftForm(form, storageKey) {
  if (!form) {
    return false;
  }

  const draft = safeRead(`${DRAFT_PREFIX}${storageKey}`);

  if (!draft) {
    return false;
  }

  applyDraft(form, draft);
  return true;
}

export function downloadCsv(filename, columns, rows) {
  const header = columns.map((column) => column.label).join(",");
  const body = rows.map((row) => columns.map((column) => {
    const rawValue = column.value(row);
    const text = `${rawValue ?? ""}`.replace(/"/g, "\"\"");
    return `"${text}"`;
  }).join(","));
  const csv = [header, ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function buildPageHref(pagePath, { view = "", search = "", hash = "" } = {}) {
  const params = new URLSearchParams();

  if (view) {
    params.set("view", view);
  }

  if (search) {
    params.set("search", search);
  }

  return `${pagePath}${params.toString() ? `?${params}` : ""}${hash ? `#${hash}` : ""}`;
}

export function loadSavedView(pageKey) {
  return safeRead(`${SAVED_VIEW_PREFIX}${pageKey}`);
}

export function saveSavedView(pageKey, view) {
  safeWrite(`${SAVED_VIEW_PREFIX}${pageKey}`, view);
}

export function clearSavedView(pageKey) {
  window.localStorage.removeItem(`${SAVED_VIEW_PREFIX}${pageKey}`);
}
