import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin-guard';

/**
 * GET /api/admin/quality/multimodal
 *
 * Returns multimodal asset statistics: image category distribution,
 * link type distribution, oral-exam relevance coverage, and quality scores.
 *
 * Phase 13 — Multimodal Semantic Asset Engine
 */
export async function GET(request: NextRequest) {
  try {
    const { serviceSupabase } = await requireAdmin(request);

    // 1. Image category distribution
    const { data: categoryRows, error: catErr } = await serviceSupabase
      .from('source_images')
      .select('image_category');

    if (catErr) {
      return NextResponse.json({ error: catErr.message }, { status: 500 });
    }

    const categoryCounts: Record<string, number> = {};
    let totalImages = 0;
    let relevantCount = 0;
    for (const row of categoryRows || []) {
      const cat = row.image_category || 'unknown';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      totalImages++;
    }

    // 2. Oral exam relevance
    const { data: relevanceRows, error: relErr } = await serviceSupabase
      .from('source_images')
      .select('is_oral_exam_relevant')
      .eq('is_oral_exam_relevant', true);

    if (!relErr) {
      relevantCount = relevanceRows?.length || 0;
    }

    // 3. Quality scores
    const { data: qualityRows, error: qualErr } = await serviceSupabase
      .from('source_images')
      .select('quality_score')
      .not('quality_score', 'is', null);

    let avgQualityScore = 0;
    if (!qualErr && qualityRows && qualityRows.length > 0) {
      const sum = qualityRows.reduce((acc, r) => acc + (r.quality_score || 0), 0);
      avgQualityScore = sum / qualityRows.length;
    }

    // 4. Link type distribution
    const { data: linkRows, error: linkErr } = await serviceSupabase
      .from('chunk_image_links')
      .select('link_type');

    if (linkErr) {
      return NextResponse.json({ error: linkErr.message }, { status: 500 });
    }

    const linkTypeCounts: Record<string, number> = {};
    let totalLinks = 0;
    for (const row of linkRows || []) {
      const lt = row.link_type || 'unknown';
      linkTypeCounts[lt] = (linkTypeCounts[lt] || 0) + 1;
      totalLinks++;
    }

    return NextResponse.json({
      total_images: totalImages,
      category_distribution: categoryCounts,
      oral_exam_relevant: {
        count: relevantCount,
        rate: totalImages > 0 ? `${((relevantCount / totalImages) * 100).toFixed(1)}%` : '0%',
      },
      quality: {
        images_with_score: qualityRows?.length || 0,
        average_quality_score: avgQualityScore.toFixed(3),
      },
      total_chunk_image_links: totalLinks,
      link_type_distribution: linkTypeCounts,
    });
  } catch (err) {
    return handleAdminError(err);
  }
}
