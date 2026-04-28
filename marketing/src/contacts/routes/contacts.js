import express from 'express';

// CRUD + list filters + bulk import + classify trigger + voice shortcut
// + find-or-create-by-presence (used by cross-module author-linking).
//
// Filtering rules (all combinable):
//   q                  text search across name/niche/bio/tags
//   relationship       comma list: target,self,team,unknown
//   classification     comma list
//   roles              comma list (any-of)
//   tags               comma list (any-of)
//   status             comma list
//   platform           single platform — matches contacts w/ a presence on it
//   hasChannel         single channel type — matches contacts w/ that channel
//   audienceMin        integer: presence.audienceSize >= N (any presence)
//   audienceMax        integer: presence.audienceSize <= N (any presence)
//   excludeConflicts   '1' to filter out contacts w/ any conflicts
//   listId             scope to a list's members
//   limit, offset      pagination (defaults: 50, 0)
//   sort               'name'|'-name'|'updatedAt'|'-updatedAt'|'-lastResearchedAt'

export function buildContactsRoutes(ctx) {
  const router = express.Router();
  const { Contact } = ctx.models;

  router.get('/', async (req, res, next) => {
    try {
      const filter = buildFilter(req.query);
      const limit = Math.min(Number(req.query.limit) || 50, 500);
      const offset = Number(req.query.offset) || 0;
      const sort = parseSort(req.query.sort) || { updatedAt: -1 };

      const [contacts, total] = await Promise.all([
        Contact.find(filter).sort(sort).skip(offset).limit(limit).lean(),
        Contact.countDocuments(filter),
      ]);

      res.json({ contacts, total, limit, offset });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const contact = await Contact.create(sanitize(req.body));
      res.status(201).json(contact);
    } catch (err) {
      next(err);
    }
  });

  router.get('/voices', async (req, res, next) => {
    try {
      const voices = await Contact.find({
        relationship: { $in: ['self', 'team'] },
        'voiceProfile.active': true,
      })
        .sort({ name: 1 })
        .lean();
      res.json({ voices });
    } catch (err) {
      next(err);
    }
  });

  router.post('/find-or-create-by-presence', async (req, res, next) => {
    try {
      const { platform, handle, defaults = {} } = req.body || {};
      if (!platform || !handle) {
        return res.status(400).json({ error: 'platform_and_handle_required' });
      }
      const normalized = String(handle).toLowerCase().replace(/^[@]/, '').replace(/^u\//, '');
      let contact = await Contact.findOne({
        presences: { $elemMatch: { platform, handle: normalized } },
      });
      let created = false;
      if (!contact) {
        contact = await Contact.create({
          ...defaults,
          name: defaults.name || normalized,
          relationship: defaults.relationship || 'unknown',
          presences: [
            {
              platform,
              handle: normalized,
              url: defaults.url,
              isPrimary: true,
            },
          ],
          source: defaults.source || { type: 'reddit_engagement_link', importedAt: new Date() },
        });
        created = true;
      }
      res.json({ contact, created });
    } catch (err) {
      next(err);
    }
  });

  router.post('/import', async (req, res, next) => {
    try {
      // Phase 1: just accepts an array of pre-shaped Contact objects.
      // Phase 9 adds CSV/markdown parsing.
      const { contacts } = req.body || {};
      if (!Array.isArray(contacts)) {
        return res.status(400).json({ error: 'expected_contacts_array' });
      }
      const created = await Contact.insertMany(contacts.map(sanitize), { ordered: false });
      res.json({ inserted: created.length });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const contact = await Contact.findById(req.params.id).lean();
      if (!contact) return res.status(404).json({ error: 'not_found' });
      res.json(contact);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const contact = await Contact.findByIdAndUpdate(
        req.params.id,
        sanitize(req.body),
        { new: true, runValidators: true }
      );
      if (!contact) return res.status(404).json({ error: 'not_found' });
      res.json(contact);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const result = await Contact.findByIdAndDelete(req.params.id);
      if (!result) return res.status(404).json({ error: 'not_found' });
      res.json({ deleted: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/classify', async (req, res, next) => {
    try {
      const exists = await Contact.exists({ _id: req.params.id });
      if (!exists) return res.status(404).json({ error: 'not_found' });
      const job = await ctx.worker.enqueue({
        type: 'contacts.classify',
        contactId: req.params.id,
      });
      res.status(202).json({ enqueued: true, jobId: String(job._id) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/jobs', async (req, res, next) => {
    try {
      const jobs = await ctx.models.Job.find({ contactId: req.params.id })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
      res.json({ jobs });
    } catch (err) { next(err); }
  });

  return router;
}

function buildFilter(query) {
  const filter = {};
  if (query.q) {
    filter.$text = { $search: String(query.q) };
  }
  if (query.relationship) {
    filter.relationship = { $in: split(query.relationship) };
  }
  if (query.classification) {
    filter.classification = { $in: split(query.classification) };
  }
  if (query.roles) {
    filter.roles = { $in: split(query.roles) };
  }
  if (query.tags) {
    filter.tags = { $in: split(query.tags) };
  }
  if (query.status) {
    filter.status = { $in: split(query.status) };
  }
  if (query.platform) {
    filter['presences.platform'] = String(query.platform);
  }
  if (query.hasChannel) {
    filter['contactChannels.type'] = String(query.hasChannel);
  }
  const audienceMin = Number(query.audienceMin);
  const audienceMax = Number(query.audienceMax);
  if (Number.isFinite(audienceMin) || Number.isFinite(audienceMax)) {
    const range = {};
    if (Number.isFinite(audienceMin)) range.$gte = audienceMin;
    if (Number.isFinite(audienceMax)) range.$lte = audienceMax;
    filter['presences.audienceSize'] = range;
  }
  if (query.excludeConflicts === '1') {
    filter.$or = [{ conflicts: { $exists: false } }, { conflicts: { $size: 0 } }];
  }
  if (query.listId) {
    filter.listIds = query.listId;
  }
  return filter;
}

function split(value) {
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseSort(sortStr) {
  if (!sortStr) return null;
  const allow = new Set(['name', 'updatedAt', 'createdAt', 'lastResearchedAt']);
  const desc = sortStr.startsWith('-');
  const field = desc ? sortStr.slice(1) : sortStr;
  if (!allow.has(field)) return null;
  return { [field]: desc ? -1 : 1 };
}

// Strip server-managed fields from input — clients should not be able to
// set _id, createdAt, updatedAt directly.
function sanitize(body) {
  if (!body || typeof body !== 'object') return {};
  const { _id, createdAt, updatedAt, ...rest } = body;
  return rest;
}
