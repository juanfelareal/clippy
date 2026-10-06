import SwiftUI

struct SnippetsView: View {
    @ObservedObject var store: SnippetStore

    @State private var selectedID: UUID?
    @State private var trigger = ""
    @State private var expansion = ""
    @State private var errorMessage: String?

    private var isEditing: Bool { selectedID != nil }

    var body: some View {
        HSplitView {
            // Lista
            VStack(spacing: 0) {
                List(selection: $selectedID) {
                    ForEach(store.snippets.sorted { $0.trigger < $1.trigger }) { snippet in
                        VStack(alignment: .leading, spacing: 2) {
                            Text("//" + snippet.trigger)
                                .font(.system(.body, design: .monospaced).weight(.semibold))
                            Text(snippet.expansion.replacingOccurrences(of: "\n", with: " ⏎ "))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                        .padding(.vertical, 2)
                        .tag(snippet.id)
                    }
                }
                .listStyle(.inset)

                Divider()
                HStack(spacing: 8) {
                    Button {
                        clearForm()
                    } label: {
                        Image(systemName: "plus")
                    }
                    .help("Nuevo snippet")

                    Button {
                        deleteSelected()
                    } label: {
                        Image(systemName: "minus")
                    }
                    .disabled(selectedID == nil)
                    .help("Eliminar snippet")

                    Spacer()
                    Text("\(store.snippets.count) snippets")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(8)
            }
            .frame(minWidth: 200, idealWidth: 230, maxWidth: 300)

            // Editor
            VStack(alignment: .leading, spacing: 12) {
                Text(isEditing ? "Editar snippet" : "Nuevo snippet")
                    .font(.headline)

                VStack(alignment: .leading, spacing: 4) {
                    Text("Atajo (se escribe como //atajo)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    HStack(spacing: 2) {
                        Text("//")
                            .font(.system(.body, design: .monospaced))
                            .foregroundStyle(.secondary)
                        TextField("nit", text: $trigger)
                            .textFieldStyle(.roundedBorder)
                            .font(.system(.body, design: .monospaced))
                            .autocorrectionDisabled()
                    }
                    Text("Solo minúsculas y números, sin espacios (máx. 32).")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("Texto a insertar")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    TextEditor(text: $expansion)
                        .font(.body)
                        .scrollContentBackground(.hidden)
                        .padding(6)
                        .background(RoundedRectangle(cornerRadius: 6).fill(Color(nsColor: .textBackgroundColor)))
                        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color.secondary.opacity(0.3)))
                        .frame(minHeight: 120)
                }

                if let errorMessage = errorMessage {
                    Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }

                HStack {
                    if isEditing {
                        Button("Cancelar") { clearForm() }
                    }
                    Spacer()
                    Button(isEditing ? "Guardar cambios" : "Agregar") { save() }
                        .keyboardShortcut(.defaultAction)
                        .disabled(trigger.isEmpty || expansion.isEmpty)
                }

                Spacer(minLength: 0)
            }
            .padding(16)
            .frame(minWidth: 300, maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(minWidth: 560, minHeight: 340)
        .onChange(of: selectedID) { _, newValue in
            errorMessage = nil
            guard let id = newValue,
                  let snippet = store.snippets.first(where: { $0.id == id }) else { return }
            trigger = snippet.trigger
            expansion = snippet.expansion
        }
    }

    private func clearForm() {
        selectedID = nil
        trigger = ""
        expansion = ""
        errorMessage = nil
    }

    private func deleteSelected() {
        guard let id = selectedID,
              let snippet = store.snippets.first(where: { $0.id == id }) else { return }
        store.delete(snippet)
        clearForm()
    }

    private func save() {
        let trimmedTrigger = trigger.trimmingCharacters(in: .whitespacesAndNewlines)
        guard SnippetStore.isValidTrigger(trimmedTrigger) else {
            errorMessage = "Atajo inválido: solo a-z y 0-9, sin espacios, máximo 32 caracteres."
            return
        }
        if let conflict = store.prefixConflict(for: trimmedTrigger, excluding: selectedID) {
            errorMessage = "Choca con //\(conflict.trigger): un atajo no puede ser prefijo de otro."
            return
        }
        if let id = selectedID, var snippet = store.snippets.first(where: { $0.id == id }) {
            snippet.trigger = trimmedTrigger
            snippet.expansion = expansion
            store.update(snippet)
        } else {
            store.add(Snippet(trigger: trimmedTrigger, expansion: expansion))
        }
        clearForm()
    }
}
