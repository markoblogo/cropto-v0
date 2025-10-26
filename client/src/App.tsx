// client/src/App.tsx (TypeScript) or client/src/App.js (JS) - adjust extension
import React, { useEffect, useState } from 'react';
import './App.css';

function App() {
  const [list, setList] = useState([]);

  async function load(){
    const res = await fetch('http://localhost:4000/api/options'); // прямой бекенд
    const data = await res.json();
    setList(data);
  }

  useEffect(()=>{ load(); }, []);

  return (
    <div style={{padding:20}}>
      <h1>Marketplace — Cropto (commodity options)</h1>
      <button onClick={load}>Refresh</button>
      <table border={1} cellPadding={6} style={{marginTop:12}}>
        <thead><tr><th>Title</th><th>Commodity</th><th>Type</th><th>Strike</th><th>Qty</th><th>Premium</th><th>Collateral</th><th>Payout CROPT</th><th>Status</th><th>Receipt</th></tr></thead>
        <tbody>
          {list.map(o => (
            <tr key={o.id}>
              <td>{o.title}</td><td>{o.commodity}</td><td>{o.type}</td><td>{o.strike}</td><td>{o.qty}</td><td>{o.premium_per_t}</td>
              <td>{o.collateral_amount}</td><td>{o.payout_amount_token}</td><td>{o.status}</td>
              <td>{o.warehouse_receipt_url ? <a href={o.warehouse_receipt_url} target="_blank" rel="noreferrer">receipt</a> : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;
