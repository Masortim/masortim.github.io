/**
 * Loader for deployments without Vercel's git integration.
 *
 * The regular path — `vercel deploy` from `newsletter/edge` — ships the
 * whole bundled `index.mjs` (38 KB). When a deployment is created through
 * an API with a per-field size limit, that bundle cannot be passed.
 *
 * This file solves the problem differently: on the first request it
 * downloads the bundle from the repository, imports it and then behaves
 * as an ordinary handler. The version comes from `main` (the same thing
 * Vercel's git integration would ship) or from a pinned SHA when strict
 * pinning is wanted.
 *
 *   NEWSLETTER_BUNDLE_REF = main | <commit sha> | <tag>
 *
 * If GitHub is unreachable or returns the wrong file, the function
 * answers 503 `bundle_unavailable` instead of 500.
 */

const REF = (process.env.NEWSLETTER_BUNDLE_REF ?? 'main').trim();
const REPO = 'Masortim/masortim.github.io';
const PATH = 'newsletter/edge/index.mjs';

let loaded = null;

function unavailable(reason) {
  console.error(`bundle unavailable: ${reason}`);
  return new Response(JSON.stringify({ error: 'bundle_unavailable' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function load() {
  if (loaded) return loaded;
  const url = `https://raw.githubusercontent.com/${REPO}/${REF}/${PATH}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'masortim-newsletter' } });
  if (!response.ok) throw new Error(`github ${response.status}`);
  const source = await response.text();
  // Cheap sanity check: we must have got the bundle, not an error page.
  if (!source.includes('newsletter/health') || !source.includes('export default')) {
    throw new Error('unexpected payload');
  }
  const module = await import(`data:text/javascript;utf8,${encodeURIComponent(source)}`);
  if (typeof module.default !== 'function') throw new Error('no default export');
  loaded = module.default;
  return loaded;
}

export default async function handler(request, response) {
  try {
    const run = await load();
    return await run(request, response);
  } catch (error) {
    return unavailable(error && error.message ? error.message : 'unknown');
  }
}
