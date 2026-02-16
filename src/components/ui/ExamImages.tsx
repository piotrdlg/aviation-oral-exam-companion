'use client';

import { useState, useCallback } from 'react';
import type { ImageResult } from '@/lib/rag-retrieval';
import { ImageLightbox } from './ImageLightbox';

interface ExamImagesProps {
  images: ImageResult[];
  isCollapsible?: boolean;
  defaultExpanded?: boolean;
}

export function ExamImages({
  images,
  isCollapsible = true,
  defaultExpanded = true,
}: ExamImagesProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const toggle = useCallback(() => {
    if (isCollapsible) setExpanded(prev => !prev);
  }, [isCollapsible]);

  if (images.length === 0) return null;

  const primary = images[0];
  const secondary = images.slice(1, 3); // Max 3 total

  return (
    <div className="mt-2 mb-3">
      {/* Header */}
      <button
        onClick={toggle}
        className="flex w-full items-center gap-2 rounded-t-lg border border-gray-700 bg-gray-900 px-3 py-2 text-left text-sm font-medium text-gray-300 hover:bg-gray-800 transition-colors"
        aria-expanded={expanded}
        disabled={!isCollapsible}
      >
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span>Reference Materials</span>
        <span className="ml-auto text-xs text-gray-500">{images.length} image{images.length !== 1 ? 's' : ''}</span>
      </button>

      {/* Content */}
      {expanded && (
        <div className="rounded-b-lg border border-t-0 border-gray-700 bg-gray-900/50 p-3">
          {/* Primary image */}
          <button
            onClick={() => setLightboxIndex(0)}
            className="block w-full cursor-zoom-in"
          >
            <img
              src={primary.public_url}
              alt={primary.caption || primary.figure_label || 'Reference image'}
              width={primary.width}
              height={primary.height}
              loading="lazy"
              className="mx-auto max-h-96 max-w-full rounded-lg border border-gray-700 object-contain"
            />
          </button>
          <ImageCaption image={primary} />

          {/* Secondary images */}
          {secondary.length > 0 && (
            <div className="mt-3 flex gap-3">
              {secondary.map((img, i) => (
                <div key={img.image_id} className="flex-1">
                  <button
                    onClick={() => setLightboxIndex(i + 1)}
                    className="block w-full cursor-zoom-in"
                  >
                    <img
                      src={`${img.public_url}?width=300&height=300&resize=contain`}
                      alt={img.caption || img.figure_label || 'Reference image'}
                      loading="lazy"
                      className="h-32 w-full rounded-lg border border-gray-700 object-contain"
                    />
                  </button>
                  <ImageCaption image={img} compact />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <ImageLightbox
          images={images}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}

function ImageCaption({ image, compact }: { image: ImageResult; compact?: boolean }) {
  const label = image.figure_label;
  const source = `${image.doc_abbreviation.toUpperCase()} p.${image.page_number}`;

  return (
    <div className={`mt-1 ${compact ? 'text-xs' : 'text-sm'}`}>
      {label && (
        <span className="font-medium text-gray-300">{label}</span>
      )}
      {label && image.caption && <span className="text-gray-500"> — </span>}
      {image.caption && (
        <span className="text-gray-400">{compact ? image.caption.slice(0, 60) + (image.caption.length > 60 ? '...' : '') : image.caption}</span>
      )}
      <span className="ml-2 text-xs text-gray-500">({source})</span>
    </div>
  );
}
