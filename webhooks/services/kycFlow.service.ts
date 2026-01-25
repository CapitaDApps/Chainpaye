import { Wallet } from "../../models/Wallet";
import { redisClient } from "../../services/redis";
import { ToronetService } from "../../services/ToronetService";
import { UserService } from "../../services/UserService";
import { formatDate } from "../utils/formatDate";

// ============================================================
// KYC FLOW SERVICE
// Handles BVN verification for Nigerian users
// Flow: COUNTRY_SELECT → BVN_INPUT → VERIFYING → SUCCESS
// ============================================================

const supportedCountries = [{ id: "NG", title: "Nigeria" }];

export const kycFlowScreen = async (decryptedBody: {
  screen: string;
  data: any;
  version: string;
  action: string;
  flow_token: string;
}) => {
  const { screen, data, version, action, flow_token } = decryptedBody;
  console.log("DEBUG: kycFlowScreen called", {
    screen,
    action,
    flow_token,
    data,
  });

  const userService = new UserService();
  const toronetService = new ToronetService();

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

  if (!userPhone) {
    console.error(
      "DEBUG: No user phone found in Redis for flow_token:",
      flow_token,
    );
    return {
      screen: "COUNTRY_SELECT",
      data: {
        countries: supportedCountries,
        error_message: "Session expired. Please restart the verification.",
      },
    };
  }

  const phone = userPhone.startsWith("+") ? userPhone : `+${userPhone}`;

  // Handle initial request when opening the flow
  if (action === "INIT") {
    // Get user info
    const user = await userService.getUser(phone);

    if (!user) {
      return {
        screen: "COUNTRY_SELECT",
        data: {
          countries: supportedCountries,
          error_message: "Please create an account first before verifying.",
        },
      };
    }

    // Check if already verified
    if (user.isVerified) {
      return {
        screen: "SUCCESS",
        data: {
          already_verified: true,
        },
      };
    }

    return {
      screen: "COUNTRY_SELECT",
      data: {
        countries: supportedCountries,
        full_name: user.fullName || "", // Show fullName from onboarding
        dob: user.dob || "",
      },
    };
  }

  if (action === "data_exchange") {
    // Handle the request based on the current screen
    switch (screen) {
      // --------------------------------------------------------
      // COUNTRY_SELECT → BVN_INPUT
      // User selects country (Nigeria for now)
      // --------------------------------------------------------
      case "COUNTRY_SELECT":
        console.log("DEBUG: Case COUNTRY_SELECT - KYC");
        const selectedCountry = data.country || "NG";

        if (selectedCountry !== "NG") {
          return {
            screen: "SUCCESS",
            data: {
              not_required: true,
              message:
                "KYC verification is currently only required for Nigerian accounts.",
            },
          };
        }

        // Get user profile info for BVN verification
        const userForBvn = await userService.getUser(phone);

        return {
          screen: "BVN_INPUT",
          data: {
            country: selectedCountry,
            full_name: userForBvn?.fullName || "", // Show fullName from onboarding
            dob: userForBvn?.dob || data.dob || "",
          },
        };

      // --------------------------------------------------------
      // BVN_INPUT → VERIFYING → SUCCESS
      // User enters BVN, we verify and create virtual wallet
      // --------------------------------------------------------
      case "BVN_INPUT":
        console.log("DEBUG: Case BVN_INPUT");
        try {
          const bvn = data.bvn?.trim();
          const firstName = data.first_name?.trim();
          const lastName = data.last_name?.trim();

          // Validate BVN format
          if (!bvn || bvn.length !== 11) {
            return {
              screen: "BVN_INPUT",
              data: {
                country: data.country,
                full_name: data.full_name,
                first_name: data.first_name,
                last_name: data.last_name,
                dob: data.dob,
                error_message: "BVN must be exactly 11 digits",
              },
            };
          }

          if (isNaN(Number(bvn))) {
            return {
              screen: "BVN_INPUT",
              data: {
                country: data.country,
                full_name: data.full_name,
                first_name: data.first_name,
                last_name: data.last_name,
                dob: data.dob,
                error_message: "BVN must contain numbers only",
              },
            };
          }

          // Validate first and last names
          if (!firstName || firstName.length < 2) {
            return {
              screen: "BVN_INPUT",
              data: {
                country: data.country,
                full_name: data.full_name,
                first_name: data.first_name,
                last_name: data.last_name,
                dob: data.dob,
                error_message: "Please enter a valid first name",
              },
            };
          }

          if (!lastName || lastName.length < 2) {
            return {
              screen: "BVN_INPUT",
              data: {
                country: data.country,
                full_name: data.full_name,
                first_name: data.first_name,
                last_name: data.last_name,
                dob: data.dob,
                error_message: "Please enter a valid last name",
              },
            };
          }

          // Get user wallet for KYC
          const { wallet: userToroWallet, user } =
            await userService.getUserToroWallet(phone);

          if (!user) {
            return {
              screen: "BVN_INPUT",
              data: {
                country: data.country,
                full_name: data.full_name,
                first_name: data.first_name,
                last_name: data.last_name,
                dob: data.dob,
                error_message:
                  "User not found. Please create an account first.",
              },
            };
          }

          // Use DOB from user profile
          const dob = user.dob || data.dob;

          if (!dob) {
            return {
              screen: "BVN_INPUT",
              data: {
                country: data.country,
                full_name: data.full_name,
                first_name: data.first_name,
                last_name: data.last_name,
                dob: data.dob,
                error_message:
                  "Date of birth missing. Please update your profile first.",
              },
            };
          }

          console.log("DEBUG: Performing KYC with BVN");

          // Perform KYC verification via Toronet using the entered first/last names
          const kycResult = await toronetService.performKYC({
            firstName: firstName,
            lastName: lastName,
            bvn: bvn,
            dob: formatDate(dob),
            address: userToroWallet.publicKey,
            phoneNumber: phone,
          });

          console.log("DEBUG: KYC Result", kycResult);

          if (!kycResult.success) {
            console.warn("DEBUG: KYC Failed:", kycResult.message);
            return {
              screen: "BVN_INPUT",
              data: {
                country: data.country,
                full_name: data.full_name,
                first_name: firstName,
                last_name: lastName,
                dob: dob,
                error_message:
                  kycResult.message ||
                  "BVN verification failed. Please check your details and ensure your first name, last name match your BVN records exactly.",
              },
            };
          }

          // KYC successful - save the verified first/last names to user profile
          await userService.updateUserKycInfo(phone, {
            firstName: firstName,
            lastName: lastName,
          });
          console.log("DEBUG: User KYC info updated with verified names");

          // Create virtual NGN wallet using the user's fullName (from onboarding)
          try {
            const wallet = await Wallet.findOne({ userId: user.userId });
            if (wallet) {
              await toronetService.createVirtualWalletNGN({
                address: wallet.publicKey,
                fullName: user.fullName, // Use fullName from onboarding for wallet
              });
              console.log("DEBUG: Virtual NGN wallet created with fullName");
            }
          } catch (walletError) {
            console.error("DEBUG: Error creating virtual wallet:", walletError);
            // Don't fail the flow, user is still verified
          }

          // Store verification info in Redis
          await redisClient.set(
            `${flow_token}_kycComplete`,
            JSON.stringify({
              fullName: user.fullName, // Use fullName from onboarding
              verifiedFirstName: firstName, // Store verified names separately
              verifiedLastName: lastName,
              verified: true,
            }),
            "EX",
            3600,
          );

          return {
            screen: "SUCCESS",
            data: {
              first_name: firstName, // Show verified first name
              verified: true,
            },
          };
        } catch (error) {
          console.error("Error in BVN_INPUT screen:", error);
          return {
            screen: "BVN_INPUT",
            data: {
              country: data.country,
              full_name: data.full_name,
              first_name: data.first_name,
              last_name: data.last_name,
              dob: data.dob,
              error_message: "Verification failed. Please try again.",
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
