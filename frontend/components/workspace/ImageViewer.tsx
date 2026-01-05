'use client';

import { useState, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw, Download, Maximize2 } from 'lucide-react';

interface ImageViewerProps {
  imageUrl: string;
  imageName: string;
  onClose?: () => void;
}

export default function ImageViewer({ imageUrl, imageName, onClose }: ImageViewerProps) {
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = imageUrl;
  }, [imageUrl]);

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 25, 400));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 25, 25));
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = imageName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleReset = () => {
    setZoom(100);
    setRotation(0);
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose?.();
        }
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isFullscreen, onClose]);

  return (
    <div className={`flex flex-col h-full bg-background ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-sm truncate max-w-[300px]">{imageName}</h3>
          {imageDimensions && (
            <span className="text-xs text-muted-foreground">
              {imageDimensions.width} × {imageDimensions.height}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomOut}
            disabled={zoom <= 25}
            className="p-2 rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          
          <span className="px-3 py-1 text-xs font-medium min-w-[60px] text-center">
            {zoom}%
          </span>
          
          <button
            onClick={handleZoomIn}
            disabled={zoom >= 400}
            className="p-2 rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <div className="w-px h-6 bg-border mx-1" />

          <button
            onClick={handleRotate}
            className="p-2 rounded hover:bg-accent"
            title="Rotate 90°"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          <button
            onClick={handleReset}
            className="px-3 py-2 text-xs rounded hover:bg-accent"
            title="Reset View"
          >
            Reset
          </button>

          <div className="w-px h-6 bg-border mx-1" />

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded hover:bg-accent"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          <button
            onClick={handleDownload}
            className="p-2 rounded hover:bg-accent"
            title="Download"
          >
            <Download className="w-4 h-4" />
          </button>

          {!isFullscreen && onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded hover:bg-accent"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Image Container */}
      <div className="flex-1 overflow-auto bg-muted/20 flex items-center justify-center p-4">
        <div
          className="relative transition-transform duration-200"
          style={{
            transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={imageName}
            className="max-w-full max-h-full object-contain"
            style={{
              imageRendering: zoom > 100 ? 'pixelated' : 'auto',
            }}
          />
        </div>
      </div>

      {/* Footer Info */}
      <div className="px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground flex items-center justify-between">
        <div>
          Zoom: {zoom}% | Rotation: {rotation}°
        </div>
        <div className="flex gap-4">
          <kbd className="px-2 py-1 bg-background rounded border text-xs">ESC</kbd>
          <span>to close</span>
        </div>
      </div>
    </div>
  );
}
