import { Wallet } from "../../models/Wallet";
import { redisClient } from "../../services/redis";
import { ToronetService } from "../../services/ToronetService";
import { UserService } from "../../services/UserService";
import { WhatsAppBusinessService } from "../../services/WhatsAppBusinessService";
import { formatDate } from "../utils/formatDate";

// ============================================================
// KYC FLOW SERVICE
// Handles BVN verification for Nigerian users
// Flow: COUNTRY_SELECT → BVN_INPUT → VERIFICATION_COMPLETE
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
        screen: "VERIFICATION_COMPLETE",
        data: {
          already_verified: true,
        },
      };
    }

    return {
      screen: "COUNTRY_SELECT",
      data: {
        countries: supportedCountries,
        first_name: user.firstName || "",
        last_name: user.lastName || "",
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
            screen: "VERIFICATION_COMPLETE",
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
            full_name: userForBvn?.fullName || "",
            first_name: "", // Force user to enter
            last_name: "", // Force user to enter
            dob: "", // Force user to enter
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

          // Validate BVN format
          if (!bvn || bvn.length !== 11) {
            return {
              screen: "BVN_INPUT",
              data: {
                country: data.country,
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
                first_name: data.first_name,
                last_name: data.last_name,
                dob: data.dob,
                error_message: "BVN must contain numbers only",
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
                first_name: data.first_name,
                last_name: data.last_name,
                dob: data.dob,
                error_message:
                  "User not found. Please create an account first.",
              },
            };
          }

          // Use explicit data from form for KYC
          const firstName = data.first_name?.trim();
          const lastName = data.last_name?.trim();
          const dob = data.dob;

          if (!firstName || !lastName || !dob) {
            return {
              screen: "BVN_INPUT",
              data: {
                country: data.country,
                first_name: firstName,
                last_name: lastName,
                dob: dob,
                error_message:
                  "Please enter First Name, Last Name and Date of Birth.",
              },
            };
          }

          // Age validation - must be 18+
          const currentYear = new Date().getFullYear();
          const birthYear = Number(dob.split("-")[0]);
          if (currentYear - birthYear < 18) {
            return {
              screen: "BVN_INPUT",
              data: {
                country: data.country,
                first_name: firstName,
                last_name: lastName,
                dob: dob,
                error_message: "You must be 18 and above to use Chainpaye",
              },
            };
          }

          console.log("DEBUG: Performing KYC with BVN");

          // Perform KYC verification via Toronet
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
                first_name: firstName,
                last_name: lastName,
                dob: dob,
                error_message:
                  kycResult.message ||
                  "BVN verification failed. Please check your details.",
              },
            };
          }

          // KYC successful - mark user as verified and save names AND DOB
          await userService.updateUserKycInfo(phone, {
            firstName,
            lastName,
          });
          // Update DOB as well since it's now collected here
          await userService.updateUserProfile(phone, {
            dob: dob,
          });

          await userService.markUserVerified(phone);
          console.log(
            "DEBUG: User marked as verified with names:",
            firstName,
            lastName,
            dob,
          );

          // Send WhatsApp message to user about successful verification
          try {
            await whatsappBusinessService.sendNormalMessage(
              `🎉 *KYC Verification Successful!*\n\nCongratulations ${firstName}! Your identity has been verified.\n\nYou now have full access to all Chainpaye features including:\n✅ Bank withdrawals\n✅ Higher transaction limits\n✅ Full account access`,
              phone,
            );
            console.log("DEBUG: KYC success WhatsApp message sent");
          } catch (msgError) {
            console.error(
              "DEBUG: Error sending KYC success message:",
              msgError,
            );
            // Don't fail the flow if message fails
          }

          // Ensure fiat virtual wallets (NGN, USD, EUR, GBP)
          try {
            const wallet = await Wallet.findOne({ userId: user.userId });
            if (wallet) {
              await toronetService.ensureFiatVirtualWallets({
                address: wallet.publicKey,
                fullName: `${firstName} ${lastName}`,
              });
              console.log(
                "DEBUG: Fiat virtual wallets ensured (NGN, USD, EUR, GBP)",
              );
            }
          } catch (walletError) {
            console.error("DEBUG: Error creating virtual wallet:", walletError);
            // Don't fail the flow, user is still verified
          }

          // Store verification info in Redis
          await redisClient.set(
            `${flow_token}_kycComplete`,
            JSON.stringify({
              fullName: `${firstName} ${lastName}`,
              verified: true,
            }),
            "EX",
            3600,
          );

          return {
            screen: "VERIFICATION_COMPLETE",
            data: {
              first_name: firstName,
              verified: true,
            },
          };
        } catch (error) {
          console.error("Error in BVN_INPUT screen:", error);
          return {
            screen: "BVN_INPUT",
            data: {
              country: data.country,
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
