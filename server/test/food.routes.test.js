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

afterEach(() => {
  vi.unstubAllGlobals();
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
      servingGrams: 40,
      caloriesPer: 200,
      proteinPer: 4,
      fatPer: 8,
      carbsPer: 28,
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
      caloriesPer: 100,
      proteinPer: 2,
      fatPer: 4,
      carbsPer: 14,
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
      userId, name: 'Apple', caloriesPer: 50, isCustom: true,
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
      userId, name: 'Apple', caloriesPer: 50, isCustom: true,
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
      userId, name: 'Eggs', caloriesPer: 80, isCustom: true,
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
