#!/usr/bin/env tsx

/**
 * Test script for Crossmint signing functionality
 * This script tests both EVM and Solana message signing without making actual API calls
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testEvmSigning() {
  console.log('\n🔧 Testing EVM Message Signing...');
  
  const privateKey = process.env.CROSSMINT_ADMIN_EVM_PRIVATE_KEY;
  const expectedAddress = process.env.CROSSMINT_ADMIN_EVM_ADDRESS;
  
  if (!privateKey || !expectedAddress) {
    console.log('❌ EVM private key or address not configured');
    return false;
  }
  
  try {
    const { privateKeyToAccount } = await import('viem/accounts');
    
    // Create account from private key
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    
    // Verify address matches
    if (account.address.toLowerCase() !== expectedAddress.toLowerCase()) {
      console.log(`❌ Address mismatch: ${account.address} !== ${expectedAddress}`);
      return false;
    }
    
    // Test message signing
    const testMessage = '0x48656c6c6f20576f726c64'; // "Hello World" in hex
    const signature = await account.signMessage({
      message: { raw: testMessage as `0x${string}` },
    });
    
    console.log(`✅ EVM signing successful`);
    console.log(`   Address: ${account.address}`);
    console.log(`   Signature length: ${signature.length}`);
    
    return true;
  } catch (error: any) {
    console.log(`❌ EVM signing failed: ${error.message}`);
    return false;
  }
}

async function testSolanaSigning() {
  console.log('\n🔧 Testing Solana Message Signing...');
  
  const privateKey = process.env.CROSSMINT_ADMIN_SOLANA_PRIVATE_KEY;
  const expectedAddress = process.env.CROSSMINT_ADMIN_SOLANA_ADDRESS;
  
  if (!privateKey || !expectedAddress) {
    console.log('❌ Solana private key or address not configured');
    return false;
  }
  
  try {
    const { Keypair } = await import('@solana/web3.js');
    const nacl = await import('tweetnacl');
    const bs58 = await import('bs58');
    
    // Create keypair from private key
    const keypair = Keypair.fromSecretKey(bs58.default.decode(privateKey));
    
    // Verify address matches
    const publicKeyBase58 = keypair.publicKey.toBase58();
    if (publicKeyBase58 !== expectedAddress) {
      console.log(`❌ Address mismatch: ${publicKeyBase58} !== ${expectedAddress}`);
      return false;
    }
    
    // Test message signing
    const testMessage = Buffer.from('Hello World').toString('base64');
    const messageBytes = Buffer.from(testMessage, 'base64');
    const sig = nacl.default.sign.detached(messageBytes, keypair.secretKey);
    const signature = Buffer.from(sig).toString('base64');
    
    console.log(`✅ Solana signing successful`);
    console.log(`   Address: ${publicKeyBase58}`);
    console.log(`   Signature length: ${signature.length}`);
    
    return true;
  } catch (error: any) {
    console.log(`❌ Solana signing failed: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🧪 Crossmint Signing Test Suite');
  console.log('================================');
  
  const evmResult = await testEvmSigning();
  const solanaResult = await testSolanaSigning();
  
  console.log('\n📊 Test Results:');
  console.log(`   EVM Signing: ${evmResult ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Solana Signing: ${solanaResult ? '✅ PASS' : '❌ FAIL'}`);
  
  if (evmResult && solanaResult) {
    console.log('\n🎉 All tests passed! Crossmint signing is ready.');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Please check your configuration.');
    process.exit(1);
  }
}

// Run the test
main().catch((error) => {
  console.error('❌ Test suite failed:', error.message);
  process.exit(1);
});