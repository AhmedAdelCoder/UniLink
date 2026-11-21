import { getAcceptedContactIds } from "../repositories/connection.repository.js";
import { markUserOffline, markUserOnline } from "../repositories/presence.repository.js";
import { PresenceStore } from "./presence.store.js";
import { ServerEvents, userRoom, type ChatServer, type PresenceInfo } from "./chat.events.js";

// Ties the in-memory counters to the database and to the contacts' sockets.
// Presence is best effort: a failure here is logged and must never affect a connection.
export class PresenceService {
  constructor(
    private readonly io: ChatServer,
    private readonly store = new PresenceStore(),
  ) {}

  handleConnect(userId: string): void {
    // false = another device was already online, or a quick reconnect inside the grace period.
    if (!this.store.connect(userId)) return;
    this.run("online", async () => {
      await markUserOnline(userId);
      await this.notifyContacts({ userId, online: true, lastSeen: null });
    });
  }

  handleDisconnect(userId: string): void {
    this.store.disconnect(userId, () => this.run("offline", () => this.goOffline(userId)));
  }

  private async goOffline(userId: string): Promise<void> {
    const lastSeen = new Date();
    await markUserOffline(userId, lastSeen);

    // The user reconnected while the write was in flight: undo it and stay silent.
    if (this.store.isOnline(userId)) {
      await markUserOnline(userId);
      return;
    }
    await this.notifyContacts({ userId, online: false, lastSeen: lastSeen.toISOString() });
  }

  private async notifyContacts(info: PresenceInfo): Promise<void> {
    const contacts = await getAcceptedContactIds(info.userId);
    if (contacts.length === 0) return;
    this.io.to(contacts.map(userRoom)).emit(ServerEvents.PresenceUpdate, info);
  }

  private run(label: string, task: () => Promise<void>): void {
    task().catch((err) => console.error(`Presence ${label} failed:`, err));
  }
}