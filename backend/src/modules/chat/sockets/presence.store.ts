// In-memory presence: how many sockets each user has open, with a grace period before "offline".
// Single server instance only; move the counters to Redis if the backend ever runs on several.
export class PresenceStore {
  private counts = new Map<string, number>();
  private pending = new Map<string, NodeJS.Timeout>();

  constructor(private readonly graceMs = 5_000) {}

  /** Returns true only when the user really came online (not a quick reconnect inside the grace period). */
  connect(userId: string): boolean {
    const timer = this.pending.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.pending.delete(userId);
    }
    const next = (this.counts.get(userId) ?? 0) + 1;
    this.counts.set(userId, next);
    return next === 1 && !timer;
  }

  /** When the LAST device leaves, onOffline runs after the grace period unless the user reconnects first. */
  disconnect(userId: string, onOffline: () => void): void {
    const current = this.counts.get(userId);
    if (!current) return; // unknown socket: nothing to undo
    if (current > 1) {
      this.counts.set(userId, current - 1);
      return;
    }
    this.counts.delete(userId);

    const timer = setTimeout(() => {
      this.pending.delete(userId);
      onOffline();
    }, this.graceMs);
    timer.unref(); // must never keep the process alive on shutdown
    this.pending.set(userId, timer);
  }

  /** Still "online" during the grace period, because nobody was told otherwise. */
  isOnline(userId: string): boolean {
    return this.counts.has(userId) || this.pending.has(userId);
  }
}