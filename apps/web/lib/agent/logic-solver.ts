export type LogicRule =
  | { type: "before"; a: string; b: string }
  | { type: "after"; a: string; b: string }
  | { type: "position"; item: string; position: number }
  | { type: "not_position"; item: string; position: number }
  | { type: "between_count"; a: string; b: string; count: number }
  | { type: "adjacent"; a: string; b: string };

export interface LogicSolverRequest {
  items: string[];
  rules: LogicRule[];
  maxSolutions?: number;
}

export interface LogicSolverResult {
  validOrders: string[][];
  count: number;
  checkedPermutations: number;
  truncated: boolean;
}

function assertItem(value: unknown, items: Set<string>): string {
  const item = typeof value === "string" ? value.trim() : "";
  if (!item || !items.has(item)) throw new Error("LOGIC_SOLVER_UNKNOWN_ITEM");
  return item;
}
function validateRules(rules: LogicRule[], itemSet: Set<string>, size: number) {
  if (!Array.isArray(rules) || rules.length === 0 || rules.length > 50) {
    throw new Error("LOGIC_SOLVER_RULES_REQUIRED");
  }
  for (const rule of rules) {
    if (!rule || typeof rule !== "object" || typeof rule.type !== "string") {
      throw new Error("LOGIC_SOLVER_INVALID_RULE");
    }
    if (rule.type === "position" || rule.type === "not_position") {
      assertItem(rule.item, itemSet);
      if (!Number.isInteger(rule.position) || rule.position < 1 || rule.position > size) {
        throw new Error("LOGIC_SOLVER_INVALID_POSITION");
      }
      continue;
    }
    if (rule.type === "before" || rule.type === "after" || rule.type === "between_count" || rule.type === "adjacent") {
      assertItem(rule.a, itemSet);
      assertItem(rule.b, itemSet);
      if (rule.a === rule.b) throw new Error("LOGIC_SOLVER_DUPLICATE_RULE_ITEM");
      if (rule.type === "between_count" && (!Number.isInteger(rule.count) || rule.count < 0 || rule.count > size - 2)) {
        throw new Error("LOGIC_SOLVER_INVALID_BETWEEN_COUNT");
      }
      continue;
    }
    throw new Error("LOGIC_SOLVER_INVALID_RULE");
  }
}
function satisfies(order: string[], rules: LogicRule[]): boolean {
  const positions = new Map(order.map((item, index) => [item, index + 1]));
  for (const rule of rules) {
    if (rule.type === "position" && positions.get(rule.item) !== rule.position) return false;
    if (rule.type === "not_position" && positions.get(rule.item) === rule.position) return false;
    if (rule.type === "before" && positions.get(rule.a)! >= positions.get(rule.b)!) return false;
    if (rule.type === "after" && positions.get(rule.a)! <= positions.get(rule.b)!) return false;
    if (rule.type === "between_count") {
      if (Math.abs(positions.get(rule.a)! - positions.get(rule.b)!) - 1 !== rule.count) return false;
    }
    if (rule.type === "adjacent") {
      if (Math.abs(positions.get(rule.a)! - positions.get(rule.b)!) !== 1) return false;
    }
  }
  return true;
}

function permutations(items: string[], visit: (order: string[]) => void) {
  const used = new Array(items.length).fill(false);
  const current: string[] = [];
  const walk = () => {
    if (current.length === items.length) {
      visit([...current]);
      return;
    }
    for (let i = 0; i < items.length; i += 1) {
      if (used[i]) continue;
      used[i] = true;
      current.push(items[i]!);
      walk();
      current.pop();
      used[i] = false;
    }
  };
  walk();
}
export function solveLogic(request: LogicSolverRequest): LogicSolverResult {
  const items = Array.isArray(request?.items) ? request.items.map((item) => String(item).trim()) : [];
  if (items.length < 2 || items.length > 8 || items.some((item) => !item)) {
    throw new Error("LOGIC_SOLVER_ITEMS_RANGE");
  }
  const itemSet = new Set(items);
  if (itemSet.size !== items.length) throw new Error("LOGIC_SOLVER_DUPLICATE_ITEMS");
  validateRules(request.rules, itemSet, items.length);

  const maxSolutions = Math.max(1, Math.min(1000, Math.trunc(request.maxSolutions ?? 1000)));
  const validOrders: string[][] = [];
  let checkedPermutations = 0;
  let totalMatches = 0;
  permutations(items, (order) => {
    checkedPermutations += 1;
    if (!satisfies(order, request.rules)) return;
    totalMatches += 1;
    if (validOrders.length < maxSolutions) validOrders.push(order);
  });

  return {
    validOrders,
    count: totalMatches,
    checkedPermutations,
    truncated: totalMatches > validOrders.length,
  };
}
