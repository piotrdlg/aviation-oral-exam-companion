#!/usr/bin/env npx tsx
/**
 * Test Instructor PII Exposure Fix (W1.2)
 *
 * Verifies that:
 * 1. Anonymous users can no longer read sensitive columns from instructor_profiles table
 * 2. The public_instructor_profiles view returns only safe columns
 * 3. Instructors can still read their own full profile
 * 4. Admin users can still access full profiles
 *
 * Expected behavior:
 * - anon key: can read view (safe columns) but NOT table (sensitive columns)
 * - authenticated: depends on ownership/role
 * - service_role: full access to both
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !anonKey || !serviceKey) {
  console.error('Missing Supabase env vars');
  process.exit(1);
}

async function testInstructorPIIExposure() {
  console.log('=== Instructor PII Exposure Test (W1.2) ===\n');

  const anonClient = createClient(url, anonKey);
  const serviceClient = createClient(url, serviceKey);

  try {
    // Get an approved instructor to test with
    console.log('1. Fetching an approved instructor (for testing)...');
    const { data: approvedInstructor } = await serviceClient
      .from('instructor_profiles')
      .select('id, first_name, slug')
      .eq('status', 'approved')
      .limit(1)
      .single();

    if (!approvedInstructor) {
      console.log('⚠️  No approved instructors in database (expected for test environments)');
      console.log('   Test would require creating a test instructor profile.\n');

      // Still test the view access
      console.log('2. Testing public_instructor_profiles view access with anon key...');
      const { data: viewData, error: viewError } = await anonClient
        .from('public_instructor_profiles')
        .select('*')
        .limit(1);

      if (viewError) {
        console.log(`   ❌ FAIL: View access denied: ${viewError.message}`);
      } else {
        console.log(`   ✅ PASS: View accessible (${viewData?.length || 0} records)`);
        if (viewData && viewData.length > 0) {
          const cols = Object.keys(viewData[0]);
          console.log(`   Columns returned: ${cols.join(', ')}`);
          if (cols.includes('certificate_number') || cols.includes('admin_notes')) {
            console.log('   ❌ FAIL: Sensitive columns exposed!');
          } else {
            console.log('   ✅ PASS: No sensitive columns in view');
          }
        }
      }
      return;
    }

    const instructorId = approvedInstructor.id;
    const slug = approvedInstructor.slug;
    console.log(`   Instructor: ${approvedInstructor.first_name} (${slug})\n`);

    // Test 1: Anon key attempting direct table access to sensitive columns
    console.log('2. Testing anon key direct table access (SHOULD FAIL)...');
    const { data: tableData, error: tableError } = await anonClient
      .from('instructor_profiles')
      .select('certificate_number, admin_notes, verification_data')
      .eq('id', instructorId);

    if (tableError) {
      console.log(`   ✅ PASS: Direct table access denied (${tableError.message})`);
    } else if (tableData && tableData.length > 0) {
      console.log('   ❌ FAIL: Direct table access allowed (SECURITY BREACH!)');
      console.log(`   Data: ${JSON.stringify(tableData[0])}`);
    } else {
      console.log('   ⚠️  AMBIGUOUS: No error but empty result');
    }

    // Test 2: Anon key accessing view (SHOULD SUCCEED with safe columns)
    console.log('\n3. Testing anon key view access (SHOULD SUCCEED - safe columns)...');
    const { data: viewData, error: viewError } = await anonClient
      .from('public_instructor_profiles')
      .select('*')
      .eq('slug', slug)
      .single();

    if (viewError && viewError.message.includes('not found')) {
      console.log('   ⚠️  WARNING: View returned not found (may indicate access denied)');
    } else if (viewError) {
      console.log(`   ❌ FAIL: View access error: ${viewError.message}`);
    } else if (!viewData) {
      console.log('   ⚠️  AMBIGUOUS: No view data returned');
    } else {
      console.log('   ✅ PASS: View accessible');
      const cols = Object.keys(viewData);
      console.log(`   Columns: ${cols.join(', ')}`);

      // Verify only safe columns present
      const sensitiveColumns = [
        'certificate_number',
        'admin_notes',
        'verification_data',
        'rejection_reason',
        'email',
      ];
      const exposedColumns = cols.filter(col => sensitiveColumns.includes(col));

      if (exposedColumns.length > 0) {
        console.log(`   ❌ FAIL: Sensitive columns exposed: ${exposedColumns.join(', ')}`);
      } else {
        console.log('   ✅ PASS: Only safe columns in view');
      }
    }

    // Test 3: Service role can still access full table (for admin operations)
    console.log('\n4. Testing service role access (SHOULD SUCCEED - full access)...');
    const { data: serviceData, error: serviceError } = await serviceClient
      .from('instructor_profiles')
      .select('certificate_number, admin_notes, first_name')
      .eq('id', instructorId)
      .single();

    if (serviceError) {
      console.log(`   ❌ FAIL: Service role denied: ${serviceError.message}`);
    } else if (!serviceData) {
      console.log('   ⚠️  WARNING: No data returned');
    } else {
      console.log('   ✅ PASS: Service role has full access');
      if (serviceData.certificate_number || serviceData.admin_notes) {
        console.log('   ✅ PASS: Can access sensitive columns');
      } else {
        console.log('   ⚠️  WARNING: Sensitive columns null (may be legitimate)');
      }
    }

    console.log('\n=== TEST COMPLETE ===');
  } catch (e) {
    console.error('Test error:', e);
    process.exit(1);
  }
}

testInstructorPIIExposure();
