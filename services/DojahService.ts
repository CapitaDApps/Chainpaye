import axios, { AxiosInstance } from "axios";

interface BVNVerificationParams {
  bvn: string;
  firstName: string;
  lastName: string;
  dob: string; // yyyy-mm-dd
}

interface KenyanIDVerificationParams {
  id: string;
  firstName: string;
  lastName: string;
  dob: string; // yyyy-mm-dd
}

interface GhanaPassportVerificationParams {
  passportNumber: string;
  firstName: string;
  lastName: string;
  dob: string; // yyyy-mm-dd
}

interface VerificationResult {
  success: boolean;
  message: string;
}

export class DojahService {
  private axiosInstance: AxiosInstance;

  constructor() {
    const baseUrl = process.env.DOJAH_BASE_URL;
    const appId = process.env.DOJAH_APP_ID;
    const authorization = process.env.DOJAH_AUTHORIZATION;

    if (!baseUrl || !appId || !authorization) {
      throw new Error(
        "Missing Dojah configuration: DOJAH_BASE_URL, DOJAH_APP_ID, and DOJAH_AUTHORIZATION are required",
      );
    }

    this.axiosInstance = axios.create({
      baseURL: baseUrl,
      headers: {
        AppId: appId,
        Authorization: authorization,
      },
    });
  }

  async verifyBVN(params: BVNVerificationParams): Promise<VerificationResult> {
    try {
      const response = await this.axiosInstance.get("/api/v1/kyc/bvn", {
        params: {
          bvn: params.bvn,
          first_name: params.firstName,
          last_name: params.lastName,
          dob: params.dob,
        },
      });

      const entity = response.data?.entity;

      if (!entity || !entity.bvn) {
        return { success: false, message: "Could not verify BVN. Please check the number and try again." };
      }

      // Check name matches
      if (entity.first_name && !entity.first_name.status) {
        return { success: false, message: "Registered first name does not match BVN information" };
      }

      if (entity.last_name && !entity.last_name.status) {
        return { success: false, message: "Registered last name does not match BVN information" };
      }

      if (entity.date_of_birth && !entity.date_of_birth.status) {
        return { success: false, message: "Registered date of birth does not match BVN information" };
      }

      return { success: true, message: "BVN verified successfully" };
    } catch (error: any) {
      const message =
        error.response?.data?.error ||
        error.response?.data?.message ||
        "BVN verification failed. Please try again.";
      return { success: false, message };
    }
  }

  async verifyKenyanID(params: KenyanIDVerificationParams): Promise<VerificationResult> {
    try {
      const response = await this.axiosInstance.get("/api/v1/ke/kyc/id", {
        params: { id: params.id },
      });

      const entity = response.data?.entity;

      if (!entity || !entity.id) {
        return { success: false, message: "Could not verify ID. Please check the number and try again." };
      }

      if (entity.is_first_name_match === false) {
        return { success: false, message: "Registered first name does not match ID information" };
      }

      if (entity.is_last_name_match === false) {
        return { success: false, message: "Registered last name does not match ID information" };
      }

      if (entity.is_date_of_birth_match === false) {
        return { success: false, message: "Registered date of birth does not match ID information" };
      }

      return { success: true, message: "ID verified successfully" };
    } catch (error: any) {
      const message =
        error.response?.data?.error ||
        error.response?.data?.message ||
        "ID verification failed. Please try again.";
      return { success: false, message };
    }
  }

  async verifyGhanaPassport(params: GhanaPassportVerificationParams): Promise<VerificationResult> {
    try {
      const response = await this.axiosInstance.get("/api/v1/gh/kyc/passport", {
        params: { passport_number: params.passportNumber },
      });

      const entity = response.data?.entity;

      if (!entity || !entity.id) {
        return { success: false, message: "Could not verify passport. Please check the number and try again." };
      }

      // Compare returned values against user-submitted values (case-insensitive)
      const normalize = (s: string) => (s || "").trim().toLowerCase();

      if (entity.first_name && normalize(entity.first_name) !== normalize(params.firstName)) {
        return { success: false, message: "Registered first name does not match passport information" };
      }

      if (entity.last_name && normalize(entity.last_name) !== normalize(params.lastName)) {
        return { success: false, message: "Registered last name does not match passport information" };
      }

      if (entity.date_of_birth && normalize(entity.date_of_birth) !== normalize(params.dob)) {
        return { success: false, message: "Registered date of birth does not match passport information" };
      }

      return { success: true, message: "Passport verified successfully" };
    } catch (error: any) {
      const message =
        error.response?.data?.error ||
        error.response?.data?.message ||
        "Passport verification failed. Please try again.";
      return { success: false, message };
    }
  }
}
