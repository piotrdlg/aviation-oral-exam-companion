import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/csp-report
 * Receives CSP violation reports from the browser.
 * Logs them server-side for debugging — no auth required (browser sends these automatically).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // CSP reports come as {"csp-report": {...}} or {"type": "csp-violation", ...}
    const report = body['csp-report'] || body;
    const violatedDirective = report['violated-directive'] || report['effectiveDirective'] || 'unknown';
    const blockedUri = report['blocked-uri'] || report['blockedURL'] || 'unknown';
    const documentUri = report['document-uri'] || report['documentURL'] || 'unknown';

    console.warn('[csp-violation]', JSON.stringify({
      violated_directive: violatedDirective,
      blocked_uri: blockedUri,
      document_uri: documentUri,
      disposition: report['disposition'] || 'enforce',
    }));

    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
