import { z } from 'zod';

// Lets the agent record structured findings during a research loop.
// Each call appends to job.result.findings (an array of objects). The
// final job result is reduced from these findings.

export const saveFindingTool = {
  name: 'save_finding',
  description:
    'Save a structured finding (a notable fact, recent piece of content, contact-info candidate, etc.) to the research job. Call this whenever you discover something worth keeping. Be specific: include source URLs.',
  schemaZod: {
    kind: z
      .string()
      .describe(
        'One of: recent_content, distinctive_point, contact_email, contact_form, social_handle, niche_update, sponsorship_flag, audience_estimate, other'
      ),
    summary: z.string().describe('One-sentence summary of the finding.'),
    data: z
      .record(z.string(), z.any())
      .optional()
      .describe(
        'Structured payload. Shape varies by kind — e.g. { url, title, publishedAt, distinctivePoint } for recent_content; { email, sourceUrl, confidence } for contact_email.'
      ),
    sourceUrl: z.string().optional().describe('Where this finding was learned. Always include if available.'),
  },
  async execute(input, ctx) {
    if (!ctx?.job) {
      return { error: 'no_job_context' };
    }
    const finding = {
      kind: input.kind,
      summary: input.summary,
      data: input.data || {},
      sourceUrl: input.sourceUrl,
      ts: new Date(),
    };
    ctx.job.result = ctx.job.result || { findings: [] };
    ctx.job.result.findings = ctx.job.result.findings || [];
    ctx.job.result.findings.push(finding);
    await ctx.job.save();
    return { saved: true, count: ctx.job.result.findings.length };
  },
};
