/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, Clock, Video, X, BellRing, AlignLeft, CheckCircle2 } from 'lucide-react';

export default function App() {
  const [isVisible, setIsVisible] = useState(false);

  // Auto-show the notification after a short delay for demonstration
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    // Mock Desktop Background (Windows 11 Bloom inspired gradient)
    <div className="relative min-h-screen w-full bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#020617] overflow-hidden flex items-center justify-center">

      {/* Background decorative elements */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-[120px]" />

      {/* Demo Controls */}
      <div className="relative z-10 flex flex-col items-center gap-6 p-8 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 shadow-2xl">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold text-white tracking-tight">Windows Style Reminder</h1>
          <p className="text-slate-400 text-sm">Click the button to trigger the bottom-right floating window.</p>
        </div>
        <button
          onClick={() => setIsVisible(true)}
          disabled={isVisible}
          className="px-6 py-3 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-all border border-white/10 shadow-lg flex items-center gap-2"
        >
          <BellRing className="w-4 h-4" />
          Trigger Notification
        </button>
      </div>

      {/* The Floating Window Component */}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, x: 100, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.95, transition: { duration: 0.2, ease: "easeIn" } }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-6 right-6 w-[380px] rounded-2xl border border-white/10 bg-[#1c1c1c]/70 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden text-slate-200 z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/[0.02] shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-blue-500/20 rounded-lg shadow-inner border border-blue-500/20">
                  <Calendar className="w-4 h-4 text-blue-400" />
                </div>
                <span className="text-xs font-semibold tracking-wider text-slate-300 uppercase">Reminder</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsVisible(false)}
                  className="p-1.5 hover:bg-white/10 rounded-md transition-colors text-slate-400 hover:text-white"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable Body - Single Content */}
            <div className="max-h-[250px] overflow-y-auto custom-scrollbar p-5">
              <h3 className="text-[17px] font-semibold text-white tracking-tight leading-snug mb-3">
                Product Design Sync & Q3 Planning
              </h3>

              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-slate-300">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span className="font-medium">10:00 AM - 11:30 AM</span>
                </div>

                <div className="flex items-center gap-3 text-sm text-slate-300">
                  <Video className="w-4 h-4 text-blue-400" />
                  <span className="text-blue-400 hover:text-blue-300 cursor-pointer transition-colors">Google Meet</span>
                </div>

                <div className="flex items-start gap-3 text-sm text-slate-400 mt-4 pt-4 border-t border-white/5">
                  <AlignLeft className="w-4 h-4 mt-0.5 shrink-0" />
                  <div className="space-y-3 leading-relaxed">
                    <p>
                      Reviewing the new UI components for the dashboard. Please review the Figma file before joining.
                    </p>
                    <p className="text-slate-300 font-medium mt-2">Agenda:</p>
                    <ul className="list-disc pl-4 space-y-1.5 text-slate-400">
                      <li>Review updated color palette and typography.</li>
                      <li>Discuss feedback from the beta testing group regarding the navigation bar.</li>
                      <li>Finalize the interaction design for the floating windows.</li>
                      <li>Plan the handoff process to the engineering team.</li>
                      <li>Q&A and open discussion for any blockers.</li>
                    </ul>
                    <p className="pt-2">
                      Make sure to bring your notes from yesterday's sync. We will be making final decisions today.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer / Actions */}
            <div className="px-5 py-3.5 bg-black/20 flex items-center justify-end gap-2 border-t border-white/5 shrink-0">
              <button
                onClick={() => setIsVisible(false)}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
              >
                Snooze
              </button>
              <button
                onClick={() => setIsVisible(false)}
                className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all shadow-[0_0_15px_rgba(37,99,235,0.3)] hover:shadow-[0_0_20px_rgba(37,99,235,0.5)] active:scale-95 flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Acknowledge
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
