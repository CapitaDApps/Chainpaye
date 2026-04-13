/**
 * Property-based tests for emailVerificationFlow.service.ts
 * Feature: email-verification-flow
 * Uses fast-check for property-based testing
 */

import * as fc from "fast-check";

// ── Module-level mocks ────────────────────────────────────────────────────────

jest.mock("../../services/redis", () => ({
  redisClient: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    ttl: jest.fn(),
  },
}));

jest.mock("../../models/User", () => ({
  User: {
    findOne: jest.fn(),
    updateOne: jest.fn(),
  },
}));

jest.mock("../../services/EmailService", () => ({
  sendEmailVerificationOtp: jest.fn(),
}));

jest.mock("axios");

// ── Imports after mocks ───────────────────────────────────────────────────────

import { emailVerificationFlowScreen } from "./emailVerificationFlow.service";
import { redisClient } from "../../services/redis";
import { User } from "../../models/User";
import { sendEmailVerificationOtp } from "../../services/EmailService";
import axios from "axios";

const mockRedisGet = redisClient.get as jest.MockedFunction<typeof redisClient.get>;
const mockRedisSet = redisClient.set as jest.MockedFunction<typeof redisClient.set>;
const mockRedisDel = redisClient.del as jest.MockedFunction<typeof redisClient.del>;
const mockUserFindOne = User.findOne as jest.MockedFunction<typeof User.findOne>;
const mockUserUpdateOne = User.updateOne as jest.MockedFunction<typeof User.updateOne>;
const mockSendOtp = sendEmailVerificationOtp as jest.MockedFunction<typeof sendEmailVerificationOtp>;
const mockAxiosPost = axios.post as jest.MockedFunction<typeof axios.post>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBody(overrides: Partial<{
  screen: string;
  data: any;
  version: string;
  action: string;
  flow_token: string;
}>) {
  return {
    screen: "EMAIL_INPUT",
    data: {},
    version: "3.0",
    action: "data_exchange",
    flow_token: "test-token-123",
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("emailVerificationFlow property tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisSet.mockResolvedValue(undefined as any);
    mockRedisDel.mockResolvedValue(undefined as any);
    mockUserUpdateOne.mockResolvedValue({ modifiedCount: 1 } as any);
    mockAxiosPost.mockResolvedValue({
      data: { status: "Success", data: { customer_id: "cust_123" } },
    } as any);
  });

  // ── Property 3 ──────────────────────────────────────────────────────────────
  // Feature: email-verification-flow, Property 3: Invalid email addresses are rejected
  it("Property 3: invalid email addresses are rejected — Validates: Requirements 2.2, 2.3", async () => {
    // Generate strings that are definitely NOT valid emails:
    // either no '@' at all, or no '.' after '@'
    const invalidEmailArb = fc.oneof(
      // No '@' character
      fc.string({ minLength: 1 }).filter((s) => !s.includes("@")),
      // Has '@' but nothing after the last dot (or no dot after '@')
      fc.tuple(
        fc.string({ minLength: 1 }).filter((s) => !s.includes("@")),
        fc.string({ minLength: 1 }).filter((s) => !s.includes(".")),
      ).map(([local, domain]) => `${local}@${domain}`),
    );

    await fc.assert(
      fc.asyncProperty(invalidEmailArb, async (invalidEmail) => {
        const result = await emailVerificationFlowScreen(
          makeBody({ screen: "EMAIL_INPUT", data: { email: invalidEmail } }),
        ) as any;

        expect(result.screen).toBe("EMAIL_INPUT");
        expect(result.data.error_message).toBeTruthy();
        expect(result.data.error_message.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  // ── Property 4 ──────────────────────────────────────────────────────────────
  // Feature: email-verification-flow, Property 4: Valid email addresses advance the flow
  it("Property 4: valid email addresses advance to PIN_CONFIRM — Validates: Requirements 2.4", async () => {
    // Build valid emails: local@domain.tld
    const validEmailArb = fc
      .tuple(
        fc.stringMatching(/^[a-zA-Z0-9._%+\-]{1,20}$/),
        fc.stringMatching(/^[a-zA-Z0-9\-]{1,15}$/),
        fc.stringMatching(/^[a-zA-Z]{2,6}$/),
      )
      .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

    await fc.assert(
      fc.asyncProperty(validEmailArb, async (validEmail) => {
        const result = await emailVerificationFlowScreen(
          makeBody({ screen: "EMAIL_INPUT", data: { email: validEmail } }),
        ) as any;

        expect(result.screen).toBe("PIN_CONFIRM");
      }),
      { numRuns: 100 },
    );
  });

  // ── Property 5 ──────────────────────────────────────────────────────────────
  // Feature: email-verification-flow, Property 5: Incorrect PIN does not send OTP
  it("Property 5: incorrect PIN does not send OTP — Validates: Requirements 3.3", async () => {
    const storedPin = "correct-pin-hash";

    // Mock Redis to return a phone number
    mockRedisGet.mockResolvedValue("+2348012345678");

    // Mock User.findOne to return a user whose comparePin always returns false
    mockUserFindOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        whatsappNumber: "+2348012345678",
        comparePin: jest.fn().mockResolvedValue(false),
        pin: storedPin,
      }),
    } as any);

    const pinArb = fc.string({ minLength: 1, maxLength: 20 });

    await fc.assert(
      fc.asyncProperty(pinArb, async (wrongPin) => {
        jest.clearAllMocks();
        mockRedisGet.mockResolvedValue("+2348012345678");
        mockRedisSet.mockResolvedValue(undefined as any);
        mockUserFindOne.mockReturnValue({
          select: jest.fn().mockResolvedValue({
            whatsappNumber: "+2348012345678",
            comparePin: jest.fn().mockResolvedValue(false),
            pin: storedPin,
          }),
        } as any);

        const result = await emailVerificationFlowScreen(
          makeBody({
            screen: "PIN_CONFIRM",
            data: { pin: wrongPin, email: "user@example.com" },
          }),
        ) as any;

        expect(result.screen).toBe("PIN_CONFIRM");
        expect(result.data.error_message).toBeTruthy();
        expect(mockRedisSet).not.toHaveBeenCalledWith(
          expect.stringMatching(/^otp:/),
          expect.anything(),
          expect.anything(),
          expect.anything(),
        );
      }),
      { numRuns: 50 },
    );
  });

  // ── Property 6 ──────────────────────────────────────────────────────────────
  // Feature: email-verification-flow, Property 6: Correct PIN generates and stores OTP
  it("Property 6: correct PIN generates and stores 6-digit OTP — Validates: Requirements 3.4", async () => {
    const flowTokenArb = fc.string({ minLength: 5, maxLength: 30 }).filter(
      (s) => s.length > 0,
    );

    await fc.assert(
      fc.asyncProperty(flowTokenArb, async (flowToken) => {
        jest.clearAllMocks();
        mockRedisGet.mockResolvedValue("+2348012345678");
        mockRedisSet.mockResolvedValue(undefined as any);
        mockSendOtp.mockResolvedValue(undefined);
        mockUserFindOne.mockReturnValue({
          select: jest.fn().mockResolvedValue({
            whatsappNumber: "+2348012345678",
            comparePin: jest.fn().mockResolvedValue(true),
          }),
        } as any);

        const result = await emailVerificationFlowScreen(
          makeBody({
            screen: "PIN_CONFIRM",
            data: { pin: "1234", email: "user@example.com" },
            flow_token: flowToken,
          }),
        ) as any;

        expect(result.screen).toBe("OTP_INPUT");

        // Assert Redis SET was called with otp:{flow_token} and a 6-digit numeric string
        expect(mockRedisSet).toHaveBeenCalledWith(
          `otp:${flowToken}`,
          expect.stringMatching(/^\d{6}$/),
          "EX",
          600,
        );
      }),
      { numRuns: 50 },
    );
  });

  // ── Property 7 ──────────────────────────────────────────────────────────────
  // Feature: email-verification-flow, Property 7: Incorrect OTP does not verify email
  it("Property 7: incorrect OTP does not verify email — Validates: Requirements 4.4", async () => {
    const storedOtp = "123456";

    const wrongOtpArb = fc.string({ minLength: 1, maxLength: 10 }).filter(
      (s) => s !== storedOtp,
    );

    await fc.assert(
      fc.asyncProperty(wrongOtpArb, async (wrongOtp) => {
        jest.clearAllMocks();
        mockRedisGet.mockResolvedValue(storedOtp);
        mockUserUpdateOne.mockResolvedValue({ modifiedCount: 0 } as any);

        const result = await emailVerificationFlowScreen(
          makeBody({
            screen: "OTP_INPUT",
            data: { otp: wrongOtp, email: "user@example.com" },
          }),
        ) as any;

        expect(result.screen).toBe("OTP_INPUT");
        expect(result.data.error_message).toBeTruthy();

        // emailVerified: true should NOT have been set
        const updateCalls = mockUserUpdateOne.mock.calls;
        for (const call of updateCalls) {
          const updateDoc = call[1] as any;
          expect(updateDoc?.emailVerified).not.toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  // ── Property 8 ──────────────────────────────────────────────────────────────
  // Feature: email-verification-flow, Property 8: Correct OTP completes verification
  it("Property 8: correct OTP completes verification — Validates: Requirements 4.5", async () => {
    const otpArb = fc
      .integer({ min: 100000, max: 999999 })
      .map((n) => n.toString());

    await fc.assert(
      fc.asyncProperty(otpArb, async (otp) => {
        jest.clearAllMocks();
        mockRedisGet
          .mockResolvedValueOnce(otp)          // first call: get OTP
          .mockResolvedValueOnce("+2348012345678"); // second call: get phone
        mockRedisDel.mockResolvedValue(undefined as any);
        mockUserUpdateOne.mockResolvedValue({ modifiedCount: 1 } as any);
        mockUserFindOne.mockResolvedValue({
          whatsappNumber: "+2348012345678",
          email: "user@example.com",
          firstName: "John",
          lastName: "Doe",
          country: "NG",
        } as any);
        mockAxiosPost.mockResolvedValue({
          data: { status: "Success", data: { customer_id: "cust_abc" } },
        } as any);

        const result = await emailVerificationFlowScreen(
          makeBody({
            screen: "OTP_INPUT",
            data: { otp, email: "user@example.com" },
            flow_token: "test-token-abc",
          }),
        ) as any;

        expect(result.screen).toBe("SUCCESS");

        // emailVerified: true must have been set
        expect(mockUserUpdateOne).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ emailVerified: true }),
        );

        // Redis key must have been deleted
        expect(mockRedisDel).toHaveBeenCalledWith("otp:test-token-abc");
      }),
      { numRuns: 50 },
    );
  });

  // ── Property 9 ──────────────────────────────────────────────────────────────
  // Feature: email-verification-flow, Property 9: OTP expiry prevents verification
  it("Property 9: expired/missing OTP prevents verification — Validates: Requirements 4.3", async () => {
    const anyOtpArb = fc.string({ minLength: 1, maxLength: 10 });

    await fc.assert(
      fc.asyncProperty(anyOtpArb, async (anyOtp) => {
        jest.clearAllMocks();
        // Redis returns null → OTP expired/missing
        mockRedisGet.mockResolvedValue(null);
        mockUserUpdateOne.mockResolvedValue({ modifiedCount: 0 } as any);

        const result = await emailVerificationFlowScreen(
          makeBody({
            screen: "OTP_INPUT",
            data: { otp: anyOtp, email: "user@example.com" },
          }),
        ) as any;

        expect(result.screen).toBe("OTP_INPUT");
        expect(result.data.error_message).toBeTruthy();

        // emailVerified: true should NOT have been set
        const updateCalls = mockUserUpdateOne.mock.calls;
        for (const call of updateCalls) {
          const updateDoc = call[1] as any;
          expect(updateDoc?.emailVerified).not.toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  // ── Property 10 ─────────────────────────────────────────────────────────────
  // Feature: email-verification-flow, Property 10: Linkio failure does not block access
  it("Property 10: Linkio failure does not block email verification — Validates: Requirements 5.4", async () => {
    const otp = "654321";

    // Generate various error types that Linkio might throw
    const errorArb = fc.oneof(
      fc.constant(new Error("Network error")),
      fc.constant(new Error("Timeout")),
      fc.constant(new Error("500 Internal Server Error")),
    );

    await fc.assert(
      fc.asyncProperty(errorArb, async (linkioError) => {
        jest.clearAllMocks();
        mockRedisGet
          .mockResolvedValueOnce(otp)               // get OTP
          .mockResolvedValueOnce("+2348012345678");  // get phone
        mockRedisDel.mockResolvedValue(undefined as any);
        mockUserUpdateOne.mockResolvedValue({ modifiedCount: 1 } as any);
        mockUserFindOne.mockResolvedValue({
          whatsappNumber: "+2348012345678",
          email: "user@example.com",
          firstName: "Jane",
          lastName: "Smith",
          country: "NG",
        } as any);

        // Linkio throws
        mockAxiosPost.mockRejectedValue(linkioError);

        const result = await emailVerificationFlowScreen(
          makeBody({
            screen: "OTP_INPUT",
            data: { otp, email: "user@example.com" },
            flow_token: "test-token-xyz",
          }),
        ) as any;

        // Flow must still succeed
        expect(result.screen).toBe("SUCCESS");

        // emailVerified: true must still have been set
        expect(mockUserUpdateOne).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ emailVerified: true }),
        );
      }),
      { numRuns: 30 },
    );
  });
});
