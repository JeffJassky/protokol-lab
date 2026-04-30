// redditEngagement.scanSubreddit — scheduled per active subreddit.
// Calls reddit_subreddit_feed (no agent), applies scanRules, creates
// EngagementOpportunity records (status='new'), runs author-linking,
// and writes an EngagementRun summary. No LLM cost here.

export function registerScanJob(registry) {
  registry.register('redditEngagement.scanSubreddit', async ({ job, ctx }) => {
    const subId = job.payload?.subredditId;
    const sub = await ctx.models.MonitoredSubreddit.findById(subId);
    if (!sub) throw new Error(`monitored subreddit ${subId} not found`);

    const tool = ctx.tools.get('reddit_subreddit_feed');
    if (!tool) throw new Error('reddit_subreddit_feed tool not registered (reddit not configured)');

    const run = await ctx.models.EngagementRun.create({
      subredditId: sub._id,
      startedAt: new Date(),
      status: 'running',
    });

    let postsScanned = 0;
    let candidatesIdentified = 0;
    const newOppIds = []; // collected for one batch triage job at the end
    try {
      const feed = await tool.execute({ subreddit: sub.subreddit, sort: 'new', limit: 50 });
      if (feed.error) throw new Error(`feed_error: ${feed.error}`);
      const posts = feed.posts || [];
      postsScanned = posts.length;

      const rules = sub.scanRules || {};
      const maxAgeMs = (rules.maxPostAgeHours || 72) * 3600 * 1000;
      const minScore = rules.minPostScore ?? 1;
      const keywords = (rules.keywords || []).map((k) => k.toLowerCase());
      const excludeKeywords = (rules.excludeKeywords || []).map((k) => k.toLowerCase());

      // Cost-saving prefilter defaults. Each can be overridden per-sub in
      // scanRules.prefilter. Goal: kill obvious dead ends BEFORE we pay
      // Haiku to triage them. Pre-change observation: ~50% of triages
      // returned `low` or `no` and were money on the floor.
      const pf = rules.prefilter || {};
      const prefilterMinKeywordMatches = pf.minKeywordMatches ?? 2;       // require ≥2 keyword hits to be worth a triage
      const prefilterMaxComments = pf.maxComments ?? 60;                  // saturated threads = adding noise
      const prefilterMinScore = pf.minScore ?? minScore;                  // can be stricter than the recording threshold
      const prefilterTitleBlocklist = (pf.titleBlocklist || [
        'source?', 'where to buy', 'vendor rec', 'best vendor', 'sourcing',
        'cheapest', 'discount code', 'coupon', 'deal',
        'insurance', 'goodrx', 'pa denial', 'prior auth',
        'rx', 'script', 'prescription help',
      ]).map((s) => s.toLowerCase());

      for (const post of posts) {
        const ageMs = Date.now() - new Date(post.createdAt).getTime();
        if (ageMs > maxAgeMs) continue;
        if ((post.score || 0) < minScore) continue;

        const haystack = `${post.title} ${post.selftextExcerpt || ''}`.toLowerCase();
        if (excludeKeywords.some((k) => haystack.includes(k))) continue;

        const matchedKeywords = keywords.filter((k) => haystack.includes(k));
        if (keywords.length > 0 && matchedKeywords.length === 0) continue;

        if (rules.fitnessFilters?.mustBeQuestion && !post.title.includes('?')) continue;

        // Cost-saving prefilter: don't even RECORD an opportunity (and
        // therefore don't pay to triage it) if it fails these gates.
        // These are tunable per-sub via scanRules.prefilter.
        const titleLower = (post.title || '').toLowerCase();
        if (prefilterTitleBlocklist.some((s) => titleLower.includes(s))) continue;
        if ((post.score || 0) < prefilterMinScore) continue;
        if ((post.numComments || 0) > prefilterMaxComments) continue;
        if (matchedKeywords.length < prefilterMinKeywordMatches) continue;

        // NOTE: we do NOT create a Contact for the post author. That used
        // to happen here and polluted the CRM with thousands of random
        // reddit users. We just store the username string. Users can
        // manually link an author → Contact via /opportunities/:id/link-author-to-contact
        // when there's actually a relationship worth tracking.

        // Upsert opportunity (subredditId+postId unique). Re-scans hit
        // existing rows (including tombstoned ones via decision='passed'/
        // 'dismissed'/'replied') and skip re-triage.
        const opp = await ctx.models.EngagementOpportunity.findOneAndUpdate(
          { subredditId: sub._id, postId: post.id },
          {
            $setOnInsert: {
              subredditId: sub._id,
              subreddit: sub.subreddit,
              postId: post.id,
              postUrl: post.permalink,
              title: post.title,
              postExcerpt: post.selftextExcerpt,
              authorUsername: post.author,
              postedAt: new Date(post.createdAt),
              postScore: post.score,
              postCommentCount: post.numComments,
              matchedKeywords,
              status: 'new',
              decision: 'pending',
            },
          },
          { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
        );
        if (opp.createdAt && Date.now() - opp.createdAt.getTime() < 5_000) {
          candidatesIdentified++;
          // Collect id for the batch triage. We enqueue ONE batch job at
          // the end of the scan rather than N per-opp jobs — voice card
          // is sent once per call instead of N times = ~50% token savings.
          newOppIds.push(opp._id);
        } else if (opp.status === 'new') {
          // Already in DB but never got triaged (e.g. earlier triage job
          // failed because handler wasn't registered, or worker crashed).
          // Include in this scan's batch so the backlog clears naturally.
          newOppIds.push(opp._id);
        }
      }

      // Enqueue ONE batch triage job covering all newly-created opps.
      // Voice card sent once per batch instead of N times = ~50% token
      // savings vs per-opp triage. Chunked at 25 to bound prompt size.
      const BATCH_SIZE = 25;
      for (let i = 0; i < newOppIds.length; i += BATCH_SIZE) {
        const batch = newOppIds.slice(i, i + BATCH_SIZE);
        await ctx.worker.enqueue({
          type: 'redditEngagement.triageBatch',
          payload: { opportunityIds: batch.map((id) => String(id)) },
        });
      }

      sub.lastScanAt = new Date();
      sub.lastScanFoundCount = candidatesIdentified;
      await sub.save();

      run.status = 'done';
      run.postsScanned = postsScanned;
      run.candidatesIdentified = candidatesIdentified;
      run.finishedAt = new Date();
      run.totalCostUsd = 0;
      await run.save();

      return {
        runId: String(run._id),
        postsScanned,
        candidatesIdentified,
        subreddit: sub.subreddit,
      };
    } catch (err) {
      run.status = 'failed';
      run.error = err.message;
      run.finishedAt = new Date();
      await run.save();
      throw err;
    }
  });
}

// Scheduler task: enqueue scan jobs for any active subreddit whose
// lastScanAt is older than its interval. Runs every minute.
export function registerScanScheduler(scheduler, models) {
  scheduler.register({
    name: 'redditEngagement.scan',
    async check() {
      // Scheduler only picks up subs the user has explicitly opted into
      // auto-scanning. Default mode is manual: user hits /scan-now when
      // they have time to handle the resulting opportunity queue.
      const subs = await models.MonitoredSubreddit.find({ active: true, autoScanEnabled: true }).lean();
      const due = [];
      for (const s of subs) {
        const intervalMs = (s.scanIntervalMinutes || 1440) * 60 * 1000; // daily default
        if (!s.lastScanAt || Date.now() - new Date(s.lastScanAt).getTime() >= intervalMs) {
          due.push({
            type: 'redditEngagement.scanSubreddit',
            payload: { subredditId: s._id },
          });
        }
      }
      return due;
    },
  });
}
