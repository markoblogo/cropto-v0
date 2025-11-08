import { ethers } from 'ethers';

/**
 * Normalizes an Ethereum address to its checksummed format
 * @param address - The address to normalize (can be any case)
 * @returns Checksummed address or null if invalid
 */
export function normalizeAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  
  try {
    // In ethers v6, getAddress validates and returns checksummed address
    // It throws if the address is invalid
    return ethers.getAddress(address);
  } catch (error) {
    // Invalid address
    return null;
  }
}

/**
 * Validates that an address is properly formatted
 * @param address - The address to validate
 * @returns true if valid, false otherwise
 */
export function isValidAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  try {
    ethers.getAddress(address);
    return true;
  } catch {
    return false;
  }
}
