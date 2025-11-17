export function generateOptionTitle(params: {
  commodityName: string;
  quantity: number;
  creationDate: Date;
  expirationDate: Date;
}): string {
  const { commodityName, quantity, creationDate, expirationDate } = params;
  
  // Format: WHEAT115-50T-17NOV-30DEC-V10-A92KD
  
  // 1. Commodity name: uppercase, no spaces, no special chars
  const commodityCode = commodityName
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9]/g, '');
  
  // 2. Quantity with tonnes unit
  const qtyCode = `${Math.round(quantity)}T`;
  
  // 3. Creation date: DD-MMM format
  const creationCode = formatDateCode(creationDate);
  
  // 4. Expiration date: DD-MMM format
  const expirationCode = formatDateCode(expirationDate);
  
  // 5. Volume code: V + (qty / 10, rounded)
  const volumeCode = `V${Math.max(1, Math.round(quantity / 10))}`;
  
  // 6. Unique ID: 5-char alphanumeric
  const uniqueId = generateUniqueId(5);
  
  return `${commodityCode}-${qtyCode}-${creationCode}-${expirationCode}-${volumeCode}-${uniqueId}`;
}

function formatDateCode(date: Date): string {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 
                  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const day = String(date.getDate()).padStart(2, '0');
  const month = months[date.getMonth()];
  return `${day}${month}`;
}

function generateUniqueId(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
