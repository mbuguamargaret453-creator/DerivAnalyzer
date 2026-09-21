import express from "express";
import { DerivTrader } from "./deriv-trader.js";
import { TradingEngine } from "./trading-engine.js";

const router=express.Router();
let trader=null;
const engine=new TradingEngine({maxDailyLoss:10,profitTarget:10,maxTrades:50,maxConsecutiveLosses:3});

router.post("/connect",async(req,res)=>{
  try{
    if(process.env.LIVE_TRADING_ENABLED!=="true") return res.status(403).json({error:"Live trading disabled"});
    if(!req.body.wsUrl) return res.status(400).json({error:"Authenticated Deriv WebSocket URL required"});
    trader=new DerivTrader(req.body.wsUrl); await trader.connect();
    res.json({ok:true});
  }catch(e){res.status(400).json({error:e.message});}
});

router.get("/status",(req,res)=>res.json({...engine.status(),connected:Boolean(trader)}));

router.post("/start",async(req,res)=>{
  try{
    const balance=Number(req.body.balance);
    if(!Number.isFinite(balance)) return res.status(400).json({error:"Valid starting balance required"});
    engine.start(balance); res.json(engine.status());
  }catch(e){res.status(400).json({error:e.message});}
});

router.post("/proposal",async(req,res)=>{
  try{
    if(!trader)return res.status(409).json({error:"Not connected"});
    const p=await trader.proposal(req.body);res.json(p);
  }catch(e){res.status(400).json({error:e.message});}
});

router.post("/authorize-order",(req,res)=>{
  const result=engine.beginOrder(req.body);
  res.status(result.ok?200:409).json(result);
});

router.post("/buy",async(req,res)=>{
  try{
    if(!trader)return res.status(409).json({error:"Not connected"});
    const count=Math.min(2,Math.max(1,Number(req.body.contracts||1)));
    const stake=Number(req.body.stake);
    const guard=engine.canTrade(stake,count);
    if(!guard.ok)return res.status(409).json(guard);
    const results=[];
    for(let i=0;i<count;i++){
      if(!req.body.proposals?.[i]) return res.status(400).json({error:"A separate proposal is required for each contract"});
      const bought=await trader.buy(req.body.proposals[i].id,Number(req.body.proposals[i].price));
      results.push(bought);
      if(bought.buy?.contract_id)engine.addContract(bought.buy.contract_id,{direction:req.body.direction,stake});
    }
    res.json({count,results,status:engine.status()});
  }catch(e){res.status(400).json({error:e.message});}
});

router.post("/contract",async(req,res)=>{
  try{
    if(!trader)return res.status(409).json({error:"Not connected"});
    res.json(await trader.watchContract(req.body.contractId));
  }catch(e){res.status(400).json({error:e.message});}
});

router.post("/settle",(req,res)=>res.json(engine.settle(req.body.contractId,req.body.profit)));
router.post("/stop",(req,res)=>res.json(engine.stop()));

export default router;