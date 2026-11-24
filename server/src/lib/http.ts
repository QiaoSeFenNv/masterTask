import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "../config.ts";

export type Ctx = {
  req: IncomingMessage;
  res: ServerResponse;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  userId: number;
  openid: string;
};

export type Handler = (ctx: Ctx) => Promise<unknown> | unknown;

export function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

export function fail(res: ServerResponse, status: number, code: string, message: string): void {
  sendJson(res, status, { ok: false, error: { code, message } });
}

export function ok(res: ServerResponse, data: unknown): void {
  sendJson(res, 200, { ok: true, data });
}

export function readBody(req: IncomingMessage, limit = 64 * 1024): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("BODY_TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) return resolve(undefined);
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error("INVALID_JSON"));
      }
    });
    req.on("error", reject);
  });
}

export function cors(res: ServerResponse): void {
  if (!config.isDev) return;
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type, authorization");
  res.setHeader("access-control-allow-methods", "GET, POST, PATCH, OPTIONS");
}