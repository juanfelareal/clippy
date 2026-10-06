import SwiftUI

final class CalculatorModel: ObservableObject {
    @Published var input: String = "" {
        didSet {
            result = CalculatorEngine.evaluate(input)
        }
    }
    @Published private(set) var result: Double?

    var formattedResult: String? {
        result.map { CalculatorEngine.format($0) }
    }
}

struct CalculatorView: View {
    @ObservedObject var model: CalculatorModel
    @FocusState private var fieldFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "plusminus.circle")
                    .foregroundColor(.secondary)
                TextField("1.500.000 + IVA, 20% de 300.000...", text: $model.input)
                    .textFieldStyle(.plain)
                    .font(.system(size: 16))
                    .focused($fieldFocused)
            }
            HStack {
                Text(model.formattedResult ?? "—")
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                    .foregroundColor(model.result == nil ? .secondary.opacity(0.4) : .primary)
                    .textSelection(.enabled)
                Spacer()
                if model.result != nil {
                    Text("⏎ copiar")
                        .font(.system(size: 10))
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(16)
        .frame(width: CalculatorPanelController.panelWidth,
               height: CalculatorPanelController.panelHeight)
        .onAppear { fieldFocused = true }
        .onReceive(NotificationCenter.default.publisher(for: .clippyCalculatorDidShow)) { _ in
            fieldFocused = true
        }
    }
}

extension Notification.Name {
    static let clippyCalculatorDidShow = Notification.Name("clippyCalculatorDidShow")
}
