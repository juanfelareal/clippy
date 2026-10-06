import Foundation
import SQLite3

private let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

final class Database {
    private var db: OpaquePointer?

    static let appSupportDir: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("Clippy", isDirectory: true)
    }()

    init() {
        let dir = Database.appSupportDir
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let path = dir.appendingPathComponent("clippy.sqlite").path
        if sqlite3_open_v2(path, &db, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX, nil) != SQLITE_OK {
            NSLog("Clippy: failed to open database at \(path)")
            return
        }
        exec("PRAGMA journal_mode=WAL")
        exec("""
        CREATE TABLE IF NOT EXISTS items (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            kind          INTEGER NOT NULL,
            text          TEXT,
            image_file    TEXT,
            preview       TEXT NOT NULL,
            content_hash  TEXT NOT NULL UNIQUE,
            created_at    REAL NOT NULL,
            last_used_at  REAL NOT NULL,
            pinned        INTEGER NOT NULL DEFAULT 0
        )
        """)
        exec("CREATE INDEX IF NOT EXISTS idx_items_order ON items (pinned DESC, last_used_at DESC)")
    }

    deinit {
        sqlite3_close(db)
    }

    private func exec(_ sql: String) {
        var err: UnsafeMutablePointer<CChar>?
        if sqlite3_exec(db, sql, nil, nil, &err) != SQLITE_OK {
            NSLog("Clippy: sqlite error: \(err.map { String(cString: $0) } ?? "unknown")")
            sqlite3_free(err)
        }
    }

    // MARK: - CRUD

    /// Inserts a new item and returns its rowid, or nil on failure.
    func insert(kind: ClipKind, text: String?, imageFilename: String?, preview: String, contentHash: String, date: Date) -> Int64? {
        let sql = "INSERT INTO items (kind, text, image_file, preview, content_hash, created_at, last_used_at, pinned) VALUES (?,?,?,?,?,?,?,0)"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { return nil }
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_int(stmt, 1, Int32(kind.rawValue))
        if let text = text {
            sqlite3_bind_text(stmt, 2, text, -1, SQLITE_TRANSIENT)
        } else {
            sqlite3_bind_null(stmt, 2)
        }
        if let file = imageFilename {
            sqlite3_bind_text(stmt, 3, file, -1, SQLITE_TRANSIENT)
        } else {
            sqlite3_bind_null(stmt, 3)
        }
        sqlite3_bind_text(stmt, 4, preview, -1, SQLITE_TRANSIENT)
        sqlite3_bind_text(stmt, 5, contentHash, -1, SQLITE_TRANSIENT)
        sqlite3_bind_double(stmt, 6, date.timeIntervalSince1970)
        sqlite3_bind_double(stmt, 7, date.timeIntervalSince1970)
        guard sqlite3_step(stmt) == SQLITE_DONE else { return nil }
        return sqlite3_last_insert_rowid(db)
    }

    func findByHash(_ hash: String) -> Int64? {
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, "SELECT id FROM items WHERE content_hash = ?", -1, &stmt, nil) == SQLITE_OK else { return nil }
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_text(stmt, 1, hash, -1, SQLITE_TRANSIENT)
        guard sqlite3_step(stmt) == SQLITE_ROW else { return nil }
        return sqlite3_column_int64(stmt, 0)
    }

    func touch(id: Int64, date: Date) {
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, "UPDATE items SET last_used_at = ? WHERE id = ?", -1, &stmt, nil) == SQLITE_OK else { return }
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_double(stmt, 1, date.timeIntervalSince1970)
        sqlite3_bind_int64(stmt, 2, id)
        sqlite3_step(stmt)
    }

    func setPinned(id: Int64, pinned: Bool) {
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, "UPDATE items SET pinned = ? WHERE id = ?", -1, &stmt, nil) == SQLITE_OK else { return }
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_int(stmt, 1, pinned ? 1 : 0)
        sqlite3_bind_int64(stmt, 2, id)
        sqlite3_step(stmt)
    }

    func delete(id: Int64) {
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, "DELETE FROM items WHERE id = ?", -1, &stmt, nil) == SQLITE_OK else { return }
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_int64(stmt, 1, id)
        sqlite3_step(stmt)
    }

    func deleteAllUnpinned() {
        exec("DELETE FROM items WHERE pinned = 0")
    }

    /// Deletes unpinned items beyond the limit, returning the image filenames of purged rows.
    func purge(limit: Int) -> [String] {
        var purgedImages: [String] = []
        let selectSQL = """
        SELECT id, image_file FROM items
        WHERE pinned = 0 AND id NOT IN (
            SELECT id FROM items WHERE pinned = 0 ORDER BY last_used_at DESC LIMIT ?
        )
        """
        var stmt: OpaquePointer?
        var ids: [Int64] = []
        if sqlite3_prepare_v2(db, selectSQL, -1, &stmt, nil) == SQLITE_OK {
            sqlite3_bind_int(stmt, 1, Int32(limit))
            while sqlite3_step(stmt) == SQLITE_ROW {
                ids.append(sqlite3_column_int64(stmt, 0))
                if let cstr = sqlite3_column_text(stmt, 1) {
                    purgedImages.append(String(cString: cstr))
                }
            }
        }
        sqlite3_finalize(stmt)
        for id in ids { delete(id: id) }
        return purgedImages
    }

    func loadAll() -> [ClipItem] {
        var items: [ClipItem] = []
        var stmt: OpaquePointer?
        let sql = "SELECT id, kind, text, image_file, preview, content_hash, created_at, last_used_at, pinned FROM items ORDER BY pinned DESC, last_used_at DESC"
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { return items }
        defer { sqlite3_finalize(stmt) }
        while sqlite3_step(stmt) == SQLITE_ROW {
            let id = sqlite3_column_int64(stmt, 0)
            let kind = ClipKind(rawValue: Int(sqlite3_column_int(stmt, 1))) ?? .text
            let text = sqlite3_column_text(stmt, 2).map { String(cString: $0) }
            let imageFile = sqlite3_column_text(stmt, 3).map { String(cString: $0) }
            let preview = sqlite3_column_text(stmt, 4).map { String(cString: $0) } ?? ""
            let hash = sqlite3_column_text(stmt, 5).map { String(cString: $0) } ?? ""
            let created = Date(timeIntervalSince1970: sqlite3_column_double(stmt, 6))
            let lastUsed = Date(timeIntervalSince1970: sqlite3_column_double(stmt, 7))
            let pinned = sqlite3_column_int(stmt, 8) == 1
            items.append(ClipItem(id: id, kind: kind, text: text, imageFilename: imageFile,
                                  preview: preview, createdAt: created, lastUsedAt: lastUsed,
                                  isPinned: pinned, contentHash: hash))
        }
        return items
    }
}
