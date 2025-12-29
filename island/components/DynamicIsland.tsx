import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Minimize2 } from 'lucide-react';
import { IslandMode } from '../types';
import { 
  FloatContent, 
  PopupContent, 
  SidebarContent, 
  FullScreenContent 
} from './IslandContent';

interface DynamicIslandProps {
  mode: IslandMode;
  onClose?: () => void;
}

const DynamicIsland: React.FC<DynamicIslandProps> = ({ mode, onClose }) => {
  
  // LOGIC: Electron Click-Through Handling
  // We need to tell the main process whether to ignore mouse events (let them pass through to desktop)
  // or capture them (interact with the app).
  useEffect(() => {
    // Helper to safely call Electron API
    const setIgnoreMouse = (ignore: boolean) => {
      if ((window as any).require) {
        try {
          const { ipcRenderer } = (window as any).require('electron');
          if (ignore) {
            // forward: true lets the mouse move event still reach the browser 
            // so we can detect when to turn it back on.
            ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
          } else {
            ipcRenderer.send('set-ignore-mouse-events', false);
          }
        } catch (e) {
          console.error("Electron IPC failed", e);
        }
      }
    };

    // If we are in FULLSCREEN mode, we always want to capture mouse
    if (mode === IslandMode.FULLSCREEN) {
      setIgnoreMouse(false);
    } 
    // Otherwise, we default to ignore, and let the hover events below handle the toggle
    else {
      setIgnoreMouse(true);
    }
  }, [mode]);

  const handleMouseEnter = () => {
    if (mode !== IslandMode.FULLSCREEN && (window as any).require) {
        const { ipcRenderer } = (window as any).require('electron');
        ipcRenderer.send('set-ignore-mouse-events', false);
    }
  };

  const handleMouseLeave = () => {
    if (mode !== IslandMode.FULLSCREEN && (window as any).require) {
        const { ipcRenderer } = (window as any).require('electron');
        ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
    }
  };


  const getLayoutState = (mode: IslandMode) => {
    switch (mode) {
      case IslandMode.FLOAT:
        return { 
          width: 180, 
          height: 48, 
          borderRadius: 24, 
          right: 32,  
          bottom: 32  
        }; 
      case IslandMode.POPUP:
        return { 
          width: 340, 
          height: 110, 
          borderRadius: 32,
          right: 32,
          bottom: 32
        }; 
      case IslandMode.SIDEBAR:
        return { 
          width: 400, 
          height: 'calc(100vh - 64px)', 
          borderRadius: 48,
          right: 32,
          bottom: 32
        };
      case IslandMode.FULLSCREEN:
        return { 
          width: '100vw',  
          height: '100vh', 
          borderRadius: 0,
          right: 0,        
          bottom: 0        
        };
      default:
        return { 
          width: 180, 
          height: 48, 
          borderRadius: 24,
          right: 32,
          bottom: 32
        };
    }
  };

  const layoutState = getLayoutState(mode);
  const isFullscreen = mode === IslandMode.FULLSCREEN;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden">
      <motion.div
        layout
        initial={false}
        animate={layoutState}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        transition={{
          type: "spring",
          stiffness: 340, 
          damping: 28,    
          mass: 0.6,      
          restDelta: 0.001
        }}
        className="absolute overflow-hidden pointer-events-auto origin-bottom-right bg-[#0a0a0a]"
        style={{
            boxShadow: isFullscreen 
                ? 'none' 
                : '0px 20px 50px -10px rgba(0, 0, 0, 0.5), 0px 10px 20px -10px rgba(0,0,0,0.3)'
        }}
      >
        <div className={`absolute inset-0 bg-[#080808]/90 backdrop-blur-[80px] transition-colors duration-700 ease-out ${isFullscreen ? 'bg-[#030303]/98' : ''}`}></div>
        <div className="absolute inset-0 opacity-[0.035] bg-[url('https://grainy-gradients.vercel.app/noise.svg')] pointer-events-none mix-blend-overlay"></div>
        <div className={`absolute inset-0 transition-opacity duration-1000 ${mode === IslandMode.FLOAT ? 'opacity-0' : 'opacity-100'}`}>
            <div className="absolute top-[-50%] left-[-20%] w-[100%] h-[100%] rounded-full bg-indigo-500/10 blur-[120px] mix-blend-screen"></div>
            <div className="absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] rounded-full bg-purple-500/10 blur-[120px] mix-blend-screen"></div>
        </div>

        <div className={`absolute inset-0 rounded-[inherit] border border-white/10 pointer-events-none shadow-[inset_0_0_20px_rgba(255,255,255,0.03)] transition-opacity duration-500 ${isFullscreen ? 'opacity-0' : 'opacity-100'}`}></div>

        <AnimatePresence>
          {(mode === IslandMode.SIDEBAR || mode === IslandMode.FULLSCREEN) && (
             <motion.button
                initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.5, rotate: -45 }}
                className={`absolute z-[60] w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all backdrop-blur-md cursor-pointer border border-white/5
                  ${isFullscreen ? 'top-8 right-8' : 'top-6 right-6'}
                `}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose?.();
                }}
             >
                {mode === IslandMode.FULLSCREEN ? <Minimize2 size={18} /> : <X size={18} />}
             </motion.button>
          )}
        </AnimatePresence>

        <div className="absolute inset-0 w-full h-full text-white font-sans antialiased overflow-hidden">
          <AnimatePresence>
            {mode === IslandMode.FLOAT && (
              <motion.div key="float" className="absolute inset-0 w-full h-full">
                  <FloatContent />
              </motion.div>
            )}
            {mode === IslandMode.POPUP && (
              <motion.div key="popup" className="absolute inset-0 w-full h-full">
                  <PopupContent />
              </motion.div>
            )}
            {mode === IslandMode.SIDEBAR && (
              <motion.div key="sidebar" className="absolute inset-0 w-full h-full">
                  <SidebarContent />
              </motion.div>
            )}
            {mode === IslandMode.FULLSCREEN && (
              <motion.div key="fullscreen" className="absolute inset-0 w-full h-full">
                  <FullScreenContent />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </motion.div>
    </div>
  );
};

export default DynamicIsland;