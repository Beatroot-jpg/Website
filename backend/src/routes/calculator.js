import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler, createError } from "../http.js";
import {
  authenticateToken,
  authenticateTokenOptional,
  requireAdmin
} from "../middleware/auth.js";
import { requireString } from "../validators.js";

const router = Router();

function requirePositiveWholeNumber(value, fieldName) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError(400, fieldName + " must be a positive whole number.");
  }

  return parsed;
}

function normalizeIngredients(value) {
  if (!Array.isArray(value) || !value.length) {
    throw createError(400, "Add at least one material.");
  }

  const seenNames = new Set();

  return value.map((ingredient, index) => {
    const name = requireString(ingredient?.name, "Material " + (index + 1) + " name");
    const nameKey = name.toLocaleLowerCase();

    if (seenNames.has(nameKey)) {
      throw createError(400, "Each material can only appear once in a calculator.");
    }

    seenNames.add(nameKey);

    return {
      name,
      quantity: requirePositiveWholeNumber(ingredient?.quantity, "Material " + (index + 1) + " amount"),
      sortOrder: index
    };
  });
}

function normalizeRecipePayload(body) {
  return {
    name: requireString(body.name, "Calculator name"),
    outputName: requireString(body.outputName, "Crafted item name"),
    outputQuantity: requirePositiveWholeNumber(body.outputQuantity, "Output per craft"),
    ingredients: normalizeIngredients(body.ingredients)
  };
}

function serializeRecipe(recipe) {
  return {
    id: recipe.id,
    name: recipe.name,
    outputName: recipe.outputName,
    outputQuantity: recipe.outputQuantity,
    ingredients: recipe.ingredients
      .slice()
      .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
      .map((ingredient) => ({
        id: ingredient.id,
        name: ingredient.name,
        quantity: ingredient.quantity,
        sortOrder: ingredient.sortOrder,
        createdAt: ingredient.createdAt,
        updatedAt: ingredient.updatedAt
      })),
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt
  };
}

function recipeInclude() {
  return {
    ingredients: {
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    }
  };
}

async function findRecipeOrThrow(id, database = prisma) {
  const recipe = await database.calculatorRecipe.findUnique({
    where: { id },
    include: recipeInclude()
  });

  if (!recipe) {
    throw createError(404, "Calculator not found.");
  }

  return recipe;
}

async function assertRecipeNameAvailable(name, excludedId = null, database = prisma) {
  const existing = await database.calculatorRecipe.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(excludedId ? { id: { not: excludedId } } : {})
    }
  });

  if (existing) {
    throw createError(409, "A calculator already uses that name.");
  }
}

router.get(
  "/",
  authenticateTokenOptional,
  asyncHandler(async (req, res) => {
    const recipes = await prisma.calculatorRecipe.findMany({
      include: recipeInclude(),
      orderBy: { name: "asc" }
    });

    res.json({
      recipes: recipes.map(serializeRecipe),
      viewer: {
        isLoggedIn: Boolean(req.user),
        canManage: req.user?.role === "ADMIN"
      }
    });
  })
);

router.post(
  "/recipes",
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const payload = normalizeRecipePayload(req.body);
    await assertRecipeNameAvailable(payload.name);

    const recipe = await prisma.calculatorRecipe.create({
      data: {
        name: payload.name,
        outputName: payload.outputName,
        outputQuantity: payload.outputQuantity,
        ingredients: {
          create: payload.ingredients
        }
      },
      include: recipeInclude()
    });

    res.status(201).json({ recipe: serializeRecipe(recipe) });
  })
);

router.patch(
  "/recipes/:id",
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const payload = normalizeRecipePayload(req.body);

    const recipe = await prisma.$transaction(async (database) => {
      await findRecipeOrThrow(req.params.id, database);
      await assertRecipeNameAvailable(payload.name, req.params.id, database);

      await database.calculatorIngredient.deleteMany({
        where: { recipeId: req.params.id }
      });

      return database.calculatorRecipe.update({
        where: { id: req.params.id },
        data: {
          name: payload.name,
          outputName: payload.outputName,
          outputQuantity: payload.outputQuantity,
          ingredients: {
            create: payload.ingredients
          }
        },
        include: recipeInclude()
      });
    });

    res.json({ recipe: serializeRecipe(recipe) });
  })
);

router.patch(
  "/recipes/:id/details",
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await findRecipeOrThrow(req.params.id);
    const data = {};

    if (req.body.name !== undefined) {
      const name = requireString(req.body.name, "Calculator name");
      await assertRecipeNameAvailable(name, existing.id);
      data.name = name;
    }

    if (req.body.outputName !== undefined) {
      data.outputName = requireString(req.body.outputName, "Crafted item name");
    }

    if (req.body.outputQuantity !== undefined) {
      data.outputQuantity = requirePositiveWholeNumber(req.body.outputQuantity, "Output per craft");
    }

    if (!Object.keys(data).length) {
      throw createError(400, "Choose a calculator value to update.");
    }

    const recipe = await prisma.calculatorRecipe.update({
      where: { id: existing.id },
      data,
      include: recipeInclude()
    });

    res.json({ recipe: serializeRecipe(recipe) });
  })
);

router.patch(
  "/recipes/:recipeId/ingredients/:ingredientId",
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const recipe = await findRecipeOrThrow(req.params.recipeId);
    const ingredient = recipe.ingredients.find((entry) => entry.id === req.params.ingredientId);

    if (!ingredient) {
      throw createError(404, "Material not found in this calculator.");
    }

    const data = {};

    if (req.body.name !== undefined) {
      const name = requireString(req.body.name, "Material name");
      const duplicate = recipe.ingredients.find(
        (entry) => entry.id !== ingredient.id && entry.name.localeCompare(name, undefined, { sensitivity: "accent" }) === 0
      );

      if (duplicate) {
        throw createError(409, "This material is already in the calculator.");
      }

      data.name = name;
    }

    if (req.body.quantity !== undefined) {
      data.quantity = requirePositiveWholeNumber(req.body.quantity, "Material amount");
    }

    if (!Object.keys(data).length) {
      throw createError(400, "Choose a material value to update.");
    }

    const updatedIngredient = await prisma.calculatorIngredient.update({
      where: { id: ingredient.id },
      data
    });

    res.json({
      ingredient: {
        id: updatedIngredient.id,
        name: updatedIngredient.name,
        quantity: updatedIngredient.quantity,
        sortOrder: updatedIngredient.sortOrder,
        createdAt: updatedIngredient.createdAt,
        updatedAt: updatedIngredient.updatedAt
      }
    });
  })
);

router.delete(
  "/recipes/:id",
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const recipe = await findRecipeOrThrow(req.params.id);

    await prisma.calculatorRecipe.delete({ where: { id: recipe.id } });
    res.json({ message: recipe.name + " was removed." });
  })
);

export default router;