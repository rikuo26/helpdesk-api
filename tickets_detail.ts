import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from "@azure/functions";
import { corsHeaders } from "../common/cors";
import { withPool } from "../common/sql";
import * as sql from "mssql";

app.http("tickets_detail", {
  route: "tickets/{id:int}",
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (req.method === "OPTIONS") {
      return { status: 200, headers: corsHeaders(req, "GET,OPTIONS") };
    }

    const id = parseInt(String((req.params as any).id), 10);
    if (!Number.isInteger(id)) {
      return { status: 400, headers: corsHeaders(req, "GET,OPTIONS"), body: "bad id" };
    }

    try {
      const data = await withPool(async (pool) => {
        const ticket = await pool.request().input("id", sql.Int, id).query(`
          SELECT Id, Title, Body, Status, CreatedByUpn, CreatedAt, LastUpdatedAt
          FROM dbo.Tickets WHERE Id=@id
        `);
        const replies = await pool.request().input("id", sql.Int, id).query(`
          SELECT Id, TicketId, AgentUpn, Body, CreatedAt
          FROM dbo.TicketReplies WHERE TicketId=@id ORDER BY Id ASC
        `);
        const updates = await pool.request().input("id", sql.Int, id).query(`
          SELECT Id, TicketId, AuthorUpn, Kind, Message, NewStatus, CreatedAt
          FROM dbo.TicketUpdates WHERE TicketId=@id ORDER BY Id ASC
        `);
        return {
          ticket: ticket.recordset?.[0] ?? null,
          replies: replies.recordset ?? [],
          updates: updates.recordset ?? [],
        };
      });

      return {
        status: data.ticket ? 200 : 404,
        headers: { ...corsHeaders(req, "GET,OPTIONS"), "Content-Type": "application/json" },
        body: JSON.stringify(data),
      };
    } catch (e) {
      ctx.error("GET /tickets/{id} failed", e as any);
      return {
        status: 500,
        headers: { ...corsHeaders(req, "GET,OPTIONS"), "Content-Type": "application/json" },
        body: JSON.stringify({ error: "detail_failed" }),
      };
    }
  },
});
