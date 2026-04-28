import { z } from 'zod';
import * as cheerio from 'cheerio';

// Visit a site's likely contact pages (/contact, /about, /pages/contact,
// footer of root) and extract emails + social links via regex + DOM
// parsing. No paid lookup APIs — best-effort scraping only.

const CANDIDATES = ['/contact', '/contact-us', '/about', '/about-us', '/pages/contact', '/pages/about', '/'];
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export const scrapeContactPageTool = {
  name: 'scrape_contact_page',
  description:
    'Try common URL patterns on a domain (/contact, /about, footer) to extract emails and social handles. Returns best-effort findings — confidence is "scraped" at most.',
  schemaZod: {
    domain: z.string().describe('e.g. "onthepen.com" or "https://onthepen.com"'),
  },
  async execute({ domain }) {
    const base = normalizeBase(domain);
    if (!base) return { error: 'invalid_domain' };

    const findings = {
      emails: new Set(),
      socials: {},
      contactFormUrls: [],
      visited: [],
      errors: [],
    };

    for (const path of CANDIDATES) {
      const url = base + path;
      try {
        const res = await fetch(url, {
          redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; marketing-admin/0.1)' },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
          findings.errors.push({ url, status: res.status });
          continue;
        }
        const html = await res.text();
        findings.visited.push({ url: res.url, status: res.status });

        for (const m of html.match(EMAIL_RE) || []) {
          if (m.endsWith('.png') || m.endsWith('.jpg') || m.endsWith('.gif') || m.endsWith('.svg')) continue;
          if (/example\.com$/i.test(m)) continue;
          findings.emails.add(m.toLowerCase());
        }

        const $ = cheerio.load(html);
        $('a[href^="mailto:"]').each((_, el) => {
          const href = $(el).attr('href');
          const m = href.match(/mailto:([^?]+)/);
          if (m) findings.emails.add(m[1].toLowerCase());
        });
        if ($('form').length > 0 && /\/contact/i.test(res.url)) {
          findings.contactFormUrls.push(res.url);
        }
        $('a[href]').each((_, el) => {
          const href = ($(el).attr('href') || '').trim();
          recordSocial(findings.socials, href);
        });
      } catch (err) {
        findings.errors.push({ url, err: err.message });
      }
    }

    return {
      domain: base,
      emails: Array.from(findings.emails),
      socials: findings.socials,
      contactFormUrls: findings.contactFormUrls,
      visited: findings.visited,
      errors: findings.errors,
    };
  },
};

function normalizeBase(input) {
  let s = input.trim();
  if (!/^https?:\/\//.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function recordSocial(socials, href) {
  if (!href) return;
  const tests = [
    { platform: 'twitter', re: /^https?:\/\/(www\.)?(twitter|x)\.com\/([A-Za-z0-9_]{1,15})\/?$/ },
    { platform: 'instagram', re: /^https?:\/\/(www\.)?instagram\.com\/([A-Za-z0-9._]{1,30})\/?$/ },
    { platform: 'youtube', re: /^https?:\/\/(www\.)?youtube\.com\/(@[A-Za-z0-9_-]+|c\/[^/]+|channel\/[^/]+)\/?/ },
    { platform: 'tiktok', re: /^https?:\/\/(www\.)?tiktok\.com\/@([A-Za-z0-9._]{1,30})\/?$/ },
    { platform: 'linkedin', re: /^https?:\/\/(www\.)?linkedin\.com\/in\/([A-Za-z0-9-]+)\/?/ },
    { platform: 'substack', re: /^https?:\/\/[a-z0-9-]+\.substack\.com\/?/ },
  ];
  for (const t of tests) {
    if (t.re.test(href)) {
      socials[t.platform] = socials[t.platform] || [];
      if (!socials[t.platform].includes(href)) socials[t.platform].push(href);
    }
  }
}
