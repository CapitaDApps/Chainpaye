import { v4 as uuidv4 } from "uuid";
import { whatsappBusinessService, smsService } from "../../services";
import { redisClient } from "../../services/redis";
import { CONSTANTS } from "../../config/constants";
import { User } from "../../models/User";
import argon2 from "argon2";

/**
 * Handles reset PIN requests from WhatsApp messages
 * Initiates the reset PIN flow by sending a WhatsApp Flow
 */
export async function handleResetPin(phoneNumber: string): Promise<void> {
  try {
    console.log(`Initiating PIN reset flow for ${phoneNumber}`);

    // Generate unique flow token for this reset session
    const flowToken = uuidv4();
    
    // Store flow token with user's phone number (expires in 24 hours)
    await redisClient.set(flowToken, phoneNumber, "EX", CONSTANTS.CACHE_24HRS);

    // Send WhatsApp Flow message for PIN reset
    await whatsappBusinessService.sendResetPinFlowById(phoneNumber);

    console.log(`Reset PIN flow initiated successfully for ${phoneNumber}`);
  } catch (error) {
    console.error(`Error initiating reset PIN flow for ${phoneNumber}:`, error);
    
    // Send fallback message if flow fails
    await whatsappBusinessService.sendNormalMessage(
      `❌ *Unable to start PIN reset*\n\nWe're experiencing technical difficulties. Please try again later or contact support.\n\nType *support* for help.`,
      phoneNumber
    );
  }
}

/**
 * Alternative handler for when WhatsApp Flows are not available
 * Uses conversational approach with OTP via WhatsApp messages
 */
export async function handleResetPinConversational(phoneNumber: string): Promise<void> {
  try {
    console.log(`Starting conversational PIN reset for ${phoneNumber}`);

    // Check if user already has an active reset session
    const existingSession = await redisClient.get(`reset_pin_session:${phoneNumber}`);
    if (existingSession) {
      await whatsappBusinessService.sendNormalMessage(
        `⚠️ *PIN Reset in Progress*\n\nYou already have an active PIN reset session. Please complete the current process or wait 10 minutes for it to expire.\n\nType *cancel reset* to cancel the current session.`,
        phoneNumber
      );
      return;
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const sessionData = {
      step: 'VERIFY_OTP',
      otp,
      otpExpiry: Date.now() + (10 * 60 * 1000), // 10 minutes
      attempts: 0,
      phoneNumber
    };

    // Store session data
    await redisClient.set(
      `reset_pin_session:${phoneNumber}`,
      JSON.stringify(sessionData),
      "EX",
      10 * 60 // 10 minutes
    );

    // Send OTP via SMS
    const smsSuccess = await smsService.sendOtp(phoneNumber, otp, 10);
    
    if (!smsSuccess) {
      await whatsappBusinessService.sendNormalMessage(
        `❌ *SMS Delivery Failed*\n\nWe couldn't send the verification code to your phone. Please check your phone number or try again later.\n\nType *support* for help.`,
        phoneNumber
      );
      return;
    }

    // Send WhatsApp notification about SMS
    await whatsappBusinessService.sendNormalMessage(
      `🔐 *PIN Reset Started*\n\nWe've sent a 6-digit verification code to your phone number via SMS.\n\n📱 Please check your text messages and reply here with the verification code.\n\n⏰ Code expires in 10 minutes\n🔒 Do not share this code with anyone\n\nType *cancel reset* to cancel this process.`,
      phoneNumber
    );

    console.log(`OTP sent successfully for PIN reset: ${phoneNumber}`);
  } catch (error) {
    console.error(`Error in conversational PIN reset for ${phoneNumber}:`, error);
    
    // Send fallback message if flow fails
    await whatsappBusinessService.sendNormalMessage(
      `❌ *PIN Reset Failed*\n\nWe couldn't start the PIN reset process. Please try again later or contact support.\n\nType *support* for help.`,
      phoneNumber
    );
  }
}

/**
 * Handles OTP verification in conversational mode
 */
export async function handleResetPinOTPVerification(
  phoneNumber: string, 
  message: string
): Promise<boolean> {
  try {
    const sessionData = await redisClient.get(`reset_pin_session:${phoneNumber}`);
    if (!sessionData) {
      await whatsappBusinessService.sendNormalMessage(
        `❌ *No Active Reset Session*\n\nNo PIN reset session found. Type *reset pin* to start a new reset process.`,
        phoneNumber
      );
      return false;
    }

    const session = JSON.parse(sessionData);
    
    // Check if session has expired
    if (Date.now() > session.otpExpiry) {
      await redisClient.del(`reset_pin_session:${phoneNumber}`);
      await whatsappBusinessService.sendNormalMessage(
        `⏰ *Verification Code Expired*\n\nYour verification code has expired. Please start the reset process again.\n\nType *reset pin* to get a new code.`,
        phoneNumber
      );
      return false;
    }

    // Validate OTP format
    const otpMatch = message.match(/\b\d{6}\b/);
    if (!otpMatch) {
      await whatsappBusinessService.sendNormalMessage(
        `❌ *Invalid Code Format*\n\nPlease enter the 6-digit verification code sent to you.\n\nType *cancel reset* to cancel.`,
        phoneNumber
      );
      return false;
    }

    const enteredOTP = otpMatch[0];

    // Verify OTP
    if (enteredOTP !== session.otp) {
      session.attempts = (session.attempts || 0) + 1;
      
      if (session.attempts >= 3) {
        await redisClient.del(`reset_pin_session:${phoneNumber}`);
        await whatsappBusinessService.sendNormalMessage(
          `❌ *Too Many Failed Attempts*\n\nYou've entered an incorrect code 3 times. For security, the reset process has been cancelled.\n\nPlease wait 10 minutes before trying again.`,
          phoneNumber
        );
        return false;
      }

      // Update session with failed attempt
      await redisClient.set(
        `reset_pin_session:${phoneNumber}`,
        JSON.stringify(session),
        "EX",
        10 * 60
      );

      await whatsappBusinessService.sendNormalMessage(
        `❌ *Incorrect Code*\n\nThe verification code is incorrect. You have ${3 - session.attempts} attempts remaining.\n\nPlease enter the 6-digit code sent to you.`,
        phoneNumber
      );
      return false;
    }

    // OTP verified successfully
    session.step = 'SET_NEW_PIN';
    delete session.otp; // Remove OTP for security
    delete session.otpExpiry;

    await redisClient.set(
      `reset_pin_session:${phoneNumber}`,
      JSON.stringify(session),
      "EX",
      5 * 60 // 5 minutes to set new PIN
    );

    await whatsappBusinessService.sendNormalMessage(
      `✅ *Code Verified*\n\nGreat! Now please enter your new 4-6 digit PIN.\n\n🔒 Your new PIN should be:\n• 4-6 digits long\n• Numbers only\n• Easy for you to remember\n• Hard for others to guess\n\nType your new PIN now:`,
      phoneNumber
    );

    return true;
  } catch (error) {
    console.error(`Error verifying OTP for ${phoneNumber}:`, error);
    await whatsappBusinessService.sendNormalMessage(
      `❌ *Verification Error*\n\nSomething went wrong during verification. Please try again or contact support.`,
      phoneNumber
    );
    return false;
  }
}

/**
 * Handles new PIN setting in conversational mode
 */
export async function handleResetPinNewPin(
  phoneNumber: string, 
  message: string
): Promise<boolean> {
  try {
    const sessionData = await redisClient.get(`reset_pin_session:${phoneNumber}`);
    if (!sessionData) {
      await whatsappBusinessService.sendNormalMessage(
        `❌ *Session Expired*\n\nYour reset session has expired. Please start over.\n\nType *reset pin* to begin again.`,
        phoneNumber
      );
      return false;
    }

    const session = JSON.parse(sessionData);
    
    if (session.step !== 'SET_NEW_PIN') {
      return false;
    }

    // Extract PIN from message
    const pinMatch = message.match(/\b\d{4,6}\b/);
    if (!pinMatch) {
      await whatsappBusinessService.sendNormalMessage(
        `❌ *Invalid PIN Format*\n\nPlease enter a 4-6 digit PIN (numbers only).\n\nExample: 1234 or 123456`,
        phoneNumber
      );
      return false;
    }

    const newPin = pinMatch[0];

    // Validate PIN length
    if (newPin.length < 4 || newPin.length > 6) {
      await whatsappBusinessService.sendNormalMessage(
        `❌ *Invalid PIN Length*\n\nYour PIN must be 4-6 digits long.\n\nPlease enter a valid PIN:`,
        phoneNumber
      );
      return false;
    }

    // Ask for confirmation
    session.step = 'CONFIRM_PIN';
    session.newPin = newPin;

    await redisClient.set(
      `reset_pin_session:${phoneNumber}`,
      JSON.stringify(session),
      "EX",
      5 * 60
    );

    await whatsappBusinessService.sendNormalMessage(
      `🔄 *Confirm Your New PIN*\n\nPlease enter your new PIN again to confirm:\n\n*${newPin}*\n\nType the same PIN to confirm:`,
      phoneNumber
    );

    return true;
  } catch (error) {
    console.error(`Error setting new PIN for ${phoneNumber}:`, error);
    await whatsappBusinessService.sendNormalMessage(
      `❌ *Error Setting PIN*\n\nSomething went wrong. Please try again or contact support.`,
      phoneNumber
    );
    return false;
  }
}

/**
 * Handles PIN confirmation in conversational mode
 */
export async function handleResetPinConfirmPin(
  phoneNumber: string, 
  message: string
): Promise<boolean> {
  try {
    const sessionData = await redisClient.get(`reset_pin_session:${phoneNumber}`);
    if (!sessionData) {
      await whatsappBusinessService.sendNormalMessage(
        `❌ *Session Expired*\n\nYour reset session has expired. Please start over.\n\nType *reset pin* to begin again.`,
        phoneNumber
      );
      return false;
    }

    const session = JSON.parse(sessionData);
    
    if (session.step !== 'CONFIRM_PIN' || !session.newPin) {
      return false;
    }

    // Extract confirmation PIN
    const confirmPinMatch = message.match(/\b\d{4,6}\b/);
    if (!confirmPinMatch) {
      await whatsappBusinessService.sendNormalMessage(
        `❌ *Invalid Format*\n\nPlease enter the same PIN to confirm:\n\n*${session.newPin}*`,
        phoneNumber
      );
      return false;
    }

    const confirmPin = confirmPinMatch[0];

    // Check if PINs match
    if (confirmPin !== session.newPin) {
      await whatsappBusinessService.sendNormalMessage(
        `❌ *PINs Don't Match*\n\nThe PINs don't match. Please try again.\n\nEnter your new PIN:`,
        phoneNumber
      );
      
      // Go back to SET_NEW_PIN step
      session.step = 'SET_NEW_PIN';
      delete session.newPin;
      
      await redisClient.set(
        `reset_pin_session:${phoneNumber}`,
        JSON.stringify(session),
        "EX",
        5 * 60
      );
      
      return false;
    }

    // PINs match - update in database
    const hashedPin = await argon2.hash(session.newPin);
    const phone = phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;
    
    await User.updateOne({ whatsappNumber: phone }, { pin: hashedPin });

    // Clean up session
    await redisClient.del(`reset_pin_session:${phoneNumber}`);

    // Send success confirmation via SMS
    await smsService.sendPinResetConfirmation(phoneNumber);

    // Send WhatsApp confirmation
    await whatsappBusinessService.sendNormalMessage(
      `✅ *PIN Reset Successful*\n\nYour PIN has been successfully updated! You can now use your new PIN for all transactions.\n\n🔒 *Security Tips:*\n• Keep your PIN confidential\n• Don't share it with anyone\n• Use it only for ChainPaye transactions\n\nType *menu* to return to the main menu.`,
      phoneNumber
    );

    console.log(`PIN reset completed successfully for ${phoneNumber}`);
    return true;
  } catch (error) {
    console.error(`Error confirming PIN for ${phoneNumber}:`, error);
    await whatsappBusinessService.sendNormalMessage(
      `❌ *PIN Update Failed*\n\nWe couldn't update your PIN. Please try the reset process again or contact support.\n\nType *support* for help.`,
      phoneNumber
    );
    return false;
  }
}

/**
 * Handles cancellation of reset PIN process
 */
export async function handleCancelResetPin(phoneNumber: string): Promise<void> {
  try {
    const sessionData = await redisClient.get(`reset_pin_session:${phoneNumber}`);
    if (sessionData) {
      await redisClient.del(`reset_pin_session:${phoneNumber}`);
      await whatsappBusinessService.sendNormalMessage(
        `✅ *PIN Reset Cancelled*\n\nYour PIN reset process has been cancelled. Your current PIN remains unchanged.\n\nType *menu* to return to the main menu.`,
        phoneNumber
      );
    } else {
      await whatsappBusinessService.sendNormalMessage(
        `ℹ️ *No Active Reset*\n\nYou don't have an active PIN reset session.\n\nType *reset pin* to start a new reset process.`,
        phoneNumber
      );
    }
  } catch (error) {
    console.error(`Error cancelling reset PIN for ${phoneNumber}:`, error);
  }
}