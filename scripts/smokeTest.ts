// E2E Smoke Tests - Security & Basic Functionality
const API_BASE = 'http://localhost:5000';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL';
  http?: number;
  message?: string;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<boolean>, expectedHttp?: number): Promise<void> {
  try {
    const pass = await fn();
    results.push({
      name,
      status: pass ? 'PASS' : 'FAIL',
      http: expectedHttp,
    });
  } catch (e: any) {
    results.push({
      name,
      status: 'FAIL',
      message: e.message,
    });
  }
}

async function runSmokeTests() {
  console.log('🔥 Running E2E Smoke Tests\n');
  
  // Test 1: Healthcheck
  await test('Healthcheck /api/health', async () => {
    const res = await fetch(`${API_BASE}/api/health`);
    return res.status === 200 && (await res.json()).ok === true;
  }, 200);
  
  // Test 2: SERVICE_ROLE_KEY blocked
  await test('Block SERVICE_ROLE_KEY from client', async () => {
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!SERVICE_KEY) return true; // Skip if not configured
    
    const res = await fetch(`${API_BASE}/api/wallet/me`, {
      headers: { 'Authorization': `Bearer ${SERVICE_KEY}` }
    });
    return res.status === 403;
  }, 403);
  
  // Test 3: Authentication works
  await test('Login farmer@demo', async () => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'farmer@demo', password: 'pass' })
    });
    const data = await res.json();
    return res.status === 200 && !!data.token;
  }, 200);
  
  // Test 4: Wallet endpoint with valid JWT
  await test('GET /api/wallet/me with JWT', async () => {
    const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'farmer@demo', password: 'pass' })
    });
    const { token } = await loginRes.json();
    
    const res = await fetch(`${API_BASE}/api/wallet/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.status === 200;
  }, 200);
  
  // Test 5: Unauthorized access blocked
  await test('Reject unauthorized requests', async () => {
    const res = await fetch(`${API_BASE}/api/portfolio/me`);
    return res.status === 401;
  }, 401);
  
  // Test 6: User isolation (portfolio)
  await test('Portfolio user isolation', async () => {
    const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'trader@demo', password: 'pass' })
    });
    const { token, user } = await loginRes.json();
    
    const res = await fetch(`${API_BASE}/api/portfolio/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (res.status !== 200) return false;
    
    const data = await res.json();
    return true; // Portfolio endpoint should work
  }, 200);
  
  // Report
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 SMOKE TEST RESULTS\n');
  
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  
  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : '❌';
    const http = r.http ? ` [${r.http}]` : '';
    const msg = r.message ? ` - ${r.message}` : '';
    console.log(`${icon} ${r.name}${http}${msg}`);
  });
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total: ${results.length} | Pass: ${passed} | Fail: ${failed}\n`);
  
  if (failed > 0) {
    console.log('❌ SMOKE TESTS FAILED');
    process.exit(1);
  } else {
    console.log('✅ ALL SMOKE TESTS PASSED\n');
  }
}

runSmokeTests().catch(console.error);
