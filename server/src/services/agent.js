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
import { childLogger, errContext } from "../lib/logger.js";

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
      "Add a food entry to the user's food log for a specific date and meal. Requires a foodItemId from search_food_items or create_food_item. If the user described a new food that is not in the catalog, first call create_food_item, then call this with the returned id.",
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
];

function dateRange(startDate, endDate) {
  const start = new Date(startDate + "T00:00:00.000Z");
  const end = new Date(endDate + "T23:59:59.999Z");
  return { $gte: start, $lte: end };
}

async function executeTool(name, args, userId) {
  const t0 = Date.now();
  const tLog = log.child({ userId: String(userId), tool: name });
  tLog.debug({ args }, 'tool: exec begin');
  try {
    const result = await executeToolImpl(name, args, userId);
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

async function executeToolImpl(name, args, userId) {
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
        heightInches: settings.heightInches,
        currentWeightLbs: settings.currentWeightLbs,
        goalWeightLbs: settings.goalWeightLbs,
        bmr: settings.bmr,
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
      const item = await FoodItem.create({
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
      const food = await FoodItem.findById(args.foodItemId).lean();
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
Sex: ${settings.sex}, Height: ${settings.heightInches}in, Current weight: ${settings.currentWeightLbs}lbs, Goal: ${settings.goalWeightLbs}lbs
BMR: ${settings.bmr}
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

export async function* chatStream(userId, history) {
  const sLog = log.child({ userId: String(userId) });
  const streamStart = Date.now();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    sLog.error('agent: GEMINI_API_KEY missing');
    yield { type: "error", message: "Gemini API key not configured" };
    return;
  }

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
- Write tools (search_food_items, create_food_item, log_food_entry):
  - Use when the user asks you to LOG or ADD a food to their diary.
  - Flow: 1) call search_food_items first to see if the food already exists. 2) If a close match exists, reuse its foodItemId. 3) Otherwise call create_food_item with best-effort nutrition (use Google Search to find accurate macros if the user didn't provide them). 4) Call log_food_entry with the foodItemId to put it on their log.
  - If the user provides explicit macros, use those as-is. If not, estimate from known nutrition data and be transparent about the estimate.
  - For "today" use today's date from the TODAY'S DATE line below.
  - Confirm what you logged in your final reply with a brief summary.
- Google Search (built-in):
  - Use when the user asks questions that require external knowledge — research on supplements, medications, studies, recent health news, dosing protocols, exercise science, etc.
  - Use when you need accurate nutrition facts for a food the user wants logged.
  - Use when you want to cite evidence for a recommendation.

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

  // Build contents from chat history
  const contents = history
    .slice(0, -1)
    .filter((m) => m.role === "user" || m.role === "model" || m.role === "ai")
    .filter((m) => m.text || m.html)
    .map((m) => ({
      role: m.role === "ai" ? "model" : m.role,
      parts: [{ text: m.text || stripTrailHtml(m.html || "") || "(empty)" }],
    }));

  const lastMsg = history[history.length - 1];
  const userMessage =
    lastMsg.text || (lastMsg.html || "").replace(/<[^>]*>/g, " ").trim();
  contents.push({ role: "user", parts: [{ text: userMessage }] });

  const config = {
    systemInstruction,
    tools: [{ googleSearch: {} }, { functionDeclarations }],
    toolConfig: {
      includeServerSideToolInvocations: true,
    },
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
          output = await executeTool(name, args || {}, userId);
        } catch (e) {
          output = { error: e.message };
          ok = false;
        }
        return { id, name, output, ok };
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
    default:
      return `Running ${name}`;
  }
}
