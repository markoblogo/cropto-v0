import fs from 'fs';
import path from 'path';

const AUDIT_LOG_DIR = path.join(process.cwd(), 'logs');
const AUDIT_LOG_FILE = path.join(AUDIT_LOG_DIR, 'audit.log');

function ensureLogDir() {
  if (!fs.existsSync(AUDIT_LOG_DIR)) {
    fs.mkdirSync(AUDIT_LOG_DIR, { recursive: true });
  }
}

export interface AuditLogEntry {
  timestamp: string;
  event: string;
  user?: string;
  ip?: string;
  details?: any;
}

export function auditLog(entry: AuditLogEntry) {
  ensureLogDir();
  
  const logLine = JSON.stringify({
    ...entry,
    timestamp: entry.timestamp || new Date().toISOString(),
  });
  
  fs.appendFileSync(AUDIT_LOG_FILE, logLine + '\n', 'utf8');
  
  console.log(`[AUDIT] ${entry.event}`, entry.user ? `user=${entry.user}` : '', entry.ip ? `ip=${entry.ip}` : '');
}

export function auditSecurityEvent(event: string, ip: string, details?: any) {
  auditLog({
    timestamp: new Date().toISOString(),
    event: `SECURITY:${event}`,
    ip,
    details,
  });
}

export function auditAuthEvent(event: string, user: string, ip: string) {
  auditLog({
    timestamp: new Date().toISOString(),
    event: `AUTH:${event}`,
    user,
    ip,
  });
}
