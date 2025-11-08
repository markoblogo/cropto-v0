import { Request, Response, NextFunction } from 'express';
import { auditSecurityEvent } from '../utils/auditLog';

export default function blockServiceRole(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s*/i, '');
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    if (SERVICE_ROLE && token && token === SERVICE_ROLE) {
      const forwarded = req.headers['x-forwarded-for'];
      const ip = req.ip || (typeof forwarded === 'string' ? forwarded : 'unknown');
      console.warn('[SECURITY] Client attempted to use SERVICE_ROLE from', ip);
      
      auditSecurityEvent('SERVICE_ROLE_BLOCKED', ip, {
        path: req.path,
        method: req.method,
      });
      
      return res.status(403).json({ error: 'Forbidden' });
    }
  } catch (e: any) {
    console.error('[SECURITY] blockServiceRole error', e && e.message);
  }
  next();
};
