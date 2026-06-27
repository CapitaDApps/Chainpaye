/**
 * Unit tests for EmailService
 * Requirements: 7.1, 7.2, 7.3
 */

const mockSendMail = jest.fn();

jest.mock("nodemailer", () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}));

import { sendEmailVerificationOtp } from "./EmailService";

describe("sendEmailVerificationOtp", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendMail.mockResolvedValue({ messageId: "test-id" });
  });

  it("sends to the correct recipient email (Requirement 7.1)", async () => {
    await sendEmailVerificationOtp("user@example.com", "123456");

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mailOptions = mockSendMail.mock.calls[0][0];
    expect(mailOptions.to).toBe("user@example.com");
  });

  it("includes a subject referencing verification (Requirement 7.1)", async () => {
    await sendEmailVerificationOtp("user@example.com", "654321");

    const mailOptions = mockSendMail.mock.calls[0][0];
    expect(mailOptions.subject).toBeTruthy();
    expect(mailOptions.subject.toLowerCase()).toContain("verif");
  });

  it("includes the 6-digit OTP prominently in the HTML body (Requirement 7.2)", async () => {
    const otp = "987654";
    await sendEmailVerificationOtp("user@example.com", otp);

    const mailOptions = mockSendMail.mock.calls[0][0];
    expect(mailOptions.html).toContain(otp);
  });

  it("states the OTP expires in 10 minutes in the HTML body (Requirement 7.3)", async () => {
    await sendEmailVerificationOtp("user@example.com", "112233");

    const mailOptions = mockSendMail.mock.calls[0][0];
    expect(mailOptions.html).toContain("10 minutes");
  });

  it("throws when sendMail rejects", async () => {
    mockSendMail.mockRejectedValue(new Error("SMTP error"));

    await expect(
      sendEmailVerificationOtp("user@example.com", "000000"),
    ).rejects.toThrow("SMTP error");
  });
});
