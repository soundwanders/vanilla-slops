import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { validateRequest } from '../middlewares/validateRequest.js';

function mockReqRes(query = {}) {
  const req = { query };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const next = vi.fn();
  return { req, res, next };
}

const schema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

describe('validateRequest middleware', () => {
  it('calls next() and attaches parsed data on valid input', () => {
    const { req, res, next } = mockReqRes({ page: '2', limit: '10', search: 'half-life' });
    validateRequest(schema)(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.query.page).toBe(2);
    expect(req.query.limit).toBe(10);
    expect(req.query.search).toBe('half-life');
  });

  it('applies defaults when optional fields are missing', () => {
    const { req, res, next } = mockReqRes({});
    validateRequest(schema)(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.query.page).toBe(1);
    expect(req.query.limit).toBe(20);
  });

  it('returns 400 with standard error shape on invalid input', () => {
    const { req, res, next } = mockReqRes({ limit: '9999' }); // exceeds max
    validateRequest(schema)(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Request validation failed');
    expect(body.error.fields).toBeDefined();
  });

  it('returns 400 when a coerced field has the wrong type', () => {
    const { req, res, next } = mockReqRes({ page: 'notanumber' });
    validateRequest(schema)(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
