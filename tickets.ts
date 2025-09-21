import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import * as sql from "mssql";
import { corsHeaders, readJson } from "./common/cors";
import { withPool } from "./common/sql";


/** /api/tickets : GET(一覧), POST(作成), OPTIONS */
app.http("tickets", {
  route: "tickets",
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {

    // --- CORS Preflight ---
    if (req.method === "OPTIONS") {
      return { status: 200, headers: corsHeaders(req, "GET,POST,OPTIONS") };
    }

    // --- 一覧 GET ---
    if (req.method === "GET") {
      try {
        const rows = await withPool(async (pool) => {
          const r = await pool.request().query(`
            SELECT TOP(100)
              Id, Title, Body, Status, CreatedByUpn, CreatedAt, LastUpdatedAt
            FROM dbo.Tickets
            ORDER BY Id DESC
          `);
          return r.recordset ?? [];
        });
        return {
          status: 200,
          headers: { ...corsHeaders(req, "GET,POST,OPTIONS"), "Content-Type": "application/json" },
          body: JSON.stringify(rows),
        };
      } catch (e) {
        ctx.error("GET /tickets failed", e as any);
        return {
          status: 500,
          headers: { ...corsHeaders(req, "GET,POST,OPTIONS"), "Content-Type": "application/json" },
          body: JSON.stringify({ error: "list_failed" }),
        };
      }
    }

    // --- 作成 POST ---
    if (req.method === "POST") {
      // 1) JSONパースエラーは 400 にする（原因切り分け）
      let payload: { title?: string; body?: string };
      try {
        payload = await readJson<{ title?: string; body?: string }>(req);
      } catch {
        return {
          status: 400,
          headers: { ...corsHeaders(req, "GET,POST,OPTIONS"), "Content-Type": "application/json" },
          body: JSON.stringify({ ok: false, error: "invalid_json" }),
        };
      }
      if (!payload.title || !payload.body) {
        return {
          status: 400,
          headers: { ...corsHeaders(req, "GET,POST,OPTIONS"), "Content-Type": "application/json" },
          body: JSON.stringify({ ok: false, error: "bad_request" }),
        };
      }

      try {
        // 2) NVARCHAR の長さを明示（タイトルは 200、本文は MAX）
        const newId = await withPool(async (pool) => {
          const res = await pool
            .request()
            .input("title", sql.NVarChar(200), payload.title)
            .input("body", sql.NVarChar(sql.MAX), payload.body)
            .query(`
              INSERT INTO dbo.Tickets (Title, Body, Status, CreatedByUpn)
              OUTPUT INSERTED.Id
              VALUES (@title, @body, 'open', NULL)
            `);
          return res.recordset?.[0]?.Id as number;
        });

        return {
          status: 201,
          headers: { ...corsHeaders(req, "GET,POST,OPTIONS"), "Content-Type": "application/json" },
          body: JSON.stringify({ ok: true, id: newId }),
        };
      } catch (e: any) {
        // 3) 例外内容をログに出す（Portal/CLI のログで原因が分かる）
        ctx.error("POST /tickets failed", { message: e?.message, code: e?.code, number: e?.number, stack: e?.stack });
        return {
          status: 500,
          headers: { ...corsHeaders(req, "GET,POST,OPTIONS"), "Content-Type": "application/json" },
          body: JSON.stringify({ ok: false, error: "post_failed" }),
        };
      }
    }

    // --- その他メソッド ---
    return { status: 405, headers: corsHeaders(req, "GET,POST,OPTIONS") };
  },
});
