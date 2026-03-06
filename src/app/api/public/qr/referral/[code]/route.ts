import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';

/**
 * GET /api/public/qr/referral/[code]
 *
 * Returns a PNG image of a QR code pointing to /ref/[code].
 * Public endpoint -- no auth required.
 * Used in emails and as fallback for client-side QR generation.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  // Validate code format (3-20 alphanumeric chars)
  if (!code || !/^[A-Z0-9]{3,20}$/i.test(code)) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
  }

  const referralUrl = `https://heydpe.com/ref/${code.toUpperCase()}`;

  try {
    const pngBuffer = await QRCode.toBuffer(referralUrl, {
      type: 'png',
      width: 400,
      margin: 2,
      color: {
        dark: '#F59E0B', // amber-500 (brand color)
        light: '#00000000', // transparent background
      },
      errorCorrectionLevel: 'M',
    });

    return new NextResponse(new Uint8Array(pngBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, immutable',
        'Content-Disposition': `inline; filename="heydpe-referral-${code.toUpperCase()}.png"`,
      },
    });
  } catch (err) {
    console.error('[qr/referral] Generation error:', err);
    return NextResponse.json(
      { error: 'Failed to generate QR code' },
      { status: 500 }
    );
  }
}
