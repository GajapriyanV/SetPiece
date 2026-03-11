const ITEMS = [
  { icon: "⚽", topic: "Messi vs Ronaldo", category: "GOAT Debate" },
  { icon: "🔥", topic: "Haaland vs Mbappé", category: "Future GOAT" },
  { icon: "⚡", topic: "Best PL Season Ever", category: "City 23/24 vs Arsenal 03/04" },
  { icon: "🏆", topic: "Greatest Club", category: "Real Madrid vs Barça" },
  { icon: "🎯", topic: "Best Free Kick Taker", category: "All Time" },
  { icon: "💥", topic: "Bellingham vs Pedri", category: "Gen Z Midfield" },
];

export default function DebateTicker() {
  // Double the items for seamless loop
  const allItems = [...ITEMS, ...ITEMS];

  return (
    <div
      style={{
        borderTop: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
        overflow: "hidden",
        padding: "12px 0",
        background: "var(--dark2)",
      }}
    >
      <div
        className="ticker-track"
        style={{ display: "flex", whiteSpace: "nowrap" }}
      >
        {allItems.map((item, i) => (
          <span
            key={i}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              padding: "0 32px",
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "11px",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              color: "var(--dim)",
            }}
          >
            <b style={{ color: "var(--g)", fontWeight: 400 }}>{item.icon}</b>
            {item.topic}
            <span style={{ color: "var(--border2)" }}>—</span>
            {item.category}
          </span>
        ))}
      </div>
    </div>
  );
}
