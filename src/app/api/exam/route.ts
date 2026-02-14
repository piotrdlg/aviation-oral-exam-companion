import { NextResponse } from 'next/server';

export async function POST() {
  // Stub — exam engine will be implemented in Phase 2
  return NextResponse.json(
    { message: 'Exam API not yet implemented' },
    { status: 501 }
  );
}
