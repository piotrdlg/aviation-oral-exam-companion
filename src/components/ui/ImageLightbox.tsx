'use client';

import { useEffect, useCallback, useState } from 'react';
import type { ImageResult } from '@/lib/rag-retrieval';

interface ImageLightboxProps {
  images: ImageResult[];
  initialIndex: number;
  onClose: () => void;
}

export function ImageLightbox({ images, initialIndex, onClose }: ImageLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const image = images[index];

  const handlePrev = useCallback(() => {
    setIndex(i => (i > 0 ? i - 1 : images.length - 1));
  }, [images.length]);

  const handleNext = useCallback(() => {
    setIndex(i => (i < images.length - 1 ? i + 1 : 0));
  }, [images.length]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, handlePrev, handleNext]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  if (!image) return null;

  const label = image.figure_label;
  const source = `${image.doc_abbreviation.toUpperCase()} p.${image.page_number}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image lightbox"
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-full bg-gray-800/80 p-2 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
        aria-label="Close lightbox"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Navigation arrows (when multiple images) */}
      {images.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); handlePrev(); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-gray-800/80 p-2 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
            aria-label="Previous image"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleNext(); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-gray-800/80 p-2 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
            aria-label="Next image"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {/* Image + caption */}
      <div
        className="flex max-h-[90vh] max-w-[90vw] flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={image.public_url}
          alt={image.caption || image.figure_label || 'Reference image'}
          className="max-h-[80vh] max-w-[90vw] rounded-lg object-contain"
        />
        <div className="mt-3 text-center">
          {label && (
            <div className="text-sm font-medium text-gray-200">{label}</div>
          )}
          {image.caption && (
            <div className="mt-1 max-w-xl text-sm text-gray-400">{image.caption}</div>
          )}
          <div className="mt-1 text-xs text-gray-500">{source}</div>
          {images.length > 1 && (
            <div className="mt-1 text-xs text-gray-600">{index + 1} / {images.length}</div>
          )}
        </div>
      </div>
    </div>
  );
}
