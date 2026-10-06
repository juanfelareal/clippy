import Foundation

enum Settings {
    static var historyLimit: Int {
        let value = UserDefaults.standard.integer(forKey: "historyLimit")
        return value > 0 ? value : 200
    }
}
