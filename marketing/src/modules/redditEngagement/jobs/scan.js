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

      for (const post of posts) {
        const ageMs = Date.now() - new Date(post.createdAt).getTime();
        if (ageMs > maxAgeMs) continue;
        if ((post.score || 0) < minScore) continue;

        const haystack = `${post.title} ${post.selftextExcerpt || ''}`.toLowerCase();
        if (excludeKeywords.some((k) => haystack.includes(k))) continue;

        const matchedKeywords = keywords.filter((k) => haystack.includes(k));
        if (keywords.length > 0 && matchedKeywords.length === 0) continue;

        if (rules.fitnessFilters?.mustBeQuestion && !post.title.includes('?')) continue;
        if (
          rules.fitnessFilters?.avoidAlreadyAnsweredCount != null &&
          (post.numComments || 0) > rules.fitnessFilters.avoidAlreadyAnsweredCount
        ) {
          continue;
        }

        // Resolve / create author Contact
        let authorContactId = null;
        if (post.author && post.author !== '[deleted]') {
          const handle = String(post.author).toLowerCase();
          let existing = await ctx.models.Contact.findOne({
            presences: { $elemMatch: { platform: 'reddit', handle } },
          });
          if (!existing) {
            existing = await ctx.models.Contact.create({
              name: post.author,
              relationship: 'unknown',
              presences: [{ platform: 'reddit', handle, url: `https://reddit.com/user/${post.author}` }],
              source: { type: 'reddit_engagement_link', importedAt: new Date(), note: `from sub ${sub.subreddit}` },
            });
          }
          authorContactId = existing._id;
        }

        // Upsert opportunity (subredditId+postId unique)
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
              authorContactId,
              postedAt: new Date(post.createdAt),
              postScore: post.score,
              postCommentCount: post.numComments,
              matchedKeywords,
              status: 'new',
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        if (opp.createdAt && Date.now() - opp.createdAt.getTime() < 5_000) {
          candidatesIdentified++;
        }
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
      const subs = await models.MonitoredSubreddit.find({ active: true }).lean();
      const due = [];
      for (const s of subs) {
        const intervalMs = (s.scanIntervalMinutes || 30) * 60 * 1000;
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
