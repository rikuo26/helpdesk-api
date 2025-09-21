export type Principal = { upn?: string; roles?: string[] };

/** EasyAuthのクレームを読む（HttpRequest/Fetch どちらでもOK） */
export function parseEasyAuth(req: { headers?: { get?: (k: string) => string | undefined } } | any): Principal {
  try {
    const raw = typeof req?.headers?.get === 'function'
      ? (req.headers.get('x-ms-client-principal') || '').trim()
      : '';
    if (!raw) return {};
    const json = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    const claims = (json.claims || []) as Array<{ typ: string; val: string }>;
    const upn = claims.find(c => c.typ.endsWith('/name') || c.typ.endsWith('/upn'))?.val;
    const roles = claims.filter(c => c.typ === 'roles' || c.typ.endsWith('/role')).map(c => c.val);
    return { upn, roles };
  } catch { return {}; }
}

export function requireAgent(p: Principal) {
  if (!p.roles?.includes('Agent')) throw new Error('FORBIDDEN');
}

/** credentials: 'include' に対応するCORSヘッダ（Origin固定） */
export function corsHeaders(req: { headers?: { get?: (k: string) => string | undefined } } | any, methods: string) {
  const origin = (typeof req?.headers?.get === 'function' ? (req.headers.get('origin') || '') : '').trim();
  const allowList = (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const allowOrigin = allowList.includes(origin) ? origin : (allowList[0] || 'null');

  return {
    'Access-Control-Allow-Origin': allowOrigin,      // '*' は不可
    'Access-Control-Allow-Credentials': 'true',      // 必須
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': methods,
    'Vary': 'Origin'
  };
}
