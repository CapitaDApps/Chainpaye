import axios, { AxiosInstance } from "axios";

interface BVNVerificationParams {
  bvn: string;
  firstName: string;
  lastName: string;
  dob: string; // yyyy-mm-dd
}

interface BVNVerificationResult {
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

  async verifyBVN(params: BVNVerificationParams): Promise<BVNVerificationResult> {
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
}
