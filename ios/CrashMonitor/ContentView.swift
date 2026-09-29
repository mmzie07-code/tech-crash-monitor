import SwiftUI

@main
struct CrashMonitorApp: App {
    var body: some Scene { WindowGroup { ContentView() } }
}

struct ContentView: View {
    @State private var snap: Snapshot?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                if let s = snap {
                    Section {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("\(s.score ?? 0)").font(.system(size: 64, weight: .bold))
                            Text("\(s.level) risk").font(.headline)
                            Text("Stretch \(s.stretch ?? 0) · Trigger \(s.trigger ?? 0) · \(s.evaluated)/\(s.total) checks live")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                    Section("Checklist") {
                        ForEach(s.checks) { c in
                            HStack(alignment: .top, spacing: 10) {
                                Circle().fill(color(c.status)).frame(width: 12, height: 12).padding(.top, 5)
                                VStack(alignment: .leading) {
                                    Text("\(c.id). \(c.name)").fontWeight(.semibold)
                                    Text(c.detail).font(.footnote).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                    Section { Text(s.disclaimer).font(.caption).foregroundStyle(.secondary) }
                } else if let e = error {
                    Text(e)
                } else { ProgressView() }
            }
            .navigationTitle("Tech Crash Monitor")
            .task { await refresh() }
            .refreshable { await refresh() }
        }
    }

    func color(_ status: String) -> Color {
        status == "warn" ? .orange : status == "ok" ? .green : .gray
    }
    func refresh() async {
        do { snap = try await API.load(); error = nil } catch { self.error = error.localizedDescription }
    }
}
