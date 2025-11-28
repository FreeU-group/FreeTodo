import { useState } from 'react';
import logo from './logo.png';

function App() {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const handleClose = () => {
    if (window.electronAPI?.closeApp) {
      window.electronAPI.closeApp();
    }
  };

  const handleMouseDown = () => {
    setIsPressed(true);
  };

  const handleMouseUp = () => {
    setIsPressed(false);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setIsPressed(false);
  };

  return (
    <div 
      className="app-container"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      <div className={`floating-ball ${isHovered ? 'hovered' : ''} ${isPressed ? 'pressed' : ''}`}>
        <img 
          src={logo} 
          alt="LifeTrace" 
          className="logo"
          draggable={false}
        />
        {isHovered && (
          <button 
            className="close-button"
            onClick={handleClose}
            onMouseDown={(e) => e.stopPropagation()}
            title="关闭"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

export default App;

