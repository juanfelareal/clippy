import Foundation

/// Natural-language calculator with Colombian number format and IVA (19%).
/// Pure Swift, no AppKit — testable in isolation.
enum CalculatorEngine {
    static let ivaRate = 0.19

    // MARK: - Public API

    /// Evaluates an expression. Returns nil if it can't be parsed.
    static func evaluate(_ input: String) -> Double? {
        let tokens = tokenize(input)
        guard !tokens.isEmpty else { return nil }
        var parser = Parser(tokens: tokens)
        guard let value = parser.parseExpression(), parser.isAtEnd, value.isFinite else { return nil }
        return value
    }

    /// Formats with Colombian separators: thousands ".", decimal ",", ≤2 decimals.
    static func format(_ value: Double) -> String {
        let rounded = (value * 100).rounded() / 100
        let intPart = abs(rounded).rounded(.towardZero)
        let fracPart = abs(rounded) - intPart

        // Integer part with dots
        var digits = String(format: "%.0f", intPart)
        var grouped = ""
        while digits.count > 3 {
            grouped = "." + digits.suffix(3) + grouped
            digits = String(digits.dropLast(3))
        }
        grouped = digits + grouped

        // Fractional part
        var result = grouped
        if fracPart > 0.0000001 {
            var frac = String(format: "%.2f", fracPart).dropFirst(2) // "0.xx" → "xx"
            while frac.hasSuffix("0") { frac = frac.dropLast() }
            if !frac.isEmpty { result += "," + frac }
        }
        if rounded < 0 { result = "-" + result }
        return result
    }

    // MARK: - Tokens

    enum Token: Equatable {
        case number(Double)
        case plus, minus, star, slash, lparen, rparen, percent
        case kwDe, kwIVA, kwSin
    }

    // MARK: - Tokenizer

    static func tokenize(_ input: String) -> [Token] {
        // Preprocess: lowercase, strip currency markers
        var text = input.lowercased()
        for junk in ["$", "cop", "pesos", "peso"] {
            text = text.replacingOccurrences(of: junk, with: " ")
        }

        var tokens: [Token] = []
        let chars = Array(text)
        var i = 0
        while i < chars.count {
            let c = chars[i]
            switch c {
            case " ", "\t", "\n":
                i += 1
            case "+": tokens.append(.plus); i += 1
            case "-", "−": tokens.append(.minus); i += 1
            case "*", "×": tokens.append(.star); i += 1
            case "/", "÷": tokens.append(.slash); i += 1
            case "(": tokens.append(.lparen); i += 1
            case ")": tokens.append(.rparen); i += 1
            case "%": tokens.append(.percent); i += 1
            default:
                if c.isNumber {
                    // Consume a number candidate: digits, dots, commas
                    var j = i
                    while j < chars.count, chars[j].isNumber || chars[j] == "." || chars[j] == "," {
                        j += 1
                    }
                    // Trim trailing separators (e.g. "100." at end of sentence)
                    var end = j
                    while end > i, chars[end - 1] == "." || chars[end - 1] == "," { end -= 1 }
                    let raw = String(chars[i..<end])
                    guard let value = parseNumber(raw) else { return [] }
                    tokens.append(.number(value))
                    i = end
                } else if c.isLetter {
                    var j = i
                    while j < chars.count, chars[j].isLetter { j += 1 }
                    let word = String(chars[i..<j])
                    switch word {
                    case "de": tokens.append(.kwDe)
                    case "iva": tokens.append(.kwIVA)
                    case "sin": tokens.append(.kwSin)
                    case "x": tokens.append(.star) // "2 x 3"
                    case "mas", "más": tokens.append(.plus)
                    case "menos": tokens.append(.minus)
                    case "por": tokens.append(.star)
                    default: return [] // unknown word → unparseable
                    }
                    i = j
                } else {
                    return [] // unknown char
                }
            }
        }
        return tokens
    }

    /// Colombian-aware number parsing.
    /// Rules: both separators → last one is decimal. Only "," → decimal.
    /// Only "." → thousands if every group after the first has exactly 3 digits ("1.500" = 1500), else decimal.
    static func parseNumber(_ raw: String) -> Double? {
        guard !raw.isEmpty else { return nil }
        let hasDot = raw.contains(".")
        let hasComma = raw.contains(",")

        func plain(_ s: String) -> Double? { Double(s) }

        if hasDot && hasComma {
            // Last separator is decimal
            let lastDot = raw.lastIndex(of: ".")!
            let lastComma = raw.lastIndex(of: ",")!
            if lastComma > lastDot {
                // "." thousands, "," decimal (Colombian: 1.500,50)
                return plain(raw.replacingOccurrences(of: ".", with: "")
                                .replacingOccurrences(of: ",", with: "."))
            } else {
                // "," thousands, "." decimal (US: 1,500.50)
                return plain(raw.replacingOccurrences(of: ",", with: ""))
            }
        }
        if hasComma {
            // "," is decimal; more than one comma → invalid
            guard raw.filter({ $0 == "," }).count == 1 else { return nil }
            return plain(raw.replacingOccurrences(of: ",", with: "."))
        }
        if hasDot {
            let groups = raw.split(separator: ".", omittingEmptySubsequences: false).map(String.init)
            guard groups.allSatisfy({ !$0.isEmpty }) else { return nil }
            let isThousands = groups.count >= 2
                && groups[0].count >= 1 && groups[0].count <= 3
                && groups.dropFirst().allSatisfy { $0.count == 3 }
            if isThousands {
                return plain(groups.joined())
            }
            // Single dot, non-3-digit tail → decimal (1.5); multiple irregular dots → invalid
            guard groups.count == 2 else { return nil }
            return plain(raw)
        }
        return plain(raw)
    }

    // MARK: - Parser (recursive descent)

    struct Parser {
        let tokens: [Token]
        var pos = 0

        var isAtEnd: Bool { pos >= tokens.count }
        var current: Token? { pos < tokens.count ? tokens[pos] : nil }

        mutating func advance() -> Token? {
            guard pos < tokens.count else { return nil }
            defer { pos += 1 }
            return tokens[pos]
        }

        mutating func match(_ token: Token) -> Bool {
            if current == token { pos += 1; return true }
            return false
        }

        // expr := term ( (+|-) rhs )*   where rhs may be relative % or IVA keyword
        mutating func parseExpression() -> Double? {
            guard var left = parseTerm() else { return nil }
            while let op = current, op == .plus || op == .minus {
                pos += 1
                let isPlus = (op == .plus)

                // "X + IVA" / "X - IVA" / "X sin IVA" handled at parseTerm via kwSin? No: sin handled here.
                if match(.kwIVA) {
                    left = isPlus ? left * (1 + CalculatorEngine.ivaRate)
                                  : left / (1 + CalculatorEngine.ivaRate)
                    continue
                }
                // Relative percent: "X + 20%" / "X - 20%" (only when term is exactly `number %`)
                if case .number(let n)? = current, pos + 1 < tokens.count, tokens[pos + 1] == .percent {
                    // Check it's not "X + 20% de Y" (that's percentOf, an absolute term)
                    let isPercentOf = pos + 2 < tokens.count && tokens[pos + 2] == .kwDe
                    if !isPercentOf {
                        pos += 2
                        // Allow continued multiplication? Keep simple: relative percent ends the term.
                        left = isPlus ? left * (1 + n / 100) : left * (1 - n / 100)
                        continue
                    }
                }
                guard let right = parseTerm() else { return nil }
                left = isPlus ? left + right : left - right
            }
            // "X sin IVA" postfix
            if match(.kwSin) {
                guard match(.kwIVA) else { return nil }
                left = left / (1 + CalculatorEngine.ivaRate)
            }
            return left
        }

        // term := unary ( (*|/) unary )*
        mutating func parseTerm() -> Double? {
            guard var left = parseUnary() else { return nil }
            while let op = current, op == .star || op == .slash {
                pos += 1
                guard let right = parseUnary() else { return nil }
                if op == .star { left = left * right }
                else {
                    guard right != 0 else { return nil }
                    left = left / right
                }
            }
            return left
        }

        // unary := '-' unary | postfix
        mutating func parseUnary() -> Double? {
            if match(.minus) {
                guard let value = parseUnary() else { return nil }
                return -value
            }
            return parsePostfix()
        }

        // postfix := primary [ '%' ]  (standalone % = n/100)
        mutating func parsePostfix() -> Double? {
            guard let value = parsePrimary() else { return nil }
            if match(.percent) {
                // "20% de X" → (20/100) * X
                if match(.kwDe) {
                    guard let target = parseExpression() else { return nil }
                    return (value / 100) * target
                }
                return value / 100
            }
            return value
        }

        // primary := NUMBER | '(' expr ')' | 'iva' 'de' expr
        mutating func parsePrimary() -> Double? {
            guard let token = advance() else { return nil }
            switch token {
            case .number(let n):
                return n
            case .lparen:
                guard let value = parseExpression(), match(.rparen) else { return nil }
                return value
            case .kwIVA:
                guard match(.kwDe), let target = parseExpression() else { return nil }
                return CalculatorEngine.ivaRate * target
            default:
                return nil
            }
        }
    }
}
