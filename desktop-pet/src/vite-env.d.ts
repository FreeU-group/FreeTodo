/// <reference types="vite/client" />

interface Window {
  electronAPI: {
    closeApp: () => void;
    setWindowMode: (mode: 'ball' | 'panel') => void;
  };
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare module '*.jpeg' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  const src: string;
  export default src;
}

