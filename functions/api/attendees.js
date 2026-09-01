/**
 * GET /api/attendees
 * Notion DB 를 읽어 참석자 명단과 인원 수를 돌려줍니다.
 *
 * 응답 예시
 * {
 *   "ok": true,
 *   "counts": { "참석": 12, "불참": 3, "미정": 5, "total": 20 },
 *   "attendees": [ { "name":"김한빛", "status":"참석", "message":"보고싶다", "updatedAt":"..." } ]
 * }
 */
import { readEnv, resolveProps, queryAll, toAttendee, json, fail, STATUSES } from './_notion.js';

export async function onRequestGet({ env }) {
  try {
    const cfg = readEnv(env);
    const props = await resolveProps(cfg);

    const rows = await queryAll(cfg, {
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }]
    });

    const attendees = rows
      .map((row) => toAttendee(row, props))
      .filter((a) => a.name)                 // 이름이 빈 행은 명단에서 제외
      .map(({ id, ...rest }) => rest);       // Notion 페이지 ID 는 내보내지 않습니다

    const counts = { total: attendees.length };
    STATUSES.forEach((s) => { counts[s] = 0; });
    attendees.forEach((a) => { counts[a.status] += 1; });

    return json({ ok: true, counts, attendees });
  } catch (err) {
    return fail(err);
  }
}

/** 브라우저 사전 요청(preflight) 대응. 다른 메서드는 Pages 가 자동으로 405 를 돌려줍니다. */
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'Allow': 'GET, OPTIONS' } });
}
