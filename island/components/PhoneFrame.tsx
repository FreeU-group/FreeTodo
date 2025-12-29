import React from 'react';
import { Battery, Wifi, Signal } from 'lucide-react';
import DynamicIsland from './DynamicIsland';
import { IslandMode } from '../types';

interface PhoneFrameProps {
  mode: IslandMode;
  children?: React.ReactNode;
}

export const PhoneFrame: React.FC<PhoneFrameProps> = ({ mode, children }) => {
  return (
    <div className="relative w-[390px] h-[844px] bg-black rounded-[55px] border-[10px] border-gray-900 shadow-[0_0_80px_-20px_rgba(0,0,0,0.5),0_0_20px_rgba(255,255,255,0.1)_inset] overflow-hidden mx-auto select-none ring-1 ring-white/20">
      
      {/* Status Bar (Background Layer) */}
      <div className="absolute top-0 left-0 right-0 h-12 flex justify-between items-start px-7 pt-4 z-40 text-white pointer-events-none mix-blend-overlay">
        <span className="text-[15px] font-semibold tracking-wide pl-1">9:41</span>
        <div className="flex items-center gap-1.5 pr-1">
           <Signal size={16} fill="currentColor" />
           <Wifi size={16} strokeWidth={2.5} />
           <Battery size={20} fill="currentColor" />
        </div>
      </div>

      {/* Dynamic Island Component */}
      <DynamicIsland mode={mode} />

      {/* Screen Content Area (Simulated Wallpaper/App) */}
      {/* Changed to a vibrant gradient so the black island is clearly visible */}
      <div className="w-full h-full pt-0 bg-gradient-to-br from-indigo-400 via-purple-400 to-orange-300 relative">
         {/* Noise overlay for texture */}
         <div className="absolute inset-0 opacity-10 bg-[url('https://grainy-gradients.vercel.app/noise.svg')]"></div>
         
         {/* Children content (Clock, etc) */}
         <div className="relative z-10 w-full h-full">
            {children}
         </div>
         
         {/* Simulated Home Bar */}
         <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1.5 bg-white rounded-full opacity-80 shadow-sm z-50"></div>
      </div>
      
      {/* Screen Reflection/Gloss (Optional visual polish) */}
      <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-bl from-white/5 to-transparent pointer-events-none rounded-[45px]"></div>
    </div>
  );
};
