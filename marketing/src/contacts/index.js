// Shared Contacts "module". Not under modules/ because it's foundational
// infrastructure — every actual module depends on it. Mounts the
// /api/contacts and /api/contact-lists routes; exposes the Contact +
// ContactList models on ctx.models for other modules to use.

import { buildContactModel } from './models/Contact.js';
import { buildContactListModel } from './models/ContactList.js';
import { buildContactsRoutes } from './routes/contacts.js';
import { buildListsRoutes } from './routes/lists.js';
import { registerClassifyPrompt, registerClassifyJob, CLASSIFY_PROMPT_KEY } from './jobs/classify.js';

// Registry that lets modules contribute tabs to the shared
// ContactDetailPage. Each tab declaration is just metadata the UI shell
// reads; the actual Vue components are loaded by the SPA from a manifest
// (Phase 1 keeps it static — Influencers/Reddit module entries are added
// alongside their UIs in later phases).
function buildTabRegistry() {
  const tabs = [];
  return {
    register(tab) {
      tabs.push(tab);
    },
    list() {
      return tabs.slice();
    },
  };
}

export function setupContacts(ctx) {
  const Contact = buildContactModel(ctx.db, ctx.config.collectionPrefix);
  const ContactList = buildContactListModel(ctx.db, ctx.config.collectionPrefix);

  ctx.models.Contact = Contact;
  ctx.models.ContactList = ContactList;

  // Defer index creation to start() — mongoose autoIndex is async and
  // text queries can race against the build. Track the promise so
  // createMarketingAdmin can await it before serving requests.
  ctx.indexInits = ctx.indexInits || [];
  ctx.indexInits.push(Contact.init(), ContactList.init());

  ctx.contactTabs = buildTabRegistry();

  // Register prompts + job handlers contributed by the shared contacts
  // subsystem. Modules contribute their own in their own setup hooks.
  registerClassifyPrompt(ctx.prompts);
  registerClassifyJob(ctx.worker.registry);

  return {
    routes: {
      '/api/contacts': buildContactsRoutes(ctx),
      '/api/contact-lists': buildListsRoutes(ctx),
    },
  };
}

export { CLASSIFY_PROMPT_KEY };
