import type { Artifact } from "../types/artifact.js";
import type { ProjectInitPlan } from "../types/plan.js";
import type { Session, SessionConfig, SessionMessage } from "../types/session.js";

const DEFAULT_CONFIG: SessionConfig = {
  ttlMs: 60 * 60 * 1000,
  maxTurns: 50,
  maxSessions: 128,
};

export class SessionManager {
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly config: SessionConfig = DEFAULT_CONFIG,
    private readonly now: () => number = Date.now,
  ) {}

  get size(): number {
    return this.sessions.size;
  }

  get(chatId: string): Session | undefined {
    const session = this.sessions.get(chatId);
    if (!session) return undefined;
    if (this.isExpired(session)) {
      this.sessions.delete(chatId);
      return undefined;
    }
    return session;
  }

  getOrCreate(chatId: string): Session {
    const existing = this.get(chatId);
    if (existing) {
      existing.lastActiveAt = this.isoNow();
      return existing;
    }

    const session: Session = {
      sessionId: `feishu:${chatId}`,
      chatId,
      createdAt: this.isoNow(),
      lastActiveAt: this.isoNow(),
      messages: [],
      plans: [] as ProjectInitPlan[],
      artifacts: [] as Artifact[],
      turnCount: 0,
    };
    this.sessions.set(chatId, session);
    this.evictOverflow();
    return session;
  }

  touch(chatId: string): void {
    const session = this.get(chatId);
    if (session) session.lastActiveAt = this.isoNow();
  }

  addMessage(chatId: string, message: SessionMessage): Session {
    const session = this.getOrCreate(chatId);
    session.messages.push(message);
    session.turnCount++;
    session.lastActiveAt = this.isoNow();
    const maxMessages = Math.max(1, this.config.maxTurns * 2);
    if (session.messages.length > maxMessages) {
      session.messages.splice(0, session.messages.length - maxMessages);
    }
    return session;
  }

  private isExpired(session: Session): boolean {
    return this.now() - Date.parse(session.lastActiveAt) > this.config.ttlMs;
  }

  private evictOverflow(): void {
    while (this.sessions.size > this.config.maxSessions) {
      const oldest = [...this.sessions.entries()].sort((a, b) => Date.parse(a[1].lastActiveAt) - Date.parse(b[1].lastActiveAt))[0];
      if (!oldest) return;
      this.sessions.delete(oldest[0]);
    }
  }

  private isoNow(): string {
    return new Date(this.now()).toISOString();
  }
}
