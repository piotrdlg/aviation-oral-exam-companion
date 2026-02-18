'use client';

import { useEffect } from 'react';
import { captureUTMParams } from '@/lib/utm';

export default function UTMCapture() {
  useEffect(() => {
    const utm = captureUTMParams();
    if (utm) {
      window.dataLayer = window.dataLayer ?? [];
      window.dataLayer.push({ event: 'utm_captured', ...utm });
    }
  }, []);
  return null;
}
