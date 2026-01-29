/**
 * Enhanced Webhook Handler for Crypto Off-Ramp Deposit Confirmations
 * 
 * This service handles Crossmint webhook events for deposit confirmations
 * and integrates with the WorkflowController to progress off-ramp workflows.
 * 
 * Requirements: 5.1, 5.2, 5.4
 */

import crypto from 'crypto';
import { Request, Response } from 'express';
import { WorkflowController } from './WorkflowController';
import { CrossmintService } from '../CrossmintService';
import { ValidationService } from './ValidationService';
import { 
  OffRampStep, 
  WorkflowState,
  CrossmintConfig,
  SupportedAsset,
  SupportedChain
} from '../../types/crypto-off-ramp.types';
import { logger } from '../../utils/logger';

export interface CrossmintDepositWebhookEvent {
  type: 'wallet.deposit';
  data: {
    walletId: string;
    owner: string; // Format: userId:user-123
    address: string;
    chainType: string;
    transaction: {
      hash: string;
      amount: string;
      token: string;
      from: string;
      to: string;
      blockNumber?: number;
      timestamp: string;
      status: 'confirmed' | 'pending' | 'failed';
    };
  };
  timestamp: string;
  eventId: string;
}

export interface DepositConfirmationResult {
  success: boolean;
  workflowsUpdated: number;
  message: string;
  error?: string;
}

export class WebhookHandler {
  private workflowController: WorkflowController;
  private crossmintService: CrossmintService;
  private validationService: ValidationService;
  private webhookSecret: string;

  constructor(
    workflowController: WorkflowController,
    crossmintService: CrossmintService,
    validationService: ValidationService,
    config: CrossmintConfig
  ) {
    this.workflowController = workflowController;
    this.crossmintService = crossmintService;
    this.validationService = validationService;
    this.webhookSecret = config.webhookSecret;
  }

  /**
   * Handle Crossmint deposit webhook with WorkflowController integration
   * Requirements: 5.1, 5.2, 5.4
   */
  async handleDepositWebhook(req: Request, res: Response): Promise<void> {
    try {
      // Verify webhook signature for security
      if (!this.verifyWebhookSignature(req)) {
        logger.warn('Invalid webhook signature received from Crossmint');
        res.status(403).json({ error: 'Invalid webhook signature' });
        return;
      }

      const webhookEvent: CrossmintDepositWebhookEvent = req.body;
      
      // Validate webhook structure
      const validationResult = this.validateWebhookEvent(webhookEvent);
      if (!validationResult.isValid) {
        logger.warn('Invalid webhook event structure:', validationResult.errors);
        res.status(400).json({ 
          error: 'Invalid webhook format',
          details: validationResult.errors 
        });
        return;
      }

      // Process the deposit confirmation
      const result = await this.processDepositConfirmation(webhookEvent);
      
      if (result.success) {
        logger.info(`Deposit confirmation processed successfully:`, {
          eventId: webhookEvent.eventId,
          workflowsUpdated: result.workflowsUpdated,
          message: result.message
        });
        
        res.status(200).json({
          success: true,
          message: result.message,
          workflowsUpdated: result.workflowsUpdated
        });
      } else {
        logger.error(`Failed to process deposit confirmation:`, {
          eventId: webhookEvent.eventId,
          error: result.error
        });
        
        res.status(500).json({
          success: false,
          error: result.error
        });
      }
    } catch (error: any) {
      logger.error('Unexpected error handling deposit webhook:', {
        error: error.message,
        stack: error.stack
      });
      
      res.status(500).json({
        success: false,
        error: 'Internal server error processing webhook'
      });
    }
  }

  /**
   * Process deposit confirmation and update relevant workflows
   * Enhanced with direct handler integration for better workflow management
   * Requirements: 5.1, 5.2, 5.4
   */
  private async processDepositConfirmation(
    webhookEvent: CrossmintDepositWebhookEvent
  ): Promise<DepositConfirmationResult> {
    try {
      const { data } = webhookEvent;
      
      // Extract user ID from owner field (format: userId:user-123)
      const userId = this.extractUserIdFromOwner(data.owner);
      if (!userId) {
        return {
          success: false,
          workflowsUpdated: 0,
          message: 'Failed to extract user ID from webhook',
          error: `Invalid owner format: ${data.owner}`
        };
      }

      // Only process confirmed transactions
      if (data.transaction.status !== 'confirmed') {
        logger.info(`Ignoring non-confirmed transaction:`, {
          status: data.transaction.status,
          hash: data.transaction.hash,
          userId
        });
        
        return {
          success: true,
          workflowsUpdated: 0,
          message: `Transaction not confirmed yet (status: ${data.transaction.status})`
        };
      }

      // Parse deposit details
      const depositAmount = parseFloat(data.transaction.amount);
      const asset = data.transaction.token.toUpperCase() as SupportedAsset;
      const chainType = this.mapChainTypeToSupportedChain(data.chainType);
      
      // Validate asset and chain combination
      const assetChainValidation = this.validationService.validateAssetChain(asset, chainType);
      if (!assetChainValidation.isValid) {
        logger.warn(`Invalid asset-chain combination in deposit:`, {
          asset,
          chain: chainType,
          errors: assetChainValidation.errors
        });
        
        return {
          success: false,
          workflowsUpdated: 0,
          message: 'Invalid asset-chain combination',
          error: assetChainValidation.errors.join(', ')
        };
      }

      // Get user's active workflows waiting for deposit confirmation
      const activeWorkflows = await this.workflowController.getUserActiveWorkflows(userId);
      const waitingWorkflows = activeWorkflows.filter(workflow => 
        workflow.currentStep === OffRampStep.DEPOSIT_CONFIRMATION &&
        workflow.stepData.selectedAsset === asset &&
        workflow.stepData.selectedChain === chainType &&
        workflow.stepData.walletAddress === data.address
      );

      if (waitingWorkflows.length === 0) {
        logger.info(`No workflows waiting for deposit confirmation:`, {
          userId,
          asset,
          chain: chainType,
          walletAddress: data.address,
          activeWorkflows: activeWorkflows.length
        });
        
        return {
          success: true,
          workflowsUpdated: 0,
          message: 'No workflows waiting for this deposit'
        };
      }

      // Update each waiting workflow with deposit confirmation
      let updatedCount = 0;
      const errors: string[] = [];

      for (const workflow of waitingWorkflows) {
        try {
          // Get updated wallet balance to check if user has sufficient funds (> $2 USD)
          const walletBalance = await this.crossmintService.getWalletBalanceForAsset(
            userId, 
            chainType, 
            asset
          );

          const stepData = {
            depositConfirmed: true,
            depositAmount,
            depositAsset: asset,
            depositChain: chainType,
            depositHash: data.transaction.hash,
            depositTimestamp: data.transaction.timestamp,
            currentBalance: walletBalance,
            spendCTAEnabled: true // Enable "Spend Crypto" CTA as per requirement 5.2
          };

          // Process the deposit confirmation step
          const stepResult = await this.workflowController.processStep(
            workflow.id, 
            stepData
          );

          if (stepResult.success) {
            updatedCount++;
            logger.info(`Workflow updated with deposit confirmation:`, {
              workflowId: workflow.id,
              userId,
              depositAmount,
              asset,
              nextStep: stepResult.nextStep
            });

            // Try to use the direct handler integration for enhanced notifications
            try {
              // Import the handler function dynamically to avoid circular dependencies
              const { updateWorkflowForDeposit } = await import('../../commands/handlers/offrampHandler');
              
              // Call the direct integration function for enhanced workflow handling
              const handlerResult = await updateWorkflowForDeposit(
                userId,
                asset,
                depositAmount,
                chainType,
                data.address,
                data.transaction.hash
              );
              
              logger.info(`Direct handler integration result:`, handlerResult);
            } catch (handlerError: any) {
              // Log but don't fail the webhook processing if handler integration fails
              logger.warn(`Direct handler integration failed (non-critical):`, handlerError.message);
            }
          } else {
            errors.push(`Workflow ${workflow.id}: ${stepResult.error}`);
            logger.error(`Failed to update workflow with deposit:`, {
              workflowId: workflow.id,
              error: stepResult.error
            });
          }
        } catch (workflowError: any) {
          errors.push(`Workflow ${workflow.id}: ${workflowError.message}`);
          logger.error(`Error updating workflow:`, {
            workflowId: workflow.id,
            error: workflowError.message
          });
        }
      }

      // Determine overall result
      if (updatedCount > 0) {
        const message = `Successfully updated ${updatedCount} workflow(s) with deposit confirmation`;
        
        if (errors.length > 0) {
          logger.warn(`Partial success updating workflows:`, {
            updated: updatedCount,
            errors: errors.length,
            errorDetails: errors
          });
        }
        
        return {
          success: true,
          workflowsUpdated: updatedCount,
          message: errors.length > 0 ? `${message}. ${errors.length} errors occurred.` : message
        };
      } else {
        return {
          success: false,
          workflowsUpdated: 0,
          message: 'Failed to update any workflows',
          error: errors.join('; ')
        };
      }
    } catch (error: any) {
      logger.error('Error processing deposit confirmation:', {
        error: error.message,
        eventId: webhookEvent.eventId
      });
      
      return {
        success: false,
        workflowsUpdated: 0,
        message: 'Failed to process deposit confirmation',
        error: error.message
      };
    }
  }

  /**
   * Verify Crossmint webhook signature for security
   */
  private verifyWebhookSignature(req: Request): boolean {
    try {
      if (!this.webhookSecret) {
        logger.warn('Webhook secret not configured - skipping signature verification');
        return true; // Allow in development, but log warning
      }

      const signature = req.get('x-crossmint-signature') || req.get('x-hub-signature-256');
      if (!signature) {
        logger.warn('No webhook signature header found');
        return false;
      }

      // Get raw body for signature verification
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);
      
      // Create expected signature
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(rawBody, 'utf8')
        .digest('hex');

      // Handle different signature formats
      const receivedSignature = signature.startsWith('sha256=') 
        ? signature.slice(7) 
        : signature;

      // Use timing-safe comparison
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');
      const receivedBuffer = Buffer.from(receivedSignature, 'hex');

      if (expectedBuffer.length !== receivedBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
    } catch (error: any) {
      logger.error('Error verifying webhook signature:', error.message);
      return false;
    }
  }

  /**
   * Validate webhook event structure
   */
  private validateWebhookEvent(event: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check required top-level fields
    if (!event.type) {
      errors.push('Missing event type');
    } else if (event.type !== 'wallet.deposit') {
      errors.push(`Invalid event type: ${event.type}. Expected: wallet.deposit`);
    }

    if (!event.data) {
      errors.push('Missing event data');
      return { isValid: false, errors };
    }

    const { data } = event;

    // Check required data fields
    if (!data.walletId) errors.push('Missing walletId');
    if (!data.owner) errors.push('Missing owner');
    if (!data.address) errors.push('Missing wallet address');
    if (!data.chainType) errors.push('Missing chainType');

    // Check transaction data
    if (!data.transaction) {
      errors.push('Missing transaction data');
    } else {
      const { transaction } = data;
      if (!transaction.hash) errors.push('Missing transaction hash');
      if (!transaction.amount) errors.push('Missing transaction amount');
      if (!transaction.token) errors.push('Missing transaction token');
      if (!transaction.from) errors.push('Missing transaction from address');
      if (!transaction.to) errors.push('Missing transaction to address');
      if (!transaction.timestamp) errors.push('Missing transaction timestamp');
      
      // Validate amount is a valid number
      if (transaction.amount && isNaN(parseFloat(transaction.amount))) {
        errors.push('Invalid transaction amount format');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Extract user ID from Crossmint owner field
   */
  private extractUserIdFromOwner(owner: string): string | null {
    try {
      // Expected format: userId:user-123
      const match = owner.match(/^userId:(.+)$/);
      return match && match[1] ? match[1] : null;
    } catch (error) {
      logger.error('Error extracting user ID from owner field:', error);
      return null;
    }
  }

  /**
   * Map Crossmint chain types to supported chain types
   */
  private mapChainTypeToSupportedChain(chainType: string): SupportedChain {
    const chainMapping: Record<string, SupportedChain> = {
      'solana': 'solana',
      'bsc': 'bep20',
      'arbitrum': 'arbitrum',
      'base': 'base',
      'hedera': 'hedera',
      'apechain': 'apechain',
      'lisk': 'lisk'
    };

    const mappedChain = chainMapping[chainType.toLowerCase()];
    if (!mappedChain) {
      logger.warn(`Unknown chain type from Crossmint: ${chainType}`);
      return chainType.toLowerCase() as SupportedChain;
    }

    return mappedChain;
  }

  /**
   * Handle webhook processing failures with appropriate error responses
   * Requirements: 5.3
   */
  async handleWebhookFailure(
    req: Request, 
    res: Response, 
    error: Error, 
    context: string
  ): Promise<void> {
    logger.error(`Webhook failure in ${context}:`, {
      error: error.message,
      stack: error.stack,
      body: req.body,
      headers: req.headers
    });

    // Provide appropriate error messaging as per requirement 5.3
    const errorResponse = {
      success: false,
      error: 'Webhook processing failed',
      context,
      timestamp: new Date().toISOString()
    };

    res.status(500).json(errorResponse);
  }

  /**
   * Test endpoint for webhook functionality (development/testing)
   */
  async handleTestWebhook(req: Request, res: Response): Promise<void> {
    try {
      const { userId, asset, amount, chain, walletAddress } = req.body;

      if (!userId || !asset || !amount || !chain || !walletAddress) {
        res.status(400).json({
          error: 'Missing required fields: userId, asset, amount, chain, walletAddress'
        });
        return;
      }

      // Create a test webhook event
      const testEvent: CrossmintDepositWebhookEvent = {
        type: 'wallet.deposit',
        data: {
          walletId: `test-wallet-${Date.now()}`,
          owner: `userId:${userId}`,
          address: walletAddress,
          chainType: chain,
          transaction: {
            hash: `test-tx-${Date.now()}`,
            amount: amount.toString(),
            token: asset.toLowerCase(),
            from: 'test-sender-address',
            to: walletAddress,
            timestamp: new Date().toISOString(),
            status: 'confirmed'
          }
        },
        timestamp: new Date().toISOString(),
        eventId: `test-event-${Date.now()}`
      };

      // Process the test event
      const result = await this.processDepositConfirmation(testEvent);

      res.status(200).json({
        success: true,
        message: 'Test webhook processed',
        result
      });
    } catch (error: any) {
      logger.error('Error processing test webhook:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}