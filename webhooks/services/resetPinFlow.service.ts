import argon2 from "argon2";
import { redisClient } from "../../services/redis";
import { User } from "../../models/User";
import { userService, whatsappBusinessService, smsService } from "../../services";

// Constants for reset PIN flow
const RESET_PIN_OTP_EXPIRY = 10 * 60; // 10 minutes in seconds
const RESET_PIN_RATE_LIMIT = 3; // Max 3 reset attempts per hour
const RESET_PIN_RATE_LIMIT_WINDOW = 60 * 60; // 1 hour in seconds

interface ResetPinState {
  step: 'REQUEST_RESET' | 'VERIFY_OTP' | 'SET_NEW_PIN';
  phoneNumber: string;
  otp?: string;
  otpExpiry?: number;
  attempts?: number;
  lastAttempt?: number;
}

export const getResetPinScreen = async (decryptedBody: {
  screen: string;
  data: any;
  version: string;
  action: string;
  flow_token: string;
}) => {
  const { screen, data, version, action, flow_token } = decryptedBody;

  // Handle health check request
  if (action === "ping") {
    return {
      data: {
        status: "active",
      },
    };
  }

  // Handle error notification
  if (data?.error) {
    console.warn("Received client error:", data);
    return {
      data: {
        status: "Error",
        acknowledged: true,
      },
    };
  }

  // Get user phone number from Redis using flow_token
  const userPhone = await redisClient.get(flow_token);
  if (!userPhone) {
    return {
      screen: "REQUEST_RESET",
      data: {
        error_message: "Session expired. Please restart the reset process.",
      },
    };
  }

  // Handle initial request when opening the flow
  if (action === "INIT") {
    // Initialize reset state
    const resetState: ResetPinState = {
      step: 'REQUEST_RESET',
      phoneNumber: userPhone,
      attempts: 0,
    };
    
    await redisClient.set(
      `reset_pin_state:${userPhone}`,
      JSON.stringify(resetState),
      "EX",
      RESET_PIN_OTP_EXPIRY * 6 // Give more time for the entire flow
    );

    return {
      screen: "REQUEST_RESET",
      data: {},
    };
  }

  if (action === "data_exchange") {
    // Get current reset state
    const stateData = await redisClient.get(`reset_pin_state:${userPhone}`);
    if (!stateData) {
      return {
        screen: "REQUEST_RESET",
        data: {
          error_message: "Reset session expired. Please start over.",
        },
      };
    }

    const resetState: ResetPinState = JSON.parse(stateData);

    // Handle the request based on the current screen
    switch (screen) {
      case "REQUEST_RESET":
        return await handleRequestReset(userPhone, resetState, flow_token);

      case "VERIFY_OTP":
        return await handleVerifyOTP(data, userPhone, resetState);

      case "SET_NEW_PIN":
        return await handleSetNewPin(data, userPhone, resetState, flow_token);

      default:
        return {
          screen: "REQUEST_RESET",
          data: {
            error_message: "Invalid screen. Please restart the reset process.",
          },
        };
    }
  }

  return {
    screen: "REQUEST_RESET",
    data: {},
  };
};

async function handleRequestReset(
  userPhone: string,
  resetState: ResetPinState,
  flow_token: string
) {
  try {
    // Check rate limiting
    const rateLimitKey = `reset_pin_rate_limit:${userPhone}`;
    const rateLimitData = await redisClient.get(rateLimitKey);
    
    if (rateLimitData) {
      const { attempts, lastAttempt } = JSON.parse(rateLimitData);
      const now = Date.now();
      
      // Reset counter if window has passed
      if (now - lastAttempt > RESET_PIN_RATE_LIMIT_WINDOW * 1000) {
        await redisClient.del(rateLimitKey);
      } else if (attempts >= RESET_PIN_RATE_LIMIT) {
        return {
          screen: "REQUEST_RESET",
          data: {
            error_message: "Too many reset attempts. Please try again in 1 hour.",
          },
        };
      }
    }

    // Verify user exists
    const user = await userService.getUser(userPhone);
    if (!user) {
      return {
        screen: "REQUEST_RESET",
        data: {
          error_message: "User not found. Please ensure you're registered.",
        },
      };
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = Date.now() + (RESET_PIN_OTP_EXPIRY * 1000);

    // Update reset state
    resetState.step = 'VERIFY_OTP';
    resetState.otp = otp;
    resetState.otpExpiry = otpExpiry;

    await redisClient.set(
      `reset_pin_state:${userPhone}`,
      JSON.stringify(resetState),
      "EX",
      RESET_PIN_OTP_EXPIRY * 6
    );

    // Update rate limiting
    const currentRateLimit = rateLimitData ? JSON.parse(rateLimitData) : { attempts: 0 };
    await redisClient.set(
      rateLimitKey,
      JSON.stringify({
        attempts: currentRateLimit.attempts + 1,
        lastAttempt: Date.now(),
      }),
      "EX",
      RESET_PIN_RATE_LIMIT_WINDOW
    );

    // Send OTP via SMS
    const smsSuccess = await smsService.sendOtp(userPhone, otp, 10);
    
    if (!smsSuccess) {
      return {
        screen: "REQUEST_RESET",
        data: {
          error_message: "Failed to send verification code. Please try again.",
        },
      };
    }

    // Also send a WhatsApp notification (optional)
    await whatsappBusinessService.sendNormalMessage(
      `🔐 *PIN Reset Verification*\n\nWe've sent a 6-digit verification code to your phone number via SMS.\n\nPlease check your text messages and enter the code in the form above.\n\n⏰ Code expires in 10 minutes.`,
      userPhone
    );

    return {
      screen: "VERIFY_OTP",
      data: {
        phone_number: userPhone.replace(/(\+\d{1,3})(\d{3})(\d{3})(\d{4})/, "$1 $2 $3 $4"),
      },
    };
  } catch (error) {
    console.error("Error in handleRequestReset:", error);
    return {
      screen: "REQUEST_RESET",
      data: {
        error_message: "Failed to send verification code. Please try again.",
      },
    };
  }
}

async function handleVerifyOTP(
  data: any,
  userPhone: string,
  resetState: ResetPinState
) {
  try {
    const { otp_code } = data;

    if (!otp_code) {
      return {
        screen: "VERIFY_OTP",
        data: {
          error_message: "Please enter the verification code.",
        },
      };
    }

    // Validate OTP format
    if (!/^\d{6}$/.test(otp_code)) {
      return {
        screen: "VERIFY_OTP",
        data: {
          error_message: "Invalid code format. Please enter 6 digits.",
        },
      };
    }

    // Check if OTP has expired
    if (!resetState.otpExpiry || Date.now() > resetState.otpExpiry) {
      return {
        screen: "VERIFY_OTP",
        data: {
          error_message: "Verification code has expired. Please restart the reset process.",
        },
      };
    }

    // Verify OTP
    if (otp_code !== resetState.otp) {
      return {
        screen: "VERIFY_OTP",
        data: {
          error_message: "Invalid verification code. Please try again.",
        },
      };
    }

    // OTP verified successfully, move to next step
    resetState.step = 'SET_NEW_PIN';
    delete resetState.otp; // Remove OTP from state for security
    delete resetState.otpExpiry;

    await redisClient.set(
      `reset_pin_state:${userPhone}`,
      JSON.stringify(resetState),
      "EX",
      RESET_PIN_OTP_EXPIRY * 2 // Give time to set new PIN
    );

    return {
      screen: "SET_NEW_PIN",
      data: {},
    };
  } catch (error) {
    console.error("Error in handleVerifyOTP:", error);
    return {
      screen: "VERIFY_OTP",
      data: {
        error_message: "Verification failed. Please try again.",
      },
    };
  }
}

async function handleSetNewPin(
  data: any,
  userPhone: string,
  resetState: ResetPinState,
  flow_token: string
) {
  try {
    const { new_pin, confirm_pin } = data;

    // Validate PIN input
    if (!new_pin || !confirm_pin) {
      return {
        screen: "SET_NEW_PIN",
        data: {
          error_message: "Please enter both PIN fields.",
        },
      };
    }

    if (new_pin.length < 4 || new_pin.length > 4) {
      return {
        screen: "SET_NEW_PIN",
        data: {
          error_message: "PIN must be 4 digits long.",
        },
      };
    }

    if (isNaN(Number(new_pin)) || isNaN(Number(confirm_pin))) {
      return {
        screen: "SET_NEW_PIN",
        data: {
          error_message: "PIN must contain only numbers.",
        },
      };
    }

    if (new_pin !== confirm_pin) {
      return {
        screen: "SET_NEW_PIN",
        data: {
          error_message: "PINs do not match. Please try again.",
        },
      };
    }

    // Hash the new PIN
    // const hashedPin = await argon2.hash(new_pin);

    // Update user's PIN in the database
    const phone = userPhone.startsWith("+") ? userPhone : `+${userPhone}`;
    await User.updateOne({ whatsappNumber: phone }, { pin: new_pin });

    // Clean up reset state
    await redisClient.del(`reset_pin_state:${userPhone}`);

    // Send confirmation via SMS
    await smsService.sendPinResetConfirmation(userPhone);

    // Also send WhatsApp confirmation
    await whatsappBusinessService.sendNormalMessage(
      `✅ *PIN Reset Successful*\n\nYour PIN has been successfully updated. You can now use your new PIN for transactions.\n\nFor your security, please:\n• Keep your PIN confidential\n• Don't share it with anyone\n• Use it only for ChainPaye transactions`,
      userPhone
    );

    return {
      screen: "SUCCESS",
      data: {
        extension_message_response: {
          params: {
            flow_token: flow_token,
            optional_param1: "Your PIN has been successfully reset!",
          },
        },
      },
    };
  } catch (error) {
    console.error("Error in handleSetNewPin:", error);
    return {
      screen: "SET_NEW_PIN",
      data: {
        error_message: "Failed to update PIN. Please try again.",
      },
    };
  }
}