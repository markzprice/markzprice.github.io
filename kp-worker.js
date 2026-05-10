// ============================================================
// Kprofiles proxy: Cloudflare Worker
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
    // Allow both the GitHub Pages origin and the custom domain, in both
    // http and https. The custom domain (markrprice.com) currently serves
    // over http because GitHub Pages has not yet provisioned an HTTPS cert
    // for it. Once Enforce HTTPS becomes available in the Pages settings,
    // the http entries can be removed.
    const allowedOrigins = [
      'http://markrprice.com',
      'https://markrprice.com',
      'http://markzprice.github.io',
      'https://markzprice.github.io',
    ];
    const origin = request.headers.get('Origin') || '';
    const allowOrigin = allowedOrigins.includes(origin) ? origin : 'http://markrprice.com';
    const CORS = {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Vary': 'Origin',
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

      // Collect every search result link. Kprofiles' theme wraps each result
      // heading in class "entry-title" containing the link. Then prefer the
      // first hit whose URL contains "-profile" since Kprofiles publishes
      // discography, news, and compilation pages alongside person/group
      // profile pages, and the first hit is not always the profile.
      const allMatches = [...searchHtml.matchAll(
        /entry-title[^>]*>\s*<a[^>]+href="(https:\/\/kprofiles\.com\/[^"]+?)"/g
      )];
      if (allMatches.length === 0) {
        return new Response(JSON.stringify({ note: 'no search results' }), { headers: CORS });
      }
      const profileHit = allMatches.find(m => /-profile(?:-|\/?$)/.test(m[1]));
      const linkMatch = profileHit || allMatches[0];

      // 2. Fetch the profile page
      const profileUrl = linkMatch[1];
      const profileHtml = await fetch(
        profileUrl,
        { headers: { 'User-Agent': UA } }
      ).then(r => r.text());

      // 3. Strip HTML tags and decode entities so label-value patterns reduce
      // to plain text. Kprofiles wraps labels in <span> tags
      // ("<span>Height:</span> 168 cm") and uses numeric entities for typographic
      // quotes like &#8217; (right single quote) and &#8243; (double prime),
      // both of which a naive regex stripper would mangle into noise.
      const decodeEntity = (m, code) => {
        if (code === 'nbsp') return ' ';
        if (code === 'amp')  return '&';
        if (code === 'lt')   return '<';
        if (code === 'gt')   return '>';
        if (code === 'quot') return '"';
        if (code === 'apos') return "'";
        if (code.startsWith('#x')) return String.fromCharCode(parseInt(code.slice(2), 16));
        if (code.startsWith('#'))  return String.fromCharCode(parseInt(code.slice(1), 10));
        return ' ';
      };
      const text = profileHtml
        .replace(/<[^>]+>/g, ' ')
        .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, decodeEntity)
        .replace(/\s+/g, ' ');

      const result = { profileUrl };

      // Height: "168 cm (5'6")" etc. Capture digits + cm, plus any non-uppercase
      // follow text up to the next field label (Weight, Blood, MBTI all start uppercase).
      const htMatch = text.match(/[Hh]eight\s*[:\-–]\s*([0-9]+\s*cm[^A-Z]{0,35})/);
      if (htMatch) result.height = htMatch[1].trim();

      // Weight: "47 kg (103 lbs)" etc.
      const wtMatch = text.match(/[Ww]eight\s*[:\-–]\s*([0-9]+\s*kg[^A-Z]{0,30})/);
      if (wtMatch) result.weight = wtMatch[1].trim();

      // Blood type: A / B / AB / O (with optional +/-)
      const btMatch = text.match(/[Bb]lood\s*[Tt]ype\s*[:\-–]\s*([ABO]{1,2}[+-]?)/);
      if (btMatch) result.bloodType = btMatch[1].trim();

      // MBTI: four uppercase letters, e.g. ENFP
      const mbtiMatch = text.match(/MBTI\s*[:\-–]\s*([A-Z]{4})/);
      if (mbtiMatch) result.mbti = mbtiMatch[1];

      return new Response(JSON.stringify(result), { headers: CORS });

    } catch (e) {
      // Swallow errors gracefully; the client falls back to dashes
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
    }
  }
};
