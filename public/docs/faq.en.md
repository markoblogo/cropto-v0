# FAQ — Cropto

### What is an NFT option in Cropto?

An NFT option is an ERC-721 token that represents the right to receive a payout based on a specific option contract in the Cropto system.  
The token itself is not the grain — it is a **claim on settlement** linked to a physical deal.

### How is PnL calculated?

- Every day we take the **Spike Spot Commodity Index** for the chosen grade (e.g. wheat 11.5 pro).  
- We compare it with the strike price of the option.  
- For CALL/PUT we compute intrinsic value and update unrealized PnL and margin status.

### What happens on a margin call?

If losses approach the collateral limit, the position is flagged, and the trader has a time window to top up margin.  
If the call is not met, the platform can trigger **forced settlement** using the remaining collateral.

### How do I get CROPT for tests?

In the current Pre-MVP:

- CROPT exists only on **Polygon Amoy testnet**.  
- Test tokens are minted via backend endpoints by the team.  
- You only need POL (testnet gas) in MetaMask to see transactions and NFT mints.
