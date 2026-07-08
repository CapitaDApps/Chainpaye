import { Wallet } from "../../models/Wallet";
import { redisClient } from "../../services/redis";
import { DojahService } from "../../services/DojahService";
import { ToronetService } from "../../services/ToronetService";
import { UserService } from "../../services/UserService";
import { WhatsAppBusinessService } from "../../services/WhatsAppBusinessService";
import { handleKYCCompletion } from "../controllers/referral.controller";
import { logger } from "../../utils/logger";
// ─── Country config ───────────────────────────────────────────────────────────
// Countries that require ID type selection (multiple options available)
const MULTI_ID_COUNTRIES = ["NG", "KE"];

// Countries supported by Dojah (others get auto-verified)
const DOJAH_SUPPORTED_COUNTRIES = ["NG", "KE", "ZA", "UG"];

// Countries without Dojah support — auto-verified
const AUTO_VERIFY_COUNTRIES = ["RW", "MW", "TZ"];

const COUNTRY_NAMES: Record<string, string> = {
  NG: "Nigeria", KE: "Kenya", ZA: "South Africa",
  UG: "Uganda",  RW: "Rwanda", MW: "Malawi", TZ: "Tanzania",
};

// ID type options per country
const COUNTRY_ID_TYPES: Record<string, { id: string; title: string }[]> = {
  NG: [
    { id: "NIN", title: "National ID Number (NIN)" },
    { id: "BVN", title: "Bank Verification Number (BVN)" },
  ],
  KE: [
    { id: "KE_ID",       title: "National ID" },
    { id: "KE_PASSPORT", title: "Passport" },
  ],
};

// ID label and hint for the single ID_INPUT screen
const ID_TYPE_META: Record<string, { label: string; hint: string }> = {
  NIN:         { label: "National ID Number (NIN)", hint: "Enter your 11-digit NIN" },
  BVN:         { label: "Bank Verification Number (BVN)", hint: "Enter your 11-digit BVN" },
  KE_ID:       { label: "National ID Number",       hint: "Enter your Kenyan National ID number" },
  KE_PASSPORT: { label: "Passport Number",           hint: "Enter your Kenyan passport number" },
  ZA_ID:       { label: "National ID Number",        hint: "Enter your 13-digit South African ID number" },
  UG_NIN:      { label: "National ID Number (NIN)",  hint: "Enter your Uganda NIN (e.g. CM123456789AB)" },
};

// For single-ID countries, map country → id_type code used internally
const SINGLE_ID_TYPE: Record<string, string> = {
  ZA: "ZA_ID",
  UG: "UG_NIN",
};

// ─── Name similarity (Dice coefficient) ──────────────────────────────────────
function buildBigrams(str: string): Set<string> {
  const s = str.toLowerCase().replace(/\s+/g, "");
  const bigrams = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) {
    bigrams.add(s.slice(i, i + 2));
  }
  return bigrams;
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const bigramsA = buildBigrams(a);
  const bigramsB = buildBigrams(b);
  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }
  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

/**
 * Check if user-supplied first/last name match the ID entity names.
 * Tries both orderings (in case first/last are swapped).
 * Returns true if either first or last name similarity ≥ 60%.
 */
function namesMatch(
  userFirst: string,
  userLast: string,
  entityFirst?: string,
  entityLast?: string,
): { match: boolean; reason?: string } {
  if (!entityFirst && !entityLast) return { match: true }; // no data to check against

  const threshold = 0.6;

  // Normal order
  const firstSim  = entityFirst ? similarity(userFirst, entityFirst)  : 1;
  const lastSim   = entityLast  ? similarity(userLast,  entityLast)   : 1;

  // Swapped order
  const firstSimSwap = entityLast  ? similarity(userFirst, entityLast)  : 0;
  const lastSimSwap  = entityFirst ? similarity(userLast,  entityFirst) : 0;

  const normalOk  = firstSim  >= threshold && lastSim  >= threshold;
  const swappedOk = firstSimSwap >= threshold && lastSimSwap >= threshold;

  if (normalOk || swappedOk) return { match: true };

  // Build informative failure reason
  const bestFirst = Math.max(firstSim, firstSimSwap);
  const bestLast  = Math.max(lastSim,  lastSimSwap);
  if (bestFirst < threshold) {
    return { match: false, reason: "First name does not match the records for this ID" };
  }
  return { match: false, reason: "Last name does not match the records for this ID" };
}

/**
 * Normalise DOB to yyyy-mm-dd for comparison.
 * Dojah can return "1982-01-01", "01-01-1982", or "1982/01/01".
 */
function normaliseDob(raw: string): string {
  if (!raw) return "";
  const cleaned = raw.trim().replace(/\//g, "-");
  // Already yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
  // dd-mm-yyyy
  const parts = cleaned.split("-");
  if (parts.length === 3 && (parts[0]?.length ?? 0) <= 2) {
    return `${parts[2] ?? ""}-${(parts[1] ?? "").padStart(2, "0")}-${(parts[0] ?? "").padStart(2, "0")}`;
  }
  return cleaned;
}

// ─── Post-verification: mark user verified, save names/DOB, generate referral ─
async function completeVerification(
  phone: string,
  userId: string,
  firstName: string,
  lastName: string,
  dob: string,
  flowToken: string,
  triggerToronet: boolean,
) {
  const userService = new UserService();
  const toronetService = new ToronetService();
  const whatsappBusinessService = new WhatsAppBusinessService();

  await userService.updateUserKycInfo(phone, { firstName, lastName });
  await userService.updateUserProfile(phone, { dob });
  await userService.markUserVerified(phone);

  try { await handleKYCCompletion(userId); } catch (e) { logger.error("[KYC] Referral error", e); }

  if (triggerToronet) {
    try {
      const wallet = await Wallet.findOne({ userId });
      if (wallet) {
        await toronetService.ensureFiatVirtualWallets({
          address: wallet.publicKey,
          fullName: `${firstName} ${lastName}`,
        });
      }
    } catch (e) { logger.error("[KYC] Toronet wallet error", e); }
  }

  try {
    await whatsappBusinessService.sendNormalMessage(
      `🎉 *KYC Verification Successful!*\n\nCongratulations ${firstName}! Your identity has been verified.\n\nYou now have full access to all Chainpaye features including:\n✅ Bank withdrawals\n✅ Higher transaction limits\n✅ Full account access\n✅ Referral rewards program\n\nType *referral* to get your referral code and start earning!`,
      phone,
    );
  } catch (e) { logger.error("[KYC] Success message error", e); }

  await redisClient.set(
    `${flowToken}_kycComplete`,
    JSON.stringify({ fullName: `${firstName} ${lastName}`, verified: true }),
    "EX", 3600,
  );
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export const kycFlowScreen = async (decryptedBody: {
  screen: string;
  data: any;
  version: string;
  action: string;
  flow_token: string;
}) => {
  const { screen, data, action, flow_token } = decryptedBody;

  const userService = new UserService();
  const dojahService = new DojahService();

  if (action === "ping") return { data: { status: "active" } };
  if (data?.error) {
    logger.warn("[KYC] Client error:", data);
    return { data: { status: "Error", acknowledged: true } };
  }

  const userPhone = await redisClient.get(flow_token);
  if (!userPhone) {
    return {
      screen: "SELECT_COUNTRY",
      data: { has_error: true, error_message: "Session expired. Please restart the verification." },
    };
  }

  const phone = userPhone.startsWith("+") ? userPhone : `+${userPhone}`;

  // ── INIT ──────────────────────────────────────────────────────────────────
  if (action === "INIT") {
    const user = await userService.getUser(phone);
    if (!user) {
      return {
        screen: "SELECT_COUNTRY",
        data: { has_error: true, error_message: "Please create an account first before verifying." },
      };
    }
    if (user.isVerified) {
      return {
        screen: "VERIFICATION_COMPLETE",
        data: { already_verified: true, verified: false, auto_verified: false, first_name: user.firstName || "" },
      };
    }
    // Email must be verified before KYC can proceed
    if (!user.emailVerified) {
      const whatsappBusinessService = new WhatsAppBusinessService();
      setImmediate(async () => {
        try {
          await whatsappBusinessService.sendNormalMessage(
            "📧 *Email Verification Required*\n\nYou need to verify your email address before completing KYC identity verification.\n\nPlease complete email verification first, then come back to verify your identity.",
            phone,
          );
          await whatsappBusinessService.sendEmailVerificationFlowById(phone);
        } catch (e) {
          logger.error("[KYC] Failed to redirect to email verification", e);
        }
      });
      return {
        screen: "SELECT_COUNTRY",
        data: {
          has_error: true,
          error_message: "Please verify your email address first before completing KYC. Check your WhatsApp for the email verification link.",
        },
      };
    }
    return {
      screen: "SELECT_COUNTRY",
      data: { has_error: false, error_message: "" },
    };
  }

  // ── DATA EXCHANGE ─────────────────────────────────────────────────────────
  if (action === "data_exchange") {
    switch (screen) {

      // ── SELECT_COUNTRY ───────────────────────────────────────────────────
      case "SELECT_COUNTRY": {
        const country = (data.country || "").toUpperCase();
        if (!country) {
          return {
            screen: "SELECT_COUNTRY",
            data: { has_error: true, error_message: "Please select a country." },
          };
        }

        const user = await userService.getUser(phone);
        if (!user) {
          return {
            screen: "SELECT_COUNTRY",
            data: { has_error: true, error_message: "User not found. Please create an account first." },
          };
        }

        // Auto-verify countries without Dojah support
        if (AUTO_VERIFY_COUNTRIES.includes(country)) {
          const firstName = user.firstName || user.fullName?.split(" ")[0] || "there";
          await userService.markUserVerified(phone);
          try { await handleKYCCompletion(user.userId); } catch { /* silent */ }
          return {
            screen: "VERIFICATION_COMPLETE",
            data: { auto_verified: true, verified: false, already_verified: false, first_name: firstName },
          };
        }

        // Countries with multiple ID types → SELECT_ID_TYPE
        if (MULTI_ID_COUNTRIES.includes(country)) {
          return {
            screen: "SELECT_ID_TYPE",
            data: {
              country,
              country_name: COUNTRY_NAMES[country] || country,
              id_types: COUNTRY_ID_TYPES[country] || [],
              has_error: false,
              error_message: "",
            },
          };
        }

        // Single-ID countries (ZA, UG) → straight to ID_INPUT
        const idType = SINGLE_ID_TYPE[country];
        if (idType) {
          const meta = ID_TYPE_META[idType] ?? { label: "ID Number", hint: "" };
          return {
            screen: "ID_INPUT",
            data: {
              country,
              id_type: idType,
              id_label: meta.label,
              id_hint: meta.hint,
              has_error: false,
              error_message: "",
            },
          };
        }

        return {
          screen: "SELECT_COUNTRY",
          data: { has_error: true, error_message: "Selected country is not supported yet." },
        };
      }

      // ── SELECT_ID_TYPE ───────────────────────────────────────────────────
      case "SELECT_ID_TYPE": {
        const country = (data.country || "").toUpperCase();
        const idType  = (data.id_type  || "").toUpperCase();

        if (!idType) {
          return {
            screen: "SELECT_ID_TYPE",
            data: {
              country,
              country_name: COUNTRY_NAMES[country] || country,
              id_types: COUNTRY_ID_TYPES[country] || [],
              has_error: true,
              error_message: "Please select an ID type.",
            },
          };
        }

        const meta = ID_TYPE_META[idType];
        if (!meta) {
          return {
            screen: "SELECT_ID_TYPE",
            data: {
              country,
              country_name: COUNTRY_NAMES[country] || country,
              id_types: COUNTRY_ID_TYPES[country] || [],
              has_error: true,
              error_message: "Invalid ID type selected.",
            },
          };
        }

        return {
          screen: "ID_INPUT",
          data: {
            country,
            id_type: idType,
            id_label: meta.label,
            id_hint: meta.hint,
            has_error: false,
            error_message: "",
          },
        };
      }

      // ── ID_INPUT ─────────────────────────────────────────────────────────
      case "ID_INPUT": {
        const country   = (data.country   || "").toUpperCase();
        const idType    = (data.id_type   || "").toUpperCase();
        const firstName = (data.first_name || "").trim();
        const lastName  = (data.last_name  || "").trim();
        const dob       = data.dob || "";
        const idNumber  = (data.id_number  || "").trim();

        const meta = ID_TYPE_META[idType] || { label: "ID Number", hint: "" };

        const errBack = (msg: string) => ({
          screen: "ID_INPUT",
          data: {
            country,
            id_type: idType,
            id_label: meta.label,
            id_hint: meta.hint,
            has_error: true,
            error_message: msg,
          },
        });

        // Basic validation
        if (!firstName || !lastName || !dob || !idNumber) {
          return errBack("Please fill in all required fields.");
        }

        // Age check (18+)
        const birthYear = Number(dob.split("-")[0]);
        if (new Date().getFullYear() - birthYear < 18) {
          return errBack("You must be 18 or older to use Chainpaye.");
        }

        const user = await userService.getUser(phone);
        if (!user) return errBack("User not found. Please create an account first.");

        logger.info(`[KYC] Verifying ${country}/${idType} for ${phone}`);

        try {
          // ── Nigeria NIN ────────────────────────────────────────────────
          if (idType === "NIN") {
            if (idNumber.length !== 11 || isNaN(Number(idNumber))) {
              return errBack("NIN must be exactly 11 digits.");
            }
            const result = await dojahService.verifyNIN({ nin: idNumber });
            if (!result.success) return errBack(result.message);

            // DOB check
            const entityDob = normaliseDob(result.entity?.date_of_birth || "");
            if (entityDob && entityDob !== normaliseDob(dob)) {
              return errBack("Date of birth does not match the records for this NIN.");
            }

            // Name similarity check
            const nameCheck = namesMatch(firstName, lastName, result.entity?.first_name, result.entity?.last_name);
            if (!nameCheck.match) return errBack(nameCheck.reason || "Name does not match NIN records.");

            await completeVerification(phone, user.userId, firstName, lastName, dob, flow_token, true);
            return { screen: "VERIFICATION_COMPLETE", data: { verified: true, already_verified: false, auto_verified: false, first_name: firstName } };
          }

          // ── Nigeria BVN ────────────────────────────────────────────────
          if (idType === "BVN") {
            if (idNumber.length !== 11 || isNaN(Number(idNumber))) {
              return errBack("BVN must be exactly 11 digits.");
            }
            const result = await dojahService.verifyBVN({ bvn: idNumber, firstName, lastName, dob });
            if (!result.success) return errBack(result.message);

            await completeVerification(phone, user.userId, firstName, lastName, dob, flow_token, true);
            return { screen: "VERIFICATION_COMPLETE", data: { verified: true, already_verified: false, auto_verified: false, first_name: firstName } };
          }

          // ── Kenya National ID ──────────────────────────────────────────
          if (idType === "KE_ID") {
            const result = await dojahService.verifyKenyanID({ id: idNumber, firstName, lastName, dob });
            if (!result.success) return errBack(result.message);

            const entityDob = normaliseDob(result.entity?.date_of_birth || "");
            if (entityDob && entityDob !== normaliseDob(dob)) {
              return errBack("Date of birth does not match the records for this ID.");
            }

            const nameCheck = namesMatch(firstName, lastName, result.entity?.first_name, result.entity?.last_name);
            if (!nameCheck.match) return errBack(nameCheck.reason || "Name does not match ID records.");

            await completeVerification(phone, user.userId, firstName, lastName, dob, flow_token, false);
            return { screen: "VERIFICATION_COMPLETE", data: { verified: true, already_verified: false, auto_verified: false, first_name: firstName } };
          }

          // ── Kenya Passport ─────────────────────────────────────────────
          if (idType === "KE_PASSPORT") {
            const result = await dojahService.verifyKenyanPassport({ idNumber, firstName, lastName, dob });
            if (!result.success) return errBack(result.message);

            const entityDob = normaliseDob(result.entity?.date_of_birth || "");
            if (entityDob && entityDob !== normaliseDob(dob)) {
              return errBack("Date of birth does not match the records for this passport.");
            }

            const nameCheck = namesMatch(firstName, lastName, result.entity?.first_name, result.entity?.last_name);
            if (!nameCheck.match) return errBack(nameCheck.reason || "Name does not match passport records.");

            await completeVerification(phone, user.userId, firstName, lastName, dob, flow_token, false);
            return { screen: "VERIFICATION_COMPLETE", data: { verified: true, already_verified: false, auto_verified: false, first_name: firstName } };
          }

          // ── South Africa National ID ───────────────────────────────────
          if (idType === "ZA_ID") {
            const result = await dojahService.verifySouthAfricaID({ idNumber });
            if (!result.success) return errBack(result.message);

            const entityDob = normaliseDob(result.entity?.date_of_birth || "");
            if (entityDob && entityDob !== normaliseDob(dob)) {
              return errBack("Date of birth does not match the records for this ID.");
            }

            const nameCheck = namesMatch(firstName, lastName, result.entity?.first_name, result.entity?.last_name);
            if (!nameCheck.match) return errBack(nameCheck.reason || "Name does not match ID records.");

            await completeVerification(phone, user.userId, firstName, lastName, dob, flow_token, false);
            return { screen: "VERIFICATION_COMPLETE", data: { verified: true, already_verified: false, auto_verified: false, first_name: firstName } };
          }

          // ── Uganda NIN ─────────────────────────────────────────────────
          if (idType === "UG_NIN") {
            const result = await dojahService.verifyUgandaNIN({ nin: idNumber });
            if (!result.success) return errBack(result.message);

            const entityDob = normaliseDob(result.entity?.date_of_birth || "");
            if (entityDob && entityDob !== normaliseDob(dob)) {
              return errBack("Date of birth does not match the records for this NIN.");
            }

            const nameCheck = namesMatch(firstName, lastName, result.entity?.first_name, result.entity?.last_name);
            if (!nameCheck.match) return errBack(nameCheck.reason || "Name does not match NIN records.");

            await completeVerification(phone, user.userId, firstName, lastName, dob, flow_token, false);
            return { screen: "VERIFICATION_COMPLETE", data: { verified: true, already_verified: false, auto_verified: false, first_name: firstName } };
          }

          return errBack("Unsupported ID type. Please go back and try again.");

        } catch (err) {
          logger.error(`[KYC] Error in ID_INPUT (${idType}):`, err);
          return errBack("Verification failed. Please try again.");
        }
      }

      default:
        logger.warn("[KYC] Unhandled screen:", screen);
        return;
    }
  }

  logger.error("[KYC] Unhandled request body:", decryptedBody);
  throw new Error("Unhandled endpoint request.");
};
