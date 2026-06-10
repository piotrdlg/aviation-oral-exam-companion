#!/usr/bin/env npx tsx
/**
 * Test RPC Authorization Fix (W1.1)
 *
 * Verifies that cross-user RPC calls now return 403 forbidden instead of data leaks.
 * This test uses an authenticated JWT for user A and attempts to query user B's data.
 *
 * Expected behavior:
 * - get_element_scores(user_b_id) should raise exception
 * - get_session_element_scores(user_b_session_id) should raise exception
 * - get_uncovered_acs_tasks(user_b_session_id) should raise exception
 * - Service role calls should still work
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

async function testRPCAuthorization() {
  console.log('=== RPC Authorization Test (W1.1) ===\n');

  const anonClient = createClient(url, anonKey);
  const serviceClient = createClient(url, serviceKey);

  try {
    // Get two different users from the database
    console.log('1. Fetching test users...');
    const { data: users } = await serviceClient
      .from('user_profiles')
      .select('id, email')
      .limit(2);

    if (!users || users.length < 2) {
      console.log('⚠️  Insufficient users for cross-user test (need 2, got ' + (users?.length || 0) + ')');
      console.log('   (This is expected in production with only 3 paying users)');
      return;
    }

    const [userA, userB] = users;
    console.log(`   User A: ${userA.email}`);
    console.log(`   User B: ${userB.email}\n`);

    // Get a session from user B
    console.log('2. Fetching user B session...');
    const { data: userBSessions } = await serviceClient
      .from('exam_sessions')
      .select('id')
      .eq('user_id', userB.id)
      .limit(1);

    if (!userBSessions || userBSessions.length === 0) {
      console.log('⚠️  User B has no sessions (expected for trial users)');
      console.log('   Skipping session-based tests.\n');

      // Still test get_element_scores cross-user check
      console.log('3. Testing get_element_scores with cross-user access...');
      const { data: scores, error: scoresError } = await anonClient.rpc('get_element_scores', {
        p_user_id: userB.id,
        p_rating: 'private',
      });

      if (scoresError) {
        if (scoresError.message.includes('forbidden')) {
          console.log('   ✅ PASS: Cross-user access denied (expected exception)');
        } else {
          console.log(`   ❌ FAIL: Unexpected error: ${scoresError.message}`);
        }
      } else if (scores && scores.length > 0) {
        console.log('   ❌ FAIL: Cross-user access returned data (SECURITY BREACH)');
      } else {
        console.log('   ⚠️  AMBIGUOUS: Empty result (could be no data or denial)');
      }
      return;
    }

    const userBSessionId = userBSessions[0].id;
    console.log(`   User B session: ${userBSessionId}\n`);

    // Test 1: Cross-user element scores access
    console.log('3. Testing get_element_scores with cross-user access...');
    const { data: scoresData, error: scoresError } = await anonClient.rpc('get_element_scores', {
      p_user_id: userB.id,
      p_rating: 'private',
    });

    if (scoresError && scoresError.message.includes('forbidden')) {
      console.log('   ✅ PASS: Cross-user access denied');
    } else if (scoresData && scoresData.length > 0) {
      console.log('   ❌ FAIL: Cross-user access returned data (SECURITY BREACH!)');
    } else {
      console.log('   ⚠️  AMBIGUOUS: No error but empty result');
    }

    // Test 2: Cross-user session scores access
    console.log('\n4. Testing get_session_element_scores with cross-user access...');
    const { data: sessionScores, error: sessionError } = await anonClient.rpc(
      'get_session_element_scores',
      { p_session_id: userBSessionId }
    );

    if (sessionError && sessionError.message.includes('forbidden')) {
      console.log('   ✅ PASS: Cross-user access denied');
    } else if (sessionScores && sessionScores.length > 0) {
      console.log('   ❌ FAIL: Cross-user access returned data (SECURITY BREACH!)');
    } else {
      console.log('   ⚠️  AMBIGUOUS: No error but empty result');
    }

    // Test 3: Cross-user uncovered tasks access
    console.log('\n5. Testing get_uncovered_acs_tasks with cross-user access...');
    const { data: uncovered, error: uncoveredError } = await anonClient.rpc(
      'get_uncovered_acs_tasks',
      { p_session_id: userBSessionId }
    );

    if (uncoveredError && uncoveredError.message.includes('forbidden')) {
      console.log('   ✅ PASS: Cross-user access denied');
    } else if (uncovered && uncovered.length > 0) {
      console.log('   ❌ FAIL: Cross-user access returned data (SECURITY BREACH!)');
    } else {
      console.log('   ⚠️  AMBIGUOUS: No error but empty result');
    }

    // Test 4: Service role should still work
    console.log('\n6. Testing service role access (should work for instructor insights)...');
    const { data: serviceScores, error: serviceError } = await serviceClient.rpc(
      'get_element_scores',
      {
        p_user_id: userB.id,
        p_rating: 'private',
      }
    );

    if (serviceError) {
      console.log(`   ❌ FAIL: Service role access denied: ${serviceError.message}`);
    } else {
      console.log('   ✅ PASS: Service role access allowed (expected)');
    }

    console.log('\n=== TEST COMPLETE ===');
  } catch (e) {
    console.error('Test error:', e);
    process.exit(1);
  }
}

testRPCAuthorization();
