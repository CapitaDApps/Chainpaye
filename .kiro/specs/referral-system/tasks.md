# Implementation Plan: Referral Code Capture Flow

## Overview

This implementation plan breaks down the referral code capture flow into discrete coding tasks that build incrementally. The approach focuses on implementing core validation and storage functionality first, then integrating with the WhatsApp bot and signup flow, and finally adding comprehensive testing.

## Tasks

- [x] 1. Set up core interfaces and Redis integration
  - Create TypeScript interfaces for command parsing, validation, and Redis operations
  - Set up Redis client configuration and connection handling
  - Implement basic Redis storage service with TTL support
  - _Requirements: 2.2, 10.1, 10.2_

- [ ] 2. Implement referral code validation
  - [x] 2.1 Create referral code validator service
    - Implement database lookup for referral code existence
    - Add referrer information retrieval functionality
    - Handle validation errors and edge cases
    - _Requirements: 2.1, 2.3_
  
  - [x] 2.2 Write property test for referral code validation
    - **Property 1: Referral Code Validation**
    - **Validates: Requirements 2.1, 2.4**
  
  - [x] 2.3 Write unit tests for validation edge cases
    - Test invalid code formats, non-existent codes, and database errors
    - _Requirements: 2.1, 2.4_

- [ ] 3. Implement command parsing for WhatsApp messages
  - [x] 3.1 Create command parser for "start [referral_code]" format
    - Parse WhatsApp message text to extract referral codes
    - Validate command format and structure
    - Extract phone number from message context
    - _Requirements: 2.1_
  
  - [x] 3.2 Write property test for command parsing
    - Test parsing behavior across various input formats
    - _Requirements: 2.1_
  
  - [x] 3.3 Write unit tests for command parsing edge cases
    - Test malformed commands, missing codes, special characters
    - _Requirements: 2.1_

- [ ] 4. Implement Redis temporary storage
  - [x] 4.1 Create Redis storage service for referral codes
    - Implement store, retrieve, and remove operations
    - Set 24-hour TTL for all stored codes
    - Handle Redis connection errors gracefully
    - _Requirements: 2.2, 10.1, 10.2, 10.5_
  
  - [x] 4.2 Write property test for Redis storage with TTL
    - **Property 2: Redis Storage with TTL**
    - **Validates: Requirements 2.2, 10.1, 10.2**
  
  - [x] 4.3 Write property test for expired code handling
    - **Property 8: Expired Code Handling**
    - **Validates: Requirements 10.3**

- [x] 5. Checkpoint - Core functionality validation
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement personalized messaging
  - [x] 6.1 Create message template service
    - Implement invitation message formatting with referrer name
    - Add error message templates for invalid codes
    - Handle message localization if needed
    - _Requirements: 2.3, 2.4_
  
  - [x] 6.2 Write property test for message generation
    - **Property 3: Personalized Message Generation**
    - **Validates: Requirements 2.3**
  
  - [x] 6.3 Write unit tests for message templates
    - Test message formatting with various referrer names
    - Test error message generation
    - _Requirements: 2.3, 2.4_

- [ ] 7. Implement WhatsApp bot integration
  - [x] 7.1 Create WhatsApp message handler for start command
    - Integrate command parser with WhatsApp bot
    - Handle message processing and response sending
    - Add error handling for bot communication failures
    - _Requirements: 2.1, 2.3, 2.4, 2.5_
  
  - [x] 7.2 Write integration tests for WhatsApp bot flow
    - Test complete flow from message receipt to response
    - _Requirements: 2.1, 2.3, 2.4, 2.5_

- [ ] 8. Implement signup flow integration
  - [x] 8.1 Create signup integration service
    - Implement Redis lookup during signup initialization
    - Add referral code pre-population logic
    - Handle cases where no stored code exists
    - _Requirements: 2.1.1, 2.1.2_
  
  - [x] 8.2 Write property test for signup code lookup
    - **Property 4: Signup Code Lookup and Pre-population**
    - **Validates: Requirements 2.1.1, 2.1.2**

- [ ] 9. Implement referral relationship creation
  - [x] 9.1 Create referral relationship service
    - Implement final validation during signup completion
    - Add referral relationship creation with immutability checks
    - Implement Redis cleanup after successful relationship creation
    - Add self-referral prevention logic
    - _Requirements: 2.1.4, 2.1.5, 2.1.6, 2.1.7, 10.4_
  
  - [x] 9.2 Write property test for signup validation and relationship creation
    - **Property 5: Signup Validation and Relationship Creation**
    - **Validates: Requirements 2.1.4, 2.1.5**
  
  - [x] 9.3 Write property test for referral relationship immutability
    - **Property 6: Referral Relationship Immutability**
    - **Validates: Requirements 2.1.6**
  
  - [x] 9.4 Write property test for self-referral prevention
    - **Property 7: Self-Referral Prevention**
    - **Validates: Requirements 2.1.7**
  
  - [x] 9.5 Write property test for Redis cleanup
    - **Property 9: Redis Cleanup After Relationship Creation**
    - **Validates: Requirements 10.4**

- [x] 10. Integration and error handling
  - [x] 10.1 Wire all components together
    - Connect WhatsApp bot handler to validation and storage services
    - Integrate signup flow with Redis lookup and relationship creation
    - Add comprehensive error handling and logging
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.1.1, 2.1.2, 2.1.4, 2.1.5_
  
  - [x] 10.2 Write end-to-end integration tests
    - Test complete user journey from start command to signup completion
    - Test error scenarios and edge cases
    - _Requirements: All requirements_

- [x] 11. Final checkpoint - Comprehensive testing
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with comprehensive testing ensure robust implementation
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties with minimum 100 iterations
- Unit tests validate specific examples and edge cases
- Integration tests ensure proper component interaction
- Redis operations include proper error handling and timeout management