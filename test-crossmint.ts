/**
 * Test script for CrossmintService
 * Run with: npx tsx test-crossmint.ts
 */

import { CrossmintService } from './services/CrossmintService';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testCrossmintService() {
  console.log('🚀 Starting CrossmintService tests...\n');

  const service = new CrossmintService();

  try {
    // Test 1: Create custodial wallet for Solana
    console.log('🔑 Testing createCustodialWallet for Solana...');
    const testUserId = 'test-user-123';
    try {
      const solWallet = await service.createCustodialWallet(testUserId, 'sol');
      console.log('✅ Solana wallet created successfully:');
      console.log('   Address:', solWallet.address);
      console.log('   Blockchain:', solWallet.blockchain);
    } catch (error) {
      console.log('❌ Failed to create Solana wallet:', error.message);
    }
    console.log('');

    // Test 2: Create custodial wallet for BSC
    console.log('🔑 Testing createCustodialWallet for BSC...');
    try {
      const bscWallet = await service.createCustodialWallet(testUserId, 'bsc');
      console.log('✅ BSC wallet created successfully:');
      console.log('   Address:', bscWallet.address);
      console.log('   Blockchain:', bscWallet.blockchain);
    } catch (error) {
      console.log('❌ Failed to create BSC wallet:', error.message);
    }
    console.log('');

    // Test 3: Test with different user ID
    console.log('🔄 Testing with different user ID...');
    const differentUserId = 'test-user-456';
    try {
      const wallet = await service.createCustodialWallet(differentUserId, 'sol');
      console.log('✅ Wallet created for different user:');
      console.log('   Address:', wallet.address);
      console.log('   User ID:', differentUserId);
    } catch (error) {
      console.log('❌ Failed to create wallet for different user:', error.message);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }

  console.log('\n✨ Tests completed!');
}

// Run the tests
testCrossmintService().catch(console.error);