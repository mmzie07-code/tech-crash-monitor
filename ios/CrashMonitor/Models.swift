import Foundation

struct Check: Codable, Identifiable {
    let id: Int
    let name: String
    let group: String
    let status: String      // "warn" | "ok" | "unknown"
    let detail: String
    let threshold: String?
    let proxy: Bool
}

struct Snapshot: Codable {
    let date: String
    let score: Int?
    let level: String
    let stretch: Int?
    let trigger: Int?
    let evaluated: Int
    let total: Int
    let checks: [Check]
    let disclaimer: String
}

enum API {
    // Point at wherever the daily engine publishes latest.json (static host or API).
    static let url = URL(string: "http://localhost:4175/data/latest.json")!
    static func load() async throws -> Snapshot {
        let (data, _) = try await URLSession.shared.data(from: url)
        return try JSONDecoder().decode(Snapshot.self, from: data)
    }
}
