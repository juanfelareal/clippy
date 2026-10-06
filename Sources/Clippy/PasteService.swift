import AppKit
import ApplicationServices
import Carbon.HIToolbox

enum PasteService {
    // Set: snippet expansion + clipboard restore can produce two self-writes
    // within a single clipboard-monitor tick (0.5s).
    private static var selfChangeCounts: Set<Int> = []

    static func isSelfWrite(changeCount: Int) -> Bool {
        selfChangeCounts.contains(changeCount)
    }

    /// Marks a pasteboard changeCount as written by Clippy itself,
    /// so ClipboardMonitor won't add it to history.
    static func markSelfWrite(changeCount: Int) {
        selfChangeCounts.insert(changeCount)
        // Prune: keep only counts near the current one
        let current = NSPasteboard.general.changeCount
        selfChangeCounts = selfChangeCounts.filter { current - $0 < 20 }
    }

    /// Writes the item to the general pasteboard.
    static func copy(_ item: ClipItem, imageStore: ImageStore) {
        let pb = NSPasteboard.general
        pb.clearContents()
        switch item.kind {
        case .text:
            pb.setString(item.text ?? "", forType: .string)
        case .image:
            if let file = item.imageFilename, let data = imageStore.fullImageData(filename: file) {
                pb.setData(data, forType: .png)
            }
        }
        markSelfWrite(changeCount: pb.changeCount)
    }

    static var hasAccessibilityPermission: Bool {
        AXIsProcessTrusted()
    }

    /// Shows only the system prompt (it also registers Clippy in the Accessibility
    /// list, so the user just flips the switch). A HUD explains the fallback —
    /// a second modal alert on top of the system one was confusing.
    static func requestAccessibilityPermission() {
        let opts = ["AXTrustedCheckOptionPrompt": true] as CFDictionary
        AXIsProcessTrustedWithOptions(opts)
        HUD.show("Copiado — pégalo con ⌘V")
    }

    /// Simulates ⌘V in the previously frontmost app.
    static func pasteToFrontmost(previousApp: NSRunningApplication?) {
        guard hasAccessibilityPermission else {
            requestAccessibilityPermission()
            return
        }
        previousApp?.activate()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
            let src = CGEventSource(stateID: .combinedSessionState)
            src?.setLocalEventsFilterDuringSuppressionState(
                [.permitLocalMouseEvents, .permitSystemDefinedEvents],
                state: .eventSuppressionStateSuppressionInterval
            )
            let vDown = CGEvent(keyboardEventSource: src, virtualKey: CGKeyCode(kVK_ANSI_V), keyDown: true)
            let vUp = CGEvent(keyboardEventSource: src, virtualKey: CGKeyCode(kVK_ANSI_V), keyDown: false)
            vDown?.flags = .maskCommand
            vUp?.flags = .maskCommand
            vDown?.post(tap: .cgSessionEventTap)
            vUp?.post(tap: .cgSessionEventTap)
        }
    }
}
