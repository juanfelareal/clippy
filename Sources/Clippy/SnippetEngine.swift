import AppKit
import Carbon.HIToolbox

/// Rolling keystroke buffer + trigger matching. Connects KeyEventTap → TextInjector.
final class SnippetEngine {
    private let store: SnippetStore
    private let tap: KeyEventTap
    private var buffer = ""
    private var appSwitchObserver: NSObjectProtocol?

    private static let bufferCap = 64

    init(store: SnippetStore, tap: KeyEventTap) {
        self.store = store
        self.tap = tap

        tap.onStroke = { [weak self] stroke in
            self?.handle(stroke)
        }

        // App switch → clear buffer (a trigger can't span two apps)
        appSwitchObserver = NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            self?.buffer = ""
        }
    }

    deinit {
        if let observer = appSwitchObserver {
            NSWorkspace.shared.notificationCenter.removeObserver(observer)
        }
    }

    @discardableResult
    func start() -> Bool { tap.start() }

    func stop() {
        tap.stop()
        buffer = ""
    }

    private func handle(_ stroke: KeyEventTap.Stroke) {
        // Password fields etc.: never buffer secure input
        if IsSecureEventInputEnabled() {
            buffer = ""
            return
        }

        switch stroke {
        case .reset:
            buffer = ""
        case .backspace:
            if !buffer.isEmpty { buffer.removeLast() }
        case .char(let str):
            buffer += str
            if buffer.count > SnippetEngine.bufferCap {
                buffer.removeFirst(buffer.count - SnippetEngine.bufferCap)
            }
            checkForMatch()
        }
    }

    private func checkForMatch() {
        guard buffer.contains("/") else { return } // fast path
        for snippet in store.triggersByLength {
            let full = "//" + snippet.trigger
            if buffer.hasSuffix(full) {
                expand(snippet, typedLength: full.count)
                return
            }
        }
    }

    private func expand(_ snippet: Snippet, typedLength: Int) {
        buffer = ""
        tap.isInjecting = true
        TextInjector.replace(deleteCount: typedLength, with: snippet.expansion) { [weak self] in
            self?.tap.isInjecting = false
        }
    }
}
