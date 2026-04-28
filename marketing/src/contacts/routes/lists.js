import express from 'express';
import mongoose from 'mongoose';

export function buildListsRoutes(ctx) {
  const router = express.Router();
  const { ContactList, Contact } = ctx.models;

  router.get('/', async (req, res, next) => {
    try {
      const lists = await ContactList.find().sort({ updatedAt: -1 }).lean();
      res.json({ lists });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const list = await ContactList.create(sanitize(req.body));
      res.status(201).json(list);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const list = await ContactList.findById(req.params.id).lean();
      if (!list) return res.status(404).json({ error: 'not_found' });
      res.json(list);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const list = await ContactList.findByIdAndUpdate(req.params.id, sanitize(req.body), {
        new: true,
        runValidators: true,
      });
      if (!list) return res.status(404).json({ error: 'not_found' });
      res.json(list);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const list = await ContactList.findByIdAndDelete(req.params.id);
      if (!list) return res.status(404).json({ error: 'not_found' });
      // Remove the list reference from any contact still pointing at it
      await Contact.updateMany({ listIds: list._id }, { $pull: { listIds: list._id } });
      res.json({ deleted: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/contacts', async (req, res, next) => {
    try {
      const listId = req.params.id;
      const list = await ContactList.findById(listId);
      if (!list) return res.status(404).json({ error: 'not_found' });

      // Accept either an explicit set of contactIds or a filter spec
      // (mirrors the GET /api/contacts query format) to bulk-add.
      const { contactIds } = req.body || {};
      if (!Array.isArray(contactIds) || contactIds.length === 0) {
        return res.status(400).json({ error: 'contactIds_required' });
      }
      const objectIds = contactIds.map((id) => new mongoose.Types.ObjectId(id));
      await Contact.updateMany(
        { _id: { $in: objectIds } },
        { $addToSet: { listIds: list._id } }
      );
      list.contactCount = await Contact.countDocuments({ listIds: list._id });
      await list.save();
      res.json({ added: objectIds.length, contactCount: list.contactCount });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id/contacts/:contactId', async (req, res, next) => {
    try {
      const list = await ContactList.findById(req.params.id);
      if (!list) return res.status(404).json({ error: 'not_found' });
      await Contact.updateOne(
        { _id: req.params.contactId },
        { $pull: { listIds: list._id } }
      );
      list.contactCount = await Contact.countDocuments({ listIds: list._id });
      await list.save();
      res.json({ removed: true, contactCount: list.contactCount });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function sanitize(body) {
  if (!body || typeof body !== 'object') return {};
  const { _id, createdAt, updatedAt, contactCount, ...rest } = body;
  return rest;
}
