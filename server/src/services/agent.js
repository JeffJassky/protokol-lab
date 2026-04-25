import { GoogleGenAI, Type } from "@google/genai";
import { marked } from "marked";
import FoodLog from "../models/FoodLog.js";
import FoodItem from "../models/FoodItem.js";
import WeightLog from "../models/WeightLog.js";
import WaistLog from "../models/WaistLog.js";
import DoseLog from "../models/DoseLog.js";
import Compound from "../models/Compound.js";
import Symptom from "../models/Symptom.js";
import SymptomLog from "../models/SymptomLog.js";
import UserSettings from "../models/UserSettings.js";
import Meal from "../models/Meal.js";
import MealProposal from "../models/MealProposal.js";
import User from "../models/User.js";
import { childLogger, errContext } from "../lib/logger.js";
import { evaluateStorageCap, getEffectiveChatLimits } from "../lib/planLimits.js";
import { getPlanForUser } from "../../../shared/plans.js";

const log = childLogger('agent');

// Gemini 3 Flash is the first model family that supports combining the
// built-in googleSearch tool with user-defined function declarations in the
// same request. Older flash/pro variants (2.x) force you to pick one.
const MODEL = "gemini-3-flash-preview";
const MAX_ITERATIONS = 8;

const functionDeclarations = [
  {
    name: "get_food_log",
    description:
      "Get food log entries for a date range. Returns items with food name, brand, calories, protein, fat, carbs, serving count, meal type.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        startDate: {
          type: Type.STRING,
          description: "Start date (YYYY-MM-DD)",
        },
        endDate: { type: Type.STRING, description: "End date (YYYY-MM-DD)" },
        mealType: {
          type: Type.STRING,
          description: "Optional filter: breakfast, lunch, dinner, or snack",
        },
      },
      required: ["startDate", "endDate"],
    },
  },
  {
    name: "get_daily_nutrition",
    description:
      "Get aggregated daily nutrition totals (calories, protein, fat, carbs) for a date range. One row per day.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        startDate: {
          type: Type.STRING,
          description: "Start date (YYYY-MM-DD)",
        },
        endDate: { type: Type.STRING, description: "End date (YYYY-MM-DD)" },
      },
      required: ["startDate", "endDate"],
    },
  },
  {
    name: "get_weight_log",
    description: "Get weight entries (in lbs) for a date range.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        startDate: {
          type: Type.STRING,
          description: "Start date (YYYY-MM-DD)",
        },
        endDate: { type: Type.STRING, description: "End date (YYYY-MM-DD)" },
      },
      required: ["startDate", "endDate"],
    },
  },
  {
    name: "get_waist_log",
    description: "Get waist measurement entries (in inches) for a date range.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        startDate: {
          type: Type.STRING,
          description: "Start date (YYYY-MM-DD)",
        },
        endDate: { type: Type.STRING, description: "End date (YYYY-MM-DD)" },
      },
      required: ["startDate", "endDate"],
    },
  },
  {
    name: "get_dose_log",
    description:
      "Get medication/compound dose entries for a date range. Returns compound name, dose value, dose unit (mg/mcg/iu/ml), and date. Optionally filter to a single compound by name.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        startDate: {
          type: Type.STRING,
          description: "Start date (YYYY-MM-DD)",
        },
        endDate: { type: Type.STRING, description: "End date (YYYY-MM-DD)" },
        compoundName: {
          type: Type.STRING,
          description: "Optional: filter by compound name (case-insensitive)",
        },
      },
      required: ["startDate", "endDate"],
    },
  },
  {
    name: "get_compounds",
    description:
      "List the compounds the user has configured, including enabled/disabled state, half-life (days), dose interval (days), and dose unit.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: "get_symptom_log",
    description:
      "Get symptom severity logs for a date range. Returns symptom name, severity (0-10), and date.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        startDate: {
          type: Type.STRING,
          description: "Start date (YYYY-MM-DD)",
        },
        endDate: { type: Type.STRING, description: "End date (YYYY-MM-DD)" },
        symptomName: {
          type: Type.STRING,
          description: "Optional: filter by symptom name",
        },
      },
      required: ["startDate", "endDate"],
    },
  },
  {
    name: "get_user_settings",
    description:
      "Get the user's profile and targets: sex, height, current weight, goal weight, BMR, daily calorie/macro targets. Use get_compounds for per-compound dose intervals.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: "get_saved_meals",
    description:
      "Get the user's saved meal templates with their food items and nutrition info.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: "search_food_items",
    description:
      "Search the shared food-item catalog by name and/or brand. Use this before create_food_item to avoid duplicating a food that already exists. Returns up to 10 matches with id, name, brand, serving, and per-serving macros.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: "Name or brand to search for",
        },
        limit: {
          type: Type.NUMBER,
          description: "Max results (default 10, max 25)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "create_food_item",
    description:
      "Create a new food item in the shared catalog with per-serving nutrition. Use when the user describes a food that does not exist yet. Returns the new foodItemId which you then pass to log_food_entry.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: {
          type: Type.STRING,
          description: 'Food name, e.g. "Chicken breast, grilled"',
        },
        brand: { type: Type.STRING, description: "Optional brand name" },
        emoji: {
          type: Type.STRING,
          description: "Optional single emoji for quick recognition",
        },
        servingSize: {
          type: Type.STRING,
          description: 'Human-readable serving, e.g. "1 cup", "4 oz"',
        },
        servingGrams: {
          type: Type.NUMBER,
          description: "Grams per serving (default 100)",
        },
        caloriesPer: { type: Type.NUMBER, description: "Calories per serving" },
        proteinPer: {
          type: Type.NUMBER,
          description: "Protein grams per serving",
        },
        fatPer: { type: Type.NUMBER, description: "Fat grams per serving" },
        carbsPer: { type: Type.NUMBER, description: "Carb grams per serving" },
      },
      required: ["name", "caloriesPer"],
    },
  },
  {
    name: "log_food_entry",
    description:
      "RARE — direct, unconfirmed write to the user's food log. Only use when the user has EXPLICITLY said they want to skip the confirmation step (e.g., 'just log it, don't ask me'). For ALL other logging requests — even when the user says 'log this' — prefer propose_food_entries so the user can review portions and macros before anything is written. Requires a foodItemId from search_food_items or create_food_item.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        foodItemId: {
          type: Type.STRING,
          description: "ID of an existing FoodItem",
        },
        date: {
          type: Type.STRING,
          description:
            'Date (YYYY-MM-DD). Use today\'s date if user says "today".',
        },
        mealType: {
          type: Type.STRING,
          description: "One of: breakfast, lunch, dinner, snack",
        },
        servingCount: {
          type: Type.NUMBER,
          description:
            "Number of servings (can be fractional, e.g. 1.5). Default 1.",
        },
      },
      required: ["foodItemId", "date", "mealType"],
    },
  },
  {
    name: "propose_food_entries",
    description:
      "DEFAULT food-logging tool. Use for ANY food logging request — text-described, photo-identified, or both. The client renders inline Confirm / Edit / Cancel buttons with a per-item serving multiplier so the user can review and adjust before anything is written to their food log. Make ONE call with all items in a single meal. Always prefer this over log_food_entry; silent writes are an anti-pattern.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        date: {
          type: Type.STRING,
          description: "Date for the entries (YYYY-MM-DD). Use today if unspecified.",
        },
        mealType: {
          type: Type.STRING,
          description: "One of: breakfast, lunch, dinner, snack. Infer from time of day if user didn't specify.",
        },
        items: {
          type: Type.ARRAY,
          description: "Each distinct food identified in the meal.",
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: 'e.g. "Grilled chicken breast"' },
              brand: { type: Type.STRING, description: "Brand name if a packaged product" },
              emoji: { type: Type.STRING, description: "Single emoji for the food" },
              portion: { type: Type.STRING, description: 'Human-readable portion: "1 medium", "3/4 cup"' },
              grams: { type: Type.NUMBER, description: "Estimated grams" },
              calories: { type: Type.NUMBER, description: "Total calories for the portion (not per 100g)" },
              protein: { type: Type.NUMBER, description: "Total protein grams for the portion" },
              fat: { type: Type.NUMBER, description: "Total fat grams for the portion" },
              carbs: { type: Type.NUMBER, description: "Total carb grams for the portion" },
              confidence: {
                type: Type.STRING,
                description: "high | medium | low — how sure are you about this item and portion",
              },
              source: {
                type: Type.STRING,
                description: "database | web | estimate — where the macros came from",
              },
              foodItemId: {
                type: Type.STRING,
                description: "Optional: id from search_food_items if you matched an existing catalog entry",
              },
            },
            required: ["name", "calories"],
          },
        },
      },
      required: ["mealType", "items"],
    },
  },
];

function dateRange(startDate, endDate) {
  const start = new Date(startDate + "T00:00:00.000Z");
  const end = new Date(endDate + "T23:59:59.999Z");
  return { $gte: start, $lte: end };
}

async function executeTool(name, args, userId, ctx = {}) {
  const t0 = Date.now();
  const tLog = log.child({ userId: String(userId), tool: name });
  tLog.debug({ args }, 'tool: exec begin');
  try {
    const result = await executeToolImpl(name, args, userId, ctx);
    const summary = Array.isArray(result)
      ? { rows: result.length }
      : typeof result === 'object' && result !== null
      ? { keys: Object.keys(result).slice(0, 8) }
      : {};
    tLog.info({ ...summary, durationMs: Date.now() - t0 }, 'tool: exec ok');
    return result;
  } catch (err) {
    tLog.error({ ...errContext(err), args, durationMs: Date.now() - t0 }, 'tool: exec failed');
    throw err;
  }
}

async function executeToolImpl(name, args, userId, ctx = {}) {
  switch (name) {
    case "get_food_log": {
      const filter = { userId, date: dateRange(args.startDate, args.endDate) };
      if (args.mealType) filter.mealType = args.mealType;
      const entries = await FoodLog.find(filter)
        .sort({ date: 1 })
        .populate("foodItemId")
        .lean();
      return entries.map((e) => ({
        date: e.date.toISOString().split("T")[0],
        mealType: e.mealType,
        servingCount: e.servingCount,
        food: e.foodItemId
          ? {
              name: e.foodItemId.name,
              brand: e.foodItemId.brand,
              servingSize: e.foodItemId.servingSize,
              caloriesPer: e.foodItemId.caloriesPer,
              proteinPer: e.foodItemId.proteinPer,
              fatPer: e.foodItemId.fatPer,
              carbsPer: e.foodItemId.carbsPer,
            }
          : null,
        totalCalories: e.foodItemId
          ? e.foodItemId.caloriesPer * e.servingCount
          : 0,
        totalProtein: e.foodItemId
          ? e.foodItemId.proteinPer * e.servingCount
          : 0,
        totalFat: e.foodItemId ? e.foodItemId.fatPer * e.servingCount : 0,
        totalCarbs: e.foodItemId ? e.foodItemId.carbsPer * e.servingCount : 0,
      }));
    }

    case "get_daily_nutrition": {
      const entries = await FoodLog.find({
        userId,
        date: dateRange(args.startDate, args.endDate),
      })
        .populate("foodItemId")
        .lean();

      const byDay = {};
      for (const e of entries) {
        const day = e.date.toISOString().split("T")[0];
        if (!byDay[day])
          byDay[day] = { date: day, calories: 0, protein: 0, fat: 0, carbs: 0 };
        if (e.foodItemId) {
          byDay[day].calories += e.foodItemId.caloriesPer * e.servingCount;
          byDay[day].protein += e.foodItemId.proteinPer * e.servingCount;
          byDay[day].fat += e.foodItemId.fatPer * e.servingCount;
          byDay[day].carbs += e.foodItemId.carbsPer * e.servingCount;
        }
      }

      return Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));
    }

    case "get_weight_log": {
      const entries = await WeightLog.find({
        userId,
        date: dateRange(args.startDate, args.endDate),
      })
        .sort({ date: 1 })
        .lean();
      return entries.map((e) => ({
        date: e.date.toISOString().split("T")[0],
        weightLbs: e.weightLbs,
      }));
    }

    case "get_waist_log": {
      const entries = await WaistLog.find({
        userId,
        date: dateRange(args.startDate, args.endDate),
      })
        .sort({ date: 1 })
        .lean();
      return entries.map((e) => ({
        date: e.date.toISOString().split("T")[0],
        waistInches: e.waistInches,
      }));
    }

    case "get_dose_log": {
      const compounds = await Compound.find({ userId }).lean();
      const compoundById = Object.fromEntries(
        compounds.map((c) => [String(c._id), c]),
      );

      const filter = { userId, date: dateRange(args.startDate, args.endDate) };
      if (args.compoundName) {
        const match = compounds.find(
          (c) => c.name.toLowerCase() === args.compoundName.toLowerCase(),
        );
        if (match) filter.compoundId = match._id;
        else return [];
      }

      const entries = await DoseLog.find(filter).sort({ date: 1 }).lean();
      return entries.map((e) => {
        const c = compoundById[String(e.compoundId)];
        return {
          date: e.date.toISOString().split("T")[0],
          compound: c?.name || "Unknown",
          value: e.value,
          unit: c?.doseUnit || "",
        };
      });
    }

    case "get_compounds": {
      const compounds = await Compound.find({ userId })
        .sort({ order: 1 })
        .lean();
      return compounds.map((c) => ({
        name: c.name,
        enabled: c.enabled,
        isSystem: c.isSystem,
        halfLifeDays: c.halfLifeDays,
        intervalDays: c.intervalDays,
        doseUnit: c.doseUnit,
      }));
    }

    case "get_symptom_log": {
      const symptoms = await Symptom.find({ userId }).lean();
      const symptomMap = Object.fromEntries(
        symptoms.map((s) => [s._id.toString(), s.name]),
      );

      const filter = { userId, date: dateRange(args.startDate, args.endDate) };
      if (args.symptomName) {
        const match = symptoms.find(
          (s) => s.name.toLowerCase() === args.symptomName.toLowerCase(),
        );
        if (match) filter.symptomId = match._id;
      }

      const entries = await SymptomLog.find(filter).sort({ date: 1 }).lean();
      return entries.map((e) => ({
        date: e.date.toISOString().split("T")[0],
        symptom: symptomMap[e.symptomId.toString()] || "Unknown",
        severity: e.severity,
      }));
    }

    case "get_user_settings": {
      const settings = await UserSettings.findOne({ userId }).lean();
      if (!settings) return { error: "No settings configured yet" };
      return {
        sex: settings.sex,
        age: settings.age,
        heightInches: settings.heightInches,
        currentWeightLbs: settings.currentWeightLbs,
        goalWeightLbs: settings.goalWeightLbs,
        bmr: settings.bmr,
        tdee: settings.tdee,
        activityLevel: settings.activityLevel,
        goalRateLbsPerWeek: settings.goalRateLbsPerWeek,
        targets: settings.targets,
      };
    }

    case "get_saved_meals": {
      const meals = await Meal.find({ userId })
        .populate("items.foodItemId")
        .lean();
      return meals.map((m) => ({
        name: m.name,
        items: m.items.map((item) => ({
          food: item.foodItemId?.name || "Unknown",
          brand: item.foodItemId?.brand || "",
          servingCount: item.servingCount,
          calories: (item.foodItemId?.caloriesPer || 0) * item.servingCount,
          protein: (item.foodItemId?.proteinPer || 0) * item.servingCount,
          fat: (item.foodItemId?.fatPer || 0) * item.servingCount,
          carbs: (item.foodItemId?.carbsPer || 0) * item.servingCount,
        })),
      }));
    }

    case "search_food_items": {
      const q = (args.query || "").trim();
      if (!q) return { error: "query required" };
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 25);
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const items = await FoodItem.find({
        userId,
        $or: [{ name: regex }, { brand: regex }],
      })
        .limit(limit)
        .lean();
      return items.map((i) => ({
        foodItemId: i._id.toString(),
        name: i.name,
        brand: i.brand,
        emoji: i.emoji,
        servingSize: i.servingSize,
        servingGrams: i.servingGrams,
        caloriesPer: i.caloriesPer,
        proteinPer: i.proteinPer,
        fatPer: i.fatPer,
        carbsPer: i.carbsPer,
      }));
    }

    case "create_food_item": {
      if (!args.name || args.caloriesPer == null) {
        return { error: "name and caloriesPer required" };
      }
      // Plan cap on user-custom foods. OpenFoodFacts barcode imports stay
      // global (userId=null) and never count. We only count items this user
      // created via this tool (userId set + isCustom=true).
      const user = await User.findById(userId).select('plan limitsOverride').lean();
      const used = await FoodItem.countDocuments({ userId, isCustom: true });
      const denial = evaluateStorageCap(user, 'customFoodItems', used);
      if (denial) {
        return {
          error: 'plan_limit_exceeded',
          reason: denial.reason,
          limitKey: denial.limitKey,
          limit: denial.limit,
          used: denial.used,
          upgradeAvailable: denial.upgradeAvailable,
          upgradePlanId: denial.upgradePlanId,
          message: denial.upgradePlanId
            ? `Your ${denial.currentPlan} plan allows ${denial.limit} custom food${denial.limit === 1 ? '' : 's'}. Upgrade to add more.`
            : `You've reached the ${denial.limit}-food limit for your plan.`,
        };
      }
      const item = await FoodItem.create({
        userId,
        isCustom: true,
        name: args.name,
        brand: args.brand || "",
        emoji: args.emoji || "",
        servingSize: args.servingSize || "",
        servingGrams:
          args.servingGrams != null ? Number(args.servingGrams) : 100,
        caloriesPer: Number(args.caloriesPer),
        proteinPer: Number(args.proteinPer || 0),
        fatPer: Number(args.fatPer || 0),
        carbsPer: Number(args.carbsPer || 0),
      });
      return {
        foodItemId: item._id.toString(),
        name: item.name,
        brand: item.brand,
        caloriesPer: item.caloriesPer,
        proteinPer: item.proteinPer,
        fatPer: item.fatPer,
        carbsPer: item.carbsPer,
      };
    }

    case "log_food_entry": {
      if (!args.foodItemId || !args.date || !args.mealType) {
        return { error: "foodItemId, date, and mealType are required" };
      }
      const validMeals = ["breakfast", "lunch", "dinner", "snack"];
      if (!validMeals.includes(args.mealType)) {
        return { error: `mealType must be one of: ${validMeals.join(", ")}` };
      }
      const food = await FoodItem.findOne({ _id: args.foodItemId, userId }).lean();
      if (!food)
        return { error: `No food item found with id ${args.foodItemId}` };

      const entry = await FoodLog.create({
        userId,
        foodItemId: args.foodItemId,
        date: new Date(args.date + "T12:00:00.000Z"),
        mealType: args.mealType,
        servingCount: Number(args.servingCount) || 1,
      });

      const servings = entry.servingCount;
      return {
        ok: true,
        entryId: entry._id.toString(),
        summary: `Logged ${servings} × ${food.name} to ${args.mealType} on ${args.date}`,
        nutrition: {
          calories: Math.round((food.caloriesPer || 0) * servings),
          protein: Math.round((food.proteinPer || 0) * servings),
          fat: Math.round((food.fatPer || 0) * servings),
          carbs: Math.round((food.carbsPer || 0) * servings),
        },
      };
    }

    case "propose_food_entries": {
      const validMeals = ["breakfast", "lunch", "dinner", "snack"];
      if (!args.mealType || !validMeals.includes(args.mealType)) {
        return { error: `mealType must be one of: ${validMeals.join(", ")}` };
      }
      if (!Array.isArray(args.items) || args.items.length === 0) {
        return { error: "items array required" };
      }
      const today = new Date().toISOString().slice(0, 10);
      const date = args.date && /^\d{4}-\d{2}-\d{2}$/.test(args.date) ? args.date : today;

      const items = args.items.map((i) => ({
        foodItemId: i.foodItemId || null,
        name: String(i.name || "").slice(0, 120),
        brand: String(i.brand || "").slice(0, 80),
        emoji: String(i.emoji || "").slice(0, 8),
        portion: String(i.portion || "").slice(0, 80),
        grams: i.grams != null ? Number(i.grams) : null,
        calories: Math.max(0, Math.round(Number(i.calories) || 0)),
        protein: Math.max(0, Math.round(Number(i.protein) || 0)),
        fat: Math.max(0, Math.round(Number(i.fat) || 0)),
        carbs: Math.max(0, Math.round(Number(i.carbs) || 0)),
        confidence: ["high", "medium", "low"].includes(i.confidence) ? i.confidence : "medium",
        source: ["database", "web", "estimate"].includes(i.source) ? i.source : "estimate",
      }));

      const proposal = await MealProposal.create({
        userId,
        threadId: ctx.threadId || null,
        date,
        mealType: args.mealType,
        items,
      });

      const totals = items.reduce(
        (acc, i) => {
          acc.calories += i.calories;
          acc.protein += i.protein;
          acc.fat += i.fat;
          acc.carbs += i.carbs;
          return acc;
        },
        { calories: 0, protein: 0, fat: 0, carbs: 0 },
      );

      return {
        ok: true,
        proposalId: proposal._id.toString(),
        date,
        mealType: args.mealType,
        itemCount: items.length,
        totals,
        status: "awaiting_confirmation",
        message:
          "Proposal shown to the user with Confirm / Edit / Cancel buttons. Do not log anything directly — wait for the user's next message.",
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

async function buildDataSnapshot(userId) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const startDate = `${weekAgo.getFullYear()}-${String(weekAgo.getMonth() + 1).padStart(2, "0")}-${String(weekAgo.getDate()).padStart(2, "0")}`;

  const [settings, nutrition, weight, waist, doses, symptoms, compounds] =
    await Promise.all([
      executeTool("get_user_settings", {}, userId),
      executeTool("get_daily_nutrition", { startDate, endDate: today }, userId),
      executeTool("get_weight_log", { startDate, endDate: today }, userId),
      executeTool("get_waist_log", { startDate, endDate: today }, userId),
      executeTool("get_dose_log", { startDate, endDate: today }, userId),
      executeTool("get_symptom_log", { startDate, endDate: today }, userId),
      executeTool("get_compounds", {}, userId),
    ]);

  const sections = [];

  if (settings && !settings.error) {
    sections.push(`PROFILE & TARGETS:
Sex: ${settings.sex}, Age: ${settings.age ?? 'unknown'}, Height: ${settings.heightInches}in, Current weight: ${settings.currentWeightLbs}lbs, Goal: ${settings.goalWeightLbs}lbs
Activity level: ${settings.activityLevel ?? 'unknown'}
BMR (resting): ${settings.bmr ?? 'unknown'} kcal/day, TDEE (daily burn): ${settings.tdee ?? 'unknown'} kcal/day
Goal rate: ${settings.goalRateLbsPerWeek ?? 'unknown'} lb/week
Daily targets: ${settings.targets.calories} cal, ${settings.targets.proteinGrams}g protein, ${settings.targets.fatGrams}g fat, ${settings.targets.carbsGrams}g carbs`);
  }

  if (Array.isArray(compounds) && compounds.length) {
    const enabled = compounds.filter((c) => c.enabled);
    if (enabled.length) {
      const rows = enabled
        .map(
          (c) =>
            `${c.name} (half-life ${c.halfLifeDays}d, interval ${c.intervalDays}d, ${c.doseUnit})`,
        )
        .join("; ");
      sections.push(`ENABLED COMPOUNDS: ${rows}`);
    }
  }

  if (Array.isArray(nutrition) && nutrition.length) {
    const rows = nutrition
      .map(
        (d) =>
          `${d.date}: ${Math.round(d.calories)} cal, ${Math.round(d.protein)}g P, ${Math.round(d.fat)}g F, ${Math.round(d.carbs)}g C`,
      )
      .join("\n");
    sections.push(`DAILY NUTRITION (last 7 days):\n${rows}`);
  }

  if (Array.isArray(weight) && weight.length) {
    const rows = weight.map((w) => `${w.date}: ${w.weightLbs} lbs`).join(", ");
    sections.push(`WEIGHT LOG (last 7 days): ${rows}`);
  }

  if (Array.isArray(waist) && waist.length) {
    const rows = waist.map((w) => `${w.date}: ${w.waistInches}in`).join(", ");
    sections.push(`WAIST LOG (last 7 days): ${rows}`);
  }

  if (Array.isArray(doses) && doses.length) {
    const rows = doses
      .map((d) => `${d.date}: ${d.compound} ${d.value}${d.unit}`)
      .join(", ");
    sections.push(`DOSE LOG (last 7 days): ${rows}`);
  }

  if (Array.isArray(symptoms) && symptoms.length) {
    const byDay = {};
    for (const s of symptoms) {
      if (!byDay[s.date]) byDay[s.date] = [];
      byDay[s.date].push(`${s.symptom}: ${s.severity}/10`);
    }
    const rows = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, items]) => `${date}: ${items.join(", ")}`)
      .join("\n");
    sections.push(`SYMPTOM LOG (last 7 days):\n${rows}`);
  }

  return sections.join("\n\n");
}

function stripTrailHtml(html) {
  return html
    .replace(
      /<details[^>]*class=["'][^"']*agent-trail[^"']*["'][^>]*>[\s\S]*?<\/details>/gi,
      " ",
    )
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Render grounding metadata as a human-readable "Sources" block appended to
// the final answer. Gemini returns chunk indices into groundingChunks; the
// simple approach is to list all unique source URLs.
function renderSources(groundingMetadata) {
  if (!groundingMetadata) return "";
  const chunks = groundingMetadata.groundingChunks || [];
  if (!chunks.length) return "";

  const seen = new Set();
  const lines = [];
  for (const c of chunks) {
    const web = c.web;
    if (!web?.uri) continue;
    const key = web.uri;
    if (seen.has(key)) continue;
    seen.add(key);
    const title = web.title || web.uri;
    lines.push(`- [${title}](${web.uri})`);
  }
  if (!lines.length) return "";
  return `\n\n---\n**Sources:**\n${lines.join("\n")}`;
}

export async function* chatStream(userId, history, opts = {}) {
  const sLog = log.child({ userId: String(userId) });
  const streamStart = Date.now();
  const toolCtx = { threadId: opts.threadId || null };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    sLog.error('agent: GEMINI_API_KEY missing');
    yield { type: "error", message: "Gemini API key not configured" };
    return;
  }

  // Plan-gate: tools (Google Search + agent function calls) are paid-tier
  // only. Free users get conversational replies grounded on the loaded
  // snapshot, no follow-up reads, no writes, no web search.
  const planUser = await User.findById(userId).select('plan limitsOverride').lean();
  const toolsEnabled =
    (planUser?.limitsOverride?.features?.aiToolsEnabled ??
      getPlanForUser(planUser).features.aiToolsEnabled) === true;
  const chatLimits = getEffectiveChatLimits(planUser);

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  yield { type: "status", text: "Loading your data..." };
  const snapshotT0 = Date.now();
  const snapshot = await buildDataSnapshot(userId);
  sLog.debug(
    { bytes: snapshot.length, durationMs: Date.now() - snapshotT0 },
    'agent: snapshot built',
  );

  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `You are a helpful health and body optimization assistant inside the Protokol Lab app.
You help the user understand their nutrition, weight, body measurements, symptoms, and medication dosing data.

PERSONA:
- Friendly, knowledgeable, concise. Like a personal health coach who has access to all their data.
- Never mention databases, MongoDB, collections, or technical internals.
- Speak in plain health/fitness language.

CURRENT DATA SNAPSHOT (already loaded — do NOT re-fetch this with tools):
${snapshot}

TOOLS — WHEN TO USE:
You already have the last 7 days of user data above. Tool usage:
- Read-only data tools (get_food_log, get_daily_nutrition, get_weight_log, get_waist_log, get_dose_log, get_symptom_log, get_user_settings, get_saved_meals, get_compounds):
  - Use when the user asks about a date range OUTSIDE the last 7 days
  - Use when the user asks for detailed food-by-food breakdown (snapshot only has daily totals)
  - Use when you need data not covered by the snapshot
- Food-logging proposal tool (propose_food_entries) — THE DEFAULT FOR ALL FOOD LOGGING:
  - Use this for ANY request to log, add, track, or record food — whether the user described the food in text ("log a chicken sandwich"), uploaded a photo, or both. The client renders an inline confirmation card with Confirm / Edit / Cancel buttons and a per-item serving multiplier so the user can review and adjust BEFORE anything is written.
  - Always prefer propose_food_entries over log_food_entry. Even when the user says "log this", they still want to confirm portions and macros — silently writing to the diary is an anti-pattern.
  - You MAY use search_food_items first to look up existing catalog entries (pass the matching foodItemId in the proposal so we don't create duplicates). You MAY use Google Search for branded products you can identify. But the final logging step is ALWAYS propose_food_entries — never log_food_entry, except in the narrow exception below.
  - After calling propose_food_entries, STOP. Briefly narrate what you identified and tell the user to review the card. Do not repeat the macro table in prose. Do not call log_food_entry afterward.
  - For "today" use today's date from the TODAY'S DATE line below. Default mealType from time of day: before 11 → breakfast, 11–15 → lunch, 15–20 → dinner, else snack.
- Direct-log tool (log_food_entry) — RARE EXCEPTION ONLY:
  - Only use when the user EXPLICITLY says they want to skip confirmation (e.g. "just log it, don't ask", "no need to confirm"). If you are uncertain, use propose_food_entries instead.
  - Requires a real foodItemId from search_food_items or create_food_item.
- Google Search (built-in):
  - Use when the user asks questions that require external knowledge — research on supplements, medications, studies, recent health news, dosing protocols, exercise science, etc.
  - Use when you need accurate nutrition facts for a food the user wants logged.
  - Use to look up macros for a branded product visible in a photo (read the label text, then search the brand + product name).
  - Use when you want to cite evidence for a recommendation.

IMAGE HANDLING:
When the user sends an image of food, your job is to identify every distinct item and calculate realistic macros for each portion. Approach:
1. Look carefully at the photo. Identify each separate food (main protein, starches, vegetables, sauces, drinks, packaged items, toppings). Don't miss small things — dressings, oils, and sauces add meaningful calories.
2. Estimate portion size using visual references: plate diameter (typically 10–11 inches / 25–28cm), utensils (standard fork ~7 inches), standard container sizes, or objects in frame. Call out your reference if useful ("roughly the size of a deck of cards").
3. For each item, pick macros using this preference order:
   a. If it's a packaged product with a visible label/brand → use googleSearch for that exact product, then cite the label values.
   b. Otherwise call search_food_items to check the shared catalog. Reuse an existing foodItemId when the match is clear.
   c. If nothing matches, use your own nutritional knowledge for the generic food. Be transparent: set confidence="low" and source="estimate".
4. Multiply per-100g (or per-serving) values by your portion estimate so the numbers you pass to propose_food_entries are TOTALS for the portion shown — not per 100g.
5. Call propose_food_entries exactly once with all items, the inferred mealType (use time of day if unclear — before 11: breakfast, 11–15: lunch, 15–20: dinner, else snack), and today's date unless the user says otherwise.
6. Mark confidence honestly: high only when you clearly read a label or the food is unambiguous AND portion is well-constrained. Medium for known foods with visual portion estimation. Low for ambiguous items or hidden ingredients.
7. In your final reply, give a short friendly summary — what you saw, the estimated total calories, and any caveats (hidden oils, dressings, etc). Then tell the user to review the card below to confirm or edit.

DO NOT call get_user_settings, get_daily_nutrition, get_weight_log, get_waist_log, get_dose_log, get_symptom_log, or get_compounds for the last 7 days — that data is already in the snapshot above.

RULES:
1. Use the snapshot data for recent-day questions. Only fetch more data when the question needs it.
2. When the user asks about a time period, use the appropriate date range. Default to last 7 days if no range specified.
3. Be helpful with analysis: trends, averages, comparisons to goals, correlations between symptoms and diet, etc.
4. Keep responses concise but informative. Use markdown tables for multi-day data.
5. For nutrition analysis, always compare against the user's targets when available.
6. Be encouraging but honest. If they're over/under targets, note it constructively.
7. The user manages their own list of compounds (peptides, medications) in settings. Use the ENABLED COMPOUNDS line in the snapshot to know which ones are active. Be knowledgeable about common classes the user might enable — GLP-1 receptor agonists, GLP-1/GIP co-agonists, amylin analogues, and other peptides — including typical half-lives, effects, and common side effects.
8. When citing external information from web search, include links inline or the system will append a Sources block automatically.

TODAY'S DATE: ${today}`;

  // Build contents from chat history. Trim to the user's plan context
  // window — older turns are dropped so the model sees only the most
  // recent N exchanges. The last message (current user turn) is appended
  // separately below; we always send it regardless of cap.
  const ctxCap = Number.isFinite(chatLimits.maxContextMessages)
    ? chatLimits.maxContextMessages
    : Infinity;
  const priorTurns = history
    .slice(0, -1)
    .filter((m) => m.role === "user" || m.role === "model" || m.role === "ai")
    .filter((m) => m.text || m.html);
  const trimmedTurns = Number.isFinite(ctxCap)
    ? priorTurns.slice(-ctxCap)
    : priorTurns;
  const contents = trimmedTurns.map((m) => ({
    role: m.role === "ai" ? "model" : m.role,
    parts: [{ text: m.text || stripTrailHtml(m.html || "") || "(empty)" }],
  }));

  const lastMsg = history[history.length - 1];
  const userMessage =
    lastMsg.text || (lastMsg.html || "").replace(/<[^>]*>/g, " ").trim();
  const lastParts = [];
  // Gemini requires at least one text part. Provide a hint when the user sent
  // only images so the model knows what to do instead of echoing the filename.
  const hasImages = Array.isArray(lastMsg.images) && lastMsg.images.length > 0;
  lastParts.push({
    text:
      userMessage ||
      (hasImages
        ? "Identify the food in this photo and calculate the macros."
        : "(empty)"),
  });
  if (hasImages) {
    for (const img of lastMsg.images) {
      const base64 =
        typeof img.data === "string"
          ? img.data
          : Buffer.isBuffer(img.data)
          ? img.data.toString("base64")
          : Buffer.from(img.data).toString("base64");
      lastParts.push({
        inlineData: {
          data: base64,
          mimeType: img.mimeType || "image/jpeg",
        },
      });
    }
    sLog.info(
      { imageCount: lastMsg.images.length, totalBytes: lastMsg.images.reduce((n, i) => n + (i.size || 0), 0) },
      'agent: multimodal turn',
    );
  }
  contents.push({ role: "user", parts: lastParts });

  const config = {
    systemInstruction,
    ...(toolsEnabled
      ? {
          tools: [{ googleSearch: {} }, { functionDeclarations }],
          toolConfig: { includeServerSideToolInvocations: true },
        }
      : {}),
  };

  yield { type: "status", text: "Thinking..." };

  let response = null;
  let iterations = 0;
  let sawWebSearch = false;
  let totalToolCalls = 0;
  let searchCalls = 0;

  // Usage totals summed across every iteration of the agentic loop. Gemini
  // bills per-call, and each call re-sends the full prompt, so summing the
  // per-response usageMetadata gives the true billable token volume.
  const usageTotals = {
    inputTokens: 0,
    outputTokens: 0,
    thoughtTokens: 0,
    toolTokens: 0,
    cachedInputTokens: 0,
    totalTokens: 0,
  };

  sLog.info(
    { model: MODEL, historyMessages: history.length, maxIterations: MAX_ITERATIONS },
    'agent: chat begin',
  );

  while (iterations < MAX_ITERATIONS) {
    const iterT0 = Date.now();
    try {
      response = await ai.models.generateContent({
        model: MODEL,
        contents,
        config,
      });
    } catch (err) {
      sLog.error(
        { ...errContext(err), iteration: iterations, model: MODEL },
        'agent: generateContent failed',
      );
      throw err;
    }
    const usage = response?.usageMetadata;
    if (usage) {
      usageTotals.inputTokens += usage.promptTokenCount || 0;
      usageTotals.outputTokens += usage.candidatesTokenCount || 0;
      usageTotals.thoughtTokens += usage.thoughtsTokenCount || 0;
      usageTotals.toolTokens += usage.toolUsePromptTokenCount || 0;
      usageTotals.cachedInputTokens += usage.cachedContentTokenCount || 0;
      usageTotals.totalTokens += usage.totalTokenCount || 0;
    }
    sLog.debug(
      {
        iteration: iterations,
        durationMs: Date.now() - iterT0,
        promptTokens: usage?.promptTokenCount,
        candidateTokens: usage?.candidatesTokenCount,
        totalTokens: usage?.totalTokenCount,
        finishReason: response?.candidates?.[0]?.finishReason,
      },
      'agent: iteration complete',
    );

    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    // Append model turn to conversation
    contents.push({ role: "model", parts });

    // Emit any text parts as intermediate thoughts
    for (const p of parts) {
      if (p.text && typeof p.text === "string" && p.text.trim()) {
        yield { type: "thought", text: p.text.trim() };
      }
    }

    // Detect server-side web search invocations for this turn (Gemini handled
    // them itself — there's no function response to send back).
    const groundingThisTurn = candidate?.groundingMetadata;
    const queriesThisTurn = groundingThisTurn?.webSearchQueries || [];
    if (queriesThisTurn.length) {
      searchCalls += queriesThisTurn.length;
      if (!sawWebSearch) {
        sawWebSearch = true;
        for (const q of queriesThisTurn) {
          yield {
            type: "tool_call",
            name: "web_search",
            summary: `Searching the web: "${q}"`,
          };
        }
      }
    }

    const functionCalls = parts.filter((p) => p.functionCall);
    if (functionCalls.length === 0) break;

    totalToolCalls += functionCalls.length;
    sLog.info(
      { iteration: iterations, toolCalls: functionCalls.map((c) => c.functionCall.name) },
      'agent: tool calls requested',
    );

    // Emit client-side tool_call events
    for (const call of functionCalls) {
      const { name, args } = call.functionCall;
      yield { type: "tool_call", name, summary: describeToolCall(name, args) };
    }

    // Execute tools
    const executed = await Promise.all(
      functionCalls.map(async (call) => {
        const { id, name, args } = call.functionCall;
        let output;
        let ok = true;
        try {
          output = await executeTool(name, args || {}, userId, toolCtx);
        } catch (e) {
          output = { error: e.message };
          ok = false;
        }
        return { id, name, args: args || {}, output, ok };
      }),
    );

    for (const r of executed) {
      if (!r.ok) {
        yield {
          type: "tool_result",
          name: r.name,
          ok: false,
          summary: "Something went wrong",
        };
        continue;
      }
      // Special handling: propose_food_entries emits an inline confirmation
      // card to the chat bubble so the user can review the agent's portion
      // estimates before anything is written to their food log.
      if (r.name === "propose_food_entries" && r.output?.proposalId) {
        yield {
          type: "tool_proposal",
          proposalId: r.output.proposalId,
          date: r.output.date,
          mealType: r.output.mealType,
          items: r.args.items || [],
          totals: r.output.totals,
        };
      }
    }

    // Send tool responses back as a user turn
    contents.push({
      role: "user",
      parts: executed.map((r) => ({
        functionResponse: {
          id: r.id,
          name: r.name,
          response: { result: r.output },
        },
      })),
    });

    iterations++;
  }

  if (iterations >= MAX_ITERATIONS) {
    sLog.warn(
      { iterations, totalToolCalls, durationMs: Date.now() - streamStart },
      'agent: hit MAX_ITERATIONS',
    );
    yield {
      type: "usage",
      model: MODEL,
      status: "max_iterations",
      iterations,
      toolCalls: totalToolCalls,
      searchCalls,
      durationMs: Date.now() - streamStart,
      ...usageTotals,
    };
    yield {
      type: "final",
      text: "I hit my complexity limit on this question. Try breaking it into smaller parts?",
    };
    return;
  }

  // Build final text from last response's text parts
  const finalCandidate = response?.candidates?.[0];
  const finalParts = finalCandidate?.content?.parts || [];
  const finalText = finalParts
    .map((p) => p.text || "")
    .join("")
    .trim();

  const sourcesBlock = renderSources(finalCandidate?.groundingMetadata);
  const finalHtml = await marked.parse((finalText || "") + sourcesBlock);
  sLog.info(
    {
      iterations,
      totalToolCalls,
      sawWebSearch,
      searchCalls,
      finalTextLength: finalText.length,
      ...usageTotals,
      durationMs: Date.now() - streamStart,
    },
    'agent: chat done',
  );
  yield {
    type: "usage",
    model: MODEL,
    status: "ok",
    iterations,
    toolCalls: totalToolCalls,
    searchCalls,
    durationMs: Date.now() - streamStart,
    ...usageTotals,
  };
  yield { type: "final", html: finalHtml };
}

function describeToolCall(name, args) {
  const range =
    args?.startDate && args?.endDate
      ? ` (${args.startDate} to ${args.endDate})`
      : "";
  switch (name) {
    case "get_food_log":
      return `Looking up food entries${range}`;
    case "get_daily_nutrition":
      return `Getting daily nutrition totals${range}`;
    case "get_weight_log":
      return `Checking weight entries${range}`;
    case "get_waist_log":
      return `Checking waist measurements${range}`;
    case "get_dose_log":
      return args?.compoundName
        ? `Looking up ${args.compoundName} dose history${range}`
        : `Looking up dose history${range}`;
    case "get_compounds":
      return "Loading compound list";
    case "get_symptom_log":
      return `Checking symptom data${range}`;
    case "get_user_settings":
      return "Loading your profile and targets";
    case "get_saved_meals":
      return "Loading your saved meals";
    case "search_food_items":
      return `Searching food catalog for "${args?.query || ""}"`;
    case "create_food_item":
      return `Creating food item: ${args?.name || "new item"}`;
    case "log_food_entry":
      return `Logging ${args?.servingCount || 1}× to ${args?.mealType || "meal"} on ${args?.date || "today"}`;
    case "propose_food_entries": {
      const n = Array.isArray(args?.items) ? args.items.length : 0;
      return `Preparing a ${args?.mealType || "meal"} summary (${n} item${n === 1 ? "" : "s"}) for you to confirm`;
    }
    default:
      return `Running ${name}`;
  }
}
