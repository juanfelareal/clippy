import AppKit
import Carbon.HIToolbox

/// Global keyboard observation for snippet expansion.
///
/// Uses an ACTIVE CGEvent tap (kCGEventTapOptionDefault → gated by the
/// Accessibility permission Clippy already has; a listen-only tap would
/// require the separate Input Monitoring permission) but NEVER modifies or
/// swallows events — every event is passed through untouched.
final class KeyEventTap {
    enum Stroke {
        case char(String)
        case backspace
        case reset
    }

    /// Magic userData tag identifying Clippy's own synthetic events ('CLPYSNIP').
    static let selfEventMagic: Int64 = 0x434C5059534E4950

    var onStroke: ((Stroke) -> Void)? // main thread
    var isInjecting = false

    private var tap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?

    @discardableResult
    func start() -> Bool {
        guard tap == nil else { return true }
        let mask: CGEventMask =
            (1 << CGEventType.keyDown.rawValue) |
            (1 << CGEventType.leftMouseDown.rawValue) |
            (1 << CGEventType.rightMouseDown.rawValue)

        let selfPtr = Unmanaged.passUnretained(self).toOpaque()
        guard let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .defaultTap,
            eventsOfInterest: mask,
            callback: { proxy, type, event, userData in
                guard let userData = userData else { return Unmanaged.passUnretained(event) }
                let tap = Unmanaged<KeyEventTap>.fromOpaque(userData).takeUnretainedValue()
                return tap.handle(proxy: proxy, type: type, event: event)
            },
            userInfo: selfPtr
        ) else {
            NSLog("Clippy: CGEvent.tapCreate failed (¿permiso de Accesibilidad revocado tras recompilar?)")
            return false
        }

        self.tap = tap
        runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        CFRunLoopAddSource(CFRunLoopGetMain(), runLoopSource, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
        return true
    }

    func stop() {
        if let tap = tap {
            CGEvent.tapEnable(tap: tap, enable: false)
        }
        if let source = runLoopSource {
            CFRunLoopRemoveSource(CFRunLoopGetMain(), source, .commonModes)
        }
        tap = nil
        runLoopSource = nil
    }

    private func handle(proxy: CGEventTapProxy, type: CGEventType, event: CGEvent) -> Unmanaged<CGEvent>? {
        // #1 real-world tap bug: macOS silently disables slow taps. Re-enable.
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            if let tap = tap { CGEvent.tapEnable(tap: tap, enable: true) }
            return Unmanaged.passUnretained(event)
        }

        // Ignore Clippy's own synthetic events
        if isInjecting || event.getIntegerValueField(.eventSourceUserData) == KeyEventTap.selfEventMagic {
            return Unmanaged.passUnretained(event)
        }

        let stroke = classify(type: type, event: event)
        if let stroke = stroke {
            DispatchQueue.main.async { [weak self] in
                self?.onStroke?(stroke)
            }
        }
        return Unmanaged.passUnretained(event)
    }

    private func classify(type: CGEventType, event: CGEvent) -> Stroke? {
        switch type {
        case .leftMouseDown, .rightMouseDown:
            return .reset
        case .keyDown:
            let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
            let flags = event.flags

            if flags.contains(.maskCommand) || flags.contains(.maskControl) {
                return .reset
            }
            switch keyCode {
            case 51: return .backspace                       // delete
            case 36, 76, 48, 53: return .reset               // return, enter, tab, esc
            case 123, 124, 125, 126: return .reset           // arrows
            case 115, 116, 119, 121: return .reset           // home/pgup/end/pgdn
            default:
                var length = 0
                var chars = [UniChar](repeating: 0, count: 4)
                event.keyboardGetUnicodeString(maxStringLength: 4,
                                               actualStringLength: &length,
                                               unicodeString: &chars)
                guard length > 0 else { return .reset }       // dead keys etc.
                let str = String(utf16CodeUnits: chars, count: length)
                if str.rangeOfCharacter(from: .whitespacesAndNewlines) != nil {
                    return .reset                             // space can't be inside a trigger
                }
                if str.rangeOfCharacter(from: .controlCharacters) != nil {
                    return .reset
                }
                return .char(str)
            }
        default:
            return nil
        }
    }
}
