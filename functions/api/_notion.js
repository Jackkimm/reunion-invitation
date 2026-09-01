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
/**
 * 참석 여부로 저장할 수 있는 값.
 * ⚠️ public/assets/js/config.js 의 statuses[].value 와 똑같이 맞춰야 합니다.
 * 이 목록에 없는 값이 노션에 들어 있으면(예전 응답 등) 화면에는 "기타" 로 보입니다.
 */
export const STATUSES = ['축구부터', '저녁부터', '뒷풀이부터', '불참'];
export const STATUS_OTHER = '기타';

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

/** 속성 종류를 한국어로 (오류 안내에 씁니다) */
const TYPE_KO = {
  title: '제목', select: '선택', status: '상태', rich_text: '텍스트',
  multi_select: '다중 선택', number: '숫자', date: '날짜', checkbox: '체크박스',
  people: '사람', files: '파일', url: 'URL', email: '이메일', phone_number: '전화번호'
};

/**
 * DB 의 실제 속성 이름을 찾아냅니다.
 * ─────────────────────────────────────────────
 * 사람이 만든 표라서 이름이 조금씩 다를 수 있으므로 이렇게 찾습니다.
 *   1) 이름이 정확히(공백·대소문자 무시) 같고 종류도 맞는 속성
 *   2) 없으면, 그 종류의 속성이 DB 에 딱 하나뿐일 때 그것을 씁니다
 *      (예: "참석여부" 대신 "상태" 라고 지어도 선택 속성이 하나뿐이면 인식)
 * 그래도 못 찾으면 "무엇이 없고 무엇이 있는지" 를 적어 오류를 냅니다.
 *
 * "참석여부" 는 선택(Select) 뿐 아니라 상태(Status) 로 만들었어도 동작합니다.
 */
export async function resolveProps(cfg) {
  const db = await notion(cfg, `/databases/${cfg.dbId}`);
  const entries = Object.entries(db.properties || {})
    .map(([name, prop]) => ({ name, type: prop.type }));

  const pick = (wanted, types) => {
    const exact = entries.find((e) => types.includes(e.type) && sameKey(e.name, wanted));
    if (exact) return exact;
    const sameType = entries.filter((e) => types.includes(e.type));
    return sameType.length === 1 ? sameType[0] : null;   // 후보가 하나뿐일 때만 자동 인식
  };

  const found = {
    name: pick(cfg.props.name, ['title']),
    status: pick(cfg.props.status, ['select', 'status']),
    message: pick(cfg.props.message, ['rich_text'])
  };

  const missing = [];
  if (!found.name) missing.push(`${cfg.props.name}(제목)`);
  if (!found.status) missing.push(`${cfg.props.status}(선택)`);
  if (!found.message) missing.push(`${cfg.props.message}(텍스트)`);

  if (missing.length) {
    const have = entries.length
      ? entries.map((e) => `${e.name}(${TYPE_KO[e.type] || e.type})`).join(', ')
      : '(속성이 하나도 없습니다)';
    throw new HttpError(400,
      `Notion DB 에 이 속성이 없습니다 → ${missing.join(', ')} / ` +
      `지금 DB 에 있는 속성 → ${have} / ` +
      '노션에서 표 오른쪽 끝 + 버튼으로 속성을 추가하거나, 이름을 위와 똑같이 바꿔주세요.');
  }

  return {
    name: found.name.name,
    status: found.status.name,
    statusType: found.status.type,   // 'select' 또는 'status'
    message: found.message.name
  };
}

/** 공백·대소문자를 무시하고 이름이 같은지 ("참석 여부" == "참석여부") */
function sameKey(a, b) {
  return String(a).replace(/\s+/g, '').toLowerCase() === String(b).replace(/\s+/g, '').toLowerCase();
}

/** Notion 페이지(행) 하나를 화면에서 쓰기 좋은 형태로 변환 */
export function toAttendee(page, props) {
  const p = page.properties || {};
  const name = plainText(p[props.name] && p[props.name].title);
  const cell = p[props.status] || {};
  const chosen = cell.select || cell.status;   // 선택(Select) / 상태(Status) 둘 다 지원
  const status = chosen && STATUSES.includes(chosen.name) ? chosen.name : STATUS_OTHER;
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
