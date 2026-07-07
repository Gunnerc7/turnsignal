import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function CompletionsTrendChart({ data }: { data: { label: string; count: number }[] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  if (total === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-4 h-40 flex items-center justify-center">
        <p className="text-steel text-sm">No completions yet in the last 8 weeks.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <p className="text-xs text-steel uppercase tracking-wide mb-1">Completions, last 8 weeks</p>
      <div style={{ width: '100%', height: 140 }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="completionsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2D5BFF" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#2D5BFF" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: '#3A4150' }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <Tooltip
              formatter={(value: number) => [`${value} completed`, '']}
              labelFormatter={(label) => `Week of ${label}`}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="#2D5BFF"
              strokeWidth={2}
              fill="url(#completionsGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
