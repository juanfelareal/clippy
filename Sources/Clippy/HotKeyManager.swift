import Carbon.HIToolbox
import Foundation

final class HotKeyManager {
    enum HotKeyID: UInt32 {
        case historyPanel = 1
        case annotate = 2
        case ocr = 3
        case calculator = 4
    }

    private var refs: [UInt32: EventHotKeyRef] = [:]
    private var handlers: [UInt32: () -> Void] = [:]
    private var eventHandler: EventHandlerRef?
    private static let signature = OSType(0x434C5059) // 'CLPY'

    /// Registers a global hotkey. Returns false if the OS rejected the combo.
    @discardableResult
    func register(_ id: HotKeyID, keyCode: UInt32, modifiers: UInt32, handler: @escaping () -> Void) -> Bool {
        installHandlerIfNeeded()
        handlers[id.rawValue] = handler

        let hotKeyID = EventHotKeyID(signature: HotKeyManager.signature, id: id.rawValue)
        var ref: EventHotKeyRef?
        let status = RegisterEventHotKey(keyCode, modifiers, hotKeyID,
                                         GetApplicationEventTarget(), 0, &ref)
        guard status == noErr, let ref = ref else {
            NSLog("Clippy: RegisterEventHotKey failed for \(id) (status \(status)) — otra app puede tener ese atajo")
            handlers[id.rawValue] = nil
            return false
        }
        refs[id.rawValue] = ref
        return true
    }

    func unregisterAll() {
        for (_, ref) in refs { UnregisterEventHotKey(ref) }
        refs.removeAll()
        handlers.removeAll()
        if let handler = eventHandler {
            RemoveEventHandler(handler)
            eventHandler = nil
        }
    }

    private func installHandlerIfNeeded() {
        guard eventHandler == nil else { return }
        var eventType = EventTypeSpec(eventClass: OSType(kEventClassKeyboard),
                                      eventKind: UInt32(kEventHotKeyPressed))
        let selfPtr = Unmanaged.passUnretained(self).toOpaque()
        let status = InstallEventHandler(GetApplicationEventTarget(), { _, event, userData in
            guard let userData = userData, let event = event else { return noErr }
            var hkID = EventHotKeyID()
            GetEventParameter(event, EventParamName(kEventParamDirectObject),
                              EventParamType(typeEventHotKeyID), nil,
                              MemoryLayout<EventHotKeyID>.size, nil, &hkID)
            let manager = Unmanaged<HotKeyManager>.fromOpaque(userData).takeUnretainedValue()
            if let handler = manager.handlers[hkID.id] {
                DispatchQueue.main.async { handler() }
            }
            return noErr
        }, 1, &eventType, selfPtr, &eventHandler)
        if status != noErr {
            NSLog("Clippy: InstallEventHandler failed: \(status)")
        }
    }
}
