import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface LightboxImage {
  url: string;
  type: 'IMAGE' | 'VIDEO';
  title?: string;
}

interface ImageLightboxProps {
  images: LightboxImage[];
  initialIndex?: number;
  open: boolean;
  onClose: () => void;
}

export function ImageLightbox({ images, initialIndex = 0, open, onClose }: ImageLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    setIndex(initialIndex);
    setZoom(false);
  }, [initialIndex, open]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setIndex((i) => (i > 0 ? i - 1 : images.length - 1));
      if (e.key === 'ArrowRight') setIndex((i) => (i < images.length - 1 ? i + 1 : 0));
      if (e.key === ' ') { e.preventDefault(); setZoom((z) => !z); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, images.length, onClose]);

  const current = images[index];
  if (!current || !open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-xl"
        onClick={onClose}
      >
        {/* Counter */}
        <div className="absolute top-6 left-6 text-sm font-mono text-white/50 glass px-3 py-1.5 rounded-full">
          {index + 1} / {images.length}
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-white/50 hover:text-white text-2xl glass w-10 h-10 rounded-full flex items-center justify-center z-10"
        >
          ✕
        </button>

        {/* Nav */}
        <button
          onClick={(e) => { e.stopPropagation(); setIndex((i) => (i > 0 ? i - 1 : images.length - 1)); }}
          className="absolute left-6 top-1/2 -translate-y-1/2 text-white/50 hover:text-white text-3xl glass w-12 h-12 rounded-full flex items-center justify-center"
        >
          ‹
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setIndex((i) => (i < images.length - 1 ? i + 1 : 0)); }}
          className="absolute right-6 top-1/2 -translate-y-1/2 text-white/50 hover:text-white text-3xl glass w-12 h-12 rounded-full flex items-center justify-center"
        >
          ›
        </button>

        {/* Content */}
        <div
          className="max-w-[90vw] max-h-[90vh] flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          {current.type === 'IMAGE' ? (
            <motion.img
              key={current.url}
              src={current.url}
              alt={current.title || ''}
              className={`
                max-w-full max-h-[85vh] object-contain rounded-lg
                transition-transform duration-300 cursor-pointer
                ${zoom ? 'scale-150 cursor-zoom-out' : 'cursor-zoom-in'}
              `}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={() => setZoom((z) => !z)}
              draggable={false}
            />
          ) : (
            <motion.video
              key={current.url}
              src={current.url}
              controls
              autoPlay
              className="max-w-full max-h-[85vh] rounded-lg"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            />
          )}
        </div>

        {/* Thumbnails strip */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 overflow-x-auto max-w-[80vw] px-4">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); setIndex(i); }}
              className={`
                w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all
                ${i === index ? 'border-neon-cyan shadow-neon' : 'border-transparent opacity-50 hover:opacity-80'}
              `}
            >
              {img.type === 'IMAGE' ? (
                <img src={img.url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-glass-bg flex items-center justify-center">
                  <span className="text-white/40">▶</span>
                </div>
              )}
            </button>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
