import { describe, expect, it } from 'vitest';
import { emailChangeNoticeMessage, maskEmail } from './auth.email-change.js';

describe('email change notice', () => {
  it.each([
    ['ana.new@example.com', 'a***@example.com'],
    ['a@example.com', 'a***@example.com'],
    ["o'brien+recipes@mail.example.co.uk", 'o***@mail.example.co.uk'],
  ])('masks %s as %s', (email, masked) => {
    expect(maskEmail(email)).toBe(masked);
  });

  it('names the masked address, links only to Settings on the trusted origin and never states the full new address', () => {
    expect(emailChangeNoticeMessage('ana@example.com', 'https://recipes.example', 'ana.new@example.com')).toEqual({
      kind: 'email-change-notice',
      to: 'ana@example.com',
      subject: 'A change of your email was requested',
      html: '<p>Someone asked to change the email of your Recapp account to a***@example.com. Your email stays the same until the new address confirms it.</p>'
        + '<p>If it was you, no action is needed here: open the link we sent to the new address.</p>'
        + '<p>If it was not you, change your password. That cancels the request and signs out your other devices: <a href="https://recipes.example/settings">Open Settings</a></p>',
    });
  });
});
