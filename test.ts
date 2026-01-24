/**
 * Test script for DexpayService
 * Run with: npx tsx test.ts
 */

import { DexpayService } from './services/DexpayService';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testDexpayService() {
  console.log('🚀 Starting DexpayService tests...\n');

  const service = new DexpayService();

  try {
    // Test 1: Get quotes
    console.log('📊 Testing getQuotes...');
    const quotes = await service.getQuotes("DUSD", "SOL",10,"SELL","0199","1234567890","Test x User","8bYtJ4HpDD5LVmLdoBVWR2ti7qtRTkK4VyiZpkQBZwPC");
    console.log('✅ Quotes retrieved:', quotes.length, 'quotes found');
    // console.log('Sample quote:', quotes);
    
    console.log('');

    // Test 2: Get banks
    console.log('🏦 Testing getBanks...');
    const banks = await service.getBanks();
    console.log('✅ Banks retrieved:', banks.length, 'banks found');
    if (banks.length > 0) {
      console.log('Sample banks:', banks.slice(0, 3));
    }
    console.log('');

    // Test 3: Get wallet address
    console.log('💰 Testing getDexpayWalletAddress...');
    try {
      const solAddress = service.getDexpayWalletAddress('SOL');
      console.log('✅ SOL wallet address:', solAddress);
    } catch (error) {
      console.log('❌ SOL wallet address not configured');
    }

    try {
      const bscAddress = service.getDexpayWalletAddress('BSC');
      console.log('✅ BSC wallet address:', bscAddress);
    } catch (error) {
      console.log('❌ BSC wallet address not configured');
    }
    console.log('');

    // Test 4: Resolve account (if banks available)
    if (banks.length > 0) {
      console.log('🔍 Testing resolveAccount...');
      try {
        const accountInfo = await service.resolveAccount(banks[0].code, '1234567890');
        console.log('✅ Account resolution result:', accountInfo);
      } catch (error) {
        console.log('❌ Account resolution failed:', error.message);
      }
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }

  console.log('\n✨ Tests completed!');
}

// Run the tests
testDexpayService().catch(console.error);