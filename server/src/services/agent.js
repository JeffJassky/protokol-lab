import { GoogleGenAI, Type } from "@google/genai";
import { marked } from "marked";
import FoodLog from "../models/FoodLog.js";
import FoodItem from "../models/FoodItem.js";
import WeightLog from "../models/WeightLog.js";
import Metric from "../models/Metric.js";
import MetricLog from "../models/MetricLog.js";
import DoseLog from "../models/DoseLog.js";
import Compound from "../models/Compound.js";
import Symptom from "../models/Symptom.js";
import SymptomLog from "../models/SymptomLog.js";
import UserSettings from "../models/UserSettings.js";
import Meal from "../models/Meal.js";
import MealProposal from "../models/MealProposal.js";
import BloodworkProposal from "../models/BloodworkProposal.js";
import {
  BLOODWORK_PANELS,
  BLOODWORK_FIELD_INDEX,
  sanitizeBloodworkValue,
  flattenBloodworkNested,
} from "../../../shared/bloodworkPanels.js";
import User from "../models/User.js";
import { childLogger, errContext } from "../lib/logger.js";
import { parseLogDate } from "../lib/date.js";
import { evaluateStorageCap, getEffectiveChatLimits } from "../lib/planLimits.js";
import { getPlanForUser } from "../../../shared/plans.js";
import { mockChatStream, isMockAgentEnabled } from "./agent.mock.js";
import { touchRecent } from "./recentFood.js";
import {
  correlate as analysisCorrelate,
  rankCorrelations as analysisRankCorrelations,
  partialCorrelate as analysisPartialCorrelate,
  changePoints as analysisChangePoints,
  compare as analysisCompare,
  project as analysisProject,
  getSeries as analysisGetSeries,
  insights as analysisInsights,
} from "../analysis/index.js";

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
    name: "get_metric_log",
    description:
      "Get biometric measurement entries (waist, arms, body fat, custom user-defined metrics, etc.) for a date range. Pass `metricKey` to scope to one metric (e.g. 'waist', 'arm_left', 'body_fat'); omit it to return every metric the user tracks.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        startDate: {
          type: Type.STRING,
          description: "Start date (YYYY-MM-DD)",
        },
        endDate: { type: Type.STRING, description: "End date (YYYY-MM-DD)" },
        metricKey: {
          type: Type.STRING,
          description: "Optional: filter to a single metric by its key/slug",
        },
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
        servingAmount: {
          type: Type.NUMBER,
          description: "Numeric serving size (grams or millilitres). Optional.",
        },
        servingUnit: {
          type: Type.STRING,
          description: "'g' or 'ml'. Defaults to 'g' when servingAmount is set.",
        },
        calories: { type: Type.NUMBER, description: "Calories per serving" },
        protein: { type: Type.NUMBER, description: "Protein grams per serving" },
        fat: { type: Type.NUMBER, description: "Fat grams per serving" },
        carbs: { type: Type.NUMBER, description: "Carb grams per serving" },
      },
      required: ["name", "calories"],
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
    name: "correlate_series",
    description:
      "Compute the linear correlation between two of the user's series (e.g., weight, calories, dosage:<id>, symptom:<id>). Returns Pearson r in [-1, 1] and sample size. Use 'auto' for lag to find the time-shift in days that maximizes |r|.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        a: { type: Type.STRING, description: "First series id (e.g., 'weight')" },
        b: { type: Type.STRING, description: "Second series id (e.g., 'calories' or 'dosage:<compoundId>')" },
        from: { type: Type.STRING, description: "Range start (YYYY-MM-DD)" },
        to: { type: Type.STRING, description: "Range end (YYYY-MM-DD)" },
        lag: {
          type: Type.STRING,
          description: "Days to shift series B vs A. Number string ('0', '7', '-3') or 'auto' to search [-14, +14] for max |r|.",
        },
        method: {
          type: Type.STRING,
          description: "'pearson' (default, linear) or 'spearman' (rank-based, monotonic non-linear).",
        },
      },
      required: ["a", "b"],
    },
  },
  {
    name: "rank_correlations",
    description:
      "Rank every (or specified) candidate series by how strongly each correlates with a target series. Auto-selects the lag for each pair. Sample-size and relevance filters are applied — only meaningful correlations are returned.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        target: { type: Type.STRING, description: "Target series id (e.g., 'weight')" },
        from: { type: Type.STRING, description: "Range start (YYYY-MM-DD)" },
        to: { type: Type.STRING, description: "Range end (YYYY-MM-DD)" },
        candidates: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Optional. Defaults to all available series for the user.",
        },
        maxLag: { type: Type.NUMBER, description: "Max lag in days to search (default 14)" },
      },
      required: ["target"],
    },
  },
  {
    name: "partial_correlate",
    description:
      "Partial correlation between two series, removing the shared variance with one or more control series. Reveals the 'remaining' association after controlling for confounders. Example: protein vs weight controlling for calories asks whether protein adds explanatory power beyond calories.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        a: { type: Type.STRING },
        b: { type: Type.STRING },
        controls: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Series ids to control for, e.g., ['calories']",
        },
        from: { type: Type.STRING },
        to: { type: Type.STRING },
        lag: { type: Type.NUMBER, description: "Lag in days (default 0)" },
      },
      required: ["a", "b", "controls"],
    },
  },
  {
    name: "series_change_points",
    description:
      "Detect dates where the trend in a series shifted significantly (e.g., 'weight loss accelerated 3 weeks ago'). Always uses a 6-month look-back regardless of the requested window since change-points are meaningless when scoped to one side of a shift.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        series: { type: Type.STRING, description: "Series id" },
        window: { type: Type.NUMBER, description: "Days on each side of candidate split (default 14)" },
      },
      required: ["series"],
    },
  },
  {
    name: "compare_windows",
    description:
      "Compare two date windows for one or more series. Returns mean, slope, and total per series in each window plus deltas. Useful for 'before vs after I started X' questions.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        series: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "One or more series ids",
        },
        aFrom: { type: Type.STRING },
        aTo: { type: Type.STRING },
        bFrom: { type: Type.STRING },
        bTo: { type: Type.STRING },
      },
      required: ["series", "aFrom", "aTo", "bFrom", "bTo"],
    },
  },
  {
    name: "project_series",
    description:
      "Forward-project the recent linear trend of a series, optionally to a target value. Returns slope, projection points, and the date the series is projected to cross the target (if applicable).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        series: { type: Type.STRING, description: "Series id (typically 'weight')" },
        target: { type: Type.NUMBER, description: "Optional target value (e.g., goal weight)" },
      },
      required: ["series"],
    },
  },
  {
    name: "get_series_daily",
    description:
      "Get the user's daily values for any chartable series (weight, calories, dosage:<id>, symptom:<id>, etc.) over a date range. Returns one point per day where the user has data. Use this when you want to discuss specific values or render a chart inline.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        series: { type: Type.STRING, description: "Series id" },
        from: { type: Type.STRING, description: "Start date (YYYY-MM-DD)" },
        to: { type: Type.STRING, description: "End date (YYYY-MM-DD)" },
      },
      required: ["series", "from", "to"],
    },
  },
  {
    name: "get_user_bloodwork",
    description:
      "Read the user's current bloodwork values. Returns a flat map of `panelId.fieldKey -> value` for every field the user has set, plus the catalog of all known fields with reference ranges and units. Read-only; safe to call without confirmation. Use this before proposing changes so you can show the user a diff and avoid re-asking for values they've already provided.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "propose_bloodwork_update",
    description:
      "Propose new or updated lab values for the user's bloodwork. NEVER writes directly — the client renders an inline confirmation card so the user must explicitly approve before anything is saved. Use the dot-path keys exactly as returned by get_user_bloodwork (e.g. `metabolic.glucose_mg_dL`). Group every change from the same panel/result into ONE call so the user sees them together. After calling, briefly narrate what you proposed and stop — do not call again until the user responds.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        notes: {
          type: Type.STRING,
          description: 'Optional free-form note shown to the user. Use it to cite the source ("From the panel dated 2026-04-12") or call out anything unusual.',
        },
        changes: {
          type: Type.ARRAY,
          description: "One entry per lab field to update.",
          items: {
            type: Type.OBJECT,
            properties: {
              key: {
                type: Type.STRING,
                description: 'Dot-path key, e.g. "metabolic.glucose_mg_dL". Must match a known field returned by get_user_bloodwork.',
              },
              value: {
                type: Type.NUMBER,
                description: "The new numeric value. Use the unit shown in the field catalog — do not convert.",
              },
            },
            required: ["key", "value"],
          },
        },
      },
      required: ["changes"],
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

// Compute calendar date + clock info in a user's IANA timezone. Without a
// user TZ, the agent would use the server clock (UTC in prod) and could
// answer/log with the wrong day around midnight boundaries.
export function getLocalDateInfo(timeZone = 'UTC') {
  const now = new Date();
  let tz = timeZone || 'UTC';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
  } catch {
    tz = 'UTC';
  }
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const timeParts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit',
  }).formatToParts(now);
  let hour = 0, minute = 0;
  for (const p of timeParts) {
    if (p.type === 'hour') hour = p.value === '24' ? 0 : Number(p.value);
    if (p.type === 'minute') minute = Number(p.value);
  }
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'long',
  }).format(now);
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return { today: dateStr, hour, weekday, localTime: `${hh}:${mm}`, timeZone: tz };
}

export async function executeTool(name, args, userId, ctx = {}) {
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
      return entries.map((e) => {
        const ps = e.foodItemId?.perServing || {};
        const s = e.servingCount;
        return {
          date: e.date.toISOString().split("T")[0],
          mealType: e.mealType,
          servingCount: s,
          food: e.foodItemId
            ? {
                name: e.foodItemId.name,
                brand: e.foodItemId.brand,
                servingSize: e.foodItemId.servingSize,
                perServing: ps,
              }
            : null,
          totalCalories: (ps.calories || 0) * s,
          totalProtein: (ps.protein || 0) * s,
          totalFat: (ps.fat || 0) * s,
          totalCarbs: (ps.carbs || 0) * s,
        };
      });
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
        const ps = e.foodItemId?.perServing;
        if (ps) {
          byDay[day].calories += (ps.calories || 0) * e.servingCount;
          byDay[day].protein += (ps.protein || 0) * e.servingCount;
          byDay[day].fat += (ps.fat || 0) * e.servingCount;
          byDay[day].carbs += (ps.carbs || 0) * e.servingCount;
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

    case "get_metric_log": {
      // Resolve which metrics to read. The model can either pin to one
      // (`metricKey`) or omit and get everything the user tracks.
      const metricFilter = { userId };
      if (args.metricKey) metricFilter.key = args.metricKey;
      const metrics = await Metric.find(metricFilter)
        .select("_id key name dimension displayUnit")
        .lean();
      if (!metrics.length) return [];
      const byId = new Map(metrics.map((m) => [String(m._id), m]));
      const logs = await MetricLog.find({
        userId,
        metricId: { $in: metrics.map((m) => m._id) },
        date: dateRange(args.startDate, args.endDate),
      })
        .sort({ date: 1 })
        .lean();
      return logs.map((l) => {
        const m = byId.get(String(l.metricId));
        return {
          date: l.date.toISOString().split("T")[0],
          metric: m?.key,
          name: m?.name,
          // Canonical-unit value (cm for length, g for mass, etc.). The agent
          // is given the dimension so it knows how to interpret/convert.
          value: l.value,
          dimension: m?.dimension,
        };
      });
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
        items: m.items.map((item) => {
          const ps = item.foodItemId?.perServing || {};
          return {
            food: item.foodItemId?.name || "Unknown",
            brand: item.foodItemId?.brand || "",
            servingCount: item.servingCount,
            calories: (ps.calories || 0) * item.servingCount,
            protein: (ps.protein || 0) * item.servingCount,
            fat: (ps.fat || 0) * item.servingCount,
            carbs: (ps.carbs || 0) * item.servingCount,
          };
        }),
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
        servingAmount: i.servingAmount,
        servingUnit: i.servingUnit,
        perServing: i.perServing || {},
      }));
    }

    case "create_food_item": {
      if (!args.name || args.calories == null) {
        return { error: "name and calories required" };
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
      const servingAmount = args.servingAmount != null ? Number(args.servingAmount) : null;
      const item = await FoodItem.create({
        userId,
        isCustom: true,
        name: args.name,
        brand: args.brand || "",
        emoji: args.emoji || "",
        servingSize: args.servingSize || "",
        servingAmount,
        servingUnit: servingAmount != null ? (args.servingUnit || 'g') : null,
        servingKnown: servingAmount != null,
        perServing: {
          calories: Number(args.calories),
          protein: Number(args.protein || 0),
          fat: Number(args.fat || 0),
          carbs: Number(args.carbs || 0),
        },
        nutrientSource: 'agent',
        nutrientCoverage: 'macros_only',
      });
      return {
        foodItemId: item._id.toString(),
        name: item.name,
        brand: item.brand,
        perServing: item.perServing,
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
        date: parseLogDate(args.date),
        mealType: args.mealType,
        servingCount: Number(args.servingCount) || 1,
      });
      await touchRecent(userId, args.foodItemId, entry.servingCount, entry.mealType);

      const servings = entry.servingCount;
      const ps = food.perServing || {};
      return {
        ok: true,
        entryId: entry._id.toString(),
        summary: `Logged ${servings} × ${food.name} to ${args.mealType} on ${args.date}`,
        nutrition: {
          calories: Math.round((ps.calories || 0) * servings),
          protein: Math.round((ps.protein || 0) * servings),
          fat: Math.round((ps.fat || 0) * servings),
          carbs: Math.round((ps.carbs || 0) * servings),
        },
      };
    }

    case "correlate_series": {
      const lagArg = args.lag;
      const lag = lagArg === 'auto'
        ? 'auto'
        : (lagArg == null ? 0 : Number(lagArg) || 0);
      return analysisCorrelate(userId, {
        a: args.a, b: args.b,
        from: args.from, to: args.to,
        lag,
        method: args.method === 'spearman' ? 'spearman' : 'pearson',
      });
    }

    case "rank_correlations": {
      return analysisRankCorrelations(userId, {
        target: args.target,
        candidates: Array.isArray(args.candidates) ? args.candidates : undefined,
        from: args.from, to: args.to,
        maxLag: Number(args.maxLag) || 14,
      });
    }

    case "partial_correlate": {
      return analysisPartialCorrelate(userId, {
        a: args.a, b: args.b,
        controls: Array.isArray(args.controls) ? args.controls : [],
        from: args.from, to: args.to,
        lag: Number(args.lag) || 0,
      });
    }

    case "series_change_points": {
      return analysisChangePoints(userId, {
        series: args.series,
        window: Number(args.window) || 14,
      });
    }

    case "compare_windows": {
      return analysisCompare(userId, {
        series: Array.isArray(args.series) ? args.series : [args.series],
        aFrom: args.aFrom, aTo: args.aTo,
        bFrom: args.bFrom, bTo: args.bTo,
      });
    }

    case "project_series": {
      return analysisProject(userId, {
        series: args.series,
        target: args.target != null ? Number(args.target) : null,
      });
    }

    case "get_series_daily": {
      return analysisGetSeries(userId, {
        series: args.series,
        from: args.from,
        to: args.to,
      });
    }

    case "get_user_bloodwork": {
      const settings = await UserSettings.findOne({ userId }).select('bloodwork').lean();
      const flat = flattenBloodworkNested(settings?.bloodwork);
      const catalog = [];
      for (const panel of BLOODWORK_PANELS) {
        for (const f of panel.fields) {
          catalog.push({
            key: f.key,
            panel: panel.id,
            panelLabel: panel.label,
            label: f.label,
            unit: f.unit,
            refMin: f.refMin,
            refMax: f.refMax,
            default: f.default,
          });
        }
      }
      return {
        ok: true,
        userValues: flat,
        catalog,
        message: 'Read-only. To change values, call propose_bloodwork_update so the user can confirm.',
      };
    }

    case "propose_bloodwork_update": {
      if (!Array.isArray(args.changes) || args.changes.length === 0) {
        return { error: 'changes array required' };
      }
      const settings = await UserSettings.findOne({ userId }).select('bloodwork').lean();
      const existing = flattenBloodworkNested(settings?.bloodwork);
      const cleaned = [];
      const skipped = [];
      for (const c of args.changes) {
        const key = String(c?.key || '');
        const field = BLOODWORK_FIELD_INDEX.get(key);
        if (!field) {
          skipped.push({ key, reason: 'unknown field' });
          continue;
        }
        const v = sanitizeBloodworkValue(key, c?.value);
        if (v == null) {
          skipped.push({ key, reason: 'invalid value' });
          continue;
        }
        cleaned.push({
          key,
          label: field.label,
          unit: field.unit,
          value: v,
          oldValue: existing[key] != null ? Number(existing[key]) : null,
        });
      }
      if (!cleaned.length) {
        return { error: 'No valid changes after validation', skipped };
      }
      const proposal = await BloodworkProposal.create({
        userId,
        threadId: ctx.threadId || null,
        notes: typeof args.notes === 'string' ? args.notes.slice(0, 500) : '',
        changes: cleaned,
      });
      return {
        ok: true,
        proposalId: proposal._id.toString(),
        kind: 'bloodwork',
        changeCount: cleaned.length,
        skipped,
        notes: proposal.notes,
        status: 'awaiting_confirmation',
        message:
          'Bloodwork proposal shown to the user with Confirm / Cancel buttons. Do not call propose_bloodwork_update again or claim the change is saved until the user responds.',
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
      const { today } = getLocalDateInfo(ctx.timeZone);
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

async function buildDataSnapshot(userId, timeZone = 'UTC') {
  const { today } = getLocalDateInfo(timeZone);
  const [ty, tm, td] = today.split('-').map(Number);
  // 7 days ago in the user's local calendar
  const weekAgo = new Date(Date.UTC(ty, tm - 1, td));
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
  const startDate = `${weekAgo.getUTCFullYear()}-${String(weekAgo.getUTCMonth() + 1).padStart(2, "0")}-${String(weekAgo.getUTCDate()).padStart(2, "0")}`;

  const [settings, nutrition, weight, metrics, doses, symptoms, compounds] =
    await Promise.all([
      executeTool("get_user_settings", {}, userId),
      executeTool("get_daily_nutrition", { startDate, endDate: today }, userId),
      executeTool("get_weight_log", { startDate, endDate: today }, userId),
      executeTool("get_metric_log", { startDate, endDate: today }, userId),
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

  if (Array.isArray(metrics) && metrics.length) {
    // Group by metric so the snapshot reads as one section per metric the
    // user actually tracks ("WAIST: 2026-04-25: 91cm; 2026-05-01: 90cm" etc).
    const byMetric = new Map();
    for (const m of metrics) {
      if (!byMetric.has(m.metric)) byMetric.set(m.metric, { name: m.name, dimension: m.dimension, rows: [] });
      byMetric.get(m.metric).rows.push(`${m.date}: ${m.value}`);
    }
    const lines = [];
    for (const { name, dimension, rows } of byMetric.values()) {
      lines.push(`${name} (canonical ${dimension}): ${rows.join(", ")}`);
    }
    sections.push(`METRICS LOG (last 7 days, canonical units):\n${lines.join("\n")}`);
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

  // Top insights from a 90-day analysis window. Embedded in the snapshot
  // so even free-tier (tools-disabled) chats can reference the patterns,
  // and so paid-tier chats don't need to re-discover obvious findings via
  // expensive tool calls. Best-effort — analysis failures don't block the
  // rest of the snapshot from rendering.
  try {
    const result = await analysisInsights(userId, {});
    if (Array.isArray(result?.findings) && result.findings.length) {
      const lines = result.findings
        .slice(0, 3)
        .map((f) => `- ${f.title} — ${f.claim}`)
        .join("\n");
      sections.push(
        `RECENT INSIGHTS (computed from a 90-day analysis window):\n${lines}\n` +
          `Use the analysis tools (correlate_series, rank_correlations, partial_correlate, etc.) to dig deeper when the user asks why or what to do about these.`,
      );
    }
  } catch (err) {
    log.warn({ ...errContext(err), userId: String(userId) }, 'snapshot: insights failed');
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
  // E2E + mock-agent branch. Activated by AGENT_PROVIDER=mock so production
  // can never accidentally serve canned content. Same generator shape as the
  // real Gemini path — same event types, so route + client are unchanged.
  if (isMockAgentEnabled()) {
    yield* mockChatStream(userId, history, opts);
    return;
  }

  const sLog = log.child({ userId: String(userId) });
  const streamStart = Date.now();

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

  // User's IANA tz drives "today" and the local clock fields exposed to the
  // model. Without it the server clock (UTC in prod) is used and "today"
  // can be the wrong day around midnight for the user. Prefer the per-request
  // tz hint from the client (always current); fall back to stored settings.
  let timeZone = 'UTC';
  if (opts.timezone) {
    try {
      new Intl.DateTimeFormat('en-CA', { timeZone: opts.timezone }).format(new Date());
      timeZone = opts.timezone;
    } catch { /* invalid hint — fall through to stored */ }
  }
  if (timeZone === 'UTC') {
    const userSettings = await UserSettings.findOne({ userId }).select('timezone').lean();
    if (userSettings?.timezone) timeZone = userSettings.timezone;
  }
  const localInfo = getLocalDateInfo(timeZone);
  const { today } = localInfo;
  const toolCtx = { threadId: opts.threadId || null, timeZone };

  yield { type: "status", text: "Loading your data..." };
  const snapshotT0 = Date.now();
  const snapshot = await buildDataSnapshot(userId, timeZone);
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
- Read-only data tools (get_food_log, get_daily_nutrition, get_weight_log, get_metric_log, get_dose_log, get_symptom_log, get_user_settings, get_saved_meals, get_compounds):
  - Use when the user asks about a date range OUTSIDE the last 7 days
  - Use when the user asks for detailed food-by-food breakdown (snapshot only has daily totals)
  - Use when you need data not covered by the snapshot
- Food-logging proposal tool (propose_food_entries) — THE DEFAULT FOR ALL FOOD LOGGING:
  - Use this for ANY request to log, add, track, or record food — whether the user described the food in text ("log a chicken sandwich"), uploaded a photo, or both. The client renders an inline confirmation card with Confirm / Edit / Cancel buttons and a per-item serving multiplier so the user can review and adjust BEFORE anything is written.
  - Always prefer propose_food_entries over log_food_entry. Even when the user says "log this", they still want to confirm portions and macros — silently writing to the diary is an anti-pattern.
  - You MAY use search_food_items first to look up existing catalog entries (pass the matching foodItemId in the proposal so we don't create duplicates). You MAY use Google Search for branded products you can identify. But the final logging step is ALWAYS propose_food_entries — never log_food_entry, except in the narrow exception below.
  - After calling propose_food_entries, STOP. Briefly narrate what you identified and tell the user to review the card. Do not repeat the macro table in prose. Do not call log_food_entry afterward.
  - NEVER claim food has been logged, added, recorded, or saved unless you actually invoked propose_food_entries (or the rare log_food_entry exception) IN THIS TURN. The proposal card itself shows the user "Proposed", "✓ Added to your food log", or "Cancelled" — those phrases belong to the card UI, not your prose. Do NOT write "Logged to <meal>", "✓ Added to your food log", or any imitation of the card layout in your text reply. If you forgot to call the tool, tell the user honestly and call it now.
  - For "today" use today's date from the LOCAL DATE/TIME block below — that already accounts for the user's timezone. Default mealType from local hour (block below): before 11 → breakfast, 11–15 → lunch, 15–20 → dinner, else snack.
- Bloodwork tools (get_user_bloodwork, propose_bloodwork_update):
  - When the user shares lab results (text, photo, screenshot), call get_user_bloodwork first to see the current values + the catalog of supported field keys. Match the user's reported labels to catalog \`label\`s and use the corresponding \`key\` (e.g. "metabolic.glucose_mg_dL") in the proposal.
  - ALWAYS use propose_bloodwork_update — never write directly. The client renders a confirmation card with Confirm / Cancel; values are only saved after the user confirms. Group every change from the same panel/result into ONE call.
  - After proposing, STOP. Narrate briefly ("Pulled 7 values from your panel — review and confirm") and wait. Do not call propose_bloodwork_update again until the user responds.
  - Don't invent values. If the user gave you a unit you don't recognize, ask them to clarify rather than guessing a conversion.
  - Bloodwork values shape the simulation engine's subject — that's why we ask for confirmation. Mention this once if the user asks why we don't auto-save.
- Direct-log tool (log_food_entry) — RARE EXCEPTION ONLY:
  - Only use when the user EXPLICITLY says they want to skip confirmation (e.g. "just log it, don't ask", "no need to confirm"). If you are uncertain, use propose_food_entries instead.
  - Requires a real foodItemId from search_food_items or create_food_item.
- Inline charts:
  - When a chart would clarify an answer (showing a trend, comparing two series, pointing at a date), embed a small chart inline using a fenced code block with the \`chart\` language tag. The client will replace the block with a rendered chart image after your reply finishes streaming.
  - Format (must be valid JSON inside the code fence):
    \`\`\`chart
    { "series": ["weight"], "from": "2026-02-01", "to": "2026-04-30", "title": "Weight, Feb–Apr" }
    \`\`\`
  - Series ids: weight, calories, protein, fat, carbs, score, dosage:<compoundId>, symptom:<symptomId>, metric:<metricId>.
  - "from" and "to" must be YYYY-MM-DD. "title" is optional but recommended.
  - You may include up to ~3 series in one chart when they share a sensible scale, or pair a metric with its compound (e.g., weight + dosage:retaId).
  - Limit yourself to 1-2 charts per reply — they take real screen space. Skip the chart if a sentence would do.
  - You do NOT need to call get_series_daily before emitting a chart; the client fetches the data when it expands the block.
- Analysis tools (correlate_series, rank_correlations, partial_correlate, series_change_points, compare_windows, project_series, get_series_daily):
  - Use when the user asks "why", "what's causing", "is X working", "what changed", "when did X start", "at this rate when will I…", or any other question that requires comparing series, finding correlations, or detecting trend shifts.
  - rank_correlations is the cheapest first move when the user asks an open-ended "what affects my X" question — it returns a ranked list of candidates with their lag and r.
  - Prefer partial_correlate over correlate_series when there's an obvious confounder (e.g., always control for calories when asking about a macro's effect on weight).
  - series_change_points always uses a 6-month window regardless of the user's chart selection — it's for finding when trends shifted.
  - The "RECENT INSIGHTS" block in the snapshot above is already a precomputed summary. Reference it directly for the obvious patterns instead of re-running the same analyses.
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

DO NOT call get_user_settings, get_daily_nutrition, get_weight_log, get_metric_log, get_dose_log, get_symptom_log, or get_compounds for the last 7 days — that data is already in the snapshot above.

RULES:
1. Use the snapshot data for recent-day questions. Only fetch more data when the question needs it.
2. When the user asks about a time period, use the appropriate date range. Default to last 7 days if no range specified.
3. Be helpful with analysis: trends, averages, comparisons to goals, correlations between symptoms and diet, etc.
4. Keep responses concise but informative. Use markdown tables for multi-day data.
5. For nutrition analysis, always compare against the user's targets when available.
6. Be encouraging but honest. If they're over/under targets, note it constructively.
7. The user manages their own list of compounds (peptides, medications) in settings. Use the ENABLED COMPOUNDS line in the snapshot to know which ones are active. Be knowledgeable about common classes the user might enable — GLP-1 receptor agonists, GLP-1/GIP co-agonists, amylin analogues, and other peptides — including typical half-lives, effects, and common side effects.
8. When citing external information from web search, include links inline or the system will append a Sources block automatically.

LOCAL DATE/TIME (in the user's timezone — use this, NOT UTC, for any "today" / "now" reasoning):
- Today: ${localInfo.today} (${localInfo.weekday})
- Local time: ${localInfo.localTime} (${localInfo.timeZone})`;

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
      // Same inline-card flow for bloodwork. Tagged kind='bloodwork' so
      // the chat client picks the right renderer.
      if (r.name === "propose_bloodwork_update" && r.output?.proposalId) {
        yield {
          type: "tool_proposal",
          kind: "bloodwork",
          proposalId: r.output.proposalId,
          notes: r.output.notes || '',
          // Re-fetch the proposal so we send the post-validation `changes`
          // (with labels/units/oldValue) to the client, not the raw agent args.
          changes: await (async () => {
            const p = await BloodworkProposal.findById(r.output.proposalId).lean();
            return p?.changes || [];
          })(),
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
    case "get_metric_log":
      return args?.metricKey
        ? `Checking ${args.metricKey} measurements${range}`
        : `Checking biometric measurements${range}`;
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
    case "get_user_bloodwork":
      return 'Reading your bloodwork values';
    case "propose_bloodwork_update": {
      const n = Array.isArray(args?.changes) ? args.changes.length : 0;
      return `Preparing ${n} bloodwork change${n === 1 ? '' : 's'} for you to confirm`;
    }
    case "correlate_series": {
      const lag = args?.lag === 'auto' ? 'auto-lag' : `lag=${args?.lag ?? 0}d`;
      return `Computing ${args?.method === 'spearman' ? 'Spearman' : 'Pearson'} correlation: ${args?.a || '?'} ↔ ${args?.b || '?'} (${lag})`;
    }
    case "rank_correlations":
      return `Ranking what correlates with ${args?.target || 'target'}`;
    case "partial_correlate":
      return `Partial correlation: ${args?.a} ↔ ${args?.b}, controlling for ${
        Array.isArray(args?.controls) ? args.controls.join(', ') : '—'
      }`;
    case "series_change_points":
      return `Detecting trend shifts in ${args?.series || 'series'}`;
    case "compare_windows":
      return `Comparing ${args?.aFrom}–${args?.aTo} vs ${args?.bFrom}–${args?.bTo}`;
    case "project_series":
      return args?.target != null
        ? `Projecting ${args?.series} toward ${args.target}`
        : `Projecting ${args?.series} forward`;
    case "get_series_daily":
      return `Fetching ${args?.series || 'series'} (${args?.from} → ${args?.to})`;
    default:
      return `Running ${name}`;
  }
}
