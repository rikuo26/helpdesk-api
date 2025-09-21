import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from "@azure/functions";
import { corsHeaders, readJson } from "../common/cors";
import { withPool } from "../common/sql";
import * as sql from "mssql";

app.http("tickets_reply", {
  route: "tickets/{id:int}/reply",
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous", // 認証を付ける場合は function などに変更
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (req.method === "OPTIONS") {
      return { status: 200, headers: corsHeaders(req, "POST,OPTIONS") };
    }

    const id = parseInt(String((req.params as any).id), 10);
    if (!Number.isInteger(id)) {
      return { status: 400, headers: corsHeaders(req, "POST,OPTIONS"), body: "bad id" };
    }

    try {
      const body = await readJson<{ body?: string }>(req);
      if (!body.body) {
        return {
          status: 400,
          headers: { ...corsHeaders(req, "POST,OPTIONS"), "Content-Type": "application/json" },
          body: JSON.stringify({ ok: false, error: "bad_request" }),
        };
      }

      await withPool(async (pool) => {
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
          await new sql.Request(tx)
            .input("id", sql.Int, id)
            .input("body", sql.NVarChar, body.body)
            .query(`
              INSERT INTO dbo.TicketReplies (TicketId, AgentUpn, Body)
              VALUES (@id, NULL, @body);
            `);

          await new sql.Request(tx)
            .input("id", sql.Int, id)
            .query(`UPDATE dbo.Tickets SET LastUpdatedAt=SYSUTCDATETIME() WHERE Id=@id;`);

          await tx.commit();
        } catch (e) {
          await tx.rollback();
          throw e;
        }
      });

      return {
        status: 201,
        headers: { ...corsHeaders(req, "POST,OPTIONS"), "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true }),
      };
    } catch (e) {
      ctx.error("POST /tickets/{id}/reply failed", e as any);
      return {
        status: 500,
        headers: { ...corsHeaders(req, "POST,OPTIONS"), "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "reply_failed" }),
      };
    }
  },
});
