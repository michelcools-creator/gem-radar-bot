import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

interface ScoreHistoryData {
  as_of: string;
  overall: number;
  confidence: number;
}

interface ScoreHistoryChartProps {
  data: ScoreHistoryData[];
}

const ScoreHistoryChart: React.FC<ScoreHistoryChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No score history available
      </div>
    );
  }

  // Sort data by date and format for chart
  const chartData = data
    .sort((a, b) => new Date(a.as_of).getTime() - new Date(b.as_of).getTime())
    .map(score => ({
      date: format(new Date(score.as_of), 'MMM dd'),
      fullDate: format(new Date(score.as_of), 'PPP'),
      score: score.overall,
      confidence: Math.round(score.confidence * 100)
    }));

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis 
            dataKey="date" 
            className="text-xs fill-muted-foreground"
            tick={{ fontSize: 12 }}
          />
          <YAxis 
            domain={[0, 100]}
            className="text-xs fill-muted-foreground"
            tick={{ fontSize: 12 }}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (active && payload && payload.length > 0) {
                const data = payload[0].payload;
                return (
                  <div className="bg-background border border-border rounded-lg shadow-md p-3">
                    <p className="font-medium text-sm mb-2">{data.fullDate}</p>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-primary"></div>
                        <span className="text-sm">Score: <strong>{data.score}/100</strong></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-accent"></div>
                        <span className="text-sm">Confidence: <strong>{data.confidence}%</strong></span>
                      </div>
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />
          <Legend 
            wrapperStyle={{ fontSize: '12px' }}
            iconType="circle"
          />
          <Line 
            type="monotone" 
            dataKey="score" 
            stroke="hsl(var(--primary))"
            strokeWidth={3}
            dot={{ fill: "hsl(var(--primary))", strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6, stroke: "hsl(var(--primary))", strokeWidth: 2 }}
            name="Score"
          />
          <Line 
            type="monotone" 
            dataKey="confidence" 
            stroke="hsl(var(--accent))"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ fill: "hsl(var(--accent))", strokeWidth: 2, r: 3 }}
            activeDot={{ r: 5, stroke: "hsl(var(--accent))", strokeWidth: 2 }}
            name="Confidence %"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ScoreHistoryChart;