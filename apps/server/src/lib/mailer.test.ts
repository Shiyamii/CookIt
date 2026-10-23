import { describe, expect, test } from 'bun:test';
import { sendError } from './mailer';

describe('sendError', () => {
  test('keeps only the SMTP code, response code and answer', () => {
    const error = Object.assign(new Error('Recipient rejected'), {
      code: 'EENVELOPE',
      responseCode: 550,
      response: '550 5.1.1 User unknown',
    });
    expect(sendError(error)).toBe('EENVELOPE 550 550 5.1.1 User unknown');
  });

  test('ignores the message of the error when an SMTP code exists', () => {
    const error = Object.assign(new Error('secret message'), { code: 'ECONNECTION' });
    expect(sendError(error)).toBe('ECONNECTION');
  });

  test('falls back to the message, then to "unknown"', () => {
    expect(sendError(new Error('boom'))).toBe('boom');
    expect(sendError('weird')).toBe('unknown');
    expect(sendError({})).toBe('unknown');
  });

  test('is a single line', () => {
    expect(sendError({ response: '250 ok\r\n550 no\nmore' })).toBe('250 ok 550 no more');
  });

  test('blanks out the addresses a server repeats', () => {
    const error = { response: '550 5.1.1 <bob@example.com>: Recipient address rejected' };
    expect(sendError(error)).toBe('550 5.1.1 <address>: Recipient address rejected');
    expect(sendError({ response: 'no such user bob@example.com here' })).toBe(
      'no such user <address> here',
    );
    expect(sendError(new Error('failed for bob@example.com'))).toBe('failed for <address>');
  });

  test('is at most 300 characters', () => {
    expect(sendError({ response: 'x'.repeat(1000) })).toHaveLength(300);
  });
});
