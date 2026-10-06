import AppKit
import Combine
import CryptoKit

final class HistoryStore: ObservableObject {
    @Published private(set) var items: [ClipItem] = []
    @Published var query: String = "" {
        didSet { selectedIndex = 0 }
    }
    @Published var selectedIndex: Int = 0

    let imageStore = ImageStore()
    private let db = Database()

    var filtered: [ClipItem] {
        guard !query.isEmpty else { return items }
        return items.filter { item in
            let haystack = item.kind == .text ? (item.text ?? "") : "imagen image"
            if haystack.range(of: query, options: [.caseInsensitive, .diacriticInsensitive]) != nil {
                return true
            }
            return HistoryStore.fuzzyMatch(query: query, in: item.preview)
        }
    }

    var selectedItem: ClipItem? {
        let list = filtered
        guard list.indices.contains(selectedIndex) else { return nil }
        return list[selectedIndex]
    }

    init() {
        items = db.loadAll()
    }

    // MARK: - Capture

    func capture(_ capture: ClipCapture) {
        let now = Date()
        switch capture {
        case .text(let str):
            let hash = HistoryStore.sha256(Data(str.utf8))
            if bumpExisting(hash: hash, date: now) { return }
            let preview = String(str.trimmingCharacters(in: .whitespacesAndNewlines).prefix(200))
            guard let id = db.insert(kind: .text, text: str, imageFilename: nil,
                                     preview: preview, contentHash: hash, date: now) else { return }
            let item = ClipItem(id: id, kind: .text, text: str, imageFilename: nil,
                                preview: preview, createdAt: now, lastUsedAt: now,
                                isPinned: false, contentHash: hash)
            insertSorted(item)
        case .image(let png):
            let hash = HistoryStore.sha256(png)
            if bumpExisting(hash: hash, date: now) { return }
            let filename = imageStore.save(pngData: png, hash: hash)
            guard let id = db.insert(kind: .image, text: nil, imageFilename: filename,
                                     preview: "", contentHash: hash, date: now) else { return }
            let item = ClipItem(id: id, kind: .image, text: nil, imageFilename: filename,
                                preview: "", createdAt: now, lastUsedAt: now,
                                isPinned: false, contentHash: hash)
            insertSorted(item)
        }
        purge()
    }

    /// If an item with this hash exists, bump it to the top. Returns true if handled.
    private func bumpExisting(hash: String, date: Date) -> Bool {
        guard let index = items.firstIndex(where: { $0.contentHash == hash }) else { return false }
        var item = items.remove(at: index)
        item.lastUsedAt = date
        db.touch(id: item.id, date: date)
        insertSorted(item)
        return true
    }

    func touch(_ item: ClipItem) {
        _ = bumpExisting(hash: item.contentHash, date: Date())
    }

    private func insertSorted(_ item: ClipItem) {
        // Pinned first, then by lastUsedAt descending
        if item.isPinned {
            items.insert(item, at: 0)
        } else {
            let index = items.firstIndex(where: { !$0.isPinned }) ?? items.count
            items.insert(item, at: index)
        }
    }

    private func purge() {
        let purgedFiles = db.purge(limit: Settings.historyLimit)
        for file in purgedFiles { imageStore.remove(filename: file) }
        let unpinned = items.filter { !$0.isPinned }
        if unpinned.count > Settings.historyLimit {
            let keep = Set(unpinned.prefix(Settings.historyLimit).map(\.id))
            items.removeAll { !$0.isPinned && !keep.contains($0.id) }
        }
    }

    // MARK: - Actions

    func togglePin(_ item: ClipItem) {
        guard let index = items.firstIndex(where: { $0.id == item.id }) else { return }
        var updated = items.remove(at: index)
        updated.isPinned.toggle()
        db.setPinned(id: updated.id, pinned: updated.isPinned)
        insertSorted(updated)
    }

    func delete(_ item: ClipItem) {
        db.delete(id: item.id)
        if let file = item.imageFilename { imageStore.remove(filename: file) }
        items.removeAll { $0.id == item.id }
        if selectedIndex >= filtered.count { selectedIndex = max(0, filtered.count - 1) }
    }

    func clearUnpinned() {
        for item in items where !item.isPinned {
            if let file = item.imageFilename { imageStore.remove(filename: file) }
        }
        db.deleteAllUnpinned()
        items.removeAll { !$0.isPinned }
        selectedIndex = 0
    }

    // MARK: - Selection

    func moveSelection(_ delta: Int) {
        let count = filtered.count
        guard count > 0 else { return }
        selectedIndex = min(max(selectedIndex + delta, 0), count - 1)
    }

    // MARK: - Helpers

    static func sha256(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    static func fuzzyMatch(query: String, in text: String) -> Bool {
        let q = query.lowercased()
        let t = text.lowercased()
        var idx = t.startIndex
        for ch in q {
            guard let found = t[idx...].firstIndex(of: ch) else { return false }
            idx = t.index(after: found)
        }
        return true
    }
}
