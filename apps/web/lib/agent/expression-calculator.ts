export interface ExactExpressionInput {
  label: string;
  expression: string;
}

export interface ExactExpressionResult extends ExactExpressionInput {
  value: string;
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
function parseDecimal(rawValue: string): Rational {
  const raw = rawValue.trim();
  if (!/^\d+(?:\.\d+)?$/.test(raw)) throw new Error(`CALCULATOR_INVALID_NUMBER:${raw}`);
  const [whole, fraction = ""] = raw.split(".");
  const d = 10n ** BigInt(fraction.length);
  return normalize({ n: BigInt(`${whole}${fraction}` || "0"), d });
}

const add = (a: Rational, b: Rational) => normalize({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
const subtract = (a: Rational, b: Rational) => normalize({ n: a.n * b.d - b.n * a.d, d: a.d * b.d });
const multiply = (a: Rational, b: Rational) => normalize({ n: a.n * b.n, d: a.d * b.d });
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

class Parser {
  private index = 0;
  constructor(private readonly source: string) {}

  parse(): Rational {
    const value = this.parseExpression();
    this.skipWhitespace();
    if (this.index !== this.source.length) throw new Error("CALCULATOR_INVALID_EXPRESSION");
    return value;
  }

  private skipWhitespace() {
    while (/\s/.test(this.source[this.index] ?? "")) this.index += 1;
  }

  private peek(): string {
    this.skipWhitespace();
    return this.source[this.index] ?? "";
  }
  private consume(expected: string) {
    this.skipWhitespace();
    if (this.source[this.index] !== expected) throw new Error("CALCULATOR_INVALID_EXPRESSION");
    this.index += 1;
  }

  private parseExpression(): Rational {
    let value = this.parseTerm();
    while (true) {
      const op = this.peek();
      if (op !== "+" && op !== "-") return value;
      this.index += 1;
      const rhs = this.parseTerm();
      value = op === "+" ? add(value, rhs) : subtract(value, rhs);
    }
  }

  private parseTerm(): Rational {
    let value = this.parseFactor();
    while (true) {
      const op = this.peek();
      if (op !== "*" && op !== "/") return value;
      this.index += 1;
      const rhs = this.parseFactor();
      value = op === "*" ? multiply(value, rhs) : divide(value, rhs);
    }
  }
  private parseFactor(): Rational {
    const token = this.peek();
    if (token === "+" || token === "-") {
      this.index += 1;
      const value = this.parseFactor();
      return token === "-" ? normalize({ n: -value.n, d: value.d }) : value;
    }
    if (token === "(") {
      this.consume("(");
      const value = this.parseExpression();
      this.consume(")");
      return value;
    }
    return this.parseNumber();
  }

  private parseNumber(): Rational {
    this.skipWhitespace();
    const start = this.index;
    while (/\d/.test(this.source[this.index] ?? "")) this.index += 1;
    if (this.source[this.index] === ".") {
      this.index += 1;
      while (/\d/.test(this.source[this.index] ?? "")) this.index += 1;
    }
    if (this.index === start) throw new Error("CALCULATOR_INVALID_EXPRESSION");
    return parseDecimal(this.source.slice(start, this.index));
  }
}
export function evaluateExactExpressions(
  expressions: ExactExpressionInput[],
  precision = 6,
): ExactExpressionResult[] {
  if (!Array.isArray(expressions) || expressions.length === 0) throw new Error("CALCULATOR_EXPRESSIONS_REQUIRED");
  if (expressions.length > 50) throw new Error("CALCULATOR_EXPRESSION_LIMIT");

  return expressions.map((item) => {
    const label = String(item?.label ?? "").trim();
    const expression = String(item?.expression ?? "").trim();
    if (!label || label.length > 100) throw new Error("CALCULATOR_INVALID_LABEL");
    if (!expression || expression.length > 500) throw new Error("CALCULATOR_INVALID_EXPRESSION");
    if (!/^[0-9+\-*/().\s]+$/.test(expression)) throw new Error("CALCULATOR_INVALID_EXPRESSION");
    const value = new Parser(expression).parse();
    return { label, expression, value: render(value, precision) };
  });
}
