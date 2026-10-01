export type CalculatorOperand = string | number | { step: number };

export type CalculatorOperation =
  | { op: "add" | "subtract" | "multiply" | "divide"; a: CalculatorOperand; b: CalculatorOperand }
  | { op: "percent_of"; a: CalculatorOperand; b: CalculatorOperand };

export interface CalculatorRequest {
  operations: CalculatorOperation[];
  precision?: number;
}

export interface CalculatorStepResult {
  index: number;
  op: CalculatorOperation["op"];
  value: string;
}

export interface CalculatorResult {
  steps: CalculatorStepResult[];
  final: string | null;
}

type Rational = { n: bigint; d: bigint };

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) [x, y] = [y, x % y];
  return x === 0n ? 1n : x;
}

function normalize(value: Rational): Rational {
  if (value.d === 0n) throw new Error("CALCULATOR_DIVIDE_BY_ZERO");
  const sign = value.d < 0n ? -1n : 1n;
  const n = value.n * sign;
  const d = value.d * sign;
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

function parseDecimal(value: string | number): Rational {
  const raw = String(value).trim();
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(raw)) throw new Error(`CALCULATOR_INVALID_NUMBER:${raw}`);
  const negative = raw.startsWith("-");
  const unsigned = raw.replace(/^[+-]/, "");
  const [whole, fraction = ""] = unsigned.split(".");
  const d = 10n ** BigInt(fraction.length);
  const n = BigInt(`${whole}${fraction}` || "0") * (negative ? -1n : 1n);
  return normalize({ n, d });
}

function add(a: Rational, b: Rational): Rational { return normalize({ n: a.n * b.d + b.n * a.d, d: a.d * b.d }); }
function subtract(a: Rational, b: Rational): Rational { return normalize({ n: a.n * b.d - b.n * a.d, d: a.d * b.d }); }
function multiply(a: Rational, b: Rational): Rational { return normalize({ n: a.n * b.n, d: a.d * b.d }); }
function divide(a: Rational, b: Rational): Rational {
  if (b.n === 0n) throw new Error("CALCULATOR_DIVIDE_BY_ZERO");
  return normalize({ n: a.n * b.d, d: a.d * b.n });
}

function render(value: Rational, precision: number): string {
  const p = Math.max(0, Math.min(12, Math.trunc(precision)));
  const negative = value.n < 0n;
  const n = negative ? -value.n : value.n;
  const whole = n / value.d;
  let remainder = n % value.d;
  let fraction = "";
  for (let i = 0; i < p; i += 1) {
    remainder *= 10n;
    fraction += String(remainder / value.d);
    remainder %= value.d;
  }
  fraction = fraction.replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function resolveOperand(operand: CalculatorOperand, exactSteps: Rational[], currentIndex: number): Rational {
  if (typeof operand === "string" || typeof operand === "number") return parseDecimal(operand);
  if (!operand || !Number.isInteger(operand.step) || operand.step < 0 || operand.step >= currentIndex) {
    throw new Error("CALCULATOR_INVALID_STEP_REFERENCE");
  }
  const value = exactSteps[operand.step];
  if (!value) throw new Error("CALCULATOR_INVALID_STEP_REFERENCE");
  return value;
}

export function runCalculator(request: CalculatorRequest): CalculatorResult {
  if (!request || !Array.isArray(request.operations) || request.operations.length === 0) throw new Error("CALCULATOR_OPERATIONS_REQUIRED");
  if (request.operations.length > 100) throw new Error("CALCULATOR_OPERATION_LIMIT");
  const precision = request.precision ?? 6;
  const exactSteps: Rational[] = [];
  const steps: CalculatorStepResult[] = [];

  request.operations.forEach((operation, index) => {
    const a = resolveOperand(operation.a, exactSteps, index);
    const b = resolveOperand(operation.b, exactSteps, index);
    const value = operation.op === "add"
      ? add(a, b)
      : operation.op === "subtract"
        ? subtract(a, b)
        : operation.op === "multiply"
          ? multiply(a, b)
          : operation.op === "divide"
            ? divide(a, b)
            : divide(multiply(a, b), parseDecimal(100));
    exactSteps.push(value);
    steps.push({ index, op: operation.op, value: render(value, precision) });
  });

  return { steps, final: steps.at(-1)?.value ?? null };
}
