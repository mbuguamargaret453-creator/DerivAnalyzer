import express from "express";
import { DerivTrader } from "./deriv-trader.js";
import { tradingEngine } from "./trading-engine.js";
import { getSession } from "./auth.js";

const router=express.Router();
let trader=null;

router.get("/status",(req,res)=>{const session=getSession(req);res.json({...tradingEngine.status(),connected:Boolean(session?.trader),authenticated:Boolean(session),accountId:session?.accountId||null,liveTradingEnabled:process.env.LIVE_TRADING_ENABLED==="true"});});

router.post("/start",(req,res)=>{
  try{tradingEngine.start(req.body.balance);res.json(tradingEngine.status());}
  catch(e){res.status(400).json({error:e.message});}
});

router.post("/proposal",async(req,res)=>{
  try{
    if(process.env.LIVE_TRADING_ENABLED!=="true") return res.status(403).json({error:"Live trading disabled"});
    const session=getSession(req);\n    if(!session?.trader)return res.status(409).json({error:"Authenticated Deriv account not connected"});\n    trader=session.trader;
    res.json(await trader.proposal(req.body));
  }catch(e){res.status(400).json({error:e.message});}
});

router.post("/authorize-order",(req,res)=>{
  const result=tradingEngine.reserveOrder(req.body);
  res.status(result.ok?200:409).json(result);
});

router.post("/buy",async(req,res)=>{
  let reservation=null;
  try{
    if(process.env.LIVE_TRADING_ENABLED!=="true") return res.status(403).json({error:"Live trading disabled"});
    const session=getSession(req);\n    if(!session?.trader)return res.status(409).json({error:"Authenticated Deriv account not connected"});\n    trader=session.trader;
    const count=Math.min(2,Math.max(1,Number(req.body.contracts||1)));
    const stake=Number(req.body.stake);
    const reservationResult=tradingEngine.reserveOrder(req.body);
    if(!reservationResult.ok)return res.status(409).json(reservationResult);
    reservation=reservationResult.key;
    if(!Array.isArray(req.body.proposals)||req.body.proposals.length<count){
      tradingEngine.releaseOrder(reservation);
      return res.status(400).json({error:"A separate proposal is required for each contract"});
    }
    const results=[];
    for(let i=0;i<count;i++){
      const proposal=req.body.proposals[i];
      if(!proposal?.id||!Number.isFinite(Number(proposal.price))) throw new Error("Invalid proposal");
      const bought=await trader.buy(proposal.id,proposal.price);
      results.push(bought);
      if(bought.buy?.contract_id) tradingEngine.addContract(bought.buy.contract_id,{direction:req.body.direction,stake});
    }
    tradingEngine.finalizeOrder(reservation,results.length);
    res.json({count,results,status:tradingEngine.status()});
  }catch(e){
    if(reservation) tradingEngine.releaseOrder(reservation);
    res.status(400).json({error:e.message,status:tradingEngine.status()});
  }
});

router.post("/contract",async(req,res)=>{
  try{
    const session=getSession(req);\n    if(!session?.trader)return res.status(409).json({error:"Authenticated Deriv account not connected"});\n    trader=session.trader;
    res.json(await trader.watchContract(req.body.contractId));
  }catch(e){res.status(400).json({error:e.message});}
});

router.post("/settle",(req,res)=>res.json(tradingEngine.settle(req.body.contractId,req.body.profit)));
router.post("/stop",(req,res)=>res.json(tradingEngine.stop()));

export default router;
