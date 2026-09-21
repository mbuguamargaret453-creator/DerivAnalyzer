import React,{useEffect,useRef,useState}from"react";
import{createRoot}from"react-dom/client";
import{ArrowUp,ArrowDown,Play,Pause,Square,Check}from"lucide-react";
import{getSignal}from"./strategy";
import"./styles.css";
function App(){
const[m,setM]=useState("MANUAL"),[run,setRun]=useState(false),[p,setP]=useState(null),[s,setS]=useState(1),[c,setC]=useState(1),[b,setB]=useState(100),[ts,setTs]=useState([]),[signal,setSignal]=useState({direction:"WAIT",strength:0}),[pending,setPending]=useState(null);
const prices=useRef([]),lastAction=useRef({direction:"WAIT",time:0});
useEffect(()=>{let w=new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089");w.onopen=()=>w.send(JSON.stringify({ticks:"R_100",subscribe:1}));w.onmessage=e=>{const d=JSON.parse(e.data);if(!d.tick)return;const price=Number(d.tick.quote);setP(price);prices.current=[...prices.current.slice(-199),price];const next=getSignal(prices.current);setSignal(next);
if(run&&m==="AUTO"&&next.direction!=="WAIT"&&next.strength>=55&&Date.now()-lastAction.current.time>5000&&next.direction!==lastAction.current.direction){lastAction.current={direction:next.direction,time:Date.now()};paperTrade(next.direction,next.strength);}
if(run&&m==="SEMI-AUTO"&&next.direction!=="WAIT"&&Date.now()-lastAction.current.time>5000&&next.direction!==lastAction.current.direction){lastAction.current={direction:next.direction,time:Date.now()};setPending({direction:next.direction,strength:next.strength,reason:next.reason,price});}};return()=>w.close()},[run,m]);
function paperTrade(d,strength=signal.strength){const stake=Number(s)||0,contracts=Number(c)||1,win=Math.random()>.48,v=win?stake*contracts*.92:-stake*contracts;setB(z=>z+v);setTs(q=>[{d,win,v,mode:m,strength},...q].slice(0,15));}
return <div className="app"><header><div><h1>Deriv Up/Down Bot</h1><span className="live-dot">● R_100 LIVE TICKS</span></div><button onClick={()=>{setRun(false);setPending(null)}}><Square/> STOP</button></header>
<div className="stats"><Card a="Balance" b={"$"+b.toFixed(2)}/><Card a="Price" b={p?p.toFixed(4):"—"}/><Card a="Signal" b={signal.direction+" "+(signal.strength?signal.strength+"%":"")}/><Card a="Trades" b={ts.length}/></div>
<section><div className="panel"><h2>Trading Controls</h2><div className="tabs">{["MANUAL","SEMI-AUTO","AUTO"].map(x=><button key={x} className={m===x?"on":""} onClick={()=>{setM(x);setPending(null);lastAction.current={direction:"WAIT",time:0}}}>{x}</button>)}</div>
{m==="SEMI-AUTO"&&pending&&<div className="approval"><div><strong>Strategy signal: {pending.direction}</strong><small>Confidence {pending.strength}% · Price {pending.price}</small><small>{pending.reason}</small></div><div><button className="approve" onClick={()=>{paperTrade(pending.direction,pending.strength);setPending(null)}}><Check/> APPROVE</button><button className="reject" onClick={()=>setPending(null)}>REJECT</button></div></div>}
<div className="signal-box"><span>EMA 9 / EMA 21</span><strong>{signal.direction}</strong><small>RSI(14): {signal.rsi==null?"—":signal.rsi.toFixed(1)}</small></div>
<div className="buttons"><button className="up" onClick={()=>paperTrade("UP")}><ArrowUp/> BUY UP</button><button className="down" onClick={()=>paperTrade("DOWN")}><ArrowDown/> BUY DOWN</button></div>
<label>Stake<input min="0.35" step="0.01" type="number" value={s} onChange={e=>setS(+e.target.value)}/></label>
<label>Contracts<select value={c} onChange={e=>setC(+e.target.value)}><option value={1}>1</option><option value={2}>2</option></select></label>
<button className="start" onClick={()=>setRun(!run)}>{run?<><Pause/> PAUSE BOT</>:<><Play/> START BOT</>}</button>
<p>EMA/RSI signals are heuristics, not guarantees. Paper execution only; real-money execution remains disabled.</p></div>
<div className="panel"><h2>Trade History</h2><table><tbody>{ts.map((t,i)=><tr key={i}><td>{t.d}</td><td>{t.mode}</td><td>{t.win?"WIN":"LOSS"}</td><td>{t.v>=0?"+":""}{"$"}{t.v.toFixed(2)}</td></tr>)}</tbody></table></div></section></div>}
function Card(x){return <div className="card"><small>{x.a}</small><strong>{x.b}</strong></div>}
createRoot(document.getElementById("root")).render(<App/>);