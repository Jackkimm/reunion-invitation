/**
 * POST /api/rsvp
 * 본문: { "name": "김한빛", "status": "참석" | "불참" | "미정", "message": "한마디(선택)" }
 *
 * 같은 이름이 이미 있으면 새 행을 만들지 않고 그 행을 수정합니다.
 * 응답: { ok:true, updated:true|false, attendee:{...} }
 */
import {
  readEnv, notion, queryAll, toAttendee, normalizeName,
  cleanName, cleanMessage, json, fail, HttpError, STATUSES, MAX_MESSAGE
} from './_notion.js';

export async function onRequestPost({ request, env }) {
  try {
    const cfg = readEnv(env);
    const body = await request.json().catch(() => {
      throw new HttpError(400, '요청 형식이 올바르지 않습니다.');
    });

    const name = cleanName(body.name);
    const status = String(body.status || '').trim();
    const message = cleanMessage(body.message);

    if (!name) throw new HttpError(400, '이름을 입력해 주세요.');
    if (!STATUSES.includes(status)) {
      throw new HttpError(400, '참석 여부는 참석 / 불참 / 미정 중에서 선택해 주세요.');
    }
    if (String(body.message || '').length > MAX_MESSAGE * 2) {
      throw new HttpError(400, `한마디는 ${MAX_MESSAGE}자까지 쓸 수 있습니다.`);
    }

    const existing = await findByName(cfg, name);
    const properties = buildProperties(cfg.props, name, status, message);

    let page;
    if (existing) {
      page = await notion(cfg, `/pages/${existing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties })
      });
    } else {
      page = await notion(cfg, '/pages', {
        method: 'POST',
        body: JSON.stringify({ parent: { database_id: cfg.dbId }, properties })
      });
    }

    const { id, ...attendee } = toAttendee(page, cfg.props);
    return json({ ok: true, updated: Boolean(existing), attendee });
  } catch (err) {
    return fail(err);
  }
}

/**
 * 같은 이름의 행 찾기.
 * 1) Notion 필터로 정확히 일치하는 이름을 먼저 찾고
 * 2) 없으면 전체를 훑어 공백·대소문자만 다른 이름("김 한빛" 등)까지 같은 사람으로 봅니다.
 */
async function findByName(cfg, name) {
  const exact = await queryAll(cfg, {
    filter: { property: cfg.props.name, title: { equals: name } },
    page_size: 10
  });
  if (exact.length) return exact[0];

  const key = normalizeName(name);
  const all = await queryAll(cfg, {});
  return all.find((row) => normalizeName(toAttendee(row, cfg.props).name) === key) || null;
}

function buildProperties(props, name, status, message) {
  return {
    [props.name]: { title: [{ text: { content: name } }] },
    [props.status]: { select: { name: status } },
    [props.message]: { rich_text: message ? [{ text: { content: message } }] : [] }
  };
}

/** 브라우저 사전 요청(preflight) 대응. 다른 메서드는 Pages 가 자동으로 405 를 돌려줍니다. */
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'Allow': 'POST, OPTIONS' } });
}
