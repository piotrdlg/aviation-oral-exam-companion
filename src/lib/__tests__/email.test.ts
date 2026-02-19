import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock resend before importing the module under test
const { mockSend } = vi.hoisted(() => {
  const mockSend = vi.fn();
  return { mockSend };
});

vi.mock('resend', () => {
  return {
    Resend: class MockResend {
      emails = { send: mockSend };
    },
  };
});

// Mock React Email templates to avoid rendering overhead in tests
vi.mock('@/emails/welcome', () => ({
  WelcomeEmail: vi.fn((props: { name?: string }) => `WelcomeEmail(${JSON.stringify(props)})`),
}));
vi.mock('@/emails/subscription-confirmed', () => ({
  SubscriptionConfirmedEmail: vi.fn((props: { plan: string }) => `SubscriptionConfirmedEmail(${JSON.stringify(props)})`),
}));
vi.mock('@/emails/subscription-cancelled', () => ({
  SubscriptionCancelledEmail: vi.fn(() => 'SubscriptionCancelledEmail'),
}));
vi.mock('@/emails/payment-failed', () => ({
  PaymentFailedEmail: vi.fn(() => 'PaymentFailedEmail'),
}));

import {
  sendWelcomeEmail,
  sendSubscriptionConfirmed,
  sendSubscriptionCancelled,
  sendPaymentFailed,
  sendTicketReply,
  forwardEmail,
} from '../email';

describe('email service', () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockSend.mockResolvedValue({ data: { id: 'test-email-id' }, error: null });
    process.env.EMAIL_FORWARD_TO = 'test@personal.com';
  });

  // -------------------------------------------------------------------
  // sendWelcomeEmail
  // -------------------------------------------------------------------
  describe('sendWelcomeEmail', () => {
    it('sends with correct from, to, and subject', async () => {
      await sendWelcomeEmail('pilot@example.com', 'Maverick');

      expect(mockSend).toHaveBeenCalledOnce();
      const call = mockSend.mock.calls[0][0];
      expect(call.from).toBe('HeyDPE <hello@heydpe.com>');
      expect(call.to).toBe('pilot@example.com');
      expect(call.subject).toBe('Welcome to HeyDPE \u2014 Your DPE is ready');
    });

    it('passes name to WelcomeEmail template', async () => {
      await sendWelcomeEmail('pilot@example.com', 'Maverick');

      const call = mockSend.mock.calls[0][0];
      expect(call.react).toContain('Maverick');
    });

    it('works without a name (optional param)', async () => {
      await sendWelcomeEmail('pilot@example.com');

      expect(mockSend).toHaveBeenCalledOnce();
    });

    it('does not throw when Resend fails', async () => {
      mockSend.mockRejectedValue(new Error('API down'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(sendWelcomeEmail('pilot@example.com')).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[email] Failed to send welcome email:',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------
  // sendSubscriptionConfirmed
  // -------------------------------------------------------------------
  describe('sendSubscriptionConfirmed', () => {
    it('sends with billing sender and correct subject', async () => {
      await sendSubscriptionConfirmed('pilot@example.com', 'monthly');

      const call = mockSend.mock.calls[0][0];
      expect(call.from).toBe('HeyDPE Billing <billing@heydpe.com>');
      expect(call.to).toBe('pilot@example.com');
      expect(call.subject).toBe('Your HeyDPE subscription is active');
    });

    it('passes monthly plan to template', async () => {
      await sendSubscriptionConfirmed('pilot@example.com', 'monthly');

      const call = mockSend.mock.calls[0][0];
      expect(call.react).toContain('"monthly"');
    });

    it('passes annual plan to template', async () => {
      await sendSubscriptionConfirmed('pilot@example.com', 'annual');

      const call = mockSend.mock.calls[0][0];
      expect(call.react).toContain('"annual"');
    });

    it('does not throw when Resend fails', async () => {
      mockSend.mockRejectedValue(new Error('API down'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(
        sendSubscriptionConfirmed('pilot@example.com', 'monthly')
      ).resolves.toBeUndefined();

      consoleSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------
  // sendSubscriptionCancelled
  // -------------------------------------------------------------------
  describe('sendSubscriptionCancelled', () => {
    it('sends with billing sender and cancellation subject', async () => {
      await sendSubscriptionCancelled('pilot@example.com');

      const call = mockSend.mock.calls[0][0];
      expect(call.from).toBe('HeyDPE Billing <billing@heydpe.com>');
      expect(call.to).toBe('pilot@example.com');
      expect(call.subject).toBe('Your HeyDPE subscription has been cancelled');
    });

    it('does not throw when Resend fails', async () => {
      mockSend.mockRejectedValue(new Error('API down'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(
        sendSubscriptionCancelled('pilot@example.com')
      ).resolves.toBeUndefined();

      consoleSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------
  // sendPaymentFailed
  // -------------------------------------------------------------------
  describe('sendPaymentFailed', () => {
    it('sends with billing sender and urgency subject', async () => {
      await sendPaymentFailed('pilot@example.com');

      const call = mockSend.mock.calls[0][0];
      expect(call.from).toBe('HeyDPE Billing <billing@heydpe.com>');
      expect(call.to).toBe('pilot@example.com');
      expect(call.subject).toBe(
        'Action needed \u2014 Payment failed for HeyDPE'
      );
    });

    it('does not throw when Resend fails', async () => {
      mockSend.mockRejectedValue(new Error('API down'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(
        sendPaymentFailed('pilot@example.com')
      ).resolves.toBeUndefined();

      consoleSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------
  // sendTicketReply
  // -------------------------------------------------------------------
  describe('sendTicketReply', () => {
    it('sends with support sender and Re: prefix', async () => {
      await sendTicketReply(
        'pilot@example.com',
        'Help with exam',
        '<p>Response body</p>'
      );

      const call = mockSend.mock.calls[0][0];
      expect(call.from).toBe('HeyDPE Support <support@heydpe.com>');
      expect(call.to).toBe('pilot@example.com');
      expect(call.subject).toBe('Re: Help with exam');
      expect(call.html).toBe('<p>Response body</p>');
    });

    it('sets In-Reply-To and References headers when inReplyTo provided', async () => {
      const messageId = '<abc123@mail.example.com>';
      await sendTicketReply(
        'pilot@example.com',
        'Help with exam',
        '<p>Reply</p>',
        messageId
      );

      const call = mockSend.mock.calls[0][0];
      expect(call.headers['In-Reply-To']).toBe(messageId);
      expect(call.headers['References']).toBe(messageId);
    });

    it('does not set threading headers when inReplyTo is not provided', async () => {
      await sendTicketReply(
        'pilot@example.com',
        'Help with exam',
        '<p>Reply</p>'
      );

      const call = mockSend.mock.calls[0][0];
      expect(call.headers).toEqual({});
    });

    it('returns the Resend email ID on success', async () => {
      mockSend.mockResolvedValue({ data: { id: 'res_abc123' }, error: null });

      const result = await sendTicketReply(
        'pilot@example.com',
        'Test',
        'body'
      );

      expect(result).toBe('res_abc123');
    });

    it('returns null when Resend returns an error response', async () => {
      mockSend.mockResolvedValue({
        data: null,
        error: { message: 'Bad request', name: 'validation_error' },
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await sendTicketReply(
        'pilot@example.com',
        'Test',
        'body'
      );

      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });

    it('returns null and does not throw when Resend throws', async () => {
      mockSend.mockRejectedValue(new Error('Network error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await sendTicketReply(
        'pilot@example.com',
        'Test',
        'body'
      );

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        '[email] Failed to send ticket reply:',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------
  // forwardEmail
  // -------------------------------------------------------------------
  describe('forwardEmail', () => {
    it('forwards to EMAIL_FORWARD_TO env var', async () => {
      await forwardEmail(
        'sender@example.com',
        'pd@heydpe.com',
        'Hello',
        'Plain text body'
      );

      const call = mockSend.mock.calls[0][0];
      expect(call.to).toBe('test@personal.com');
    });

    it('sends from noreply with [Fwd] prefix', async () => {
      await forwardEmail(
        'sender@example.com',
        'pd@heydpe.com',
        'Hello',
        'Body'
      );

      const call = mockSend.mock.calls[0][0];
      expect(call.from).toBe('HeyDPE <noreply@heydpe.com>');
      expect(call.subject).toBe('[Fwd] Hello');
    });

    it('sets X-Original-From and X-Original-To headers', async () => {
      await forwardEmail(
        'sender@example.com',
        'pd@heydpe.com',
        'Test',
        'Body'
      );

      const call = mockSend.mock.calls[0][0];
      expect(call.headers['X-Original-From']).toBe('sender@example.com');
      expect(call.headers['X-Original-To']).toBe('pd@heydpe.com');
    });

    it('uses bodyHtml when provided', async () => {
      await forwardEmail(
        'sender@example.com',
        'pd@heydpe.com',
        'Test',
        'Plain text',
        '<p>Rich HTML</p>'
      );

      const call = mockSend.mock.calls[0][0];
      expect(call.html).toBe('<p>Rich HTML</p>');
    });

    it('generates HTML from text when bodyHtml is not provided', async () => {
      await forwardEmail(
        'sender@example.com',
        'pd@heydpe.com',
        'Test',
        'Plain text body'
      );

      const call = mockSend.mock.calls[0][0];
      expect(call.html).toContain('sender@example.com');
      expect(call.html).toContain('Plain text body');
    });

    it('does not send when EMAIL_FORWARD_TO is not set', async () => {
      delete process.env.EMAIL_FORWARD_TO;
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await forwardEmail(
        'sender@example.com',
        'pd@heydpe.com',
        'Test',
        'Body'
      );

      expect(mockSend).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        '[email] EMAIL_FORWARD_TO not configured, cannot forward'
      );
      consoleSpy.mockRestore();
    });

    it('does not throw when Resend fails', async () => {
      mockSend.mockRejectedValue(new Error('API down'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(
        forwardEmail('sender@example.com', 'pd@heydpe.com', 'Test', 'Body')
      ).resolves.toBeUndefined();

      consoleSpy.mockRestore();
    });
  });
});
