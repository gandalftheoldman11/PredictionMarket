"use client";

import { useEffect, useRef } from "react";
import { z } from "zod";
import {
  compareExactSequences,
  exactSequence,
  isNextExactSequence,
} from "../exactSequence.mjs";
import { realtimeEndpoint } from "./realtimeEndpoint.ts";

export function marketRoom(market: string, bracket: string): string {
  const bytes = new TextEncoder().encode(JSON.stringify([market, bracket]));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `market:${btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")}`;
}

const sequenceSchema = z.string().refine((value) => {
  try {
    exactSequence(value);
    return true;
  } catch {
    return false;
  }
}, "sequence must be an exact nonnegative decimal string");

const messageSchema = z
  .object({
    id: z.number().int().nonnegative().optional(),
    type: z.string(),
    sid: z.number().int().nonnegative().optional(),
    room: z.string().optional(),
    sequence: sequenceSchema.optional(),
    retry_after_ms: z.number().int().nonnegative().optional(),
    authenticated: z.boolean().optional(),
    resumed: z.boolean().optional(),
    timestamp_ms: z.union([z.number().int().nonnegative(), sequenceSchema]).optional(),
    data: z.unknown().optional(),
  })
  .passthrough();

export type RealtimeMessage = z.infer<typeof messageSchema>;
export type RealtimeHandler = (message: RealtimeMessage) => void;
const accountRecoveryPageSchema = z.object({
  events: z.array(
    z.object({
      sequence: sequenceSchema,
      type: z.string(),
      timestampMs: sequenceSchema,
      data: z.unknown(),
    }),
  ),
  nextCursor: z.string().nullable(),
  resumeCursor: z.string(),
});
const eventBatchSchema = z.object({
  events: z.array(
    z.object({
      type: z.string(),
      data: z.unknown(),
    }),
  ),
});

export function expandRealtimeMessage(message: RealtimeMessage): RealtimeMessage[] {
  if (message.type !== "event_batch") return [message];
  const batch = eventBatchSchema.safeParse(message.data);
  if (!batch.success || batch.data.events.length === 0) return [];
  return batch.data.events.map((event) => ({
    ...message,
    type: event.type,
    data: event.data,
  }));
}

type AccountRecoveryEvent = z.infer<typeof accountRecoveryPageSchema>["events"][number];

export function expandAccountRecoveryEvent(
  event: AccountRecoveryEvent,
  room: string,
  sid: number | undefined,
  channels: string[],
): RealtimeMessage[] {
  const requested = new Set(channels);
  const logical: RealtimeMessage[] = [];
  const append = (type: string, data: unknown) => {
    logical.push({
      type,
      room,
      ...(sid === undefined ? {} : { sid }),
      sequence: event.sequence,
      timestamp_ms: event.timestampMs,
      data,
    });
  };
  if (requested.has(event.type)) append(event.type, event.data);
  if (
    event.type === "custody_restriction" &&
    !requested.has(event.type) &&
    requested.has("balance")
  ) {
    append(event.type, event.data);
  }
  if (
    (
      event.type === "fill" ||
      event.type === "settlement" ||
      event.type === "deposit_reversed" ||
      event.type === "deposit_restored"
    ) &&
    typeof event.data === "object" &&
    event.data !== null
  ) {
    const payload = event.data as Record<string, unknown>;
    if (requested.has("balance") && payload.cash !== undefined) {
      append("balance", payload.cash);
    }
    if (requested.has("position") && payload.position != null) {
      append("position", payload.position);
    } else if (requested.has("position") && payload.positions != null) {
      append("position", { positions: payload.positions });
    }
  }
  return logical;
}

const microsSchema = z.string().regex(/^\d+$/);
export const realtimeLevelSchema = z.object({
  price_micros: microsSchema,
  shares_micros: microsSchema,
});
export const orderbookSnapshotSchema = z.object({
  market: z.string(),
  bracket: z.string(),
  bids: z.array(realtimeLevelSchema),
  asks: z.array(realtimeLevelSchema),
  book_checksums: z.object({
    yes: z.string().regex(/^[0-9a-f]{64}$/),
    no: z.string().regex(/^[0-9a-f]{64}$/),
  }).optional(),
  books: z.record(
    z.string(),
    z.object({ bids: z.array(realtimeLevelSchema), asks: z.array(realtimeLevelSchema) }),
  ).optional(),
});
export const orderbookDeltaSchema = z.object({
  market: z.string(),
  bracket: z.string(),
  reason: z.string(),
  levels: z.array(
    realtimeLevelSchema.extend({
      side: z.enum(["bid", "ask"]),
      outcome: z.string().optional(),
    }),
  ),
});
export const marketLifecycleEventSchema = z
  .object({
    lifecycle: z.enum([
      "draft",
      "open",
      "cancel_only",
      "halted",
      "closed",
      "disputed",
      "resolved",
      "settled",
    ]),
  })
  .passthrough();
export const marketSnapshotSchema = z.object({
  status: z.enum([
    "draft",
    "open",
    "cancel_only",
    "halted",
    "closed",
    "disputed",
    "resolved",
    "settled",
  ]),
});
export const privateOrderEventSchema = z.object({
  order_id: z.string(),
  status: z.enum([
    "resting",
    "partially_filled",
    "filled",
    "cancelled",
    "expired",
    "rejected",
  ]),
});
export const tradeEventSchema = z.object({
  market: z.string(),
  bracket: z.string(),
  yes_price_micros: microsSchema,
  shares_micros: microsSchema,
  timestamp: z.number(),
});

type Listener = { channels: Set<string>; handler: RealtimeHandler };
type RoomState = {
  requestedRoom: string;
  actualRoom?: string;
  sid?: number;
  cursor?: string;
  accountResumeCursor?: string;
  accountResumeSequence?: string;
  recoveryGeneration: number;
  recoveryAttempt: number;
  activeRecoveryGeneration?: number;
  listeners: Set<Listener>;
  resyncTimer?: number;
};

export function privateSubscriptionNeedsRestRecovery(
  requestedRoom: string,
  cursor: string | undefined,
  resumed: boolean | undefined,
): boolean {
  return requestedRoom === "user" && cursor !== undefined && resumed === false;
}

export function privateCommandErrorRequiresReconnect(
  messageId: number,
  authenticationCommandId: number | undefined,
  requestedRoom: string | undefined,
): boolean {
  return messageId === authenticationCommandId || requestedRoom === "user";
}

export function subscriptionChangeAction(
  changed: boolean,
  protocolReady: boolean,
  socketOpen: boolean,
  subscribed: boolean,
  pending: boolean,
): "none" | "subscribe" | "resubscribe" {
  if (!changed || !protocolReady || !socketOpen) return "none";
  if (subscribed) return "resubscribe";
  return pending ? "none" : "subscribe";
}

export function subscriptionRequestCanBeSent(
  protocolReady: boolean,
  socketOpen: boolean,
  hasListeners: boolean,
  pending: boolean,
  recoveryInFlight: boolean,
): boolean {
  return protocolReady && socketOpen && hasListeners && !pending && !recoveryInFlight;
}

export function privateConnectionRequiresRestart(
  requireAuthentication: boolean,
  privateSocket: boolean,
  authenticationInFlight: boolean,
): boolean {
  return requireAuthentication && !privateSocket && !authenticationInFlight;
}

export function realtimeSubscriptionsReady(
  connectionReady: boolean,
  pendingSubscriptions: number,
  rooms: ReadonlyArray<{
    hasListeners: boolean;
    subscribed: boolean;
    resyncPending: boolean;
    recoveryInFlight: boolean;
  }>,
): boolean {
  const activeRooms = rooms.filter((room) => room.hasListeners);
  return (
    connectionReady &&
    pendingSubscriptions === 0 &&
    activeRooms.length > 0 &&
    activeRooms.every(
      (room) => room.subscribed && !room.resyncPending && !room.recoveryInFlight,
    )
  );
}

export function resetPrivateRecoveryState(
  room: Pick<
    RoomState,
    "cursor" | "actualRoom" | "accountResumeCursor" | "accountResumeSequence"
    | "recoveryGeneration" | "recoveryAttempt" | "activeRecoveryGeneration"
  >,
) {
  room.recoveryGeneration += 1;
  room.recoveryAttempt = 0;
  room.activeRecoveryGeneration = undefined;
  room.cursor = undefined;
  room.actualRoom = undefined;
  room.accountResumeCursor = undefined;
  room.accountResumeSequence = undefined;
}

export function invalidatePrivateRecoveryOnDisconnect(
  room: Pick<
    RoomState,
    "requestedRoom" | "recoveryGeneration" | "recoveryAttempt"
    | "activeRecoveryGeneration" | "resyncTimer"
  >,
  clearTimer: (timer: number) => void,
) {
  if (room.requestedRoom !== "user") return;
  room.recoveryGeneration += 1;
  room.recoveryAttempt = 0;
  room.activeRecoveryGeneration = undefined;
  if (room.resyncTimer !== undefined) {
    clearTimer(room.resyncTimer);
    room.resyncTimer = undefined;
  }
}

export function privateRecoveryRetryDelay(
  attempt: number,
  random = Math.random,
): number {
  const boundedAttempt = Math.max(0, Math.min(Math.trunc(attempt), 16));
  const cap = Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** boundedAttempt);
  return Math.floor(random() * cap);
}

const BASE_RETRY_MS = 500;
const MAX_RETRY_MS = 30_000;
export const REALTIME_STATUS_EVENT = "rl:realtime-status";

function emitRealtimeStatus(status: "idle" | "connecting" | "live" | "reconnecting" | "recovering") {
  window.dispatchEvent(new CustomEvent(REALTIME_STATUS_EVENT, { detail: status }));
}

class RealtimeClient {
  private socket?: WebSocket;
  private rooms = new Map<string, RoomState>();
  private sidRooms = new Map<number, RoomState>();
  private pendingRooms = new Map<number, { room: RoomState; channels: string }>();
  private nextCommand = 1;
  private reconnectAttempt = 0;
  private reconnectTimer?: number;
  private connectionGeneration = 0;
  private connecting = false;
  private privateSocket = false;
  private connectionToken?: string;
  private authCommand?: number;
  private cachedToken?: { token: string; expiresAt: number };
  private stableConnectionTimer?: number;
  private protocolReady = false;

  subscribe(room: string, channels: string[], handler: RealtimeHandler): () => void {
    let state = this.rooms.get(room);
    if (!state) {
      state = {
        requestedRoom: room,
        listeners: new Set(),
        recoveryGeneration: 0,
        recoveryAttempt: 0,
      };
      this.rooms.set(room, state);
    }
    const before = this.channels(state).join(",");
    const listener = { channels: new Set(channels), handler };
    state.listeners.add(listener);
    const changed = before !== this.channels(state).join(",");
    this.ensureConnected(room === "user");
    const action = subscriptionChangeAction(
      changed,
      this.protocolReady,
      this.socket?.readyState === WebSocket.OPEN,
      state.sid !== undefined,
      this.hasPendingSubscription(state),
    );
    if (action === "resubscribe") {
      this.resubscribe(state, false);
    } else if (action === "subscribe") {
      this.sendSubscribe(state);
    }

    return () => {
      const current = this.rooms.get(room);
      if (!current) return;
      const oldChannels = this.channels(current).join(",");
      current.listeners.delete(listener);
      if (current.listeners.size === 0) {
        this.unsubscribeRoom(current);
        this.rooms.delete(room);
      } else if (oldChannels !== this.channels(current).join(",")) {
        this.resubscribe(current, false);
      }
      if (this.rooms.size === 0) {
        this.disconnect();
      } else {
        this.emitLiveIfReady();
      }
    };
  }

  refreshAuthentication() {
    this.cachedToken = undefined;
    const privateRoom = this.rooms.get("user");
    if (privateRoom) {
      if (privateRoom.resyncTimer !== undefined) {
        window.clearTimeout(privateRoom.resyncTimer);
        privateRoom.resyncTimer = undefined;
      }
      resetPrivateRecoveryState(privateRoom);
      this.reconnectNow();
    }
  }

  private channels(room: RoomState): string[] {
    return [...new Set([...room.listeners].flatMap((listener) => [...listener.channels]))].sort();
  }

  private hasPendingSubscription(room: RoomState): boolean {
    return [...this.pendingRooms.values()].some((pending) => pending.room === room);
  }

  private activePendingSubscriptionCount(): number {
    const activeRooms = new Set(this.rooms.values());
    return [...this.pendingRooms.values()].filter(
      ({ room }) => activeRooms.has(room) && room.listeners.size > 0,
    ).length;
  }

  private emitLiveIfReady() {
    const privateRoom = this.rooms.get("user");
    const connectionReady =
      this.protocolReady &&
      this.socket?.readyState === WebSocket.OPEN &&
      this.authCommand === undefined &&
      (
        privateRoom === undefined ||
        privateRoom.listeners.size === 0 ||
        this.privateSocket
      );
    if (realtimeSubscriptionsReady(
      connectionReady,
      this.activePendingSubscriptionCount(),
      [...this.rooms.values()].map((room) => ({
        hasListeners: room.listeners.size > 0,
        subscribed: room.sid !== undefined,
        resyncPending: room.resyncTimer !== undefined,
        recoveryInFlight: room.activeRecoveryGeneration !== undefined,
      })),
    )) {
      emitRealtimeStatus("live");
    }
  }

  private endpoint(): string {
    return realtimeEndpoint(
      process.env.NEXT_PUBLIC_REALTIME_URL,
      window.location.href,
    );
  }

  private ensureConnected(requireAuthentication = false) {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
      if (privateConnectionRequiresRestart(
        requireAuthentication,
        this.privateSocket,
        this.connectionToken !== undefined || this.authCommand !== undefined,
      )) {
        this.reconnectNow();
      }
      return;
    }
    if (this.connecting) return;
    void this.connect();
  }

  private async connect() {
    if (this.rooms.size === 0 || this.connecting) return;
    this.connecting = true;
    emitRealtimeStatus(this.reconnectAttempt === 0 ? "connecting" : "reconnecting");
    const generation = ++this.connectionGeneration;
    let token: string | undefined;
    if (this.rooms.has("user")) {
      if (this.cachedToken && this.cachedToken.expiresAt > Date.now() / 1_000 + 30) {
        token = this.cachedToken.token;
      }
      try {
        if (!token) {
          const response = await fetch("/api/v1/realtime/token", { method: "POST" });
          if (!response.ok) throw new Error("private realtime token request failed");
          const value: unknown = await response.json();
          this.cachedToken = z.object({
            token: z.string(),
            expiresAt: z
              .string()
              .regex(/^[1-9][0-9]*$/)
              .transform(Number)
              .pipe(z.number().int().positive().safe()),
          }).parse(value);
          token = this.cachedToken.token;
        }
      } catch {
        // Never send the private room unauthenticated. A bounded reconnect
        // retry obtains a fresh token before any private subscription.
        this.cachedToken = undefined;
        this.connecting = false;
        this.scheduleReconnect();
        return;
      }
    }
    if (generation !== this.connectionGeneration || this.rooms.size === 0) {
      this.connecting = false;
      return;
    }

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.endpoint(), ["redline.realtime.v1"]);
    } catch {
      this.connecting = false;
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    this.protocolReady = false;
    this.connectionToken = token;
    this.privateSocket = false;
    this.connecting = false;
    socket.addEventListener("message", (event) => this.onMessage(event));
    socket.addEventListener("close", () => {
      if (socket !== this.socket) return;
      this.socket = undefined;
      this.connectionToken = undefined;
      this.authCommand = undefined;
      this.privateSocket = false;
      this.protocolReady = false;
      if (this.stableConnectionTimer !== undefined) window.clearTimeout(this.stableConnectionTimer);
      this.stableConnectionTimer = undefined;
      this.sidRooms.clear();
      this.pendingRooms.clear();
      for (const room of this.rooms.values()) {
        room.sid = undefined;
        // Preserve the last accepted cursor/opaque resume cursor, but make
        // every REST flight from the dead socket stale before reconnecting.
        // Otherwise an old recovery can dispatch duplicates and move the
        // cursor backwards after the new socket has already resumed.
        invalidatePrivateRecoveryOnDisconnect(
          room,
          (timer) => window.clearTimeout(timer),
        );
      }
      emitRealtimeStatus("reconnecting");
      this.scheduleReconnect();
    });
    socket.addEventListener("error", () => socket.close());
  }

  private onMessage(event: MessageEvent) {
    if (typeof event.data !== "string") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(event.data);
    } catch {
      return;
    }
    const result = messageSchema.safeParse(parsed);
    if (!result.success) return;
    const message = result.data;

    if (message.type === "error" && message.id !== undefined) {
      if (message.id === this.authCommand) {
        this.authCommand = undefined;
        this.cachedToken = undefined;
        this.connectionToken = undefined;
        this.socket?.close();
        return;
      }
      const pending = this.pendingRooms.get(message.id);
      if (pending) {
        this.pendingRooms.delete(message.id);
        this.dispatch(pending.room, message);
        if (
          privateCommandErrorRequiresReconnect(
            message.id,
            this.authCommand,
            pending.room.requestedRoom,
          )
        ) {
          this.cachedToken = undefined;
          this.connectionToken = undefined;
          this.socket?.close();
        } else {
          this.emitLiveIfReady();
        }
      }
      return;
    }

    if (message.type === "connected") {
      if (this.stableConnectionTimer !== undefined) window.clearTimeout(this.stableConnectionTimer);
      this.stableConnectionTimer = window.setTimeout(() => {
        this.reconnectAttempt = 0;
        this.stableConnectionTimer = undefined;
      }, 30_000);
      if (message.authenticated) {
        this.privateSocket = true;
        this.protocolReady = true;
        emitRealtimeStatus("recovering");
        for (const room of this.rooms.values()) this.sendSubscribe(room);
      } else if (this.connectionToken) {
        emitRealtimeStatus("recovering");
        const id = this.nextCommand++;
        this.authCommand = id;
        this.socket?.send(JSON.stringify({
          id,
          cmd: "authenticate",
          params: { token: this.connectionToken },
        }));
      } else {
        this.protocolReady = true;
        emitRealtimeStatus("recovering");
        for (const room of this.rooms.values()) this.sendSubscribe(room);
      }
      return;
    }
    if (message.type === "authenticated" && message.id === this.authCommand) {
      this.authCommand = undefined;
      this.connectionToken = undefined;
      this.privateSocket = true;
      this.protocolReady = true;
      emitRealtimeStatus("recovering");
      for (const room of this.rooms.values()) this.sendSubscribe(room);
      return;
    }
    if (message.type === "subscribed" && message.id !== undefined && message.sid !== undefined) {
      const pending = this.pendingRooms.get(message.id);
      if (!pending) return;
      this.pendingRooms.delete(message.id);
      const room = pending.room;
      if (room.listeners.size === 0 || pending.channels !== this.channels(room).join(",")) {
        this.sendUnsubscribeSid(message.sid);
        if (room.listeners.size > 0) {
          this.sendSubscribe(room);
        } else {
          this.emitLiveIfReady();
        }
        return;
      }
      if (room.sid !== undefined) this.sidRooms.delete(room.sid);
      room.sid = message.sid;
      room.actualRoom = message.room;
      this.sidRooms.set(message.sid, room);
      this.dispatch(room, message);
      if (
        privateSubscriptionNeedsRestRecovery(
          room.requestedRoom,
          room.cursor,
          message.resumed,
        )
      ) {
        emitRealtimeStatus("recovering");
        void this.recoverPrivateRoom(room);
        return;
      }
      this.emitLiveIfReady();
      return;
    }

    const room = message.sid === undefined ? undefined : this.sidRooms.get(message.sid);
    if (!room) return;
    if (message.type === "resync_required") {
      this.dispatch(room, message);
      this.scheduleResync(room, message.retry_after_ms);
      return;
    }
    if (message.sequence !== undefined) {
      const isSnapshot = message.type.endsWith("_snapshot");
      if (!isSnapshot && room.cursor !== undefined) {
        if (compareExactSequences(message.sequence, room.cursor) <= 0) return;
        if (!isNextExactSequence(message.sequence, room.cursor)) {
          emitRealtimeStatus("recovering");
          this.scheduleResync(room);
          return;
        }
      }
      room.cursor = message.sequence;
    }
    if (message.type !== "cursor") {
      const logicalMessages = expandRealtimeMessage(message);
      if (logicalMessages.length === 0) {
        emitRealtimeStatus("recovering");
        this.scheduleResync(room);
        return;
      }
      for (const logicalMessage of logicalMessages) {
        this.dispatch(room, logicalMessage);
      }
    }
  }

  private dispatch(room: RoomState, message: RealtimeMessage) {
    for (const listener of room.listeners) listener.handler(message);
  }

  private sendSubscribe(room: RoomState, cursor = room.cursor) {
    const socketOpen = this.socket?.readyState === WebSocket.OPEN;
    if (!subscriptionRequestCanBeSent(
      this.protocolReady,
      socketOpen,
      room.listeners.size > 0,
      this.hasPendingSubscription(room),
      room.activeRecoveryGeneration !== undefined,
    ) || !this.socket) {
      return;
    }
    const id = this.nextCommand++;
    const channels = this.channels(room);
    this.pendingRooms.set(id, { room, channels: channels.join(",") });
    emitRealtimeStatus("recovering");
    this.socket.send(
      JSON.stringify({
        id,
        cmd: "subscribe",
        params: {
          subscriptions: [
            {
              room: room.requestedRoom,
              channels,
              ...(cursor === undefined ? {} : { cursor }),
            },
          ],
        },
      }),
    );
  }

  private unsubscribeRoom(room: RoomState, invalidateRecovery = true) {
    if (invalidateRecovery && room.requestedRoom === "user") {
      room.recoveryGeneration += 1;
      room.activeRecoveryGeneration = undefined;
    }
    if (room.resyncTimer !== undefined) {
      window.clearTimeout(room.resyncTimer);
      room.resyncTimer = undefined;
    }
    if (room.sid === undefined || this.socket?.readyState !== WebSocket.OPEN) return;
    this.sendUnsubscribeSid(room.sid);
    this.sidRooms.delete(room.sid);
    room.sid = undefined;
  }

  private sendUnsubscribeSid(sid: number) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    const id = this.nextCommand++;
    this.socket.send(JSON.stringify({ id, cmd: "unsubscribe", params: { sids: [sid] } }));
    this.sidRooms.delete(sid);
  }

  private resubscribe(room: RoomState, preserveCursor: boolean) {
    this.unsubscribeRoom(room);
    if (!preserveCursor) room.cursor = undefined;
    this.sendSubscribe(room);
  }

  private scheduleResync(room: RoomState, serverDelay?: number) {
    if (room.resyncTimer !== undefined) return;
    const delay = (serverDelay ?? 250) + Math.floor(Math.random() * 500);
    room.resyncTimer = window.setTimeout(() => {
      room.resyncTimer = undefined;
      if (room.listeners.size === 0) return;
      if (room.requestedRoom === "user") {
        void this.recoverPrivateRoom(room);
      } else {
        this.resubscribe(room, false);
      }
    }, delay);
    emitRealtimeStatus("recovering");
  }

  private async recoverPrivateRoom(room: RoomState) {
    const recoveryGeneration = room.recoveryGeneration + 1;
    room.recoveryGeneration = recoveryGeneration;
    room.activeRecoveryGeneration = recoveryGeneration;
    emitRealtimeStatus("recovering");
    this.unsubscribeRoom(room, false);
    let cursor = room.cursor ?? "0";
    let pageCursor: string | null =
      room.accountResumeSequence === cursor ? room.accountResumeCursor ?? null : null;
    let completed = false;
    const visitedCursors = new Set<string>();
    try {
      for (let page = 0; page < 10_000; page += 1) {
        if (room.listeners.size === 0) return;
        const query = pageCursor === null
          ? `after=${encodeURIComponent(cursor)}`
          : `cursor=${encodeURIComponent(pageCursor)}`;
        const response = await fetch(`/api/v1/account-events?limit=1000&${query}`);
        if (room.recoveryGeneration !== recoveryGeneration) return;
        if (!response.ok) throw new Error(`account recovery failed with ${response.status}`);
        const body: unknown = await response.json();
        if (room.recoveryGeneration !== recoveryGeneration) return;
        const result = accountRecoveryPageSchema.parse(body);
        for (const event of result.events) {
          if (room.recoveryGeneration !== recoveryGeneration) return;
          if (compareExactSequences(event.sequence, cursor) <= 0) continue;
          if (!isNextExactSequence(event.sequence, cursor)) {
            throw new Error("account recovery returned a non-contiguous sequence");
          }
          cursor = event.sequence;
          room.cursor = cursor;
          for (const message of expandAccountRecoveryEvent(
            event,
            room.actualRoom ?? room.requestedRoom,
            room.sid,
            this.channels(room),
          )) {
            this.dispatch(room, message);
          }
        }
        room.accountResumeCursor = result.resumeCursor;
        room.accountResumeSequence = cursor;
        if (result.nextCursor === null) {
          completed = true;
          break;
        }
        if (visitedCursors.has(result.nextCursor)) {
          throw new Error("account recovery cursor did not advance");
        }
        visitedCursors.add(result.nextCursor);
        pageCursor = result.nextCursor;
      }
      if (!completed) throw new Error("account recovery exceeded the page safety bound");
      room.recoveryAttempt = 0;
      if (
        room.recoveryGeneration === recoveryGeneration &&
        room.listeners.size > 0
      ) {
        room.activeRecoveryGeneration = undefined;
        this.sendSubscribe(room, room.cursor);
      }
    } catch {
      this.schedulePrivateRecoveryRetry(room, recoveryGeneration);
    } finally {
      if (room.activeRecoveryGeneration === recoveryGeneration) {
        room.activeRecoveryGeneration = undefined;
        this.emitLiveIfReady();
      }
    }
  }

  private schedulePrivateRecoveryRetry(
    room: RoomState,
    recoveryGeneration: number,
  ) {
    if (
      room.recoveryGeneration !== recoveryGeneration ||
      room.listeners.size === 0 ||
      room.resyncTimer !== undefined
    ) {
      return;
    }
    const delay = privateRecoveryRetryDelay(room.recoveryAttempt++);
    room.resyncTimer = window.setTimeout(() => {
      room.resyncTimer = undefined;
      if (
        room.recoveryGeneration === recoveryGeneration &&
        room.listeners.size > 0
      ) {
        void this.recoverPrivateRoom(room);
      }
    }, delay);
  }

  private scheduleReconnect() {
    if (this.rooms.size === 0 || this.reconnectTimer !== undefined) return;
    emitRealtimeStatus("reconnecting");
    const cap = Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** this.reconnectAttempt++);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect();
    }, Math.floor(Math.random() * cap));
  }

  private reconnectNow() {
    this.connectionGeneration += 1;
    this.connecting = false;
    if (this.reconnectTimer !== undefined) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    const socket = this.socket;
    this.socket = undefined;
    this.privateSocket = false;
    this.protocolReady = false;
    this.sidRooms.clear();
    this.pendingRooms.clear();
    for (const room of this.rooms.values()) room.sid = undefined;
    if (this.stableConnectionTimer !== undefined) window.clearTimeout(this.stableConnectionTimer);
    this.stableConnectionTimer = undefined;
    socket?.close();
    emitRealtimeStatus(this.rooms.size === 0 ? "idle" : "reconnecting");
    void this.connect();
  }

  private disconnect() {
    this.connectionGeneration += 1;
    this.connecting = false;
    if (this.reconnectTimer !== undefined) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    const socket = this.socket;
    this.socket = undefined;
    this.privateSocket = false;
    this.protocolReady = false;
    this.sidRooms.clear();
    this.pendingRooms.clear();
    if (this.stableConnectionTimer !== undefined) window.clearTimeout(this.stableConnectionTimer);
    this.stableConnectionTimer = undefined;
    socket?.close();
    emitRealtimeStatus("idle");
  }
}

const realtime = new RealtimeClient();

export function subscribeRealtime(
  room: string,
  channels: string[],
  handler: RealtimeHandler,
): () => void {
  return realtime.subscribe(room, channels, handler);
}

export function refreshRealtimeAuthentication() {
  realtime.refreshAuthentication();
}

export function useRealtimeRoom(
  room: string,
  channels: string[],
  handler: RealtimeHandler,
  enabled = true,
) {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);
  const channelKey = [...channels].sort().join(",");
  useEffect(() => {
    if (!enabled) return;
    return subscribeRealtime(room, channelKey.split(",").filter(Boolean), (message) =>
      handlerRef.current(message),
    );
  }, [room, channelKey, enabled]);
}
