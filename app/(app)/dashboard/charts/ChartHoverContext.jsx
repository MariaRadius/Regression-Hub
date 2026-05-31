// app/(app)/dashboard/charts/ChartHoverContext.jsx
'use client';

import { createContext, useContext, useState } from 'react';

const ChartHoverContext = createContext({
  hoveredStatus: null,
  setHoveredStatus: () => {},
});

/**
 * Wraps all dashboard charts so hover state is shared across them.
 * Hover a segment in any chart → all charts dim non-matching segments.
 */
export function ChartHoverProvider({ children }) {
  const [hoveredStatus, setHoveredStatus] = useState(null);
  return (
    <ChartHoverContext.Provider value={{ hoveredStatus, setHoveredStatus }}>
      {children}
    </ChartHoverContext.Provider>
  );
}

/** Returns { hoveredStatus, setHoveredStatus } from the nearest provider. */
export function useChartHover() {
  return useContext(ChartHoverContext);
}
