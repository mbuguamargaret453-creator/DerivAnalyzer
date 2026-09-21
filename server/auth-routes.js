import express from "express";
import {createLoginUrl,handleCallback,getSession,createSessionCookie,clearSessionCookie,listAccounts,connectAccount,destroySession} from "./auth.js";

const router=express.Router();

router.get("/login",(req,res)=>{
  try{res.redirect(createLoginUrl());}
  catch(e){res.status(500).json({error:e.message});}
});

router.get("/callback",async(req,res)=>{
  try{
    const sessionId=await handleCallback(req);
    res.setHeader("Set-Cookie",createSessionCookie(sessionId));
    res.redirect(process.env.AUTH_SUCCESS_REDIRECT||"/");
  }catch(e){res.status(400).send(`Authentication failed: ${e.message}`);}
});

router.get("/status",(req,res)=>{
  const session=getSession(req);
  res.json({
    authenticated:Boolean(session),
    connected:Boolean(session?.trader),
    accountId:session?.accountId||null,
    accountType:session?.accountType||null,
    expiresAt:session?.expiresAt||null,
    liveTradingEnabled:process.env.LIVE_TRADING_ENABLED==="true"
  });
});

router.get("/accounts",async(req,res)=>{
  try{
    const session=getSession(req);
    if(!session)return res.status(401).json({error:"Not authenticated"});
    res.json(await listAccounts(session));
  }catch(e){res.status(400).json({error:e.message});}
});

router.post("/connect",async(req,res)=>{
  try{
    const session=getSession(req);
    if(!session)return res.status(401).json({error:"Not authenticated"});
    res.json({ok:true,...await connectAccount(session,req.body.account_id)});
  }catch(e){res.status(400).json({error:e.message});}
});

router.post("/logout",(req,res)=>{
  destroySession(req);
  res.setHeader("Set-Cookie",clearSessionCookie());
  res.json({ok:true});
});

export default router;
