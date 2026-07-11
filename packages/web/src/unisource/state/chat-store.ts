import { useSyncExternalStore } from "react";

import type { ChangeSet, DataFieldPrimitive, MemberId } from "../model/kernel";
import type { ChatMessage } from "../model/view-layer";
import { cloneDemoSeed } from "../seed/demo-seed";
import { changeSetStore, type ChangeSetStore } from "./changeset-store";
import { sessionStore, type SessionStore } from "./session-store";
import { workspaceStore, type WorkspaceStore } from "./workspace-store";

export type ChatScript = "batteryAndKpi" | "aov" | "fallback";

export interface ActionCard {
  readonly id: string;
  readonly kind: "change" | "add";
  readonly title: string;
  readonly target: string;
  readonly diff: string;
  readonly impact: string;
  readonly status: "applied" | "pending" | "undone";
  readonly eventId?: string;
  readonly kpiId?: string;
  readonly restore?: {
    readonly objectId: string;
    readonly fieldCode: string;
    readonly value: DataFieldPrimitive;
  };
}

export interface ChatState {
  readonly messages: readonly ChatMessage[];
  readonly actionCards: readonly ActionCard[];
  readonly typing: boolean;
}

type Listener = () => void;

export function matchScript(text: string): ChatScript {
  if (text.includes("续航") && text.includes("活跃渠道")) {
    return "batteryAndKpi";
  }
  if (text.includes("客单价")) return "aov";
  return "fallback";
}

export class ChatStore {
  private state: ChatState;
  private readonly listeners = new Set<Listener>();
  private sequence = 0;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(
    private readonly workspace: WorkspaceStore = workspaceStore,
    private readonly changeSets: ChangeSetStore = changeSetStore,
    seed = cloneDemoSeed(),
  ) {
    this.state = {
      messages: seed.chatMessages,
      actionCards: [],
      typing: false,
    };
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ChatState => this.state;

  reset(seed = cloneDemoSeed()): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.sequence = 0;
    this.state = {
      messages: seed.chatMessages,
      actionCards: [],
      typing: false,
    };
    this.emit();
  }

  send(text: string, session: SessionStore = sessionStore): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    const user = this.message("user", trimmed);
    this.state = {
      ...this.state,
      messages: [...this.state.messages, user],
      typing: true,
    };
    this.emit();
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      this.applyScript(trimmed, session);
    }, 450);
    this.timers.add(timer);
  }

  undoAll(messageId: string, session: SessionStore = sessionStore): void {
    const message = this.state.messages.find((item) => item.id === messageId);
    const cardIds = message?.actionCardIds ?? [];
    const actor = session.getSnapshot().currentMemberId;
    for (const card of [...this.state.actionCards].reverse()) {
      if (!cardIds.includes(card.id) || card.status !== "applied") continue;
      if (card.restore) {
        this.workspace.updateField(
          card.restore.objectId,
          card.restore.fieldCode,
          card.restore.value,
          { actor, summary: `撤销 ${card.title}` },
        );
      } else if (card.eventId) {
        this.workspace.undo(card.eventId);
      }
      if (card.kpiId) this.workspace.setKpiVisible(card.kpiId, false, actor);
    }
    this.state = {
      ...this.state,
      actionCards: this.state.actionCards.map((card) =>
        cardIds.includes(card.id) ? { ...card, status: "undone" } : card,
      ),
    };
    this.emit();
  }

  private applyScript(text: string, session: SessionStore): void {
    const script = matchScript(text);
    if (script === "aov") {
      this.pushAi(
        "平均客单价 = GMV / 有效订单数,当前下降主要来自线下经销补贴。",
      );
      return;
    }
    if (script === "fallback") {
      this.pushAi("可以试试:「把续航改到 14,并加一张活跃渠道数卡」。");
      return;
    }
    this.applyBatteryAndKpi(session);
  }

  private applyBatteryAndKpi(session: SessionStore): void {
    const actor = session.getSnapshot().currentMemberId;
    const canApply =
      session.can(actor, "product_specs", "editData") &&
      session.can(actor, "exp-dashboard", "editView");
    const changeSet = this.submitBatteryChangeSet(actor);
    const cards: ActionCard[] = [
      {
        id: this.cardId(),
        kind: "change",
        title: "更新电池续航",
        target: "产品规格库 › 门锁 S3 › 续航(月)",
        diff: "12 → 14",
        impact: "影响 2 处文档引用",
        status: canApply ? "applied" : "pending",
      },
      {
        id: this.cardId(),
        kind: "add",
        title: "新增看板卡",
        target: "渠道经营看板",
        diff: "活跃渠道数 42",
        impact: "表达轨变更",
        status: canApply ? "applied" : "pending",
        kpiId: "kpi-active-channels",
      },
    ];
    if (canApply) {
      const restoreValue =
        this.workspace.getObject("prod-s3")?.fields.battery_months?.value ??
        null;
      const result = this.changeSets.acceptItems(changeSet.id, [
        "chat-battery",
      ]);
      const eventId = this.workspace.getChangeEvents()[0]?.id;
      this.workspace.setKpiVisible("kpi-active-channels", true, actor);
      cards[0] = {
        ...cards[0]!,
        eventId,
        restore: {
          objectId: "prod-s3",
          fieldCode: "battery_months",
          value: restoreValue,
        },
      };
      if (!result.ok) cards[0] = { ...cards[0]!, status: "pending" };
    }
    const ai = this.message(
      "ai",
      canApply
        ? "已按你的指令更新数据并加了一张看板卡。"
        : "我已提交 AI 变更集,等待王芸批准后写入。",
      cards.map((card) => card.id),
    );
    this.state = {
      ...this.state,
      typing: false,
      actionCards: [...this.state.actionCards, ...cards],
      messages: [...this.state.messages, ai],
    };
    this.emit();
  }

  private submitBatteryChangeSet(actor: MemberId): ChangeSet {
    return this.changeSets.submit({
      id: `changeset-chat-${this.sequence + 1}`,
      source: "ai",
      status: "pending",
      title: "AI 对话:更新续航",
      actor,
      createdAt: "2026-07-10T10:36:00+08:00",
      items: [
        {
          id: "chat-battery",
          op: "updateField",
          target: {
            entityType: "field",
            entityId: "prod-s3",
            fieldCode: "battery_months",
          },
          oldValue: 12,
          nextValue: 14,
          confidence: 0.94,
          confirmed: true,
        },
      ],
    });
  }

  private pushAi(text: string): void {
    this.state = {
      ...this.state,
      typing: false,
      messages: [...this.state.messages, this.message("ai", text)],
    };
    this.emit();
  }

  private message(
    role: ChatMessage["role"],
    text: string,
    actionCardIds?: readonly string[],
  ): ChatMessage {
    this.sequence += 1;
    return { id: `chat-${this.sequence}`, role, text, actionCardIds };
  }

  private cardId(): string {
    this.sequence += 1;
    return `action-${this.sequence}`;
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }
}

export const chatStore = new ChatStore();

export function useChatSnapshot(): ChatState {
  return useSyncExternalStore(
    chatStore.subscribe,
    chatStore.getSnapshot,
    chatStore.getSnapshot,
  );
}
