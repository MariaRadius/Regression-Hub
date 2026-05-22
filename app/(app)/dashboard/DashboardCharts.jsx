'use client';

import { PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';

const COLORS = { Pass: '#16a34a', Fail: '#dc2626', Pending: '#d97706' };

export function DonutChart({ donutData }) {
  return (
    <div className='panel'>
      <div className='panel-header'><h3>Pass / Fail / Pending</h3></div>
      <div className='panel-body' style={{ minHeight: 260 }}>
        {donutData.length ? (
          <ResponsiveContainer width='100%' height={240}>
            <PieChart>
              <Pie data={donutData} cx='50%' cy='50%' innerRadius={65} outerRadius={95} dataKey='value' paddingAngle={2}>
                {donutData.map((entry) => <Cell key={entry.name} fill={COLORS[entry.name]} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [v, n]} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className='empty-state'>No data yet — import an Excel file to begin.</div>
        )}
      </div>
    </div>
  );
}

export function ModuleBarChart({ moduleBarData }) {
  return (
    <div className='panel' style={{ marginBottom: 20 }}>
      <div className='panel-header'><h3>Results by Module</h3></div>
      <div className='panel-body'>
        {moduleBarData.length ? (
          <ResponsiveContainer width='100%' height={340}>
            <BarChart data={moduleBarData} margin={{ left: 0, bottom: 80, right: 20 }}>
              <CartesianGrid strokeDasharray='3 3' stroke='var(--line)' />
              <XAxis dataKey='name' tick={{ fontSize: 11 }} angle={-35} textAnchor='end' interval={0} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value, name) => [value, name]} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--line)' }} />
              <Legend verticalAlign='top' height={32} formatter={(value) => <span style={{ fontSize: 12 }}>{value}</span>} />
              <Bar dataKey='Pass'    stackId='a' fill={COLORS.Pass}    radius={[0,0,0,0]} />
              <Bar dataKey='Fail'    stackId='a' fill={COLORS.Fail}    radius={[0,0,0,0]} />
              <Bar dataKey='Pending' stackId='a' fill={COLORS.Pending} radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className='empty-state'>No module data yet.</div>
        )}
      </div>
    </div>
  );
}
