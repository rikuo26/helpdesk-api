import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from "@azure/functions";
import { corsHeaders, readJson } from "../common/cors";
import { withPool } from "../common/sql";
import * as sql from "mssql";

type UpdatePayload = { kind?: "progress" | "status"; message?: string; newStatus?: string };

app.http("tickets_update", {
  route: "tickets/{id:int}/update",
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (req.method === "OPTIONS") {
      return { status: 200, headers: corsHeaders(req, "POST,OPTIONS") };
    }

    const id = parseInt(String((req.params as any).id), 10);
    if (!Number.isInteger(id)) {
      return { status: 400, headers: corsHeaders(req, "POST,OPTIONS"), body: "bad id" };
    }

    try {
      const body = await readJson<UpdatePayload>(req);
      if (!body.kind || (body.kind === "status" && !body.newStatus)) {
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
            .input("kind", sql.NVarChar, body.kind)
            .input("msg", sql.NVarChar, body.message ?? null)
            .input("newStatus", sql.NVarChar, body.newStatus ?? null)
            .query(`
              INSERT INTO dbo.TicketUpdates (TicketId, AuthorUpn, Kind, Message, NewStatus)
              VALUES (@id, NULL, @kind, @msg, @newStatus);
            `);

          if (body.kind === "status" && body.newStatus) {
            await new sql.Request(tx)
              .input("id", sql.Int, id)
              .input("newStatus", sql.NVarChar, body.newStatus)
              .query(`
                UPDATE dbo.Tickets
                  SET Status=@newStatus, LastUpdatedAt=SYSUTCDATETIME()
                WHERE Id=@id;
              `);
          } else {
            await new sql.Request(tx)
              .input("id", sql.Int, id)
              .query(`UPDATE dbo.Tickets SET LastUpdatedAt=SYSUTCDATETIME() WHERE Id=@id;`);
          }

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
      ctx.error("POST /tickets/{id}/update failed", e as any);
      return {
        status: 500,
        headers: { ...corsHeaders(req, "POST,OPTIONS"), "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "update_failed" }),
      };
    }
  },
});
