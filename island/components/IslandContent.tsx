import React from 'react';
import { motion } from 'framer-motion';
import { 
  ArrowUpRight, 
  Search,
  CloudSun,
  CreditCard,
  ChevronRight,
  Bell,
  MoreHorizontal,
  Hexagon,
  MessageCircle
} from 'lucide-react';

const fadeVariants = {
    initial: { opacity: 0, filter: 'blur(8px)', scale: 0.98 },
    animate: { opacity: 1, filter: 'blur(0px)', scale: 1, transition: { duration: 0.4, ease: "easeOut", delay: 0.1 } },
    exit: { opacity: 0, filter: 'blur(8px)', scale: 1.05, transition: { duration: 0.2 } }
};

// --- 1. FLOAT STATE: Screen Rec | Voice Rec | Logo ---
export const FloatContent: React.FC = () => (
  <motion.div 
    variants={fadeVariants}
    initial="initial" animate="animate" exit="exit"
    className="w-full h-full flex items-center justify-between px-5 relative cursor-pointer group"
  >
    {/* Left: Screen Recording Animation */}
    <div className="flex items-center gap-2 group/rec">
        <div className="relative flex items-center justify-center">
            <motion.div 
                className="absolute w-full h-full bg-red-500/30 rounded-full"
                animate={{ scale: [1, 1.8, 1], opacity: [0.3, 0, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
            />
            <div className="w-2.5 h-2.5 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.6)] z-10"></div>
        </div>
        <div className="w-0 overflow-hidden group-hover/rec:w-auto transition-all duration-300">
             <span className="text-[10px] font-medium text-white/50 pl-1 whitespace-nowrap">REC</span>
        </div>
    </div>

    {/* Divider */}
    <div className="w-[1px] h-3 bg-white/10"></div>

    {/* Center: Voice Recording Waveform */}
    <div className="flex items-center gap-0.5 h-3">
        {[1, 0.6, 1, 0.5, 0.8].map((h, i) => (
            <motion.div 
                key={i}
                className="w-0.5 bg-orange-400 rounded-full"
                animate={{ height: [4, h * 12, 4] }}
                transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1, ease: "easeInOut" }}
            />
        ))}
    </div>

    {/* Divider */}
    <div className="w-[1px] h-3 bg-white/10"></div>

    {/* Right: Logo */}
    <div className="flex items-center justify-center text-white/80">
        <Hexagon size={18} strokeWidth={2.5} className="text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]" />
    </div>

  </motion.div>
);

// --- 2. POPUP STATE: Message Box ---
export const PopupContent: React.FC = () => (
  <motion.div 
    variants={fadeVariants}
    initial="initial" animate="animate" exit="exit"
    className="w-full h-full p-5 flex items-center gap-4 relative overflow-hidden font-lexend"
  >
      {/* Background Accent */}
      <div className="absolute -left-4 top-0 w-20 h-full bg-gradient-to-r from-blue-500/10 to-transparent blur-md"></div>

      {/* Avatar */}
      <div className="relative shrink-0">
          <div className="w-14 h-14 rounded-full border border-white/10 overflow-hidden shadow-lg">
              <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=200&auto=format&fit=crop" className="w-full h-full object-cover" />
          </div>
          <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 border-2 border-[#121212] rounded-full z-10"></div>
      </div>

      {/* Message Content */}
      <div className="flex flex-col flex-1 min-w-0 justify-center">
          <div className="flex items-center justify-between mb-0.5">
              <span className="text-base font-semibold text-white tracking-wide">Sarah Chen</span>
              <span className="text-[10px] text-white/40 font-inter">Now</span>
          </div>
          <p className="text-sm text-white/80 font-inter leading-tight truncate">
              Hey! The design review is starting in 5 mins.
          </p>
          <div className="flex items-center gap-2 mt-2">
             <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/5">
                <MessageCircle size={10} className="text-white/40" />
                <span className="text-[10px] text-white/40">Reply</span>
             </div>
          </div>
      </div>
  </motion.div>
);

// --- 3. SIDEBAR STATE: Hidden Scrollbar ---
export const SidebarContent: React.FC = () => (
  <motion.div 
    variants={fadeVariants}
    initial="initial" animate="animate" exit="exit"
    className="w-full h-full flex flex-col p-6 pt-8 relative"
  >
      <div className="flex items-center justify-between mb-8 shrink-0">
          <div className="flex flex-col">
             <h2 className="text-3xl font-light font-lexend text-white tracking-tight">Focus</h2>
             <span className="text-xs text-white/40 uppercase tracking-widest font-bold mt-1 font-lexend">Thursday 24</span>
          </div>
          <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer">
              <MoreHorizontal size={20} className="text-white/60" />
          </div>
      </div>

      {/* Added scrollbar-hide class here */}
      <div className="flex-1 space-y-4 overflow-y-auto scrollbar-hide pb-4">
          
          <div className="w-full p-5 rounded-[28px] bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] transition-colors group cursor-pointer">
               <div className="flex justify-between items-start mb-4">
                   <div className="flex items-center gap-2">
                       <div className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)]"></div>
                       <span className="text-xs font-semibold uppercase tracking-wider text-white/70 font-lexend">Meeting</span>
                   </div>
                   <span className="text-xs text-white/30 font-inter">10:30 AM</span>
               </div>
               <h3 className="text-xl font-normal text-white mb-2 font-lexend">Product Sync</h3>
               <div className="flex -space-x-3 mt-3 pl-1">
                   {[1,2,3].map(i => (
                       <div key={i} className="w-8 h-8 rounded-full border-2 border-[#121212] bg-zinc-700"></div>
                   ))}
               </div>
          </div>

          <div className="w-full h-44 p-6 rounded-[28px] bg-gradient-to-b from-blue-500/10 to-purple-500/5 border border-white/5 relative overflow-hidden group">
               <div className="absolute top-6 right-6">
                   <CloudSun size={32} className="text-white/80" />
               </div>
               <div className="absolute bottom-6 left-6">
                   <span className="text-5xl font-extralight text-white font-lexend">72°</span>
                   <p className="text-xs text-white/50 mt-1 font-inter">San Francisco • Partly Cloudy</p>
               </div>
          </div>

          {/* Extra content to ensure scroll is possible */}
          <div className="w-full p-5 rounded-[28px] bg-white/[0.03] border border-white/5">
              <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-pink-500"></div>
                  <span className="text-xs font-semibold text-white/60">Reminder</span>
              </div>
              <p className="text-white/80">Pick up dry cleaning</p>
          </div>
      </div>

      {/* Input */}
      <div className="mt-auto pt-4 shrink-0">
          <div className="w-full h-14 bg-white/5 backdrop-blur-xl rounded-[24px] border border-white/10 flex items-center px-2 gap-2 hover:border-white/20 transition-colors">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white/40">
                  <Search size={18} />
              </div>
              <input 
                type="text" 
                placeholder="Ask AI..." 
                className="flex-1 bg-transparent border-none outline-none text-white text-sm placeholder:text-white/20 font-inter"
              />
          </div>
      </div>
  </motion.div>
);

// --- 4. FULLSCREEN STATE ---
export const FullScreenContent: React.FC = () => (
  <motion.div 
    variants={fadeVariants}
    initial="initial" animate="animate" exit="exit"
    className="w-full h-full p-8 md:p-14 flex flex-col relative"
  >
      {/* Top Bar */}
      <div className="flex justify-between items-center mb-12 pr-12">
          <div className="flex flex-col gap-1">
              <h1 className="text-5xl md:text-6xl font-thin text-white tracking-tighter font-lexend">Dashboard</h1>
              <span className="text-xs text-white/40 font-bold tracking-[0.2em] uppercase font-lexend pl-1">Overview • Q3 2024</span>
          </div>
          
          <div className="hidden md:flex gap-4">
              <button className="h-12 w-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
                  <Bell size={20} className="text-white/70" />
              </button>
              <div className="h-12 w-12 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600"></div>
          </div>
      </div>

      {/* Grid Layout */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-6 pb-4 min-h-0">
          
          {/* Main Hero */}
          <div className="md:col-span-8 bg-zinc-900/40 rounded-[32px] border border-white/5 relative overflow-hidden p-10 flex flex-col justify-end group transition-colors hover:border-white/10">
               <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?q=80&w=1000&auto=format&fit=crop')] bg-cover opacity-40 mix-blend-overlay group-hover:scale-105 transition-transform duration-[2s]"></div>
               <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent"></div>
               
               <div className="relative z-10">
                   <div className="flex items-center gap-3 mb-4">
                       <span className="px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-[10px] font-bold uppercase text-white border border-white/10 font-lexend">Priority</span>
                       <span className="text-white/60 text-xs font-inter">Updated 2m ago</span>
                   </div>
                   <h2 className="text-4xl font-light text-white mb-4 leading-tight font-lexend">Financial <br/>Performance Review</h2>
                   <div className="flex items-center gap-2 text-white/70 text-sm hover:text-white cursor-pointer transition-colors w-max font-inter group/link">
                       <span>View detailed report</span>
                       <ArrowUpRight size={14} className="group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 transition-transform"/>
                   </div>
               </div>
          </div>

          {/* Right Column */}
          <div className="md:col-span-4 flex flex-col gap-6">
              <div className="flex-1 bg-white/[0.03] rounded-[32px] border border-white/5 p-8 flex flex-col justify-between hover:bg-white/[0.05] transition-colors relative overflow-hidden">
                   <div className="absolute top-0 right-0 w-40 h-40 bg-purple-500/10 blur-[60px] rounded-full pointer-events-none"></div>
                   <div className="flex justify-between items-start">
                       <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
                           <CreditCard size={24} className="text-white/80" />
                       </div>
                       <span className="text-emerald-400 text-sm font-bold font-lexend">+12.5%</span>
                   </div>
                   <div>
                       <span className="text-4xl font-light text-white font-lexend">$48,200</span>
                       <p className="text-sm text-white/40 mt-1 font-inter">Total Revenue</p>
                   </div>
              </div>

              <div className="flex-1 bg-white/[0.01] rounded-[32px] border border-white/5 p-8 flex items-center justify-center hover:bg-white/[0.03] transition-colors cursor-pointer group border-dashed border-white/10 hover:border-white/20">
                   <div className="flex flex-col items-center gap-3">
                       <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                           <ChevronRight size={24} className="text-white/50" />
                       </div>
                       <span className="text-sm font-medium text-white/40 font-lexend">View All Projects</span>
                   </div>
              </div>
          </div>
      </div>
  </motion.div>
);