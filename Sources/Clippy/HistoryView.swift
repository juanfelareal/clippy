import SwiftUI

struct HistoryView: View {
    @ObservedObject var store: HistoryStore
    var onCommit: (CommitAction, ClipItem) -> Void

    @FocusState private var searchFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            searchBar
            Divider()
            if store.filtered.isEmpty {
                emptyState
            } else {
                itemList
            }
            Divider()
            footer
        }
        .frame(width: PanelController.panelWidth, height: PanelController.panelHeight)
        .onAppear { searchFocused = true }
        .onReceive(NotificationCenter.default.publisher(for: .clippyPanelDidShow)) { _ in
            searchFocused = true
        }
    }

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundColor(.secondary)
            TextField("Buscar en el historial...", text: $store.query)
                .textFieldStyle(.plain)
                .font(.system(size: 15))
                .focused($searchFocused)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Spacer()
            Image(systemName: "clipboard")
                .font(.system(size: 36))
                .foregroundColor(.secondary.opacity(0.5))
            Text(store.query.isEmpty ? "Tu historial está vacío.\nCopia algo para empezar." : "Sin resultados para “\(store.query)”")
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)
                .font(.system(size: 13))
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private var itemList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 2) {
                    ForEach(Array(store.filtered.enumerated()), id: \.element.id) { index, item in
                        ItemRow(item: item,
                                index: index,
                                isSelected: index == store.selectedIndex,
                                thumbnail: item.imageFilename.flatMap { store.imageStore.thumbnail(for: $0) })
                            .id(item.id)
                            .onTapGesture {
                                store.selectedIndex = index
                                onCommit(.paste, item)
                            }
                    }
                }
                .padding(6)
            }
            .onChange(of: store.selectedIndex) { _, newIndex in
                let list = store.filtered
                if list.indices.contains(newIndex) {
                    proxy.scrollTo(list[newIndex].id)
                }
            }
        }
    }

    private var footer: some View {
        HStack(spacing: 12) {
            shortcutHint("⏎", "pegar")
            shortcutHint("⌥⏎", "copiar")
            shortcutHint("⌥P", "pin")
            shortcutHint("⌥⌫", "borrar")
            Spacer()
            Text("\(store.filtered.count)")
                .font(.system(size: 11))
                .foregroundColor(.secondary)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
    }

    private func shortcutHint(_ key: String, _ label: String) -> some View {
        HStack(spacing: 3) {
            Text(key)
                .font(.system(size: 10, weight: .semibold, design: .rounded))
                .padding(.horizontal, 4)
                .padding(.vertical, 1)
                .background(Color.secondary.opacity(0.15))
                .cornerRadius(3)
            Text(label)
                .font(.system(size: 10))
                .foregroundColor(.secondary)
        }
    }
}

private struct ItemRow: View {
    let item: ClipItem
    let index: Int
    let isSelected: Bool
    let thumbnail: NSImage?

    var body: some View {
        HStack(spacing: 10) {
            if index < 9 {
                Text("⌘\(index + 1)")
                    .font(.system(size: 10, weight: .medium, design: .rounded))
                    .foregroundColor(isSelected ? .white.opacity(0.8) : .secondary)
                    .frame(width: 26, alignment: .leading)
            } else {
                Spacer().frame(width: 26)
            }

            if item.kind == .image {
                if let thumb = thumbnail {
                    Image(nsImage: thumb)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(maxWidth: 120, maxHeight: 48)
                        .cornerRadius(4)
                } else {
                    Label("Imagen", systemImage: "photo")
                        .font(.system(size: 13))
                }
                Spacer()
            } else {
                Text(item.preview)
                    .font(.system(size: 13))
                    .lineLimit(2)
                    .truncationMode(.tail)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            if item.isPinned {
                Image(systemName: "pin.fill")
                    .font(.system(size: 10))
                    .foregroundColor(isSelected ? .white.opacity(0.8) : .orange)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(isSelected ? Color.accentColor : Color.clear)
        )
        .foregroundColor(isSelected ? .white : .primary)
        .contentShape(Rectangle())
    }
}
