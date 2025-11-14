# FAQ — Frequently Asked Questions

### What is an NFT-option in Cropto?
An NFT-option is an ERC-721 token that stores option metadata: type, strike, volume, term, and link to the physical contract. It is a digital certificate of the right/position.

### How does a farmer use it?
A farmer buys an option as insurance — pays the premium and locks a price for a future delivery. If the market moves unfavorably, the difference is compensated per the option terms.

### Who pays the premium?
The option buyer pays the premium. The seller (trader) sets the premium — guideline 3–4% for a 6-month option, but it's market-driven.

### What are the trader's risks?
Main risk is the market moving against the position. Traders post collateral; if losses exceed collateral → margin call → forced settlement → default rating.

### What is a margin call?
Automatic notification triggered at a threshold (80% of collateral). Trader has 24 hours to top up, otherwise forced settlement occurs.

### How does settlement / exercise work?
Buyer initiates exercise. System calculates intrinsic value using Spike Index, compares to collateral, performs payout (off-chain) or triggers on-chain release when required.

### How does minting on-chain work?
CROPT is ERC-20. In MVP, minting is handled by the backend (dev-wallet, testnet). Users request withdraw — backend mints CROPT to the address. Production requires additional infrastructure.

### Can I transfer/sell the NFT-option?
Yes — the NFT can be traded. Legal/physical obligations are described in the contract; transferring the NFT changes the digital owner of the right.
