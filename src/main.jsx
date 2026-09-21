import React,{useEffect,useRef,useState}from"react";
import{createRoot}from"react-dom/client";
import{ArrowUp,ArrowDown,Play,Pause,Square,Check}from"lucide-react";
import{getSignal}from"./strategy";
import"./styles.css";

function App(){
const[m,setM]=useState("MANUAL"),[run,setRun]=useState(false),[p,setP]=useState(null),[s,setS]=useState(1),[c,setC]=useState(1),[b,setB]=useState(100),[ts,setTs]=useState([]),[signal,setSignal]=useState({direction:"WAIT",strength:0}),[pending,setPending]=useState(null),[live,setLive]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState("PAPER");
const prices=useRef([]),lastAction=useRef({direction:"WAIT",time:0});

useEffect(()=>{fetch("/api/trading/status").then(r=>r.json()).then(x=>{setLive(Boolean(x.liveTradingEnabled));setStatus(x.liveTradingEnabled?"LIVE":"PAPER")}).catch(()=>{});},[]);

useEffect(()=>{let w=new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089");w.onopen=()=>w.send(JSON.stringify({ticks:"R_100",subscribe:1}));w.onmessage=e=>{const d=JSON.parse(e.data);if(!d.tick)return;const price=Number(d.tick.quote);setP(price);prices.current=[...prices.current.slice(-199),price];const next=getSignal(prices.current);setSignal(next);
if(run&&m==="AUTO"&&next.direction!=="WAIT"&&next.strength>=55&&Date.now()-lastAction.current.time>5000&&next.direction!==lastAction.current.direction){lastAction.current={direction:next.direction,time:Date.now()};executeTrade(next.direction,next.strength);}
if(run&&m==="SEMI-AUTO"&&next.direction!=="WAIT"&&next.strength>=55&&Date.now()-lastAction.current.time>5000&&next.direction!==lastAction.current.direction){lastAction.current={direction:next.direction,time:Date.now()};setPending({direction:next.direction,strength:next.strength,reason:next.reason,price});}};return()=>w.close()},[run,m]);

async function executeTrade(d,strength=signal.strength){
if(busy)return;
const stake=Number(s),contracts=Math.min(2,Math.max(1,Number(c)));
if(!Number.isFinite(stake)||stake<=0)return;
setBusy(true);
try{
const current=await fetch("/api/trading/status").then(r=>r.json());
if(current.liveTradingEnabled){
const proposals=[];
for(let i=0;i<contracts;i++){
const r=await fetch("/api/trading/proposal",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({amount:stake,currency:"USD",contract_type:d==="UP"?"CALL":"PUT",underlying_symbol:"R_100",duration:5,duration_unit:"t"})});
const data=await r.json();if(!r.ok)throw new Error(data.error||"Proposal request failed");
proposals.push({id:data.proposal?.id,price:data.proposal?.ask_price||data.proposal?.display_value});
}
const r=await fetch("/api/trading/buy",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({direction:d,stake,contracts,signalId:`${d}-${Date.now()}`,proposals})});
const data=await r.json();if(!r.ok)throw new Error(data.error||"Buy request failed");
setTs(q=>[{d,mode:m,strength,live:true,result:"OPEN"},...q].slice(0,15));
}else{
const win=Math.random()>.48,v=win?stake*contracts*.92:-stake*contracts;
setB(z=>z+v);setTs(q=>[{d,win,v,mode:m,strength,live:false},...q].slice(0,15));
}
}catch(e){setTs(q=>[{d,mode:m,strength,live:live,error:e.message},...q].slice(0,15));}
finally{setBusy(false);}
}

return <div className="app"><header><div><h1>Deriv Up/Down Bot</h1><span className="live-dot">● R_100 LIVE TICKS</span></div><div><span className="live-dot">{status==="LIVE"?"● LIVE EXECUTION":"● PAPER EXECUTION"}</span><button onClick={()=>{setRun(false);setPending(null)}}><Square/> STOP</button></div></header>
<div className="stats"><Card a="Balance" b={status==="PAPER"?"$"+b.toFixed(2):"SERVER"}/><Card a="Price" b={p?p.toFixed(4):"—"}/><Card a="Signal" b={signal.direction+" "+(signal.strength?signal.strength+"%":"")}/><Card a="Trades" b={ts.length}/></div>
<section><div className="panel"><h2>Trading Controls</h2><div className="tabs">{["MANUAL","SEMI-AUTO","AUTO"].map(x=><button key={x} className={m===x?"on":""} onClick={()=>{setM(x);setPending(null);lastAction.current={direction:"WAIT",time:0}}}>{x}</button>)}</div>
{m==="SEMI-AUTO"&&pending&&<div className="approval"><div><strong>Strategy signal: {pending.direction}</strong><small>Confidence {pending.strength}% · Price {pending.price}</small><small>{pending.reason}</small></div><div><button className="approve" disabled={busy} onClick={()=>{executeTrade(pending.direction,pending.strength);setPending(null)}}><Check/> {busy?"EXECUTING":"APPROVE"}</button><button className="reject" disabled={busy} onClick={()=>setPending(null)}>REJECT</button></div></div>}
<div className="signal-box"><span>EMA 9 / EMA 21</span><strong>{signal.direction}</strong><small>RSI(14): {signal.rsi==null?"—":signal.rsi.toFixed(1)}</small></div>
<div className="buttons"><button className="up" disabled={busy} onClick={()=>executeTrade("UP")}><ArrowUp/> BUY UP</button><button className="down" disabled={busy} onClick={()=>executeTrade("DOWN")}><ArrowDown/> BUY DOWN</button></div>
<label>Stake<input min="0.35" step="0.01" type="number" value={s} onChange={e=>setS(+e.target.value)}/></label>
<label>Contracts<select value={c} onChange={e=>setC(+e.target.value)}><option value={1}>1</option><option value={2}>2</option></select></label>
<button className="start" disabled={busy} onClick={()=>setRun(!run)}>{run?<><Pause/> PAUSE BOT</>:<><Play/> START BOT</>}</button>
<p>EMA/RSI signals are heuristics, not guarantees. Paper mode is the default. Live execution requires authenticated server-side Deriv access.</p></div>
<div className="panel"><h2>Trade History</h2><table><tbody>{ts.map((t,i)=><tr key={i}><td>{t.d}</td><td>{t.mode}</td><td>{t.strength||0}%</td><td>{t.live?"LIVE":t.error?"ERROR":t.win?"WIN":"LOSS"}</td><td>{t.error||t.v==null?"—":(t.v>=0?"+":"")+"$"+t.v.toFixed(2)}</td></tr>)}</tbody></table></div></section></div>}
function Card(x){return <div className="card"><small>{x.a}</small><strong>{x.b}</strong></div>}
createRoot(document.getElementById("root")).render(<App/>);
