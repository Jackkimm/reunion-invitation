/**
 * Cloudflare Workers 진입점
 * ─────────────────────────────────────────────
 * Workers 프로젝트로 배포할 때(= `npx wrangler deploy`) 쓰입니다.
 *
 *   /api/attendees, /api/rsvp  →  functions/api/ 의 핸들러가 처리
 *   그 밖의 모든 주소          →  public/ 폴더의 정적 파일(ASSETS) 로 응답
 *
 * functions/api/*.js 는 Cloudflare Pages 규격 그대로라, Pages 로 배포할 때는
 * 이 파일과 wrangler.jsonc 없이도 똑같이 동작합니다. (README "다른 방법" 참고)
 */
import { onRequestGet as attendeesGet } from '../functions/api/attendees.js';
import { onRequestPost as rsvpPost } from '../functions/api/rsvp.js';

const ROUTES = {
  '/api/attendees': { GET: attendeesGet, allow: 'GET, OPTIONS' },
  '/api/rsvp': { POST: rsvpPost, allow: 'POST, OPTIONS' }
};

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    const route = ROUTES[pathname];

    if (route) {
      const handler = route[request.method];
      if (handler) return handler({ request, env, ctx });

      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: { 'Allow': route.allow } });
      }
      return json({ ok: false, error: `${route.allow.split(',')[0]} 메서드만 사용할 수 있습니다.` },
        405, { 'Allow': route.allow });
    }

    // /api/ 로 시작하는데 없는 주소면 JSON 으로 404 를 돌려줍니다.
    if (pathname.startsWith('/api/')) {
      return json({ ok: false, error: '없는 API 주소입니다.' }, 404);
    }

    return env.ASSETS.fetch(request);
  }
};

function json(data, status, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders }
  });
}
