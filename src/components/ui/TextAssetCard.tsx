'use client';

interface TextCard {
  type: string;
  title: string;
  content: string;
  source: string;
  confidence: number;
}

interface TextAssetCardProps {
  textCards: TextCard[];
}

const TYPE_STYLES: Record<string, { label: string; color: string }> = {
  metar:      { label: 'METAR',  color: 'bg-blue-600/20 text-blue-400 border-blue-500/30' },
  taf:        { label: 'TAF',    color: 'bg-blue-600/20 text-blue-400 border-blue-500/30' },
  regulation: { label: 'REG',    color: 'bg-amber-600/20 text-amber-400 border-amber-500/30' },
  reference:  { label: 'REF',    color: 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30' },
};

const DEFAULT_STYLE = { label: 'REF', color: 'bg-gray-600/20 text-gray-400 border-gray-500/30' };

export function TextAssetCard({ textCards }: TextAssetCardProps) {
  if (textCards.length === 0) return null;

  return (
    <div className="mt-2 mb-3 space-y-2">
      {textCards.map((card, idx) => {
        const style = TYPE_STYLES[card.type] ?? DEFAULT_STYLE;
        const isWeatherData = card.type === 'metar' || card.type === 'taf';

        return (
          <div
            key={idx}
            className="rounded-lg border border-c-border-hi bg-c-panel overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-c-border">
              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider border ${style.color}`}>
                {style.label}
              </span>
              <span className="text-sm font-medium text-c-text truncate">
                {card.title}
              </span>
              {card.source && (
                <span className="ml-auto text-xs text-c-muted font-mono shrink-0">
                  {card.source}
                </span>
              )}
            </div>

            {/* Content */}
            <div className="px-3 py-2">
              <pre
                className={`text-xs text-c-text whitespace-pre-wrap break-words leading-relaxed ${
                  isWeatherData ? 'font-mono' : 'font-sans'
                }`}
              >
                {card.content}
              </pre>
            </div>
          </div>
        );
      })}
    </div>
  );
}
