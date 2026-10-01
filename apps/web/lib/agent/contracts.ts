export type AgentToolName =
  | "calculator"
  | "code_solver"
  | "web_search"
  | "web_fetch"
  | "evidence_verify";

export type AgentActivityStage =
  | "PLANNING"
  | "CALLING_MODEL"
  | "USING_TOOL"
  | "VERIFYING"
  | "COMPLETED"
  | "FAILED";

export interface AgentActivityEvent {
  id: string;
  stage: AgentActivityStage;
  label: string;
  tool?: AgentToolName;
  at: string;
  status: "RUNNING" | "DONE" | "FAILED";
}

export interface AgentToolCall<TInput = unknown> {
  id: string;
  name: AgentToolName;
  input: TInput;
}

export interface AgentToolResult<TData = unknown> {
  callId: string;
  name: AgentToolName;
  ok: boolean;
  data?: TData;
  error?: { code: string; message: string };
  evidence?: AgentEvidence[];
}

export interface AgentEvidence {
  id: string;
  sourceUrl: string;
  title?: string;
  excerpt: string;
  observedAt: string;
  confidence: number;
}

export interface AgentPlan {
  reasoningSummary?: string;
  toolCalls: AgentToolCall[];
  canAnswerDirectly: boolean;
}

export interface AgentTurnResult {
  answer: string;
  toolResults: AgentToolResult[];
  activity: AgentActivityEvent[];
  evidence: AgentEvidence[];
  verified: boolean;
}
