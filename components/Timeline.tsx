import React from 'react';
import { useStore } from '../store';

export const Timeline: React.FC = () => {
  const { graph, timelineYear, setFilterYear } = useStore();
  
  // Extract years and sort
  // Explicitly typing helps avoid 'unknown' type inference issues
  const years: number[] = Array.from(new Set(
    graph.nodes
      .map(n => n.data.year)
      .filter((y): y is number => typeof y === 'number')
  )).sort((a, b) => a - b);

  if (years.length === 0) return null;

  return (
    <div className="h-16 bg-zinc-900 border-t border-zinc-800 flex items-center px-6 gap-4 overflow-x-auto">
      <button 
        onClick={() => setFilterYear(null)}
        className={`text-xs font-mono px-3 py-1 rounded transition-colors whitespace-nowrap ${timelineYear === null ? 'bg-indigo-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
      >
        ALL TIME
      </button>
      
      <div className="w-[1px] h-8 bg-zinc-800 mx-2"></div>

      <div className="flex items-center gap-8 relative">
        {/* Line */}
        <div className="absolute left-0 right-0 top-1/2 h-[1px] bg-zinc-800 -z-0"></div>

        {years.map((year) => (
          <button 
            key={year}
            onClick={() => setFilterYear(year)}
            className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-all
              ${timelineYear === year 
                ? 'bg-zinc-900 border-indigo-500 text-indigo-400 scale-110' 
                : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:border-zinc-500'}`}
          >
            {year}
          </button>
        ))}
      </div>
    </div>
  );
};