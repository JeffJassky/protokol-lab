# @jeffjassky/marketing-admin — Feature Plan

A mountable Vue+Express **suite of AI marketing tools** that drops into any host app at `/admin/marketing`. Each tool is a self-contained module sharing core infrastructure (Mongo connection, worker, agent runner, tool registry, auth, usage tracking, UI shell, **a shared Contact collection**, and **editable prompts**). BullMQ-style mount pattern.

Initial modules:
1. **Influencer CRM + Outreach** — manage contacts (with rich classification), AI-research them, compose personalized outreach drafts.
2. **Reddit Engagement Assistant** — monitor configured subreddits for high-value threads, AI-draft genuine, valuable replies for manual review/post.

Architected so additional modules (X engagement, blog comment monitoring, podcast guesting, newsletter intel, etc.) can be added without touching shared code.

### Shared Contact model — central principle

Modules **do not** maintain parallel "person" collections. Anyone in the system — an influencer we want to reach, a Reddit user we keep replying to, our own founder voice we post as — is a single `Contact` record. The `relationship` field distinguishes them (`'target'`, `'self'`, `'team'`, `'unknown'`). Voice configuration (used to draft Reddit replies, future X/IG replies, even outreach in our voice) is an optional `voiceProfile` sub-doc on the same Contact record — populated only when relationship is `self`/`team`.

This enables organic cross-module flow:
- A Reddit user we engage with often → linked to an existing Contact (or creates a new one) → CRM can run full enrichment on them
- Our `relationship:'self'` Contact has a Reddit presence → that presence's username feeds the engagement module's voice config
- Modules contribute additional fields/sub-docs to Contact when useful, namespaced under `contact.modules.<name>` to avoid collisions

### Editable prompts — central principle

**Every prompt the suite uses against an LLM is admin-editable through the UI**, never hard-coded into code paths. Package ships sensible defaults as `.md` files, but at runtime prompts are read from a `marketing_prompts` collection. Editing a prompt creates a new version (versioned, revertible to default). This applies to: the classifier, research/enrichment system prompt, outreach draft system prompt, Reddit triage prompt, Reddit reply draft prompt, and every prompt added by future modules. List/persona context blocks stored on their own records (e.g. `ContactList.contextPrompt`, `Contact.voiceProfile.voiceDescription`) are similarly editable.

---

## 1. Package

- Name: `@jeffjassky/marketing-admin`
- Distribution: `file:./marketing` link in host `package.json` initially. Private npm publish once cross-app validated.
- Single export: `createMarketingAdmin(config) → { router, start, stop }`

---

## 2. Mount API

```js
import { createMarketingAdmin } from '@jeffjassky/marketing-admin';
import { requireAdmin } from './middleware/auth.js';

const marketing = createMarketingAdmin({
  mongoUri: process.env.MONGO_URI,
  collectionPrefix: 'marketing_',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  perplexityApiKey: process.env.PERPLEXITY_API_KEY,
  reddit: { userAgent }, // public-JSON mode by default (no creds needed); add clientId/clientSecret/username/password to upgrade to OAuth
  youtubeApiKey: process.env.YOUTUBE_API_KEY,
  basePath: '/admin/marketing',
  requireAuth: requireAdmin,
  budget: { defaultPerJobUsd: 0.50, monthlyCapUsd: 50 },
  worker: { concurrency: 2, pollIntervalMs: 2000, enabled: true },
  models: { research: 'claude-sonnet-4-6', draft: 'claude-sonnet-4-6', triage: 'claude-haiku-4-5-20251001', classify: 'claude-haiku-4-5-20251001' },
  modules: {
    influencers: { enabled: true },
    redditEngagement: { enabled: true, scanIntervalMinutes: 30 },
  },
  extraTools: [],
  logger: console,
});

app.use('/admin/marketing', marketing.router);
await marketing.start();
```

Host integration surface = config object + auth middleware. Package owns Mongo, worker, UI, agents, prompts, all module logic.

---

## 3. Suite architecture

### Module pattern

Every module exports:

```js
// src/modules/<name>/index.js
export default {
  name: 'influencers',
  navItems: [{ label, path, icon }],
  models,                              // mongoose models bound to suite connection
  registerRoutes(router, ctx),         // mounts /api/<module>/* endpoints
  registerJobHandlers(worker, ctx),    // worker dispatches by job.type
  registerTools(toolRegistry, ctx),    // contributes tools usable by other modules
  registerPrompts(promptRegistry, ctx),// declares default prompt definitions (key, defaults, variables)
  uiManifest: { entry: 'modules/influencers/main.js', contactTabs: [...] },
  startup(ctx),                        // optional: idempotent bootstrap (indexes, schedules, prompt seeding)
};
```

`ctx` provides shared services: `db`, `agent`, `toolRegistry`, `promptRegistry`, `worker`, `usage`, `config`, `logger`.

The package's top-level `createMarketingAdmin` wires enabled modules into shared infrastructure. Adding a 3rd module = drop a folder under `src/modules/`, register it in `modules/index.js`. No shared code changes.

### Source layout

```
/marketing/
  package.json
  src/
    index.js                           # createMarketingAdmin
    config.js
    shared/
      db/
        connection.js                  # mongoose.createConnection
        baseModel.js                   # collectionPrefix helper
      worker/
        index.js                       # Mongo-backed poller, dispatches by job.type
        registry.js                    # job handler registry
      scheduler/
        index.js                       # marketing_scheduled_tasks tick
      agent/
        runner.js                      # Claude Agent SDK orchestrator + budget + prompt resolution
        meter.js                       # token/cost accounting
        templating.js                  # {{var.path}} substitution
      tools/
        registry.js
        builtins/
          webSearch.js                 # Perplexity sonar-pro
          fetchUrl.js                  # undici + cheerio + turndown
          redditSearch.js
          redditUserHistory.js
          redditSubredditFeed.js       # new posts in a sub
          redditCommentTree.js         # full thread for a post
          youtubeChannelInfo.js
          youtubeRecentVideos.js
          youtubeTranscript.js
          rssFeed.js
          scrapeContactPage.js
          twitterProfile.js            # via nitter or scraping (no API)
          instagramProfile.js          # scraping fallback
          saveFinding.js
      prompts/
        registry.js                    # declarative prompt registration + lookup
        models.js                      # marketing_prompts collection
        seeder.js                      # seeds defaults from .md files on startup
      auth/
        wrapAuth.js
      usage/
        models.js                      # marketing_usage_logs
        service.js
      ui/
        shell/                         # SPA shell + nav, host of all module UIs
          App.vue
          AppNav.vue
          UsageBadge.vue
        components/                    # cross-module: tables, chips, status pills, prompt-editor
          PromptEditor.vue
        pages/                         # shared pages
          PromptsPage.vue              # list/edit all registered prompts
      contacts/                        # SHARED — owns the Contact model + base CRUD/UI
        models/
          Contact.js                   # the unified person record
          ContactList.js
        routes/
          contacts.js                  # CRUD, search, filter, classify
          lists.js                     # list CRUD + membership
        agent/
          prompts/
            classify.md                # default; overridden by marketing_prompts record if edited
        jobs/
          classifyContact.js
        ui/
          pages/
            ContactsPage.vue
            ContactDetailPage.vue      # tabs: Overview / Voice / Research / Drafts / Engagement / History — modules contribute tabs
            ListsPage.vue
            ListDetailPage.vue
    modules/
      index.js                         # imports + assembles enabled modules
      influencers/                     # outreach module — uses shared Contact
        index.js
        models/
          ResearchJob.js
          OutreachDraft.js
        routes/
          research.js
          drafts.js
        agent/
          prompts/
            enrich.md                  # default
            draft.md                   # default
        jobs/
          researchContact.js
          composeDraft.js
        ui/
          main.js
          tabs/                        # contributes tabs to shared ContactDetailPage
            ResearchTab.vue
            DraftsTab.vue
          pages/
            OutreachQueuePage.vue
      redditEngagement/                # reddit engagement module
        index.js
        models/
          MonitoredSubreddit.js
          EngagementOpportunity.js
          EngagementRun.js
        routes/
          subreddits.js
          opportunities.js
          runs.js
        agent/
          prompts/
            triage.md                  # default
            draftReply.md              # default
        jobs/
          scanSubreddit.js
          triageOpportunity.js
          draftReply.js
        ui/
          main.js
          tabs/                        # contributes to shared ContactDetailPage
            EngagementTab.vue          # shows opportunities authored by this contact
            VoiceTab.vue               # only renders when relationship in [self,team]
          pages/
            FeedPage.vue
            OpportunityDetailPage.vue
            SubredditsPage.vue
    server/
      router.js                        # express.Router(), wires shared + module routes + UI
      sse.js                           # generic /sse/:channel
      ui-static.js                     # serves ui-dist
    ui-dist/                           # built SPA, shipped in pkg
  scripts/
    build-ui.js
  test/
  README.md
  CHANGELOG.md
```

---

## 4. Mongo strategy

- Shared cluster + DB w/ host app
- All collections prefixed `marketing_` (configurable via `collectionPrefix`)
- Package's own `mongoose.createConnection(mongoUri)` — host's default mongoose untouched
- Models bound to the suite-local connection
- Idempotent index setup runs on `marketing.start()`, per-module

---

## 5. Shared — Contact model

The Contact collection is **shared infrastructure**, not a module. Every module reads/writes it. Voice configuration for our own accounts lives on Contacts where `relationship` is `self`/`team`. Engagement opportunities link to Contacts when the author matches a known presence.

### 5.1 `marketing_contacts`

```
{
  _id,
  name,                                  // "Dave Knapp" or "Jeff Jassky"
  displayHandle,                         // "@onthepen" or null

  // Identity & relationship
  relationship,                          // 'target'|'self'|'team'|'unknown'
                                         //   target  = someone we want to engage / reach (default)
                                         //   self    = us — used as a draft voice in engagement modules
                                         //   team    = teammate / collaborator we draft as
                                         //   unknown = stub created from raw signal, not yet classified
  classification,                        // 'influencer'|'creator'|'journalist'|'company'|'partner'|'prospect'|'employee'|'other'
  roles,                                 // multi: ['podcaster','substack-writer','youtuber','blogger','redditor','instagrammer','tiktoker','x-poster','journalist','contributing-writer','newsletter-author','clinician','researcher','founder']
  primaryRole,
  bio,
  niche,
  tags,

  // Platform presences — used by ALL modules
  presences: [{
    platform,                            // 'podcast'|'substack'|'youtube'|'x'|'instagram'|'tiktok'|'reddit'|'blog'|'website'|'linkedin'|'apple-podcasts'|'spotify'|'rss'
    handle,                              // normalized lowercase for cross-module lookup
    url,
    role,                                // 'host'|'writer'|'author'|'commenter'|'owner'
    audienceSize, audienceSizeRaw, audienceConfidence,
    isPrimary,
    metadata,
    notes
  }],

  // Reach mechanisms (relationship='target')
  contactChannels: [{
    type,                                // 'email'|'reddit_dm'|'x_dm'|'instagram_dm'|'substack_message'|'youtube_business'|'contact_form'|'linkedin_inmail'
    value, sourceUrl, confidence, isPreferred, notes
  }],

  // Voice (relationship='self'|'team') — drives drafting voice in engagement modules
  voiceProfile: {
    active,                              // show in voice pickers
    voiceDescription,                    // long: tone, expertise, what we never claim
    expertiseTags,
    doNotMention,
    selfPromoPolicy,                     // 'never'|'when-asked'|'soft-link-when-relevant'
    signatureSnippet,
    redditPresenceId,                    // index into presences[] — which one is this voice's reddit acct
    xPresenceId, instagramPresenceId,
    notes
  },

  // Outreach signals (relationship='target')
  conflicts,
  doNotContact, doNotContactReason,
  status,                                // 'new'|'researching'|'enriched'|'drafted'|'sent'|'replied'|'declined'|'do_not_contact'
  enrichmentSummary,
  recentContent: [{
    title, url, publishedAt, platform, summary, distinctivePoint
  }],
  personalizedHooks: [{
    text, sourceContentUrl, generatedAt, model, jobId
  }],

  // Module-namespaced state — modules attach own state without colliding
  modules: {
    // influencers: { lastDraftId, totalDraftsSent, replyRate, ... }
    // redditEngagement: { lastSeenInOpportunityAt, totalRepliesToTheirThreads, ... }
  },

  source: {
    type,                                // 'manual'|'people_md_import'|'reddit_engagement_link'|'csv_import'|'research_paste'|'self_setup'
    note,
    linkedFromOpportunityId,
    importedAt
  },

  listIds,
  customFields,                          // host-app extensibility

  lastResearchedAt,
  createdAt, updatedAt
}
```

### 5.2 Indexes

- `{ name: 'text', niche: 'text', tags: 'text' }`
- `{ relationship: 1, classification: 1 }`
- `{ 'presences.platform': 1, 'presences.handle': 1 }` — author-link lookups (Reddit module hot path)
- `{ roles: 1 }`, `{ tags: 1 }`, `{ status: 1 }`, `{ listIds: 1 }`, `{ 'voiceProfile.active': 1 }`

### 5.3 Auto-classification

Whenever presences/niche change, a classifier agent (Haiku 4.5) re-derives `roles[]`, `primaryRole`, suggested `tags` from `presences[]` + `niche` + `bio`. Auto-applied at confidence ≥ 0.8; otherwise queued for review. Prompt is **registered as `prompts:contacts.classify`**, editable via UI.

### 5.4 Author-linking (cross-module bridge)

When the Reddit Engagement module ingests an opportunity, attempt to link the author to a Contact:

```
Contact.findOne({ presences: { $elemMatch: { platform: 'reddit', handle: <username_lower> } } })
```

If found → `EngagementOpportunity.authorContactId`. If not, optional auto-create stub Contact (`relationship:'unknown'`, source.type:`'reddit_engagement_link'`). Reverse backfill runs when a Contact's Reddit presence is added/edited.

### 5.5 Shared routes

```
GET    /api/contacts                                 list w/ filters (relationship, classification, roles, tags, audience, status, has-channel-of-type, has-conflicts, excludeConflicts) + search + pagination
POST   /api/contacts                                 create
GET    /api/contacts/:id
PATCH  /api/contacts/:id
DELETE /api/contacts/:id
POST   /api/contacts/import                          CSV/markdown/JSON paste
POST   /api/contacts/:id/classify                    trigger classify agent
GET    /api/contacts/voices                          shortcut: relationship in [self,team] AND voiceProfile.active
POST   /api/contacts/find-or-create-by-presence      { platform, handle, defaults } → returns Contact (used by author-linking)

GET    /api/contact-lists
POST   /api/contact-lists
GET    /api/contact-lists/:id
PATCH  /api/contact-lists/:id
DELETE /api/contact-lists/:id
POST   /api/contact-lists/:id/contacts               add by ids or filter
DELETE /api/contact-lists/:id/contacts/:contactId
```

### 5.6 Shared UI

**`/contacts`** — TanStack Table. Columns: name, relationship pill, primaryRole, role chips, platforms (icons), largest audience, tags, status, conflict ⚠️, last researched. Filters include `relationship` first-class so you can flip between targets and voices. Bulk: add to list, enqueue research, classify, export CSV.

**`/contacts/:id`** — tab host:
- **Overview** (shared) — presences, contactChannels, niche, tags, roles, lists, source
- **Voice** (shared, only when relationship in [self,team]) — voiceProfile editor, presence pickers (which Reddit/X/IG account is this voice)
- **Research** (contributed by influencers module)
- **Drafts** (contributed by influencers module)
- **Engagement** (contributed by redditEngagement module — opportunities authored by this person)
- **History** (shared — usage logs, all jobs)

**`/contact-lists`** + **`/contact-lists/:id`** — list CRUD; detail has the big contextPrompt textarea, filter spec, scoped contact table, bulk-research/draft buttons.

---

## 6. Shared — Editable prompts

### 6.1 `marketing_prompts`

```
{
  _id,
  key,                                   // 'contacts.classify' | 'influencers.enrich' | 'influencers.draft' | 'redditEngagement.triage' | 'redditEngagement.draftReply' | etc.
  module,                                // 'shared'|'contacts'|'influencers'|'redditEngagement'
  title,                                 // human-readable
  description,                           // when this prompt is used; what it produces
  body,                                  // the active prompt text (markdown w/ {{template.vars}})
  defaultBody,                           // shipped default — for "Restore default"
  variables: [{                          // declared at registration time; UI shows what's available
    name,                                // 'contact.name'
    description,
    sample                               // shown in test mode
  }],
  outputSchema,                          // optional JSON schema for structured outputs
  models: { defaultSlot },               // 'research'|'draft'|'triage'|'classify' — picks model from config.models
  version,                               // monotonic int
  isActive,                              // exactly one active version per key
  editedBy,                              // user id from requireAuth, when host surfaces it
  editedAt,
  createdAt
}
```

Indexes: `{ key: 1, isActive: 1 }`, `{ key: 1, version: -1 }`.

### 6.2 Lifecycle

- **Registration:** modules call `promptRegistry.register({ key, title, description, defaultBodyFile, variables, outputSchema, defaultSlot })` at startup. Registry knows every prompt key the suite uses.
- **Seeding:** on `marketing.start()`, for each registered key, if no Mongo record exists → create v1 from `defaultBodyFile` content, mark active. If record exists, leave it (user has customized).
- **Editing:** save creates v(N+1) w/ `isActive:true`, sets prior to `isActive:false`. Edits never overwrite history.
- **Restore default:** creates new version w/ `body = defaultBody`, becomes active.
- **Lookup:** at agent runtime, `promptRegistry.resolve(key, context)` fetches active version (cached in-process w/ TTL ~30s + invalidation on save), substitutes `{{var}}` placeholders, returns rendered prompt.

### 6.3 Routes

```
GET    /api/prompts                                  list all registered prompts (active version + metadata)
GET    /api/prompts/:key                             active version
GET    /api/prompts/:key/history                     all versions
PATCH  /api/prompts/:key                             save new version
POST   /api/prompts/:key/activate-version            { version } → mark a prior version active again
POST   /api/prompts/:key/restore-default
POST   /api/prompts/:key/test                        { sampleContext } → renders + sends to model, returns output (dry-run, charged to usage)
```

### 6.4 UI

Sidebar: **Settings → Prompts**. Page lists all registered keys grouped by module, w/ title + description + last edited. Click → editor view:
- Markdown editor for `body`
- Right-side panel: declared variables w/ sample values (clickable to insert `{{var}}`)
- "Test" button → opens dialog w/ editable sample context → runs against model → shows output side-by-side w/ rendered prompt
- "Save" creates new version
- Version dropdown on top-right, "Restore default" button

Same `<PromptEditor />` component is reused inline anywhere prompts appear (e.g. could be embedded in a contact's voice tab if voiceDescription wants similar treatment, though those are plain fields not prompt records).

### 6.5 What's editable

| key | title | used by |
|---|---|---|
| `contacts.classify` | Classify Contact | classifier agent (auto-derive roles/tags) |
| `influencers.enrich` | Influencer Research System Prompt | research agent loop |
| `influencers.draft` | Outreach Draft System Prompt | draft agent (uses list.contextPrompt + voice + findings) |
| `redditEngagement.triage` | Reddit Triage System Prompt | triage agent (fit assessment) |
| `redditEngagement.draftReply` | Reddit Reply Draft System Prompt | draft reply agent (uses voiceProfile) |
| _future modules add their own_ | — | — |

`ContactList.contextPrompt` and `Contact.voiceProfile.voiceDescription` are not prompt records — they're context fields edited inline on their parent record. The prompt template references them as `{{list.contextPrompt}}` / `{{voice.voiceDescription}}` so behavior is fully tunable from the list/voice page or the prompt page, whichever you prefer.

---

## 7. Module 1 — Influencer CRM + Outreach

### 7.1 Concept

Operates on the shared Contact collection (filters to `relationship:'target'` by default). Adds `marketing_research_jobs` and `marketing_outreach_drafts` collections. Contributes Research and Drafts tabs to the shared Contact detail page. Adds `marketing_contact_lists`-aware bulk workflows on top of the shared lists.

### 7.2 Module-specific collections

#### `marketing_research_jobs`
```
{
  _id, contactId, listId,
  status,                                // 'queued'|'running'|'done'|'failed'|'cancelled'
  lockedBy, lockedAt,
  startedAt, finishedAt,
  toolsAvailable,
  budget: { capUsd, spentUsd },
  toolCalls: [{ tool, input, output, ts, costUsd, tokensIn, tokensOut }],
  findings,                              // structured agent output
  error,
  createdAt
}
```

#### `marketing_outreach_drafts`
```
{
  _id, contactId, listId,
  channel,                               // matches contactChannels[].type
  subject, body, hookSentenceUsed,
  modelUsed, costUsd,
  status,                                // 'draft'|'approved'|'sent'|'replied'|'discarded'
  approvedAt, sentAt,
  replyNotes,
  createdAt, updatedAt
}
```

### 7.3 Routes

```
POST   /api/influencers/research/jobs                { contactId, listId }
POST   /api/influencers/research/jobs/bulk           { listId, contactIds? }
GET    /api/influencers/research/jobs/:id
GET    /api/influencers/research/jobs/:id/stream     SSE
POST   /api/influencers/research/jobs/:id/cancel
GET    /api/influencers/research/jobs?status=...

POST   /api/influencers/drafts                       { contactId, listId, channelType } → AI compose
GET    /api/influencers/drafts/:id
PATCH  /api/influencers/drafts/:id
POST   /api/influencers/drafts/:id/approve
POST   /api/influencers/drafts/:id/mark-sent
POST   /api/influencers/drafts/:id/discard
```

### 7.4 Channel-aware draft rendering

| channel.type | UI render |
|---|---|
| `email` | `mailto:` button + copy-body button |
| `reddit_dm` | `https://www.reddit.com/message/compose/?to=USERNAME&subject=...&message=...` |
| `x_dm` | Copy body + open `https://x.com/messages/compose?recipient_id=...` |
| `instagram_dm` | Copy body + open `https://ig.me/m/USERNAME` |
| `substack_message` | Copy body + open author profile |
| `contact_form` | Copy body + open `contactFormUrl` |
| `linkedin_inmail` | Copy body + open profile |

No automated sending — ever.

---

## 8. Module 2 — Reddit Engagement Assistant

### 8.1 Concept

Configure subreddits to monitor. Worker scans on schedule, triages each opportunity (fit assessment), drafts a candidate reply for fit ≥ medium, queues for human review. You edit, post manually via Reddit, mark posted. Performance tracked passively. Engaged authors auto-link to Contacts.

### 8.2 Voice binding

A `MonitoredSubreddit` references a **Contact** (via `voiceContactId`) where `relationship in ['self','team']` and `voiceProfile.active === true`. The draft agent uses that Contact's `voiceProfile.voiceDescription`, `expertiseTags`, `doNotMention`, `selfPromoPolicy`, and `signatureSnippet`. The contact's Reddit presence (looked up via `voiceProfile.redditPresenceId`) supplies the username for self-disclosure rules and the eventual posting account.

No separate persona collection.

### 8.3 Module-specific collections

#### `marketing_monitored_subreddits`
```
{
  _id,
  subreddit,                             // 'tirzepatide' (no r/)
  active,
  voiceContactId,                        // ref Contact (relationship in [self,team])
  scanRules: {
    keywords, excludeKeywords,
    maxPostAgeHours, minPostScore, minCommentScore,
    fitnessFilters: { mustBeQuestion, avoidAlreadyAnsweredCount, avoidNicheMismatch }
  },
  scanIntervalMinutes,
  budget: { perRunCapUsd, monthlyCapUsd },
  lastScanAt, lastScanFoundCount,
  totalPostsPosted, totalUpvotesEarned,
  createdAt, updatedAt
}
```

#### `marketing_engagement_opportunities`
```
{
  _id,
  subredditId,
  subreddit,                             // denormalized
  postId, postUrl, title, postExcerpt,
  authorUsername,
  authorContactId,                       // auto-linked to Contact when presence match found
  authorPostKarma,
  postedAt, postScore, postCommentCount,
  matchedKeywords,
  triage: {
    fit,                                 // 'high'|'medium'|'low'|'no'
    reasoning, valueAngle, risks,
    model, costUsd, completedAt
  },
  draft: {
    body, confidence,
    voiceContactIdAtDraft,               // snapshot — which voice composed this
    model, costUsd, generatedAt,
    citations
  },
  status,                                // 'new'|'triaged'|'drafted'|'reviewed'|'dismissed'|'posted'|'replied-to'|'low-fit-archived'
  reviewerNotes,
  postedAt, postedCommentId, postedCommentUrl,
  postPerformance: { score, replyCount, lastCheckedAt },
  createdAt, updatedAt
}
```

#### `marketing_engagement_runs`
```
{
  _id, subredditId,
  startedAt, finishedAt, status,
  postsScanned, candidatesIdentified,
  triagedFit, triagedNoFit, draftsGenerated,
  totalCostUsd, error
}
```

### 8.4 Worker pipeline

1. **`engagement.scanSubreddit`** — scheduled per sub. Calls `redditSubredditFeed`, applies `scanRules`, creates `EngagementOpportunity` records (`status:'new'`), runs author-linking against Contacts. No agent calls — cheap.
2. **`engagement.triageOpportunity`** — for `new` opportunities, runs triage agent (Haiku, prompt key `redditEngagement.triage`). Sets `triage.*`. If `fit ∈ {high,medium}` → enqueue stage 3. Else → `status:'low-fit-archived'`.
3. **`engagement.draftReply`** — runs draft agent (Sonnet, prompt key `redditEngagement.draftReply`) w/ resolved voice (from `voiceContactId` → Contact.voiceProfile). Tools allowed: `fetch_url`, `redditCommentTree`. Writes `draft.body`, sets `status:'drafted'`.

Scheduler tick (every minute) enqueues `scanSubreddit` for active subreddits whose `lastScanAt` is older than their interval.

### 8.5 Routes

```
GET    /api/reddit-engagement/subreddits
POST   /api/reddit-engagement/subreddits
GET    /api/reddit-engagement/subreddits/:id
PATCH  /api/reddit-engagement/subreddits/:id
DELETE /api/reddit-engagement/subreddits/:id
POST   /api/reddit-engagement/subreddits/:id/scan-now

GET    /api/reddit-engagement/opportunities                 paginated, filterable (status, fit, subreddit, dateRange, authorContactId)
GET    /api/reddit-engagement/opportunities/:id
PATCH  /api/reddit-engagement/opportunities/:id            edit draft body, reviewer notes
POST   /api/reddit-engagement/opportunities/:id/redraft    re-run draft agent w/ optional steering note
POST   /api/reddit-engagement/opportunities/:id/dismiss
POST   /api/reddit-engagement/opportunities/:id/mark-posted { commentUrl }
POST   /api/reddit-engagement/opportunities/:id/refresh-performance
POST   /api/reddit-engagement/opportunities/:id/link-author-to-contact { contactId? }   # creates stub if no contactId

GET    /api/reddit-engagement/runs?subredditId=...
GET    /api/reddit-engagement/runs/:id
```

### 8.6 UI

Lives under `/admin/marketing/reddit-engagement/*`.

- **`/feed`** — card stream of opportunities, filterable by status/fit/subreddit/voice. Each card: subreddit + score, title, post excerpt, age, matched keywords, triage fit pill, value angle, **draft preview**, action buttons (Edit, Redraft, Dismiss, Open on Reddit + Mark Posted). Author-linked Contact shown as a small chip if linked.
- **`/opportunities/:id`** — full detail. Original post (rendered markdown). Triage block. Draft editor (markdown + live preview, fork voice if you want to regenerate w/ a different voiceContactId). "Open on Reddit" deep-link → manual paste → "Mark Posted" w/ comment URL. Performance section.
- **`/subreddits`** — table of monitored subs, last scan time, opportunity counts by status, monthly spend per sub. "Add subreddit" form w/ `voiceContactId` picker (autocomplete over `relationship in [self,team]` Contacts) + scanRules editor.

Voice management has no dedicated page in this module — voices live as Contacts viewed/edited via the shared Contacts UI w/ the Voice tab. Subreddit form is where they're picked.

### 8.7 Risk notes

- **Self-promotion ban risk.** Reddit punishes commercial accounts. Voice Contacts must back real accounts w/ real history, low link-frequency. `selfPromoPolicy` defaults to `'never'`. Drafts avoid first-person product references unless policy allows + post explicitly invites.
- **Rate limits.** Reddit API: 60 req/min OAuth. Worker concurrency configurable. Scan batches via `subreddit/new`, ~25 posts/call.
- **Account safety.** No auto-posting in v1. Every reply human-reviewed.
- **Compliance.** Some subs (e.g. r/medicine) ban non-clinician medical commentary. Subreddit config warns on niche mismatch via `triage.risks`.

---

## 9. Shared infrastructure

### 9.1 Worker (Mongo-backed, no Redis)

- Single poller, dispatches by `job.type` to handler registered by owning module
- Concurrency configurable, default 2 parallel jobs
- Atomic claim via `findOneAndUpdate` setting `lockedBy`+`lockedAt`
- Stale lock recovery (>10min)
- Graceful shutdown: SIGTERM → re-queue in-flight jobs
- Progress emitted via in-mem EventEmitter → SSE

If multi-instance ever needed → swap implementation for BullMQ behind same registry interface. Module job handlers don't change.

### 9.2 Scheduler

`marketing_scheduled_tasks` collection. Modules register tasks at startup:

```js
ctx.scheduler.register({
  name: 'redditEngagement.scan',
  intervalMinutes: 30,
  enqueue: async () => { /* returns array of jobs */ },
});
```

Internal tick every minute, idempotent.

### 9.3 Agent runner

Wraps Claude Agent SDK with:
- **Prompt resolution** via `promptRegistry.resolve(key, context)` — fetches active version, substitutes template vars
- Tool registry lookup, scoped per-call
- Token + USD metering → `marketing_usage_logs`
- Per-job budget cap → loop aborts when exceeded
- Streamed tool-call events → worker EventEmitter → SSE
- Structured output parsing per declared `outputSchema`
- Model selection from `config.models` slot (`research`/`draft`/`triage`/`classify`)

### 9.4 Tool registry

Built-in tools above. Modules can register additional tools. Tools scoped per-call by job context (e.g., research agent for a Reddit-only contact gets reddit + fetch_url + scrape_contact_page; YouTube tools omitted unless contact has a YouTube presence).

### 9.5 Usage tracking

`marketing_usage_logs`: `{ jobId, contactId?, opportunityId?, module, kind, model, tokensIn, tokensOut, costUsd, ts }`. Suite-level usage page aggregates by module/month/job type.

### 9.6 SSE

`GET /sse/:channel` — generic. Modules emit on named channels (`research-job-:id`, `engagement-run-:id`).

---

## 10. UI shell

Top-level `/admin/marketing/` sidebar:

- 🧑 **Influencers** *(actually shared-Contact-driven)*
  - Contacts
  - Lists
- 💬 **Reddit Engagement**
  - Feed
  - Subreddits
- 📊 **Usage**
- ⚙️ **Settings**
  - Prompts
  - Tool availability
  - Config (read-only)

Each module's UI is an independent Vue mini-app loaded by the shell. Shell handles nav, auth context, global usage badge.

---

## 11. Auth & config

- `requireAuth`: required host-supplied middleware. Applied to every API + UI route.
- `collectionPrefix`: configurable, default `marketing_`.
- `modules.<name>.enabled`: toggle modules at mount time.
- `extraTools`: host can register additional tools.
- `logger`: injectable.

---

## 12. Build & distribution

- `npm run build:ui` → vite builds shell + module UIs into `src/ui-dist/`
- Server-side ESM, target Node 20+
- `package.json#files`: `dist/`, `src/ui-dist/`, `src/**/agent/prompts/` (defaults need to ship for seeding)
- semver, CHANGELOG.md
- Local link via `file:./marketing` until cross-app validated

---

## 13. Phases

**Phase 0 — Suite scaffold (½ day)**
- Pkg structure, mongoose `createConnection`, Express router skeleton, mounted in body-optimizer behind `requireAdmin`
- Empty Vue shell w/ sidebar
- Module loader, prompt registry, usage logging stubs

**Phase 1 — Shared Contacts + CRUD (1 day)**
- Contact model w/ full schema (presences, contactChannels, voiceProfile, conflicts, modules namespace)
- ContactList model + membership
- Shared routes `/api/contacts*`, `/api/contact-lists*`
- TanStack Table contacts page w/ filters incl. relationship
- Contact detail page w/ Overview + Voice tabs
- `/contacts/find-or-create-by-presence` for cross-module use

**Phase 2 — Editable prompts infrastructure (½ day)**
- `marketing_prompts` model + registry + seeder
- `PromptEditor` component, Settings → Prompts page
- Routes for CRUD + version history + restore default + test
- Wire agent runner to use registry for all prompt lookups (prepares Phase 3+)

**Phase 3 — Auto-classifier (½ day)**
- `contacts.classify` prompt registered + default seeded
- `classifyContact` job handler (Haiku)
- Triggered on contact save/import; auto-applies suggestions ≥ 0.8

**Phase 4 — Influencers: research agent (1–2 days)**
- Built-in tools: `fetch_url`, `web_search`, `scrape_contact_page`, `rss_fetch`, `save_finding`
- Worker + SSE
- "Run research" button → live tool-call feed → findings persist
- Per-job budget cap, monthly dashboard tile
- `influencers.enrich` prompt registered

**Phase 5 — Influencers: platform-specific tools (1 day)**
- Reddit OAuth + `redditUserHistory` + `redditSearch`
- YouTube Data API + `youtubeChannelInfo` + `youtubeRecentVideos` + `youtubeTranscript`
- Twitter/Instagram scraping fallbacks (no API)

**Phase 6 — Influencers: draft agent (1 day)**
- Draft compose endpoint + UI editor
- Channel-aware draft rendering
- Approve / mark-sent / reply tracking
- `influencers.draft` prompt registered

**Phase 7 — Reddit Engagement: scaffold + scanning (1 day)**
- MonitoredSubreddit + EngagementOpportunity + EngagementRun models
- Subreddit CRUD UI w/ voice picker (autocomplete over voice Contacts)
- `redditSubredditFeed` + `redditCommentTree` tools
- `scanSubreddit` job + scheduler tick
- Author-linking (Contact lookup by Reddit presence)
- Feed page w/ raw matches (no AI yet)

**Phase 8 — Reddit Engagement: triage + draft (1–2 days)**
- `triageOpportunity` job (Haiku) + `redditEngagement.triage` prompt
- `draftReply` job (Sonnet) + `redditEngagement.draftReply` prompt
- Feed shows triage pills + draft preview
- Opportunity detail page w/ editor + Open on Reddit + Mark Posted flow
- Performance refresh job

**Phase 9 — Cross-module + polish (1 day)**
- `link-author-to-contact` action (link or stub-create)
- Suite usage dashboard (cross-module rollups)
- Tool availability page
- CSV/markdown import for contacts (people.md becomes seed input)
- Prompt history UI polish

**Phase 10 — Cross-app reuse (later)**
- Audit body-optimizer-specific assumptions
- Private npm publish
- Wire into 2nd host app

---

## 14. Decisions captured

| Question | Decision |
|---|---|
| Architecture | Suite of modules sharing infrastructure |
| Pkg name | `@jeffjassky/marketing-admin` |
| DB | Mongo, shared cluster, prefixed collections (`marketing_*`), own connection |
| Contact concept | Single shared collection w/ `relationship` (target/self/team/unknown), rich `presences[]`, `contactChannels[]`, `voiceProfile` sub-doc |
| No persona collection | Voices = Contacts where `relationship in [self,team]` w/ `voiceProfile` populated |
| Cross-module bridge | Author-linking by presence handle; `find-or-create-by-presence` endpoint |
| Auto-classification | Haiku-driven on save/import; prompt editable via UI |
| Reddit module | Configurable subreddit monitoring → triage → draft → manual post; voice picked from Contact pool |
| Editable prompts | All LLM prompts stored in `marketing_prompts`, versioned, UI-editable, restorable to default; defaults shipped as `.md` and seeded on startup |
| UI | Vue 3 + Vite + Tailwind + Pinia + TanStack Table; sidebar shell hosts module mini-apps; modules contribute tabs to shared ContactDetailPage |
| Worker | In-process Mongo-backed poller, no Redis; scheduler driven by `marketing_scheduled_tasks` |
| Email-find | Scrape only — no Hunter/Apollo/Findymail |
| Sending/posting | Manual only — package never sends or posts |
| Auth | Host-supplied `requireAuth` middleware |
| Mount | BullMQ-style: `app.use(basePath, marketing.router); marketing.start()` |
