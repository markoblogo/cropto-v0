// E2E Smoke Tests - Complete API Flow
const API_BASE = 'http://localhost:5000';

interface TestResults {
  health: 'OK' | 'FAIL';
  login: 'OK' | 'FAIL';
  me: number;
  wallet: string | 'NULL';
  balance: string;
  createOption: string;
  mint: string;
  txStatus: string;
  dailySettle: string;
}

async function runE2ETests(): Promise<TestResults> {
  const results: TestResults = {
    health: 'FAIL',
    login: 'FAIL',
    me: 0,
    wallet: 'NULL',
    balance: 'NOT_AVAILABLE',
    createOption: 'FAIL',
    mint: 'FAIL',
    txStatus: 'PENDING',
    dailySettle: 'processed=0 errors=0',
  };

  try {
    // Step 1: Healthcheck
    const healthRes = await fetch(`${API_BASE}/api/health`);
    if (healthRes.status !== 200) {
      throw new Error(`Healthcheck failed: HTTP ${healthRes.status}`);
    }
    const healthText = await healthRes.text();
    const healthData = JSON.parse(healthText);
    if (healthData.ok === true) {
      results.health = 'OK';
    } else {
      throw new Error('Healthcheck failed: ok !== true');
    }

    // Step 2: Login
    const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'farmer@demo', password: 'pass' })
    });
    
    if (loginRes.status !== 200) {
      const errorText = await loginRes.text();
      throw new Error(`Login failed: HTTP ${loginRes.status}: ${errorText.substring(0, 100)}`);
    }

    const loginText = await loginRes.text();
    const loginData = JSON.parse(loginText);
    const token = loginData.token || loginData.accessToken;
    
    if (!token) {
      throw new Error('Token missing from login response');
    }
    
    results.login = 'OK';

    // Step 3: Check /api/auth/me
    const meRes = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    results.me = meRes.status;
    
    if (meRes.status !== 200) {
      const errorText = await meRes.text();
      throw new Error(`/api/auth/me failed: HTTP ${meRes.status}: ${errorText.substring(0, 100)}`);
    }

    const meText = await meRes.text();
    const meData = JSON.parse(meText);
    const userId = meData.user?.id || meData.id;
    if (userId !== 'user_1762284081440_877dimuju') {
      console.warn(`Warning: User ID mismatch. Expected user_1762284081440_877dimuju, got ${userId}`);
    }

    // Step 4: Check wallet
    const walletRes = await fetch(`${API_BASE}/api/wallet/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (walletRes.status === 200) {
      const walletData = await walletRes.json();
      results.wallet = walletData.walletAddress || 'NULL';
    }

    // Step 5: Balance read
    if (results.wallet !== 'NULL') {
      const balanceRes = await fetch(`${API_BASE}/api/onchain/balance/${results.wallet}`);
      
      if (balanceRes.status === 200) {
        const balanceData = await balanceRes.json();
        results.balance = `${balanceData.balance || '0'} ${balanceData.symbol || 'CROPT'}`;
      }
    }

    // Step 6: Create option
    const optionPayload = {
      title: 'E2E Test Option',
      type: 'CALL',
      strike: 210,
      qty: 100,
      premium_per_t: 5,
      commodity: 'WHEAT',
      warehouse_receipt_url: 'https://example.com/receipt.pdf'
    };

    const createRes = await fetch(`${API_BASE}/api/options`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(optionPayload)
    });

    if (createRes.status === 201 || createRes.status === 200) {
      const optionData = await createRes.json();
      const optionId = optionData.id || optionData.option?.id;
      if (optionId) {
        results.createOption = `OK id=${optionId}`;
      } else {
        results.createOption = 'FAIL (no id)';
      }
    } else {
      const errorText = await createRes.text();
      results.createOption = `FAIL (HTTP ${createRes.status})`;
    }

    // Step 7: Mint request (withdraw simulation)
    if (results.wallet !== 'NULL') {
      const mintRes = await fetch(`${API_BASE}/api/onchain/mint`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          address: results.wallet,
          amount: 1
        })
      });

      if (mintRes.status === 200) {
        const mintData = await mintRes.json();
        const txHash = mintData.txHash;
        if (txHash) {
          results.mint = `OK tx=${txHash.substring(0, 10)}...${txHash.substring(txHash.length - 8)}`;
          
          // Step 8: Poll tx status (max 180s, check every 5s)
          const maxAttempts = 36; // 180s / 5s
          let attempts = 0;
          
          while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s
            
            const txRes = await fetch(`${API_BASE}/api/onchain/tx/${txHash}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (txRes.status === 200) {
              const txData = await txRes.json();
              results.txStatus = txData.status || 'PENDING';
              
              if (results.txStatus === 'CONFIRMED' || results.txStatus === 'FAILED') {
                break;
              }
            }
            
            attempts++;
          }
        } else {
          results.mint = 'FAIL (no txHash)';
        }
      } else {
        const errorText = await mintRes.text();
        results.mint = `FAIL (HTTP ${mintRes.status})`;
      }
    } else {
      results.mint = 'SKIP (no wallet)';
    }

    // Step 10: Daily settle job
    const today = new Date().toISOString().split('T')[0];
    const settleRes = await fetch(`${API_BASE}/api/jobs/daily-settle`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        date: today,
        commodity: 'WHEAT',
        indexPrice: 230
      })
    });

    if (settleRes.status === 200) {
      const settleData = await settleRes.json();
      const processed = settleData.processedOptions || 0;
      const errors = settleData.errors?.length || 0;
      results.dailySettle = `processed=${processed} errors=${errors}`;
    } else {
      results.dailySettle = `FAIL (HTTP ${settleRes.status})`;
    }

  } catch (error: any) {
    console.error('E2E Test Error:', error.message);
    throw error;
  }

  return results;
}

async function main() {
  console.log('🔥 Running E2E Smoke Tests...\n');
  
  try {
    const results = await runE2ETests();
    
    // Output in compact format
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 E2E SMOKE TEST RESULTS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`HEALTH: ${results.health}`);
    console.log(`LOGIN: ${results.login}`);
    console.log(`ME: ${results.me}`);
    console.log(`WALLET: ${results.wallet}`);
    console.log(`BALANCE: ${results.balance}`);
    console.log(`CREATE_OPTION: ${results.createOption}`);
    console.log(`MINT: ${results.mint}`);
    console.log(`TX_STATUS: ${results.txStatus}`);
    console.log(`DAILY_SETTLE: ${results.dailySettle}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Determine overall status
    if (results.health === 'OK' && results.login === 'OK' && results.me === 200) {
      console.log('✅ Core functionality: PASSED');
    } else {
      console.log('❌ Core functionality: FAILED');
      process.exit(1);
    }
    
  } catch (error: any) {
    console.error('\n❌ E2E Tests FAILED:', error.message);
    process.exit(1);
  }
}

main();
