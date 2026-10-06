import Foundation

enum ClipKind: Int {
    case text = 0
    case image = 1
}

struct ClipItem: Identifiable, Equatable {
    var id: Int64
    var kind: ClipKind
    var text: String?
    var imageFilename: String?
    var preview: String
    var createdAt: Date
    var lastUsedAt: Date
    var isPinned: Bool
    var contentHash: String
}
