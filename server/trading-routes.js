import express from "express";
import {tradingEngine} from "./trading-engine.js";
import {getSession} from "./auth.js";

const router=express.Router();

router.get("/status",(req,res)=>{
  const session=getSession(req);
  res.json({...tradingEngine.status(),connected:Boolean(session?.trader),authenticated:Boolean(session),accountId:session?.accountId||null,accountType:session?.accountType||null,liveTradingEnabled:process.env.LIVE_TRADING_ENABLED==="true"});
});

router.post("/start",(req,res)=>{
  try{tradingEngine.start(req.body.balance);res.json(tradingEngine.status());}
  catch(e){res.status(400).json({error:e.message});}
});

router.post("/proposal",async(req,res)=>{
  try{
    if(process.env.LIVE_TRADING_ENABLED!=="true")return res.status(403).json({error:"Live trading disabled"});
    const session=getSession(req);
    if(!session?.trader)return res.status(409).json({error:"Authenticated Deriv account not connected"});
    res.json(await session.trader.proposal(req.body));
  }catch(e){res.status(400).json({error:e.message});}
});

router.post("/authorize-order",(req,res)=>{
  const result=tradingEngine.reserveOrder(req.body);
  res.status(result.ok?200:409).json(result);
});

router.post("/buy",async(req,res)=>{
  let reservation=null,boughtCount=0;
  try{
    if(process.env.LIVE_TRADING_ENABLED!=="true")return res.status(403).json({error:"Live trading disabled"});
    const session=getSession(req);
    if(!session?.trader)return res.status(409).json({error:"Authenticated Deriv account not connected"});
    const count=Number(req.body.contracts);
    const stake=Number(req.body.stake);
    if(!Number.isInteger(count)||count<1||count>2)return res.status(400).json({error:"Contracts must be 1 or 2"});
    if(!Number.isFinite(stake)||stake<=0)return res.status(400).json({error:"Invalid stake"});
    const reservationResult=tradingEngine.reserveOrder({...req.body,contracts:count,stake});
    if(!reservationResult.ok)return res.status(409).json(reservationResult);
    reservation=reservationResult.key;
    if(!Array.isArray(req.body.proposals)||req.body.proposals.length<count){
      tradingEngine.releaseOrder(reservation);
      reservation=null;
      return res.status(400).json({error:"A separate proposal is required for each contract"});
    }
    const results=[];
    for(let i=0;i<count;i++){
      const proposal=req.body.proposals[i];
      if(!proposal?.id||!Number.isFinite(Number(proposal.price)))throw new Error("Invalid proposal");
      const bought=await session.trader.buy(proposal.id,proposal.price);
      results.push(bought);boughtCount++;
      if(bought.buy?.contract_id){
        const contractId=String(bought.buy.contract_id);
        tradingEngine.addContract(contractId,{direction:req.body.direction,stake});
        await session.trader.watchContract(contractId);
      }
    }
    tradingEngine.finalizeOrder(reservation,boughtCount);reservation=null;
    res.json({count:boughtCount,results,status:tradingEngine.status()});
  }catch(e){
    if(reservation)tradingEngine.finalizeOrder(reservation,boughtCount);
    res.status(400).json({error:e.message,status:tradingEngine.status()});
  }
});

router.post("/contract",async(req,res)=>{
  try{
    const session=getSession(req);
    if(!session?.trader)return res.status(409).json({error:"Authenticated Deriv account not connected"});
    res.json(await session.trader.watchContract(req.body.contractId));
  }catch(e){res.status(400).json({error:e.message});}
});

router.post("/settle",(req,res)=>res.status(410).json({error:"Manual settlement disabled; contracts are settled from Deriv contract updates"}));
router.post("/stop",(req,res)=>res.json(tradingEngine.stop()));

export default router;
