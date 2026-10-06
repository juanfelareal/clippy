import Foundation
import Combine

struct Snippet: Codable, Identifiable, Equatable {
    var id = UUID()
    var trigger: String    // ASCII [a-z0-9], no spaces; typed as //trigger
    var expansion: String
    var createdAt = Date()
}

final class SnippetStore: ObservableObject {
    @Published private(set) var snippets: [Snippet] = [] {
        didSet { rebuildCache() }
    }

    /// Triggers sorted by length desc for longest-match. Read from the engine (main thread).
    private(set) var triggersByLength: [Snippet] = []

    private var fileURL: URL {
        Database.appSupportDir.appendingPathComponent("snippets.json")
    }

    init() {
        load()
    }

    static func isValidTrigger(_ trigger: String) -> Bool {
        !trigger.isEmpty && trigger.count <= 32 &&
        trigger.allSatisfy { ($0.isLowercase && $0.isASCII && $0.isLetter) || ($0.isNumber && $0.isASCII) }
    }

    /// Returns a conflicting snippet if `trigger` is a prefix of an existing one or vice versa.
    func prefixConflict(for trigger: String, excluding id: UUID?) -> Snippet? {
        snippets.first { other in
            other.id != id && (other.trigger.hasPrefix(trigger) || trigger.hasPrefix(other.trigger))
        }
    }

    func add(_ snippet: Snippet) {
        snippets.append(snippet)
        save()
    }

    func update(_ snippet: Snippet) {
        guard let index = snippets.firstIndex(where: { $0.id == snippet.id }) else { return }
        snippets[index] = snippet
        save()
    }

    func delete(_ snippet: Snippet) {
        snippets.removeAll { $0.id == snippet.id }
        save()
    }

    private func rebuildCache() {
        triggersByLength = snippets.sorted { $0.trigger.count > $1.trigger.count }
    }

    private func load() {
        guard let data = try? Data(contentsOf: fileURL),
              let decoded = try? JSONDecoder().decode([Snippet].self, from: data) else { return }
        snippets = decoded
    }

    private func save() {
        try? FileManager.default.createDirectory(at: Database.appSupportDir, withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        guard let data = try? encoder.encode(snippets) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }
}
