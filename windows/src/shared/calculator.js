// Calculadora natural con formato colombiano e IVA (19%).
// Port 1:1 de Sources/Clippy/CalculatorEngine.swift — misma gramática, mismos casos borde.
// UMD: se usa desde el renderer (window.CalculatorEngine) y desde Node (tests).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CalculatorEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const IVA_RATE = 0.19;

  // Tokens
  const T = {
    NUMBER: 'number', PLUS: '+', MINUS: '-', STAR: '*', SLASH: '/',
    LPAREN: '(', RPAREN: ')', PERCENT: '%', DE: 'de', IVA: 'iva', SIN: 'sin'
  };

  const isNumberChar = c => /^\p{N}$/u.test(c);
  const isLetterChar = c => /^\p{L}$/u.test(c);

  // Equivalente a Double(String) de Swift para cadenas formadas solo por dígitos y '.':
  // acepta "1", "1.5", "1.", ".5"; rechaza "", ".", "1..5", dígitos no ASCII.
  function plain(s) {
    if (!/^[0-9]*\.?[0-9]*$/.test(s) || !/[0-9]/.test(s)) return null;
    const v = Number(s);
    return Number.isNaN(v) ? null : v;
  }

  /// Reglas colombianas: ambos separadores → el último es decimal. Solo "," → decimal.
  /// Solo "." → miles si todos los grupos después del primero tienen exactamente 3 dígitos.
  function parseNumber(raw) {
    if (!raw) return null;
    const hasDot = raw.includes('.');
    const hasComma = raw.includes(',');

    if (hasDot && hasComma) {
      const lastDot = raw.lastIndexOf('.');
      const lastComma = raw.lastIndexOf(',');
      if (lastComma > lastDot) {
        // "." miles, "," decimal (1.500,50)
        return plain(raw.split('.').join('').split(',').join('.'));
      }
      // "," miles, "." decimal (1,500.50)
      return plain(raw.split(',').join(''));
    }
    if (hasComma) {
      if (raw.split(',').length - 1 !== 1) return null;
      return plain(raw.replace(',', '.'));
    }
    if (hasDot) {
      const groups = raw.split('.');
      if (!groups.every(g => g.length > 0)) return null;
      const isThousands = groups.length >= 2 &&
        groups[0].length >= 1 && groups[0].length <= 3 &&
        groups.slice(1).every(g => g.length === 3);
      if (isThousands) return plain(groups.join(''));
      if (groups.length !== 2) return null;
      return plain(raw);
    }
    return plain(raw);
  }

  function tokenize(input) {
    // Minúsculas + quitar marcadores de moneda (mismo orden que Swift)
    let text = String(input).normalize('NFC').toLowerCase();
    for (const junk of ['$', 'cop', 'pesos', 'peso']) text = text.split(junk).join(' ');

    const tokens = [];
    const chars = Array.from(text);
    let i = 0;
    while (i < chars.length) {
      const c = chars[i];
      switch (c) {
        case ' ': case '\t': case '\n': i += 1; continue;
        case '+': tokens.push({ t: T.PLUS }); i += 1; continue;
        case '-': case '−': tokens.push({ t: T.MINUS }); i += 1; continue;
        case '*': case '×': tokens.push({ t: T.STAR }); i += 1; continue;
        case '/': case '÷': tokens.push({ t: T.SLASH }); i += 1; continue;
        case '(': tokens.push({ t: T.LPAREN }); i += 1; continue;
        case ')': tokens.push({ t: T.RPAREN }); i += 1; continue;
        case '%': tokens.push({ t: T.PERCENT }); i += 1; continue;
        default: break;
      }
      if (isNumberChar(c)) {
        let j = i;
        while (j < chars.length && (isNumberChar(chars[j]) || chars[j] === '.' || chars[j] === ',')) j += 1;
        let end = j;
        while (end > i && (chars[end - 1] === '.' || chars[end - 1] === ',')) end -= 1;
        const raw = chars.slice(i, end).join('');
        const value = parseNumber(raw);
        if (value === null) return [];
        tokens.push({ t: T.NUMBER, v: value });
        i = end;
      } else if (isLetterChar(c)) {
        let j = i;
        while (j < chars.length && isLetterChar(chars[j])) j += 1;
        const word = chars.slice(i, j).join('');
        switch (word) {
          case 'de': tokens.push({ t: T.DE }); break;
          case 'iva': tokens.push({ t: T.IVA }); break;
          case 'sin': tokens.push({ t: T.SIN }); break;
          case 'x': tokens.push({ t: T.STAR }); break;
          case 'mas': case 'más': tokens.push({ t: T.PLUS }); break;
          case 'menos': tokens.push({ t: T.MINUS }); break;
          case 'por': tokens.push({ t: T.STAR }); break;
          default: return [];
        }
        i = j;
      } else {
        return [];
      }
    }
    return tokens;
  }

  class Parser {
    constructor(tokens) { this.tokens = tokens; this.pos = 0; }
    get isAtEnd() { return this.pos >= this.tokens.length; }
    get current() { return this.pos < this.tokens.length ? this.tokens[this.pos] : null; }
    advance() { if (this.pos >= this.tokens.length) return null; return this.tokens[this.pos++]; }
    match(type) { const c = this.current; if (c && c.t === type) { this.pos += 1; return true; } return false; }

    // expr := term ( (+|-) rhs )*  — rhs puede ser % relativo o IVA
    parseExpression() {
      let left = this.parseTerm();
      if (left === null) return null;
      for (;;) {
        const op = this.current;
        if (!op || (op.t !== T.PLUS && op.t !== T.MINUS)) break;
        this.pos += 1;
        const isPlus = op.t === T.PLUS;

        if (this.match(T.IVA)) {
          left = isPlus ? left * (1 + IVA_RATE) : left / (1 + IVA_RATE);
          continue;
        }
        const cur = this.current;
        if (cur && cur.t === T.NUMBER && this.pos + 1 < this.tokens.length && this.tokens[this.pos + 1].t === T.PERCENT) {
          const isPercentOf = this.pos + 2 < this.tokens.length && this.tokens[this.pos + 2].t === T.DE;
          if (!isPercentOf) {
            const n = cur.v;
            this.pos += 2;
            left = isPlus ? left * (1 + n / 100) : left * (1 - n / 100);
            continue;
          }
        }
        const right = this.parseTerm();
        if (right === null) return null;
        left = isPlus ? left + right : left - right;
      }
      // "X sin IVA" postfijo
      if (this.match(T.SIN)) {
        if (!this.match(T.IVA)) return null;
        left = left / (1 + IVA_RATE);
      }
      return left;
    }

    // term := unary ( (*|/) unary )*
    parseTerm() {
      let left = this.parseUnary();
      if (left === null) return null;
      for (;;) {
        const op = this.current;
        if (!op || (op.t !== T.STAR && op.t !== T.SLASH)) break;
        this.pos += 1;
        const right = this.parseUnary();
        if (right === null) return null;
        if (op.t === T.STAR) left = left * right;
        else {
          if (right === 0) return null;
          left = left / right;
        }
      }
      return left;
    }

    // unary := '-' unary | postfix
    parseUnary() {
      if (this.match(T.MINUS)) {
        const value = this.parseUnary();
        if (value === null) return null;
        return -value;
      }
      return this.parsePostfix();
    }

    // postfix := primary [ '%' ]
    parsePostfix() {
      const value = this.parsePrimary();
      if (value === null) return null;
      if (this.match(T.PERCENT)) {
        if (this.match(T.DE)) {
          const target = this.parseExpression();
          if (target === null) return null;
          return (value / 100) * target;
        }
        return value / 100;
      }
      return value;
    }

    // primary := NUMBER | '(' expr ')' | 'iva' 'de' expr
    parsePrimary() {
      const token = this.advance();
      if (!token) return null;
      switch (token.t) {
        case T.NUMBER: return token.v;
        case T.LPAREN: {
          const value = this.parseExpression();
          if (value === null || !this.match(T.RPAREN)) return null;
          return value;
        }
        case T.IVA: {
          if (!this.match(T.DE)) return null;
          const target = this.parseExpression();
          if (target === null) return null;
          return IVA_RATE * target;
        }
        default: return null;
      }
    }
  }

  /// Evalúa una expresión. Devuelve null si no se puede interpretar.
  function evaluate(input) {
    const tokens = tokenize(input);
    if (tokens.length === 0) return null;
    const parser = new Parser(tokens);
    const value = parser.parseExpression();
    if (value === null || !parser.isAtEnd || !Number.isFinite(value)) return null;
    return value;
  }

  // Double.rounded() de Swift: mitad lejos de cero
  const roundSchool = x => Math.sign(x) * Math.round(Math.abs(x));

  /// Formato colombiano: miles ".", decimal ",", máx. 2 decimales.
  function format(value) {
    const rounded = roundSchool(value * 100) / 100;
    const intPart = Math.trunc(Math.abs(rounded));
    const fracPart = Math.abs(rounded) - intPart;

    let digits = BigInt(intPart).toString(); // = String(format: "%.0f")
    let grouped = '';
    while (digits.length > 3) {
      grouped = '.' + digits.slice(-3) + grouped;
      digits = digits.slice(0, -3);
    }
    grouped = digits + grouped;

    let result = grouped;
    if (fracPart > 0.0000001) {
      let frac = fracPart.toFixed(2).slice(2); // "0.xx" → "xx"
      while (frac.endsWith('0')) frac = frac.slice(0, -1);
      if (frac) result += ',' + frac;
    }
    if (rounded < 0) result = '-' + result;
    return result;
  }

  return { IVA_RATE, evaluate, format, tokenize, parseNumber };
});
