import type { SessionState } from "./types";

export interface SessionStore {
  get(id: string): Promise<SessionState | null>;
  put(state: SessionState): Promise<void>;
  delete(id: string): Promise<void>;
  /** Atomically removes the pending confirmation if the token matches. Single use. */
  consumeToken(id: string, token: string, now: number): Promise<SessionState | null>;
}

function consume(state: SessionState | null, token: string, now: number): SessionState | null {
  if (!state || !state.pending) return null;
  if (state.pending.token !== token || state.pending.expiresAt < now) return null;
  return state;
}

/** In-memory store for tests and local development. */
export class MemoryStore implements SessionStore {
  map = new Map<string, SessionState>();
  constructor(private now: () => number = () => Date.now()) {}
  async get(id: string) {
    const s = this.map.get(id);
    if (!s) return null;
    if (s.expiresAt < this.now()) {
      this.map.delete(id);
      return null;
    }
    return structuredClone(s);
  }
  async put(state: SessionState) {
    this.map.set(state.id, structuredClone(state));
  }
  async delete(id: string) {
    this.map.delete(id);
  }
  async consumeToken(id: string, token: string, now: number) {
    const s = this.map.get(id) ?? null;
    const ok = consume(s, token, now);
    if (!ok) return null;
    const pending = ok.pending!;
    ok.pending = undefined;
    this.map.set(id, ok);
    return structuredClone({ ...ok, pending });
  }
}

/**
 * One Durable Object per conversation, created in the EU jurisdiction. Data is deleted with
 * an alarm at expiresAt (max 24 h) or when the patient ends the chat.
 */
export class SessionDO {
  constructor(private state: DurableObjectState) {}

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const storage = this.state.storage;
    if (req.method === "GET") {
      const s = (await storage.get<SessionState>("s")) ?? null;
      if (s && s.expiresAt < Date.now()) {
        await storage.deleteAll();
        return Response.json(null);
      }
      return Response.json(s);
    }
    if (req.method === "PUT") {
      const s = (await req.json()) as SessionState;
      await storage.put("s", s);
      await storage.setAlarm(s.expiresAt);
      return new Response(null, { status: 204 });
    }
    if (req.method === "DELETE") {
      await storage.deleteAll();
      await storage.deleteAlarm();
      return new Response(null, { status: 204 });
    }
    if (req.method === "POST" && url.pathname === "/consume") {
      const { token, now } = (await req.json()) as { token: string; now: number };
      const s = (await storage.get<SessionState>("s")) ?? null;
      const ok = consume(s, token, now);
      if (!ok) return Response.json(null);
      const pending = ok.pending!;
      ok.pending = undefined;
      await storage.put("s", ok);
      return Response.json({ ...ok, pending });
    }
    return new Response("not found", { status: 404 });
  }

  async alarm() {
    await this.state.storage.deleteAll();
  }
}

export class DurableStore implements SessionStore {
  constructor(
    private ns: DurableObjectNamespace,
    private jurisdiction: "eu" | null = "eu",
  ) {}
  private stub(id: string) {
    const ns = this.jurisdiction ? this.ns.jurisdiction(this.jurisdiction) : this.ns;
    return ns.get(ns.idFromName(id));
  }
  async get(id: string) {
    const r = await this.stub(id).fetch("https://session/", { method: "GET" });
    return (await r.json()) as SessionState | null;
  }
  async put(state: SessionState) {
    await this.stub(state.id).fetch("https://session/", { method: "PUT", body: JSON.stringify(state) });
  }
  async delete(id: string) {
    await this.stub(id).fetch("https://session/", { method: "DELETE" });
  }
  async consumeToken(id: string, token: string, now: number) {
    const r = await this.stub(id).fetch("https://session/consume", { method: "POST", body: JSON.stringify({ token, now }) });
    return (await r.json()) as SessionState | null;
  }
}
