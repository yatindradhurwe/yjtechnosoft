/**
 * Safe arithmetic for creator tools. Grammar:
 *   expr    := cmp
 *   cmp     := sum (('<'|'>'|'<='|'>='|'=='|'!=') sum)?
 *   sum     := term (('+'|'-') term)*
 *   term    := power (('*'|'/'|'%') power)*
 *   power   := unary ('^' power)?
 *   unary   := '-' unary | primary
 *   primary := number | identifier | func '(' args ')' | '(' expr ')'
 * Identifiers resolve to numeric variables only. No property access, strings or
 * calls other than the whitelisted functions – nothing can reach JavaScript.
 */
const FUNCS: Record<string, (...a: number[]) => number> = {
  min: Math.min,
  max: Math.max,
  abs: Math.abs,
  sqrt: Math.sqrt,
  round: (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d,
  floor: Math.floor,
  ceil: Math.ceil,
  if: (c, a, b) => (c ? a : b),
};

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
    } else if (/[0-9.]/.test(c)) {
      const m = src.slice(i).match(/^\d*\.?\d+(e[+-]?\d+)?/i);
      if (!m) throw new Error(`Bad number at ${i}`);
      out.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
    } else if (/[a-z_]/i.test(c)) {
      const m = src.slice(i).match(/^[a-z_][a-z0-9_]*/i)!;
      out.push({ t: 'id', v: m[0] });
      i += m[0].length;
    } else {
      const two = src.slice(i, i + 2);
      if (['<=', '>=', '==', '!='].includes(two)) {
        out.push({ t: 'op', v: two });
        i += 2;
      } else if ('+-*/%^(),<>'.includes(c)) {
        out.push({ t: 'op', v: c });
        i++;
      } else throw new Error(`Unexpected "${c}"`);
    }
  }
  return out;
}

export function evaluate(src: string, vars: Record<string, number>): number {
  if (src.length > 500) throw new Error('Formula too long');
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const eat = (v?: string) => {
    const t = toks[p++];
    if (!t || (v !== undefined && t.v !== v)) throw new Error(`Expected ${v ?? 'token'}`);
    return t;
  };
  const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v;

  function primary(): number {
    const t = peek();
    if (!t) throw new Error('Unexpected end');
    if (t.t === 'num') return (p++, t.v);
    if (t.t === 'op' && t.v === '(') {
      eat('(');
      const v = expr();
      eat(')');
      return v;
    }
    if (t.t === 'id') {
      p++;
      if (isOp('(')) {
        const fn = FUNCS[t.v.toLowerCase()];
        if (!fn) throw new Error(`Unknown function ${t.v}`);
        eat('(');
        const args: number[] = [];
        if (!isOp(')')) {
          args.push(expr());
          while (isOp(',')) (eat(','), args.push(expr()));
        }
        eat(')');
        return fn(...args);
      }
      if (!Object.prototype.hasOwnProperty.call(vars, t.v)) throw new Error(`Unknown field ${t.v}`);
      return vars[t.v];
    }
    throw new Error(`Unexpected ${t.v}`);
  }
  function unary(): number {
    if (isOp('-')) return (eat('-'), -unary());
    return primary();
  }
  function power(): number {
    const b = unary();
    if (isOp('^')) return (eat('^'), b ** power());
    return b;
  }
  function term(): number {
    let v = power();
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = eat().v;
      const r = power();
      v = op === '*' ? v * r : op === '/' ? v / r : v % r;
    }
    return v;
  }
  function sum(): number {
    let v = term();
    while (isOp('+') || isOp('-')) v = eat().v === '+' ? v + term() : v - term();
    return v;
  }
  function expr(): number {
    const l = sum();
    for (const op of ['<=', '>=', '==', '!=', '<', '>']) {
      if (isOp(op)) {
        eat(op);
        const r = sum();
        return Number(op === '<=' ? l <= r : op === '>=' ? l >= r : op === '==' ? l === r : op === '!=' ? l !== r : op === '<' ? l < r : l > r);
      }
    }
    return l;
  }
  const v = expr();
  if (p !== toks.length) throw new Error('Unexpected input after formula');
  if (!Number.isFinite(v)) throw new Error('Result is not a number (check for division by zero)');
  return v;
}

/** Validates a formula against the allowed variable names without real values */
export function checkFormula(src: string, names: string[]) {
  evaluate(src, Object.fromEntries(names.map((n) => [n, 1])));
}
