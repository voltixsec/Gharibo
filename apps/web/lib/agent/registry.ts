import type { AgentToolName } from "./contracts";

export type AgentCapabilityId = "gharibo_model" | AgentToolName;
export type AgentCapabilityCategory = "MODEL" | "CALCULATION" | "CODE" | "RESEARCH" | "VERIFY";

export interface AgentCapability {
  id: AgentCapabilityId;
  name: string;
  description: string;
  category: AgentCapabilityCategory;
  deterministic: boolean;
  requiresApproval: boolean;
  costClass: "NONE" | "LOW" | "MEDIUM";
}

const CAPABILITIES: readonly AgentCapability[] = [
  { id: "gharibo_model", name: "GHARIBO-V1", description: "Primary reasoning and response model", category: "MODEL", deterministic: false, requiresApproval: false, costClass: "LOW" },
  { id: "calculator", name: "Calculator", description: "Exact deterministic arithmetic", category: "CALCULATION", deterministic: true, requiresApproval: false, costClass: "NONE" },
  { id: "code_solver", name: "Code Solver", description: "Bounded deterministic code and constraint solving", category: "CODE", deterministic: true, requiresApproval: false, costClass: "LOW" },
  { id: "web_search", name: "Web Search", description: "Search public web sources", category: "RESEARCH", deterministic: false, requiresApproval: false, costClass: "MEDIUM" },
  { id: "web_fetch", name: "Web Fetch", description: "Fetch and inspect a selected public source", category: "RESEARCH", deterministic: false, requiresApproval: false, costClass: "MEDIUM" },
  { id: "evidence_verify", name: "Evidence Verify", description: "Check candidate claims against gathered evidence", category: "VERIFY", deterministic: true, requiresApproval: false, costClass: "NONE" },
] as const;

export function listAgentCapabilities(): AgentCapability[] {
  return CAPABILITIES.map((capability) => ({ ...capability }));
}

export function routeAgentCapabilities(goal: string, maxVisible = 6): AgentCapability[] {
  const text = goal.trim().toLowerCase();
  if (!text) return [{ ...CAPABILITIES[0] }];
  const wanted = new Set<AgentCapabilityId>(["gharibo_model"]);

  if (/\b(calculate|calculation|sum|total|margin|profit|cost|price|discount|percent|percentage|÷|\+|\-|\*|\/|احسب|حساب|نسبة|تكلفة|هامش|ربح)\b/i.test(text)) {
    wanted.add("calculator");
  }
  if (/\b(code|typescript|javascript|python|debug|algorithm|constraint|logic|json|solve|كود|برمجة|منطق|حل)\b/i.test(text)) {
    wanted.add("code_solver");
  }
  if (/\b(search|research|web|website|source|latest|current|price|supplier|product|manufacturer|ابحث|الويب|موقع|مصدر|مورد|منتج|سعر)\b/i.test(text)) {
    wanted.add("web_search");
    wanted.add("web_fetch");
    wanted.add("evidence_verify");
  }

  return CAPABILITIES.filter((capability) => wanted.has(capability.id)).slice(0, Math.max(1, Math.min(10, maxVisible))).map((capability) => ({ ...capability }));
}
