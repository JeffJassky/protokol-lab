// /api/food coverage. P0 #4 in docs/testing.md.
//
// Search and barcode call OpenFoodFacts via global fetch. We stub fetch with
// vi.stubGlobal to keep tests offline and deterministic. The route's local-DB
// branches (user FoodItems + Meal templates + favorites + recents) hit the
// real mongoose models against mem-mongo.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import '../src/models/index.js';
import { createApp } from '../src/app.js';
import FoodItem from '../src/models/FoodItem.js';
import Meal from '../src/models/Meal.js';
import RecentFood from '../src/models/RecentFood.js';
import FavoriteFood from '../src/models/FavoriteFood.js';

const app = createApp({ serveClient: false });

// FoodItem.search uses a `$text` query — Mongo refuses without the text index
// being built. setup.js wipes collections between tests, which drops the
// implicit indexes on first run; ensuring init() before the suite makes the
// index sticky for every test in this file.
beforeAll(async () => {
  await FoodItem.init();
});

async function registerAndLogin(email = 'food@example.com') {
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({ email, password: 'food-pw-1' });
  const me = await agent.get('/api/auth/me');
  return { agent, userId: me.body.user.id };
}

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

// Build a fetch mock that routes by URL hostname so we can stub USDA and OFF
// independently in the same test. Hosts not in the map throw — surfaces
// accidental egress.
function routedFetch(handlers) {
  return vi.fn(async (input) => {
    const url = String(input?.url || input || '');
    if (url.includes('api.nal.usda.gov') && handlers.usda) return handlers.usda(url);
    if (url.includes('openfoodfacts.org') && handlers.off) return handlers.off(url);
    throw new Error(`No fetch handler for ${url}`);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.USDA_FDC_API_KEY;
});

describe('GET /api/food/search', () => {
  it('returns empty results for an empty query without hitting OFF', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { agent } = await registerAndLogin();
    const res = await agent.get('/api/food/search?q=');
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns local FoodItems and a saved Meal alongside OFF results', async () => {
    const { agent, userId } = await registerAndLogin();
    const local = await FoodItem.create({
      userId,
      name: 'Granola Bar',
      brand: 'Acme',
      servingSize: '1 bar',
      servingAmount: 40,
      servingUnit: 'g',
      servingKnown: true,
      perServing: { calories: 200, protein: 4, fat: 8, carbs: 28 },
      nutrientSource: 'manual',
      isCustom: true,
    });
    await Meal.create({
      userId,
      name: 'Granola breakfast',
      items: [{ foodItemId: local._id, servingCount: 1 }],
    });

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      hits: [{
        code: '0000000000018',
        product_name: 'Granola Bar Plus',
        brands: 'Other',
        nutriments: {
          'energy-kcal_100g': 400,
          proteins_100g: 8,
          fat_100g: 16,
          carbohydrates_100g: 56,
        },
        serving_quantity: 50,
      }],
    })));

    const res = await agent.get('/api/food/search?q=granola');
    expect(res.status).toBe(200);
    const sources = res.body.results.map((r) => r.source);
    expect(sources).toContain('meal');
    expect(sources).toContain('local');
    expect(sources).toContain('openfoodfacts');
  });

  it('logs a warning but still responds when OFF returns non-JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>error</html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    })));

    const { agent } = await registerAndLogin();
    const res = await agent.get('/api/food/search?q=test');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
  });
});

describe('GET /api/food/barcode/:code', () => {
  it('returns a local hit without calling OFF', async () => {
    const { agent, userId } = await registerAndLogin();
    await FoodItem.create({
      userId,
      offBarcode: '0000000000019',
      name: 'Cached Bar',
      servingAmount: 30,
      servingUnit: 'g',
      servingKnown: true,
      perServing: { calories: 100, protein: 2, fat: 4, carbs: 14 },
      nutrientSource: 'openfoodfacts',
      isCustom: false,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await agent.get('/api/food/barcode/0000000000019');
    expect(res.status).toBe(200);
    expect(res.body.result.source).toBe('local');
    expect(res.body.result.name).toBe('Cached Bar');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('hits OFF when the barcode is not in the local cache', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      status: 1,
      product: {
        code: '0000000000020',
        product_name: 'Live Bar',
        brands: 'Live',
        serving_quantity: 50,
        nutriments: {
          'energy-kcal_100g': 300,
          proteins_100g: 5,
          fat_100g: 10,
          carbohydrates_100g: 40,
        },
      },
    })));

    const { agent } = await registerAndLogin();
    const res = await agent.get('/api/food/barcode/0000000000020');
    expect(res.status).toBe(200);
    expect(res.body.result.source).toBe('openfoodfacts');
    expect(res.body.result.name).toBe('Live Bar');
  });

  it('returns 404 when OFF reports the product missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ status: 0 })));

    const { agent } = await registerAndLogin();
    const res = await agent.get('/api/food/barcode/0000000000099');
    expect(res.status).toBe(404);
  });

  it('returns 502 when OFF lookup throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));

    const { agent } = await registerAndLogin();
    const res = await agent.get('/api/food/barcode/0000000000077');
    expect(res.status).toBe(502);
  });
});

describe('/api/food/favorites', () => {
  it('add → list → remove flow', async () => {
    const { agent, userId } = await registerAndLogin();
    const food = await FoodItem.create({
      userId, name: 'Apple', perServing: { calories: 50 }, isCustom: true,
    });

    const add = await agent.post('/api/food/favorites').send({
      foodItemId: food._id,
      defaultServingCount: 2,
      defaultMealType: 'snack',
    });
    expect(add.status).toBe(201);
    const favoriteId = add.body.favorite._id;

    const list = await agent.get('/api/food/favorites');
    expect(list.body.favorites).toHaveLength(1);
    expect(list.body.favorites[0].defaultServingCount).toBe(2);

    const del = await agent.delete(`/api/food/favorites/${favoriteId}`);
    expect(del.status).toBe(204);

    expect(await FavoriteFood.countDocuments({ userId })).toBe(0);
  });

  it('POST /favorites is upsert-on-(userId,foodItemId) — second call replaces', async () => {
    const { agent, userId } = await registerAndLogin();
    const food = await FoodItem.create({
      userId, name: 'Apple', perServing: { calories: 50 }, isCustom: true,
    });

    await agent.post('/api/food/favorites').send({
      foodItemId: food._id,
      defaultServingCount: 1,
      defaultMealType: 'snack',
    });
    await agent.post('/api/food/favorites').send({
      foodItemId: food._id,
      defaultServingCount: 5,
      defaultMealType: 'lunch',
    });
    expect(await FavoriteFood.countDocuments({ userId })).toBe(1);
    const fav = await FavoriteFood.findOne({ userId });
    expect(fav.defaultServingCount).toBe(5);
    expect(fav.defaultMealType).toBe('lunch');
  });
});

describe('GET /api/food/recents', () => {
  it('merges RecentFood and recently-logged Meals, sorted newest first', async () => {
    const { agent, userId } = await registerAndLogin();
    const food = await FoodItem.create({
      userId, name: 'Eggs', perServing: { calories: 80 }, isCustom: true,
    });
    const meal = await Meal.create({
      userId,
      name: 'Egg breakfast',
      items: [{ foodItemId: food._id, servingCount: 2 }],
      lastLoggedAt: new Date('2026-04-26'),
    });
    await RecentFood.create({
      userId,
      foodItemId: food._id,
      lastServingCount: 2,
      lastMealType: 'breakfast',
      lastUsedAt: new Date('2026-04-27'),
    });

    const res = await agent.get('/api/food/recents');
    expect(res.status).toBe(200);
    expect(res.body.recents).toHaveLength(2);
    expect(res.body.recents[0].kind).toBe('food'); // newer ts wins
    expect(res.body.recents[1].kind).toBe('meal');
  });
});

// ---------------------------------------------------------------------------
// USDA FDC integration. Default is no API key (USDA path skipped). These
// tests opt in via process.env.USDA_FDC_API_KEY and stub api.nal.usda.gov.
// ---------------------------------------------------------------------------

const usdaSearchPayload = {
  totalHits: 1,
  foods: [{
    fdcId: 999001,
    description: 'NUTELLA HAZELNUT SPREAD',
    brandOwner: 'Ferrero',
    brandName: 'Nutella',
    dataType: 'Branded',
    gtinUpc: '009800800124',
    servingSize: 37,
    servingSizeUnit: 'g',
    householdServingFullText: '2 tbsp',
    foodNutrients: [
      { nutrientId: 1008, value: 539, unitName: 'KCAL' },
      { nutrientId: 1003, value: 6.3, unitName: 'G' },
      { nutrientId: 1004, value: 30.9, unitName: 'G' },
      { nutrientId: 1005, value: 57.5, unitName: 'G' },
      { nutrientId: 1087, value: 77, unitName: 'MG' },
      { nutrientId: 1089, value: 2.08, unitName: 'MG' },
      { nutrientId: 1093, value: 41, unitName: 'MG' },
    ],
  }],
};

describe('USDA FDC integration', () => {
  it('search prefers USDA results when present and skips OFF when sufficient', async () => {
    process.env.USDA_FDC_API_KEY = 'test-key';
    // 8 USDA results so the route's threshold is met and OFF is skipped.
    const usdaFoods = Array.from({ length: 8 }, (_, i) => ({
      ...usdaSearchPayload.foods[0],
      fdcId: 999100 + i,
      description: `USDA item ${i}`,
      gtinUpc: `99${i}`,
    }));
    const offFetch = vi.fn(async () => jsonResponse({ hits: [] }));
    vi.stubGlobal('fetch', routedFetch({
      usda: async () => jsonResponse({ totalHits: 8, foods: usdaFoods }),
      off: offFetch,
    }));

    const { agent } = await registerAndLogin('usda-search@example.com');
    const res = await agent.get('/api/food/search?q=nutella');
    expect(res.status).toBe(200);
    const sources = res.body.results.map((r) => r.source);
    expect(sources.filter((s) => s === 'usda_branded')).toHaveLength(8);
    // OFF was *fetched* in parallel for safety, but its results were dropped
    // because USDA hit the threshold.
    expect(sources).not.toContain('openfoodfacts');
  });

  it('search falls back to OFF when USDA returns thin results', async () => {
    process.env.USDA_FDC_API_KEY = 'test-key';
    vi.stubGlobal('fetch', routedFetch({
      usda: async () => jsonResponse({ totalHits: 1, foods: [usdaSearchPayload.foods[0]] }),
      off: async () => jsonResponse({
        hits: [{
          code: '0000000000050',
          product_name: 'OFF Granola',
          brands: 'Other',
          serving_quantity: 30,
          serving_quantity_unit: 'g',
          nutriments: {
            'energy-kcal_100g': 400, proteins_100g: 8, fat_100g: 16, carbohydrates_100g: 56,
          },
        }],
      }),
    }));

    const { agent } = await registerAndLogin('usda-thin@example.com');
    const res = await agent.get('/api/food/search?q=granola');
    expect(res.status).toBe(200);
    const sources = res.body.results.map((r) => r.source);
    expect(sources).toContain('usda_branded');
    expect(sources).toContain('openfoodfacts');
  });

  it('barcode lookup tries USDA before OFF', async () => {
    process.env.USDA_FDC_API_KEY = 'test-key';
    const offCall = vi.fn(async () => jsonResponse({ status: 0 }));
    vi.stubGlobal('fetch', routedFetch({
      usda: async () => jsonResponse({
        totalHits: 1,
        foods: [{
          ...usdaSearchPayload.foods[0],
          gtinUpc: '0000000000020', // exact match
        }],
      }),
      off: offCall,
    }));

    const { agent } = await registerAndLogin('usda-barcode@example.com');
    const res = await agent.get('/api/food/barcode/0000000000020');
    expect(res.status).toBe(200);
    expect(res.body.result.source).toBe('usda_branded');
    expect(res.body.result.usdaFdcId).toBe('999001');
    expect(offCall).not.toHaveBeenCalled();
  });

  it('barcode falls back to OFF when USDA has no match', async () => {
    process.env.USDA_FDC_API_KEY = 'test-key';
    vi.stubGlobal('fetch', routedFetch({
      usda: async () => jsonResponse({ totalHits: 0, foods: [] }),
      off: async () => jsonResponse({
        status: 1,
        product: {
          code: '0000000000022',
          product_name: 'OFF Bar',
          brands: 'Brand',
          serving_quantity: 30,
          serving_quantity_unit: 'g',
          nutriments: { 'energy-kcal_100g': 200, proteins_100g: 4 },
        },
      }),
    }));

    const { agent } = await registerAndLogin('usda-fallback@example.com');
    const res = await agent.get('/api/food/barcode/0000000000022');
    expect(res.status).toBe(200);
    expect(res.body.result.source).toBe('openfoodfacts');
  });

  it('USDA is silently skipped when API key missing', async () => {
    // No USDA_FDC_API_KEY in env. The route still works via OFF only.
    vi.stubGlobal('fetch', routedFetch({
      off: async () => jsonResponse({
        hits: [{
          code: '0000000000060',
          product_name: 'Anything Bar',
          brands: 'B',
          serving_quantity: 50,
          serving_quantity_unit: 'g',
          nutriments: { 'energy-kcal_100g': 300, proteins_100g: 5 },
        }],
      }),
    }));

    const { agent } = await registerAndLogin('usda-nokey@example.com');
    const res = await agent.get('/api/food/search?q=anything');
    expect(res.status).toBe(200);
    const sources = res.body.results.map((r) => r.source);
    expect(sources).toContain('openfoodfacts');
    expect(sources).not.toContain('usda_branded');
  });

  it('foodlog upsert dedups by usdaFdcId across requests', async () => {
    process.env.USDA_FDC_API_KEY = 'test-key';
    const { agent, userId } = await registerAndLogin('usda-upsert@example.com');

    const body = {
      usdaFdcId: '999001',
      offBarcode: '009800800124',
      name: 'NUTELLA',
      brand: 'Nutella',
      servingSize: '2 tbsp (37 g)',
      servingAmount: 37,
      servingUnit: 'g',
      servingKnown: true,
      perServing: { calories: 200, protein: 2, fat: 11, carbs: 21 },
      nutrientSource: 'usda_branded',
      nutrientCoverage: 'label_only',
      date: '2026-04-28',
      mealType: 'snack',
      servingCount: 1,
    };
    const a = await agent.post('/api/foodlog').send(body);
    expect(a.status).toBe(201);
    const b = await agent.post('/api/foodlog').send(body);
    expect(b.status).toBe(201);

    const items = await FoodItem.find({ userId, usdaFdcId: '999001' });
    expect(items).toHaveLength(1);
  });
});
