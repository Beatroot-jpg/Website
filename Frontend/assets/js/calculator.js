import { api } from "./api.js";
import { clearSession, getSession, saveSession } from "./session.js";
import { initThemeToggle } from "./theme.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const themeToggleButton = $("#themeToggleButton");
const sessionButton = $("#sessionButton");
const calculatorAccessStatus = $("#calculatorAccessStatus");
const openRecipeModalButton = $("#openRecipeModalButton");
const recipeSelect = $("#recipeSelect");
const targetQuantityInput = $("#targetQuantityInput");
const batchCountValue = $("#batchCountValue");
const selectedRecipeTitle = $("#selectedRecipeTitle");
const recipeOutputCopy = $("#recipeOutputCopy");
const recipeFacts = $("#recipeFacts");
const updateRecipeButton = $("#updateRecipeButton");
const calculatorTableHint = $("#calculatorTableHint");
const calculatorTableBody = $("#calculatorTableBody");
const calculatorTableMeta = $("#calculatorTableMeta");
const loginModal = $("#loginModal");
const loginForm = $("#loginForm");
const loginError = $("#loginError");
const loginSubmitButton = $("#loginSubmitButton");
const recipeModal = $("#recipeModal");
const recipeModalTitle = $("#recipeModalTitle");
const recipeForm = $("#recipeForm");
const recipeFormMessage = $("#recipeFormMessage");
const recipeSubmitButton = $("#recipeSubmitButton");
const ingredientRows = $("#ingredientRows");
const addIngredientRowButton = $("#addIngredientRowButton");
const deleteRecipeButton = $("#deleteRecipeButton");
const deleteRecipeModal = $("#deleteRecipeModal");
const deleteRecipeName = $("#deleteRecipeName");
const confirmDeleteRecipeButton = $("#confirmDeleteRecipeButton");

const state = {
  session: getSession(),
  currentUser: null,
  viewer: { isLoggedIn: false, canManage: false },
  recipes: [],
  loading: true,
  selectedRecipeId: null,
  editingRecipeId: null,
  deletingRecipeId: null
};

function showToast(message, tone = "success") {
  const toast = document.createElement("div");
  toast.className = "toast " + tone;
  toast.textContent = message;
  $("#toastStack").appendChild(toast);
  window.setTimeout(() => toast.remove(), 3400);
}

function setMessage(element, message = "") {
  element.textContent = message;
  element.classList.toggle("hidden", !message);
}

function setLoading(button, loading, loadingLabel, idleLabel) {
  button.disabled = loading;
  button.textContent = loading ? loadingLabel : idleLabel;
}

function toggleModal(modal, visible) {
  modal.classList.toggle("hidden", !visible);
  modal.setAttribute("aria-hidden", visible ? "false" : "true");
}

function apiWithSession(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (state.session && state.session.token) {
    headers.set("Authorization", "Bearer " + state.session.token);
  }
  return api(path, { ...options, headers });
}

function canManage() {
  return Boolean(state.viewer.canManage);
}

function formatQuantity(value) {
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function createCell(value, className = "") {
  const cell = document.createElement("td");
  cell.className = className;
  cell.textContent = value;
  return cell;
}

function createMessageRow(message) {
  const row = document.createElement("tr");
  const cell = createCell(message, "inventory-table-message");
  cell.colSpan = 3;
  row.appendChild(cell);
  return row;
}

function selectedRecipe() {
  return state.recipes.find((recipe) => recipe.id === state.selectedRecipeId) || null;
}

function sortRecipes(recipes) {
  return [...recipes].sort((left, right) => left.name.localeCompare(right.name));
}

function syncSessionButton() {
  if (state.currentUser && state.currentUser.name) {
    sessionButton.textContent = state.currentUser.name;
    sessionButton.dataset.state = "session";
    return;
  }

  sessionButton.textContent = "Login";
  sessionButton.dataset.state = "login";
}

function syncRecipeSelect() {
  const priorId = state.selectedRecipeId;
  recipeSelect.replaceChildren();

  if (!state.recipes.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No calculators available";
    recipeSelect.appendChild(option);
    recipeSelect.disabled = true;
    state.selectedRecipeId = null;
    return;
  }

  state.recipes.forEach((recipe) => {
    const option = document.createElement("option");
    option.value = recipe.id;
    option.textContent = recipe.name + " - makes " + recipe.outputQuantity + " " + recipe.outputName;
    recipeSelect.appendChild(option);
  });

  state.selectedRecipeId = state.recipes.some((recipe) => recipe.id === priorId)
    ? priorId
    : state.recipes[0].id;
  recipeSelect.value = state.selectedRecipeId;
  recipeSelect.disabled = false;
}

function syncAccess(recipe = selectedRecipe()) {
  const admin = canManage();
  calculatorAccessStatus.textContent = admin ? "Admin controls enabled" : "Public view";
  calculatorAccessStatus.classList.toggle("is-live", admin);
  openRecipeModalButton.hidden = !admin;
  updateRecipeButton.hidden = !admin || !recipe;
  calculatorTableHint.textContent = !recipe
    ? "Choose a calculator to see the material list."
    : admin
      ? "Double-click any recipe value or material value for a quick edit. Use Update calculator for the full form."
      : "Enter the product quantity above to calculate the materials required.";
}

function targetQuantity() {
  const value = Number(targetQuantityInput.value);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

function batchCount(recipe) {
  const target = targetQuantity();
  return recipe && target ? Math.ceil(target / recipe.outputQuantity) : 0;
}

function createRecipeFact(label, recipe, field, value, displayValue, editable = true) {
  const fact = document.createElement("div");
  fact.className = "calculator-fact";
  const labelElement = document.createElement("span");
  labelElement.textContent = label;
  const valueElement = document.createElement("strong");
  valueElement.textContent = displayValue;

  if (editable) {
    valueElement.dataset.recipeField = field;
    valueElement.dataset.rawValue = String(value);
    valueElement.title = canManage() ? "Double-click to edit" : "Read-only value";
  }

  fact.append(labelElement, valueElement);
  return fact;
}

function createEditableIngredientCell(ingredient, field, value, displayValue, className = "") {
  const cell = createCell(displayValue, className);
  cell.dataset.ingredientId = ingredient.id;
  cell.dataset.ingredientField = field;
  cell.dataset.rawValue = String(value);
  cell.title = canManage() ? "Double-click to edit" : "Read-only value";
  return cell;
}

function renderCalculator() {
  syncRecipeSelect();
  const recipe = selectedRecipe();
  const batches = batchCount(recipe);

  batchCountValue.textContent = formatQuantity(batches);
  recipeFacts.replaceChildren();
  calculatorTableBody.replaceChildren();
  syncAccess(recipe);

  if (state.loading) {
    selectedRecipeTitle.textContent = "Loading calculators";
    recipeOutputCopy.textContent = "Getting saved recipes ready.";
    calculatorTableBody.appendChild(createMessageRow("Loading calculators..."));
    calculatorTableMeta.textContent = "Loading calculators...";
    return;
  }

  if (!recipe) {
    selectedRecipeTitle.textContent = "No calculator selected";
    recipeOutputCopy.textContent = canManage()
      ? "Create the first calculator to start building material lists."
      : "No saved calculators are available yet.";
    calculatorTableBody.appendChild(createMessageRow("No calculator selected."));
    calculatorTableMeta.textContent = "0 saved calculators";
    return;
  }

  selectedRecipeTitle.textContent = recipe.name;
  selectedRecipeTitle.dataset.recipeField = "name";
  selectedRecipeTitle.dataset.rawValue = recipe.name;
  selectedRecipeTitle.title = canManage() ? "Double-click to edit" : "Read-only value";
  selectedRecipeTitle.classList.toggle("calculator-title-editable", canManage());

  recipeOutputCopy.textContent = "Each craft makes " + formatQuantity(recipe.outputQuantity) + " " + recipe.outputName + ". "
    + (targetQuantity() ? "The material list below covers " + formatQuantity(targetQuantity()) + " requested products." : "Enter a product amount to calculate the next craft.");

  recipeFacts.append(
    createRecipeFact("Crafted item", recipe, "outputName", recipe.outputName, recipe.outputName),
    createRecipeFact("Output per craft", recipe, "outputQuantity", recipe.outputQuantity, formatQuantity(recipe.outputQuantity)),
    createRecipeFact("Requested output", recipe, "target", targetQuantity(), formatQuantity(targetQuantity()), false)
  );

  recipe.ingredients.forEach((ingredient) => {
    const row = document.createElement("tr");
    row.append(
      createEditableIngredientCell(ingredient, "name", ingredient.name, ingredient.name, "quota-member-name"),
      createEditableIngredientCell(ingredient, "quantity", ingredient.quantity, formatQuantity(ingredient.quantity)),
      createCell(formatQuantity(ingredient.quantity * batches), "calculator-required-value")
    );
    calculatorTableBody.appendChild(row);
  });

  calculatorTableMeta.textContent = formatQuantity(batches) + " craft " + (batches === 1 ? "batch" : "batches") + " required for "
    + formatQuantity(targetQuantity()) + " " + recipe.outputName + ".";
}

function hydrateSession() {
  state.currentUser = state.session && state.session.token ? state.session.user || null : null;
  syncSessionButton();
}

async function loadCalculators() {
  state.loading = true;
  renderCalculator();

  try {
    const request = state.session && state.session.token ? apiWithSession : api;
    const response = await request("/calculator");
    state.recipes = sortRecipes(response.recipes || []);
    state.viewer = response.viewer || state.viewer;

    if (!state.viewer.isLoggedIn && state.session && state.session.token) {
      clearSession();
      state.session = null;
      state.currentUser = null;
      syncSessionButton();
    }
  } catch (error) {
    state.recipes = [];
    showToast(error.message, "error");
  } finally {
    state.loading = false;
    renderCalculator();
  }
}

function normalizeInlineValue(field, value) {
  const trimmed = String(value ?? "").trim();

  if (field === "name" || field === "outputName") {
    if (!trimmed) {
      throw new Error(field === "outputName" ? "Crafted item name cannot be empty." : "Name cannot be empty.");
    }
    return trimmed;
  }

  const numeric = Number(trimmed);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error("Use a whole number greater than zero.");
  }
  return numeric;
}

async function updateRecipeDetails(recipeId, payload, successMessage) {
  const response = await apiWithSession("/calculator/recipes/" + recipeId + "/details", {
    method: "PATCH",
    body: payload
  });
  state.recipes = sortRecipes(state.recipes.map((recipe) => recipe.id === response.recipe.id ? response.recipe : recipe));
  renderCalculator();
  showToast(successMessage, "success");
}

async function updateIngredient(recipeId, ingredientId, payload, successMessage) {
  const response = await apiWithSession("/calculator/recipes/" + recipeId + "/ingredients/" + ingredientId, {
    method: "PATCH",
    body: payload
  });

  state.recipes = state.recipes.map((recipe) => {
    if (recipe.id !== recipeId) {
      return recipe;
    }

    return {
      ...recipe,
      ingredients: recipe.ingredients.map((ingredient) => ingredient.id === response.ingredient.id ? response.ingredient : ingredient)
    };
  });

  renderCalculator();
  showToast(successMessage, "success");
}

function openInlineEditor(element) {
  if (!canManage() || element.querySelector("input")) {
    return;
  }

  const recipe = selectedRecipe();
  if (!recipe) {
    return;
  }

  const recipeField = element.dataset.recipeField;
  const ingredientField = element.dataset.ingredientField;
  const ingredientId = element.dataset.ingredientId;
  const field = recipeField || ingredientField;
  const originalValue = element.dataset.rawValue;

  if (!field) {
    return;
  }

  const input = document.createElement("input");
  input.className = "inventory-inline-editor";
  input.value = originalValue;
  input.type = field === "outputQuantity" || field === "quantity" ? "number" : "text";

  if (input.type === "number") {
    input.min = "1";
    input.step = "1";
    input.inputMode = "numeric";
  }

  let completed = false;

  const restore = () => {
    if (completed) {
      return;
    }
    completed = true;
    renderCalculator();
  };

  const save = async () => {
    if (completed) {
      return;
    }

    let nextValue;
    try {
      nextValue = normalizeInlineValue(field, input.value);
    } catch (error) {
      showToast(error.message, "error");
      input.focus();
      return;
    }

    if (String(nextValue) === String(originalValue)) {
      restore();
      return;
    }

    completed = true;
    input.disabled = true;

    try {
      if (recipeField) {
        await updateRecipeDetails(recipe.id, { [recipeField]: nextValue }, "Calculator updated.");
      } else {
        await updateIngredient(recipe.id, ingredientId, { [ingredientField]: nextValue }, "Material updated.");
      }
    } catch (error) {
      renderCalculator();
      showToast(error.message, "error");
    }
  };

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      save();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      restore();
    }
  });
  input.addEventListener("blur", save, { once: true });

  element.replaceChildren(input);
  input.focus();
  input.select();
}

function createIngredientRow(ingredient = {}) {
  const row = document.createElement("div");
  row.className = "calculator-form-ingredient";

  const nameField = document.createElement("label");
  nameField.className = "inventory-field";
  const nameLabel = document.createElement("span");
  nameLabel.textContent = "Material";
  const nameInput = document.createElement("input");
  nameInput.name = "ingredientName";
  nameInput.value = ingredient.name || "";
  nameInput.maxLength = 100;
  nameInput.required = true;
  nameField.append(nameLabel, nameInput);

  const quantityField = document.createElement("label");
  quantityField.className = "inventory-field";
  const quantityLabel = document.createElement("span");
  quantityLabel.textContent = "Per craft";
  const quantityInput = document.createElement("input");
  quantityInput.name = "ingredientQuantity";
  quantityInput.type = "number";
  quantityInput.min = "1";
  quantityInput.step = "1";
  quantityInput.inputMode = "numeric";
  quantityInput.value = ingredient.quantity || 1;
  quantityInput.required = true;
  quantityField.append(quantityLabel, quantityInput);

  const removeButton = document.createElement("button");
  removeButton.className = "inventory-button ghost compact";
  removeButton.type = "button";
  removeButton.dataset.ingredientAction = "remove";
  removeButton.textContent = "Remove";

  row.append(nameField, quantityField, removeButton);
  ingredientRows.appendChild(row);
}

function syncIngredientRemoveButtons() {
  const buttons = $$("button[data-ingredient-action='remove']");
  buttons.forEach((button) => {
    button.disabled = buttons.length <= 1;
  });
}

function fillRecipeForm(recipe = null) {
  recipeForm.reset();
  ingredientRows.replaceChildren();
  setMessage(recipeFormMessage, "");
  state.editingRecipeId = recipe ? recipe.id : null;
  recipeModalTitle.textContent = recipe ? "Update calculator" : "New calculator";
  recipeSubmitButton.textContent = recipe ? "Save calculator" : "Create calculator";
  deleteRecipeButton.hidden = !recipe;

  if (recipe) {
    recipeForm.elements.name.value = recipe.name;
    recipeForm.elements.outputName.value = recipe.outputName;
    recipeForm.elements.outputQuantity.value = recipe.outputQuantity;
    recipe.ingredients.forEach((ingredient) => createIngredientRow(ingredient));
  } else {
    recipeForm.elements.outputQuantity.value = 1;
    createIngredientRow();
  }

  syncIngredientRemoveButtons();
}

function openRecipeModal(recipe = null) {
  if (!canManage()) {
    showToast(state.currentUser ? "Admin access is required." : "Log in as an admin to manage calculators.", "error");
    return;
  }

  fillRecipeForm(recipe);
  toggleModal(recipeModal, true);
  window.requestAnimationFrame(() => recipeForm.elements.name.focus());
}

function openDeleteRecipeModal(recipe) {
  state.deletingRecipeId = recipe.id;
  deleteRecipeName.textContent = recipe.name;
  toggleModal(deleteRecipeModal, true);
}

sessionButton.addEventListener("click", async () => {
  if (sessionButton.dataset.state !== "session") {
    setMessage(loginError, "");
    toggleModal(loginModal, true);
    window.requestAnimationFrame(() => loginForm.elements.username.focus());
    return;
  }

  if (!window.confirm("Log out of this account?")) {
    return;
  }

  clearSession();
  state.session = null;
  state.currentUser = null;
  state.viewer = { isLoggedIn: false, canManage: false };
  syncSessionButton();
  await loadCalculators();
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(loginError, "");
  setLoading(loginSubmitButton, true, "Entering", "Enter");

  try {
    const session = await api("/auth/login", {
      method: "POST",
      body: Object.fromEntries(new FormData(loginForm).entries())
    });
    state.session = session;
    state.currentUser = session.user;
    saveSession(session);
    loginForm.reset();
    toggleModal(loginModal, false);
    syncSessionButton();
    await loadCalculators();
    showToast("Logged in successfully.", "success");
  } catch (error) {
    setMessage(loginError, error.message);
    showToast(error.message, "error");
  } finally {
    setLoading(loginSubmitButton, false, "Entering", "Enter");
  }
});

recipeSelect.addEventListener("change", () => {
  state.selectedRecipeId = recipeSelect.value || null;
  renderCalculator();
});

targetQuantityInput.addEventListener("input", () => {
  renderCalculator();
});

$$("[data-target-step]").forEach((button) => {
  button.addEventListener("click", () => {
    const current = Number(targetQuantityInput.value);
    const step = Number(button.dataset.targetStep);
    const next = Math.max(0, (Number.isFinite(current) ? current : 0) + step);
    targetQuantityInput.value = String(next);
    renderCalculator();
  });
});

openRecipeModalButton.addEventListener("click", () => openRecipeModal());
updateRecipeButton.addEventListener("click", () => {
  const recipe = selectedRecipe();
  if (recipe) {
    openRecipeModal(recipe);
  }
});

selectedRecipeTitle.addEventListener("dblclick", () => {
  if (selectedRecipe()) {
    openInlineEditor(selectedRecipeTitle);
  }
});

recipeFacts.addEventListener("dblclick", (event) => {
  const value = event.target.closest("strong[data-recipe-field]");
  if (value) {
    openInlineEditor(value);
  }
});

calculatorTableBody.addEventListener("dblclick", (event) => {
  const cell = event.target.closest("td[data-ingredient-field]");
  if (cell) {
    openInlineEditor(cell);
  }
});

addIngredientRowButton.addEventListener("click", () => {
  createIngredientRow();
  syncIngredientRemoveButtons();
  const inputs = ingredientRows.querySelectorAll("input");
  inputs[inputs.length - 2].focus();
});

ingredientRows.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-ingredient-action='remove']");
  if (!button || ingredientRows.children.length <= 1) {
    return;
  }

  button.closest(".calculator-form-ingredient").remove();
  syncIngredientRemoveButtons();
});

recipeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const editing = Boolean(state.editingRecipeId);
  const ingredients = [...ingredientRows.querySelectorAll(".calculator-form-ingredient")].map((row) => ({
    name: row.querySelector("input[name='ingredientName']").value.trim(),
    quantity: row.querySelector("input[name='ingredientQuantity']").value
  }));

  const payload = {
    name: recipeForm.elements.name.value.trim(),
    outputName: recipeForm.elements.outputName.value.trim(),
    outputQuantity: recipeForm.elements.outputQuantity.value,
    ingredients
  };

  setMessage(recipeFormMessage, "");
  setLoading(recipeSubmitButton, true, "Saving", editing ? "Save calculator" : "Create calculator");

  try {
    if (editing) {
      const response = await apiWithSession("/calculator/recipes/" + state.editingRecipeId, {
        method: "PATCH",
        body: payload
      });
      state.recipes = sortRecipes(state.recipes.map((recipe) => recipe.id === response.recipe.id ? response.recipe : recipe));
      state.selectedRecipeId = response.recipe.id;
      showToast("Calculator updated.", "success");
    } else {
      const response = await apiWithSession("/calculator/recipes", {
        method: "POST",
        body: payload
      });
      state.recipes = sortRecipes([...state.recipes, response.recipe]);
      state.selectedRecipeId = response.recipe.id;
      showToast("Calculator created.", "success");
    }

    toggleModal(recipeModal, false);
    renderCalculator();
  } catch (error) {
    setMessage(recipeFormMessage, error.message);
    showToast(error.message, "error");
  } finally {
    setLoading(recipeSubmitButton, false, "Saving", editing ? "Save calculator" : "Create calculator");
  }
});

deleteRecipeButton.addEventListener("click", () => {
  const recipe = selectedRecipe();
  if (recipe) {
    openDeleteRecipeModal(recipe);
  }
});

confirmDeleteRecipeButton.addEventListener("click", async () => {
  const recipe = state.recipes.find((entry) => entry.id === state.deletingRecipeId);
  if (!recipe) {
    return;
  }

  setLoading(confirmDeleteRecipeButton, true, "Deleting", "Delete calculator");

  try {
    const response = await apiWithSession("/calculator/recipes/" + recipe.id, {
      method: "DELETE"
    });
    state.recipes = state.recipes.filter((entry) => entry.id !== recipe.id);
    state.selectedRecipeId = state.recipes[0] ? state.recipes[0].id : null;
    state.editingRecipeId = null;
    state.deletingRecipeId = null;
    toggleModal(deleteRecipeModal, false);
    toggleModal(recipeModal, false);
    renderCalculator();
    showToast(response.message, "success");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setLoading(confirmDeleteRecipeButton, false, "Deleting", "Delete calculator");
  }
});

[
  ["closeLoginButton", loginModal],
  ["closeLoginBackdrop", loginModal],
  ["closeRecipeButton", recipeModal],
  ["closeRecipeBackdrop", recipeModal],
  ["closeDeleteRecipeButton", deleteRecipeModal],
  ["closeDeleteRecipeBackdrop", deleteRecipeModal],
  ["cancelDeleteRecipeButton", deleteRecipeModal]
].forEach(([buttonId, modal]) => {
  $("#" + buttonId).addEventListener("click", () => toggleModal(modal, false));
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  [deleteRecipeModal, recipeModal, loginModal].some((modal) => {
    if (!modal.classList.contains("hidden")) {
      toggleModal(modal, false);
      return true;
    }
    return false;
  });
});

initThemeToggle(themeToggleButton);
hydrateSession();
renderCalculator();
await loadCalculators();