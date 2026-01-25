import { redisClient } from "../../services/redis";
import { UserService } from "../../services/UserService";
import { WhatsAppBusinessService } from "../../services/WhatsAppBusinessService";
import { getCountryCodeFromPhoneNumber } from "../../utils/countryCodeMapping";

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
    // Detect country from phone number
    const detectedCountry = getCountryCodeFromPhoneNumber(phone);
    return {
      screen: "PERSONAL_INFO",
      data: {
        countries: countries,
        default_country: detectedCountry || "NG",
      },
    };
  }

  if (action === "data_exchange") {
    // Handle the request based on the current screen
    switch (screen) {
      // --------------------------------------------------------
      // PERSONAL_INFO → COUNTRY_SELECT
      // User submits full name and DOB
      // --------------------------------------------------------
      case "PERSONAL_INFO":
        console.log("DEBUG: Case PERSONAL_INFO");
        try {
          const fullName = data.full_name?.trim();
          const dob = data.dob;

          // Validate required fields
          if (!fullName || fullName.length < 3) {
            return {
              screen: "PERSONAL_INFO",
              data: {
                countries: countries,
                default_country: data.country || "NG",
                error_message: "Please enter your full name (at least 3 characters)",
              },
            };
          }

          // Validate that full name has at least 2 words (first and last name)
          const nameParts = fullName.split(' ').filter((part: string) => part.length > 0);
          if (nameParts.length < 2) {
            return {
              screen: "PERSONAL_INFO",
              data: {
                countries: countries,
                default_country: data.country || "NG",
                error_message: "Please enter your full name (first and last name)",
              },
            };
          }

          // Age validation - must be 18+
          const currentYear = new Date().getFullYear();
          const birthYear = Number(dob.split("-")[0]);
          if (currentYear - birthYear < 18) {
            return {
              screen: "PERSONAL_INFO",
              data: {
                countries: countries,
                default_country: data.country || "NG",
                error_message: "You must be 18 and above to use Chainpaye",
              },
            };
          }

          // Proceed to country selection
          return {
            screen: "COUNTRY_SELECT",
            data: {
              full_name: fullName,
              dob: dob,
              countries: countries,
              default_country: getCountryCodeFromPhoneNumber(phone) || "NG",
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
      case "COUNTRY_SELECT":
        console.log("DEBUG: Case COUNTRY_SELECT");
        return {
          screen: "SECURITY_INFO",
          data: {
            full_name: data.full_name,
            dob: data.dob,
            country: data.country || "NG",
          },
        };

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
                full_name: data.full_name,
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
                full_name: data.full_name,
                dob: data.dob,
                country: data.country,
                error_message: "PIN must be exactly 4 digits",
              },
            };
          }

          if (isNaN(Number(pin))) {
            return {
              screen: "SECURITY_INFO",
              data: {
                full_name: data.full_name,
                dob: data.dob,
                country: data.country,
                error_message: "PIN must contain numbers only",
              },
            };
          }

          if (pin !== confirmPin) {
            return {
              screen: "SECURITY_INFO",
              data: {
                full_name: data.full_name,
                dob: data.dob,
                country: data.country,
                error_message: "PINs do not match. Please try again.",
              },
            };
          }

          // Check if user already exists
          const existingUser = await userService.getUser(phone);
          console.log("DEBUG: Existing user found?", !!existingUser);

          if (!existingUser) {
            // Create new user with fullName for wallet creation
            await userService.createUser({
              whatsappNumber: phone,
              pin: pin,
              fullName: data.full_name,
            });
            console.log("DEBUG: User created successfully");
          }

          // Update user with profile information (fullName and DOB)
          await userService.updateUserProfile(phone, {
            fullName: data.full_name,
            dob: data.dob,
          });
          console.log("DEBUG: User profile updated");

          // Store account creation info in Redis for welcome message
          await redisClient.set(
            `${flow_token}_accountCreation`,
            JSON.stringify({
              fullName: data.full_name,
              country: data.country,
              needsKyc: data.country === "NG",
            }),
            "EX",
            3600,
          );

          return {
            screen: "SUCCESSFUL",
            data: {
              full_name: data.full_name,
              needs_kyc: data.country === "NG",
            },
          };
        } catch (error) {
          console.error("Error in SECURITY_INFO screen:", error);
          return {
            screen: "SECURITY_INFO",
            data: {
              full_name: data.full_name,
              dob: data.dob,
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
