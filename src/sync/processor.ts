import type { ProductId, SourceVersion } from "../contracts/types.js";
import type { ProductUpdateEvent } from "./events.js";

export interface DerivedStoreSyncTarget {
  readonly name: string;
  getCurrentVersion(productId: ProductId): Promise<SourceVersion | null>;
  applyUpdate(event: ProductUpdateEvent): Promise<void>;
}

export type SyncStatus = "applied" | "skipped_duplicate" | "failed";

export interface SyncLogEntry {
  eventId: string;
  targetName: string;
  productId: ProductId;
  version: SourceVersion;
  status: SyncStatus;
  attempts: number;
  lastAttemptAt: string;
  error?: string | undefined;
}

export class SyncManager {
  private readonly logMap = new Map<string, SyncLogEntry>();
  private readonly eventStore = new Map<string, ProductUpdateEvent>();
  private readonly targets = new Map<string, DerivedStoreSyncTarget>();

  registerTarget(target: DerivedStoreSyncTarget): void {
    this.targets.set(target.name, target);
  }

  getTarget(name: string): DerivedStoreSyncTarget | undefined {
    return this.targets.get(name);
  }

  private getLogKey(eventId: string, targetName: string): string {
    return `${eventId}::${targetName}`;
  }

  async dispatchEvent(
    event: ProductUpdateEvent,
    target: DerivedStoreSyncTarget,
  ): Promise<SyncLogEntry> {
    this.eventStore.set(event.eventId, event);
    const key = this.getLogKey(event.eventId, target.name);
    const existing = this.logMap.get(key);
    const attempts = (existing?.attempts ?? 0) + 1;
    const now = new Date().toISOString();

    try {
      // 1. Idempotency Check: check target store's current applied version
      const currentVersion = await target.getCurrentVersion(event.productId);

      if (currentVersion !== null && currentVersion >= event.version) {
        // Already at or ahead of this version -> skip duplicate application
        const logEntry: SyncLogEntry = {
          eventId: event.eventId,
          targetName: target.name,
          productId: event.productId,
          version: event.version,
          status: "skipped_duplicate",
          attempts,
          lastAttemptAt: now,
        };
        this.logMap.set(key, logEntry);
        return logEntry;
      }

      // 2. Apply update to the derived store
      await target.applyUpdate(event);

      const logEntry: SyncLogEntry = {
        eventId: event.eventId,
        targetName: target.name,
        productId: event.productId,
        version: event.version,
        status: "applied",
        attempts,
        lastAttemptAt: now,
      };
      this.logMap.set(key, logEntry);
      return logEntry;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const logEntry: SyncLogEntry = {
        eventId: event.eventId,
        targetName: target.name,
        productId: event.productId,
        version: event.version,
        status: "failed",
        attempts,
        lastAttemptAt: now,
        error: errorMessage,
      };
      this.logMap.set(key, logEntry);
      return logEntry;
    }
  }

  async retryFailedUpdate(eventId: string, targetName: string): Promise<SyncLogEntry> {
    const event = this.eventStore.get(eventId);
    if (!event) {
      throw new Error(`Event "${eventId}" not found in event store.`);
    }

    const target = this.targets.get(targetName);
    if (!target) {
      throw new Error(`Target "${targetName}" is not registered.`);
    }

    return this.dispatchEvent(event, target);
  }

  getFailedUpdates(): SyncLogEntry[] {
    return Array.from(this.logMap.values()).filter((log) => log.status === "failed");
  }

  getLog(eventId: string, targetName: string): SyncLogEntry | undefined {
    return this.logMap.get(this.getLogKey(eventId, targetName));
  }

  getAllLogs(): SyncLogEntry[] {
    return Array.from(this.logMap.values());
  }
}
