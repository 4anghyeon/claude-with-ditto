export type DittoMood = "idle" | "thinking" | "working" | "error" | "done";
export type DittoState = {
  mood: DittoMood;
  lastMessage: string;
  lastTool?: string;
  /** What Ditto says in the message's place for a few seconds after a skill runs. */
  announcement?: string;
};

declare module "claude-code" {
  interface PluginState {
    "ditto": {
      state: DittoState;
    };
  }
}
