import React, { useState, useEffect } from 'react';
import DynamicIsland from './components/DynamicIsland';
import { IslandMode } from './types';

const App: React.FC = () => {
  // Default to FLOAT (The always-on desktop widget state)
  const [mode, setMode] = useState<IslandMode>(IslandMode.FLOAT);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch(e.key) {
        case '1': setMode(IslandMode.FLOAT); break;
        case '2': setMode(IslandMode.POPUP); break;
        case '3': setMode(IslandMode.SIDEBAR); break;
        case '4': setMode(IslandMode.FULLSCREEN); break;
        case 'Escape': 
          // Logic: If fullscreen, go to Sidebar; if Sidebar, go to Float
          if (mode === IslandMode.FULLSCREEN) setMode(IslandMode.SIDEBAR);
          else if (mode === IslandMode.SIDEBAR) setMode(IslandMode.FLOAT);
          else if (mode === IslandMode.POPUP) setMode(IslandMode.FLOAT);
          break;
        default: break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode]);

  return (
    // Transparent background - only the floating island is visible
    <div className="relative w-full h-full overflow-hidden">
      <DynamicIsland 
        mode={mode} 
        onClose={() => setMode(IslandMode.FLOAT)} 
      />
    </div>
  );
};

export default App;