import { Request, Response, NextFunction } from 'express';

export default function auditLog(req: Request, res: Response, next: NextFunction) {
  try {
    const user = ((req as any).user && (req as any).user.id) || req.headers['x-user-id'] || 'anonymous';
    console.info(`[AUDIT] ${new Date().toISOString()} ${req.method} ${req.originalUrl} user=${user} ip=${req.ip}`);
  } catch (e) {}
  next();
}
