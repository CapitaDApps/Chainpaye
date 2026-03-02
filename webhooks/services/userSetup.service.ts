import { redisClient } from "../../services/redis";
import { UserService } from "../../services/UserService";
import { WhatsAppBusinessService } from "../../services/WhatsAppBusinessService";
import { getCountryCodeFromPhoneNumber } from "../../utils/countryCodeMapping";
import { SignupIntegrationServiceImpl } from "../../services/SignupIntegrationService";
import { logger } from "../../utils/logger";

// ============================================================
// ACCOUNT SETUP FLOW SERVICE
// Handles user registration without BVN (KYC done separately)
// Flow: PERSONAL_INFO → COUNTRY_SELECT → SECURITY_INFO → SUCCESSFUL
// ============================================================

const countries = [
  { id: "NG", title: "Nigeria" },
  { id: "US", title: "United States" },
  { id: "GB", title: "United Kingdom" },
  { id: "CA", title: "Canada" },
  { id: "GH", title: "Ghana" },
  { id: "KE", title: "Kenya" },
  { id: "ZA", title: "South Africa" },
];

export const userSetupScreen = async (decryptedBody: {
  screen: string;
  data: any;
  version: string;
  action: string;
  flow_token: string;
}) => {
  const { screen, data, version, action, flow_token } = decryptedBody;
  console.log("DEBUG: userSetupScreen called", {
    screen,
    action,
    flow_token,
    data,
  });

  const userService = new UserService();
  const whatsappBusinessService = new WhatsAppBusinessService();

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
  console.log("DEBUG: Redis get userPhone:", userPhone);
  const phone = userPhone?.startsWith("+") ? userPhone : `+${userPhone}`;

  // Handle initial request when opening the flow
  if (action === "INIT") {
    console.log("🚀 DEBUG: INIT ACTION CALLED - Flow opened!");
    
    // Detect country from phone number
    const detectedCountry = getCountryCodeFromPhoneNumber(phone);
    
    // Check for stored referral code from "start [code]" command
    const signupIntegrationService = new SignupIntegrationServiceImpl();
    const formData = await signupIntegrationService.prePopulateReferralField(phone);
    
    console.log("DEBUG: INIT - Phone:", phone);
    console.log("DEBUG: INIT - Form data:", JSON.stringify(formData, null, 2));
    
    logger.info(`Signup INIT for ${phone}`, {
      detectedCountry,
      hasReferralCode: formData.isPrePopulated,
      referralCode: formData.referralCode
    });
    
    // If user has a referral code, get the referrer's name and show special screen
    if (formData.isPrePopulated && formData.referralCode) {
      try {
        console.log("DEBUG: INIT - Has referral code, getting referrer info");
        const { ReferralCodeValidatorService } = await import('../../services/ReferralCodeValidatorService');
        const validator = new ReferralCodeValidatorService();
        const result = await validator.validateAndGetReferrer(formData.referralCode);
        
        console.log("DEBUG: INIT - Validator result:", JSON.stringify(result, null, 2));
        
        if (result.validation.isValid && result.referrer) {
          console.log("DEBUG: INIT - Returning PERSONAL_INFO_WITH_REFERRAL screen");
          return {
            screen: "PERSONAL_INFO_WITH_REFERRAL",
            data: {
              countries: countries,
              default_country: detectedCountry || "NG",
              referral_code: formData.referralCode,
              referrer_name: result.referrer.name
            },
          };
        }
      } catch (error) {
        logger.error('Error getting referrer info for flow', { error, code: formData.referralCode });
        console.error("DEBUG: INIT - Error getting referrer info:", error);
        // Fall through to normal screen if error
      }
    }
    
    console.log("DEBUG: INIT - Returning normal PERSONAL_INFO screen");
    // Default screen without referral - but check if we should pre-populate
    const defaultData: any = {
      countries: countries,
      default_country: detectedCountry || "NG",
      has_referral: false
    };
    
    // If we have a referral code but couldn't show special screen, pre-populate the field
    if (formData.referralCode) {
      console.log("DEBUG: INIT - Pre-populating referral code in normal screen:", formData.referralCode);
      defaultData.referral_code = formData.referralCode;
      defaultData.has_referral = true;
    } else {
      defaultData.referral_code = "";
    }
    
    return {
      screen: "PERSONAL_INFO",
      data: defaultData,
    };
  }

  if (action === "data_exchange") {
    // Handle the request based on the current screen
    switch (screen) {
      // --------------------------------------------------------
      // PERSONAL_INFO or PERSONAL_INFO_WITH_REFERRAL → SECURITY_INFO
      // User submits name and country
      // --------------------------------------------------------
      case "PERSONAL_INFO":
      case "PERSONAL_INFO_WITH_REFERRAL":
        console.log("DEBUG: Case PERSONAL_INFO");
        try {
          const fullName = data.full_name?.trim();
          // DOB removed from this step
          // const dob = data.dob;

          // Validate required fields
          if (!fullName || fullName.split(" ").length < 2) {
            // Return to the same screen they came from
            const returnScreen = screen === "PERSONAL_INFO_WITH_REFERRAL" ? "PERSONAL_INFO_WITH_REFERRAL" : "PERSONAL_INFO";
            
            // If returning to referral screen, need to get referrer name again
            let returnData: any = {
              countries: countries,
              default_country: data.country || "NG",
              error_message: "Please enter your full name (First and Last name)",
            };
            
            if (returnScreen === "PERSONAL_INFO_WITH_REFERRAL" && data.referral_code) {
              try {
                const { ReferralCodeValidatorService } = await import('../../services/ReferralCodeValidatorService');
                const validator = new ReferralCodeValidatorService();
                const result = await validator.validateAndGetReferrer(data.referral_code);
                
                if (result.validation.isValid && result.referrer) {
                  returnData.referral_code = data.referral_code;
                  returnData.referrer_name = result.referrer.name;
                }
              } catch (error) {
                logger.error('Error getting referrer info', { error });
              }
            }
            
            return {
              screen: returnScreen,
              data: returnData,
            };
          }

          // Split name for display purposes only (legacy support)
          const nameParts = fullName.split(" ");
          const firstName = nameParts[0];
          const lastName = nameParts.slice(1).join(" ");

          // Get referral code - either from form submission or from stored data
          let referralCode = data.referral_code?.trim() || "";
          console.log("DEBUG: Referral code from form:", data.referral_code);
          
          // If no referral code in form, check if it was stored from INIT
          if (!referralCode) {
            console.log("DEBUG: No referral code in form, checking Redis");
            const signupIntegrationService = new SignupIntegrationServiceImpl();
            const formData = await signupIntegrationService.prePopulateReferralField(phone);
            referralCode = formData.referralCode || "";
            console.log("DEBUG: Referral code from Redis:", referralCode);
          }

          console.log("DEBUG: Final referral code to pass to SECURITY_INFO:", referralCode);

          // Proceed to security setup (Skipping COUNTRY_SELECT)
          return {
            screen: "SECURITY_INFO",
            data: {
              full_name: fullName,
              first_name: firstName,
              last_name: lastName,
              // dob: dob, // Removed
              country: data.country || "NG",
              referral_code: referralCode,
            },
          };
        } catch (error) {
          console.error("Error in PERSONAL_INFO screen:", error);
          return {
            screen: "PERSONAL_INFO",
            data: {
              countries: countries,
              default_country: "NG",
              error_message: "Something went wrong. Please try again.",
            },
          };
        }

      // --------------------------------------------------------
      // COUNTRY_SELECT → SECURITY_INFO
      // User confirms country
      // --------------------------------------------------------
      // --------------------------------------------------------
      // COUNTRY_SELECT (REMOVED)
      // --------------------------------------------------------
      // case "COUNTRY_SELECT":
      //   console.log("DEBUG: Case COUNTRY_SELECT");
      //   return {
      //     screen: "SECURITY_INFO",
      //     data: {
      //       full_name:
      //         data.full_name ||
      //         (data.first_name && data.last_name
      //           ? `${data.first_name} ${data.last_name}`
      //           : undefined),
      //       first_name: data.first_name,
      //       last_name: data.last_name,
      //       dob: data.dob,
      //       country: data.country || "NG",
      //     },
      //   };

      // --------------------------------------------------------
      // SECURITY_INFO → SUCCESSFUL
      // User creates PIN and account is created
      // --------------------------------------------------------
      case "SECURITY_INFO":
        console.log("DEBUG: Case SECURITY_INFO");
        try {
          if (!userPhone) {
            return {
              screen: "SECURITY_INFO",
              data: {
                first_name: data.first_name,
                last_name: data.last_name,
                dob: data.dob,
                country: data.country,
                error_message: "Session expired. Please restart the flow.",
              },
            };
          }

          // Validate PIN input
          const pin = data.pin?.trim();
          const confirmPin = data.confirm_pin?.trim();

          if (!pin || pin.length !== 4) {
            return {
              screen: "SECURITY_INFO",
              data: {
                first_name: data.first_name,
                last_name: data.last_name,
                // dob: data.dob,
                country: data.country,
                error_message: "PIN must be exactly 4 digits",
              },
            };
          }

          if (isNaN(Number(pin))) {
            return {
              screen: "SECURITY_INFO",
              data: {
                first_name: data.first_name,
                last_name: data.last_name,
                // dob: data.dob,
                country: data.country,
                error_message: "PIN must contain numbers only",
              },
            };
          }

          if (pin !== confirmPin) {
            return {
              screen: "SECURITY_INFO",
              data: {
                first_name: data.first_name,
                last_name: data.last_name,
                // dob: data.dob,
                country: data.country,
                error_message: "PINs do not match. Please try again.",
              },
            };
          }

          // Check if user already exists
          const existingUser = await userService.getUser(phone);
          console.log("DEBUG: Existing user found?", !!existingUser);

          let userId: string;
          if (!existingUser) {
            // Create new user WITHOUT KYC verification
            const newUser = await userService.createUser({
              whatsappNumber: phone,
              pin: pin,
              fullName:
                data.full_name || `${data.first_name} ${data.last_name}`,
            });
            userId = newUser.userId;
            logger.info(`User created successfully: ${userId}`);
          } else {
            userId = existingUser.userId;
            console.log("DEBUG: Using existing user ID:", userId);
          }

          // Update user with profile information
          await userService.updateUserProfile(phone, {
            fullName: data.full_name || `${data.first_name} ${data.last_name}`,
            dob: "", // No DOB collected at signup
          });
          console.log("DEBUG: User profile updated");

          // Process referral code if provided
          const referralCode = data.referral_code?.trim();
          console.log("DEBUG: Referral code from data:", referralCode);
          console.log("DEBUG: Full data object:", JSON.stringify(data, null, 2));
          
          if (referralCode) {
            try {
              console.log("DEBUG: Processing referral code:", referralCode, "for user:", userId);
              const signupIntegrationService = new SignupIntegrationServiceImpl();
              await signupIntegrationService.processReferralOnSignup(userId, referralCode);
              
              // Clean up temporary Redis storage after successful relationship creation
              await signupIntegrationService.cleanupTemporaryStorage(phone);
              
              logger.info(`Referral relationship created for user ${userId} with code ${referralCode}`);
              console.log("DEBUG: Referral relationship created successfully");
            } catch (referralError: any) {
              // Log referral error but don't fail signup
              logger.error(`Failed to process referral code for user ${userId}:`, {
                error: referralError.message,
                code: referralCode,
                stack: referralError.stack
              });
              console.error("DEBUG: Referral error:", referralError);
              // Continue with signup - referral is optional
            }
          } else {
            console.log("DEBUG: No referral code provided, skipping referral processing");
          }

          // Store account creation info in Redis for welcome message
          const userFullName =
            data.full_name || `${data.first_name} ${data.last_name}`;

          await redisClient.set(
            `${flow_token}_accountCreation`,
            JSON.stringify({
              fullName: userFullName,
              country: data.country,
              needsKyc: data.country === "NG",
            }),
            "EX",
            3600,
          );

          return {
            screen: "SUCCESSFUL",
            data: {
              first_name:
                data.first_name || userFullName.split(" ")[0] || "User",
              needs_kyc: data.country === "NG",
            },
          };
        } catch (error) {
          console.error("Error in SECURITY_INFO screen:", error);
          logger.error("Error in SECURITY_INFO screen:", error);
          return {
            screen: "SECURITY_INFO",
            data: {
              first_name: data.first_name,
              last_name: data.last_name,
              // dob: data.dob,
              country: data.country,
              error_message: "Failed to create account. Please try again.",
            },
          };
        }

      default:
        console.warn("Unhandled screen:", screen);
        return;
    }
  }

  console.error("Unhandled request body:", decryptedBody);
  throw new Error(
    "Unhandled endpoint request. Make sure you handle the request action & screen logged above.",
  );
};
