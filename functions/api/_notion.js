/**
 * Notion API 공용 헬퍼
 * ─────────────────────────────────────────────
 * 파일명이 밑줄(_)로 시작하므로 이 파일은 API 주소로 노출되지 않고,
 * 같은 폴더의 attendees.js / rsvp.js 에서 불러다 씁니다.
 *
 * 필요한 환경변수
 *   NOTION_TOKEN  : Notion integration 의 Internal Integration Secret (ntn_... 또는 secret_...)
 *   NOTION_DB_ID  : 동창회 명단 데이터베이스 ID (32자리)
 * 선택 환경변수 (DB 속성 이름을 다르게 만들었을 때만)
 *   NOTION_PROP_NAME    기본값 "이름"
 *   NOTION_PROP_STATUS  기본값 "참석여부"
 *   NOTION_PROP_MESSAGE 기본값 "한마디"
 */

export const NOTION_VERSION = '2022-06-28';
export const STATUSES = ['참석', '불참', '미정'];

export const MAX_NAME = 30;
export const MAX_MESSAGE = 200;

/** 환경변수를 읽고, 빠진 값이 있으면 사람이 읽을 수 있는 오류를 냅니다. */
export function readEnv(env) {
  const token = (env.NOTION_TOKEN || '').trim();
  const dbId = normalizeDbId(env.NOTION_DB_ID || '');

  if (!token || !dbId) {
    throw new HttpError(500,
      '서버 설정이 끝나지 않았습니다. Cloudflare 대시보드 → Settings → Variables and Secrets 에 NOTION_TOKEN 과 NOTION_DB_ID 를 등록한 뒤 다시 배포해 주세요.');
  }

  return {
    token,
    dbId,
    props: {
      name: env.NOTION_PROP_NAME || '이름',
      status: env.NOTION_PROP_STATUS || '참석여부',
      message: env.NOTION_PROP_MESSAGE || '한마디'
    }
  };
}

/**
 * DB ID 다듬기.
 * 노션 "링크 복사" 로 얻은 주소를 그대로 붙여넣어도 동작하도록,
 * ?v=(보기 ID) 같은 쿼리스트링을 먼저 떼어낸 뒤 주소 끝의 32자리를 씁니다.
 *   https://www.notion.so/Alumni-1a2b...ff?v=9c8d...  →  1a2b...ff
 */
export function normalizeDbId(raw) {
  const path = String(raw).trim().split(/[?#]/)[0];

  // 하이픈이 들어간 UUID 형태 (8-4-4-4-12)
  const uuid = path.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  if (uuid) return uuid[0].replace(/-/g, '');

  const hit = path.match(/[0-9a-fA-F]{32}/g);
  return hit && hit.length ? hit[hit.length - 1] : '';
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Notion REST API 호출 공통 래퍼 */
export async function notion(cfg, path, init = {}) {
  let res;
  try {
    res = await fetch('https://api.notion.com/v1' + path, {
      ...init,
      headers: {
        'Authorization': `Bearer ${cfg.token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
        ...(init.headers || {})
      }
    });
  } catch (e) {
    throw new HttpError(502, 'Notion 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(res.status === 404 ? 500 : res.status, notionMessage(res.status, data));
  return data;
}

/** Notion 오류를 초보자가 고칠 수 있는 안내 문구로 바꿔줍니다. */
function notionMessage(status, data) {
  const code = data && data.code;
  if (status === 401) return 'Notion 토큰이 올바르지 않습니다. NOTION_TOKEN 값을 다시 확인해 주세요.';
  if (status === 404 || code === 'object_not_found') {
    return '데이터베이스를 찾지 못했습니다. NOTION_DB_ID 가 맞는지, 그리고 DB 페이지에서 integration 을 "연결"했는지 확인해 주세요.';
  }
  if (status === 400 && data && data.message && /property|select/i.test(data.message)) {
    return 'Notion DB 속성 이름이 다릅니다. 이름(제목) / 참석여부(선택) / 한마디(텍스트) 속성이 있는지 확인해 주세요. (' + data.message + ')';
  }
  if (status === 429) return '요청이 잠시 많습니다. 몇 초 뒤에 다시 시도해 주세요.';
  return (data && data.message) || 'Notion 요청이 실패했습니다. (HTTP ' + status + ')';
}

/** 데이터베이스의 모든 행을 (페이지네이션까지 처리해서) 가져옵니다. */
export async function queryAll(cfg, body = {}) {
  const rows = [];
  let cursor;

  do {
    const page = await notion(cfg, `/databases/${cfg.dbId}/query`, {
      method: 'POST',
      body: JSON.stringify({ page_size: 100, ...body, ...(cursor ? { start_cursor: cursor } : {}) })
    });
    rows.push(...(page.results || []));
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor && rows.length < 1000);

  return rows;
}

/** Notion 페이지(행) 하나를 화면에서 쓰기 좋은 형태로 변환 */
export function toAttendee(page, props) {
  const p = page.properties || {};
  const name = plainText(p[props.name] && p[props.name].title);
  const select = p[props.status] && p[props.status].select;
  const status = select && STATUSES.includes(select.name) ? select.name : '미정';
  const message = plainText(p[props.message] && p[props.message].rich_text);

  return {
    id: page.id,
    name,
    status,
    message,
    updatedAt: page.last_edited_time || page.created_time || null
  };
}

function plainText(arr) {
  if (!Array.isArray(arr)) return '';
  return arr.map((t) => t.plain_text || '').join('').trim();
}

/** 동일인 판정용: 공백 제거 + 소문자 */
export function normalizeName(name) {
  return String(name || '').replace(/\s+/g, '').toLowerCase();
}

/** 사용자가 넣은 값을 정리(길이 제한 포함) */
export function cleanName(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ').slice(0, MAX_NAME);
}

export function cleanMessage(raw) {
  return String(raw || '').replace(/\r\n/g, '\n').trim().slice(0, MAX_MESSAGE);
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders
    }
  });
}

export function fail(err) {
  const status = err instanceof HttpError ? err.status : 500;
  const message = err instanceof HttpError ? err.message : '알 수 없는 오류가 발생했습니다.';
  return json({ ok: false, error: message }, status);
}
