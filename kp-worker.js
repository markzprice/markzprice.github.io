// ============================================================
// Kprofiles proxy — Cloudflare Worker
// ============================================================
// This is NOT a client-side file. Deploy it to Cloudflare Workers:
//   1. https://dash.cloudflare.com → Workers & Pages → Create
//   2. Paste this file into the editor
//   3. Save and deploy
//   4. Copy the *.workers.dev URL into actor.html → WORKER_URL
//
// Free tier: 100,000 requests/day, no credit card, no expiry.
// ============================================================

export default {
  async fetch(request) {
    const CORS = {
      'Access-Control-Allow-Origin': 'https://markzprice.github.io',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Content-Type': 'application/json',
    };

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const name = url.searchParams.get('name');
    if (!name) {
      return new Response(JSON.stringify({ error: 'name param required' }), { status: 400, headers: CORS });
    }

    const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

    try {
      // 1. Search Kprofiles for the actor name
      const searchHtml = await fetch(
        `https://kprofiles.com/?s=${encodeURIComponent(name)}`,
        { headers: { 'User-Agent': UA } }
      ).then(r => r.text());

      // Find the first profile article link (skip category/tag/page URLs)
      const linkMatch = searchHtml.match(
        /href="(https:\/\/kprofiles\.com\/(?!(?:category|tag|page|author)\/)[\w-]+-(?:profile|facts)\/?)"/
      );
      if (!linkMatch) {
        // Looser fallback: any kprofiles.com post link
        const loose = searchHtml.match(/href="(https:\/\/kprofiles\.com\/[\w-]{5,}\/?)"/);
        if (!loose) return new Response(JSON.stringify({}), { headers: CORS });
        linkMatch = loose; // reassignment
      }

      // 2. Fetch the profile page
      const profileUrl = linkMatch[1];
      const profileHtml = await fetch(
        profileUrl,
        { headers: { 'User-Agent': UA } }
      ).then(r => r.text());

      // 3. Parse fields via regex against the raw HTML
      const result = { profileUrl };

      // Height: "180 cm (5 feet 11 inches)" or "180cm" etc.
      const htMatch = profileHtml.match(/[Hh]eight\s*[:\-–]\s*([0-9]+\s*cm[^<\n]{0,35})/);
      if (htMatch) result.height = htMatch[1].replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();

      // Weight: "65 kg (143 lbs)" etc.
      const wtMatch = profileHtml.match(/[Ww]eight\s*[:\-–]\s*([0-9]+\s*kg[^<\n]{0,30})/);
      if (wtMatch) result.weight = wtMatch[1].replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();

      // Blood type: A / B / AB / O (with optional +/-)
      const btMatch = profileHtml.match(/[Bb]lood\s*[Tt]ype\s*[:\-–]\s*([ABO]{1,2}[+-]?)/);
      if (btMatch) result.bloodType = btMatch[1].trim();

      // MBTI: four uppercase letters, e.g. ENFP
      const mbtiMatch = profileHtml.match(/MBTI\s*[:\-–]\s*([A-Z]{4})/);
      if (mbtiMatch) result.mbti = mbtiMatch[1];

      return new Response(JSON.stringify(result), { headers: CORS });

    } catch (e) {
      // Swallow errors gracefully — the client falls back to dashes
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
    }
  }
};
