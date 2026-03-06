'use client';

import { useState, useEffect } from 'react';

export interface InstructorConnection {
  instructorName: string;
  isNew: boolean;
}

/**
 * Checks if student has an active instructor connection.
 * Returns the instructor name and whether this is a "new" connection
 * (based on sessionStorage flag set by the referral claim flow).
 */
export function useInstructorConnection(): InstructorConnection | null {
  const [connection, setConnection] = useState<InstructorConnection | null>(null);

  useEffect(() => {
    // Check if we just completed a referral claim
    const justConnected = sessionStorage.getItem('referral_just_connected');
    const instructorName = sessionStorage.getItem('referral_instructor_name');

    if (justConnected && instructorName) {
      setConnection({ instructorName, isNew: true });
      // Clean up so banner only shows once per session
      sessionStorage.removeItem('referral_just_connected');
    }
  }, []);

  return connection;
}
