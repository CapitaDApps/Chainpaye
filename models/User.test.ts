/**
 * User model unit tests
 * Requirements: 6.1, 6.2
 */

import mongoose from "mongoose";
import { User } from "./User";

describe("User model defaults", () => {
  it("should have emailVerified default to false on a new document", () => {
    const user = new User({
      whatsappNumber: "+2348012345678",
      userId: "test-user-id",
      fullName: "Test User",
      country: "NG",
      currency: "NGN",
      pin: "hashedpin",
    });

    expect(user.emailVerified).toBe(false);
  });

  it("should not have linkioCustomerId set by default", () => {
    const user = new User({
      whatsappNumber: "+2348012345678",
      userId: "test-user-id",
      fullName: "Test User",
      country: "NG",
      currency: "NGN",
      pin: "hashedpin",
    });

    expect(user.linkioCustomerId).toBeUndefined();
  });

  it("should allow setting emailVerified to true", () => {
    const user = new User({
      whatsappNumber: "+2348012345678",
      userId: "test-user-id",
      fullName: "Test User",
      country: "NG",
      currency: "NGN",
      pin: "hashedpin",
      emailVerified: true,
    });

    expect(user.emailVerified).toBe(true);
  });

  it("should allow setting linkioCustomerId", () => {
    const customerId = "VHlwZXM6OkNhc2hyYW1wOjpBUEk6Ok1lcmNoYW50Q3VzdG9tZXItYjAyZjA4NWQtZjFlNi00MzVlLWI1YzctNWVlMmFhNzg3YTM3";
    const user = new User({
      whatsappNumber: "+2348012345678",
      userId: "test-user-id",
      fullName: "Test User",
      country: "NG",
      currency: "NGN",
      pin: "hashedpin",
      linkioCustomerId: customerId,
    });

    expect(user.linkioCustomerId).toBe(customerId);
  });
});
