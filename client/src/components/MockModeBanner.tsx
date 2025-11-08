import React from "react";

export default function MockModeBanner() {
  const mockEnv = (import.meta.env.VITE_MOCK_ONCHAIN || "").toLowerCase() === "true";
  const mintEnabled = (import.meta.env.VITE_ENABLE_MINT || "").toLowerCase() === "true";
  const show = mockEnv || !mintEnabled;
  if (!show) return null;

  return (
    <div style={{background:"#FFEDD5", color:"#7C2D12", padding:"12px 16px", borderLeft:"4px solid #F97316", marginBottom:16}}>
      <strong>DEMO / MOCK MODE:</strong>{" "}
      {mockEnv ? "Mock on-chain is enabled — blockchain actions are simulated." : null}
      {!mintEnabled ? (!mockEnv ? " On-chain minting is disabled (ENABLE_MINT not true)." : "") : null}
      <div style={{marginTop:8, fontSize:13}}>
        For real on-chain tests: fund your wallet with POL on Polygon Amoy faucet and set <code>VITE_MOCK_ONCHAIN=false</code> and <code>VITE_ENABLE_MINT=true</code>.
      </div>
    </div>
  );
}
