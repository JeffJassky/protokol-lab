import { useHead } from '@unhead/vue';
import { useRoute } from 'vue-router';
import { seoConfigFor, ORIGIN } from '../marketing-meta.js';

// Central SEO helper. Marketing pages call useRouteSeo() and the composable
// pulls title/description/schema from the registry in marketing-meta.js.
// Adding a new marketing page = one entry in that file + one useRouteSeo()
// line in the page. Nothing else.
//
// For edge cases (pages with per-instance dynamic SEO — e.g. a blog post
// index page that wants FAQ schema merged from its own data), call useSeo()
// directly with an explicit config and optionally pass extraSchema.

export function useSeo({ path = '/', title, description, ogImage, schema } = {}) {
  const canonical = `${ORIGIN}${path}`;
  const image = ogImage
    ? (ogImage.startsWith('http') ? ogImage : `${ORIGIN}${ogImage}`)
    : `${ORIGIN}/og/landing.png`;

  const script = [];
  if (Array.isArray(schema)) {
    for (const block of schema) {
      script.push({
        type: 'application/ld+json',
        innerHTML: JSON.stringify(block),
      });
    }
  }

  useHead({
    title,
    link: [{ rel: 'canonical', href: canonical }],
    meta: [
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: canonical },
      { property: 'og:image', content: image },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: image },
    ],
    script,
  });
}

/**
 * Read metadata from the registry for the current route and apply it.
 * Zero-config 1-liner for marketing pages.
 *
 * @param {object} [extra] Optional overrides / additions.
 * @param {object[]} [extra.schema] Extra JSON-LD blocks merged onto the
 *   registry's schema array (useful for pages that build schema from
 *   per-instance data, like FaqPage.vue).
 */
export function useRouteSeo(extra = {}) {
  const route = useRoute();
  const cfg = seoConfigFor(route.path);
  if (!cfg) {
    // Fallback for a route that isn't in the registry yet — still emits
    // baseline tags so crawlers don't see a blank head.
    useSeo({ path: route.path, title: 'Protokol Lab', description: '' });
    return;
  }
  useSeo({
    ...cfg,
    schema: [...(cfg.schema || []), ...(extra.schema || [])],
  });
}

export { ORIGIN };
