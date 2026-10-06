import AppKit
import Carbon.HIToolbox

/// Replaces the typed //trigger with the snippet expansion in the frontmost app.
enum TextInjector {
    /// Tagged source so KeyEventTap ignores our synthetic events.
    private static let source: CGEventSource? = {
        let src = CGEventSource(stateID: .privateState)
        src?.userData = KeyEventTap.selfEventMagic
        return src
    }()

    /// Deletes `deleteCount` characters, then inserts `text`.
    /// Short single-line text → synthetic unicode typing (no clipboard pollution).
    /// Long or multi-line → clipboard + ⌘V, restoring the previous clipboard string.
    static func replace(deleteCount: Int, with text: String, completion: @escaping () -> Void) {
        // Backspaces
        for _ in 0..<deleteCount {
            postKey(CGKeyCode(kVK_Delete))
        }

        if text.utf16.count <= 200 && !text.contains("\n") {
            typeUnicode(text)
            completion()
        } else {
            pasteViaClipboard(text, completion: completion)
        }
    }

    private static func postKey(_ keyCode: CGKeyCode, flags: CGEventFlags = []) {
        let down = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: true)
        let up = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: false)
        down?.flags = flags
        up?.flags = flags
        down?.post(tap: .cgSessionEventTap)
        up?.post(tap: .cgSessionEventTap)
    }

    /// Types text via CGEventKeyboardSetUnicodeString in chunks of ≤20 UTF-16 units.
    private static func typeUnicode(_ text: String) {
        let units = Array(text.utf16)
        var index = 0
        while index < units.count {
            let chunk = Array(units[index..<min(index + 20, units.count)])
            let down = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: true)
            let up = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: false)
            down?.keyboardSetUnicodeString(stringLength: chunk.count, unicodeString: chunk)
            up?.keyboardSetUnicodeString(stringLength: chunk.count, unicodeString: chunk)
            down?.post(tap: .cgSessionEventTap)
            up?.post(tap: .cgSessionEventTap)
            index += 20
        }
    }

    private static func pasteViaClipboard(_ text: String, completion: @escaping () -> Void) {
        let pb = NSPasteboard.general
        let previous = pb.string(forType: .string)

        pb.clearContents()
        pb.setString(text, forType: .string)
        PasteService.markSelfWrite(changeCount: pb.changeCount)

        // ⌘V (target app is already frontmost)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.03) {
            postKey(CGKeyCode(kVK_ANSI_V), flags: .maskCommand)
            // Restore previous clipboard string after the paste lands
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                if let previous = previous {
                    pb.clearContents()
                    pb.setString(previous, forType: .string)
                    PasteService.markSelfWrite(changeCount: pb.changeCount)
                }
                completion()
            }
        }
    }
}
