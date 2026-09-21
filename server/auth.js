import crypto from "node:crypto";
import { DerivTrader } from "./deriv-trader.js";
import { tradingEngine } from "./trading-engine.js";

const sessions=new Map();
const oauthStates=new Map();
const API_BASE="https://api.derivws.com";
const AUTH_BASE="https://auth.deriv.com";
const COOKIE="deriv_session";
const STATE_TTL=10*60*1000;

function required(name){
  const value=process.env[name];
  if(!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}
function randomUrlSafe(bytes=32){return crypto.randomBytes(bytes).toString("base64url");}
function sha256(value){return crypto.createHash("sha256").update(value).digest("base64url");}
export function getRedirectUri(){return required("DERIV_REDIRECT_URI");}

export function createLoginUrl(){
  const clientId=required("DERIV_CLIENT_ID");
  const redirectUri=getRedirectUri();
  const state=randomUrlSafe(32);
  const verifier=randomUrlSafe(64);
  oauthStates.set(state,{verifier,createdAt:Date.now()});
  const url=new URL(`${AUTH_BASE}/oauth2/auth`);
  url.searchParams.set("response_type","code");
  url.searchParams.set("client_id",clientId);
  url.searchParams.set("redirect_uri",redirectUri);
  url.searchParams.set("scope",process.env.DERIV_OAUTH_SCOPE||"trade");
  url.searchParams.set("state",state);
  url.searchParams.set("code_challenge",sha256(verifier));
  url.searchParams.set("code_challenge_method","S256");
  return url.toString();
}

export function createSessionCookie(sessionId){
  const secure=process.env.NODE_ENV==="production"?" Secure":"";
  return `${COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secure}`;
}
export function clearSessionCookie(){return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;}

function parseCookie(header=""){
  const result={};
  for(const part of header.split(";")){
    const i=part.indexOf("=");
    if(i>0) result[part.slice(0,i).trim()]=part.slice(i+1).trim();
  }
  return result;
}

function detachContractMonitoring(session){
  if(session?.trader&&session.contractListener){
    session.trader.off("proposal_open_contract",session.contractListener);
    session.contractListener=null;
  }
}

function attachContractMonitoring(session,trader){
  detachContractMonitoring(session);
  const listener=(message)=>{
    const contract=message?.proposal_open_contract;
    if(!contract?.contract_id)return;
    const id=String(contract.contract_id);
    const status=String(contract.status||"").toLowerCase();
    if(contract.is_sold===1||contract.is_sold===true||status==="sold"){
      const active=tradingEngine.status().activeContracts.some(item=>String(item.id)===id);
      if(active){
        tradingEngine.settle(id,Number(contract.profit)||0);
        trader.unwatchContract(id);
      }
    }
  };
  session.contractListener=listener;
  trader.on("proposal_open_contract",listener);
}

export function getSession(req){
  const id=parseCookie(req.headers.cookie||"")[COOKIE];
  const session=id?sessions.get(id):null;
  if(session?.expiresAt&&Date.now()>=session.expiresAt){
    if(session.trader)detachContractMonitoring(session);
    if(session.trader)session.trader.close();
    sessions.delete(id);
    return null;
  }
  return session||null;
}

async function exchangeCode(code,verifier){
  const body=new URLSearchParams({
    grant_type:"authorization_code",
    client_id:required("DERIV_CLIENT_ID"),
    code,
    code_verifier:verifier,
    redirect_uri:getRedirectUri()
  });
  const response=await fetch(`${AUTH_BASE}/oauth2/token`,{
    method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body
  });
  const data=await response.json();
  if(!response.ok||!data.access_token)throw new Error(data.error_description||"Deriv token exchange failed");
  return data;
}

async function apiRequest(session,path,options={}){
  if(!session?.accessToken)throw new Error("Not authenticated");
  if(session.expiresAt&&Date.now()>=session.expiresAt)throw new Error("Deriv session expired; please connect again");
  const headers={"Authorization":`Bearer ${session.accessToken}`,...(options.headers||{})};
  const response=await fetch(`${API_BASE}${path}`,{...options,headers});
  const data=await response.json();
  if(!response.ok)throw new Error(data?.errors?.[0]?.message||data?.error?.message||"Deriv API request failed");
  return data;
}

export async function handleCallback(req){
  const {code,state,error,error_description}=req.query;
  if(error)throw new Error(error_description||error);
  if(!code||!state)throw new Error("Missing OAuth callback parameters");
  const pending=oauthStates.get(state);
  oauthStates.delete(state);
  if(!pending||Date.now()-pending.createdAt>STATE_TTL)throw new Error("Invalid or expired OAuth state");
  const token=await exchangeCode(code,pending.verifier);
  const sessionId=randomUrlSafe(32);
  const expiresIn=Math.max(60,Number(token.expires_in||3600));
  sessions.set(sessionId,{
    accessToken:token.access_token,
    expiresAt:Date.now()+expiresIn*1000,
    accountId:null,
    accountType:null,
    trader:null,
    contractListener:null
  });
  return sessionId;
}

export async function listAccounts(session){
  return apiRequest(session,"/trading/v1/options/accounts");
}

export async function connectAccount(session,accountId){
  if(!session)throw new Error("Not authenticated");
  if(!accountId)throw new Error("account_id is required");
  const accounts=await listAccounts(session);
  const items=Array.isArray(accounts.data)?accounts.data:accounts.accounts||[];
  const account=items.find(x=>String(x.account_id||x.id)===String(accountId));
  if(!account)throw new Error("Account is not available to this session");
  const otp=await apiRequest(session,`/trading/v1/options/accounts/${encodeURIComponent(accountId)}/otp`,{method:"POST"});
  const wsUrl=otp?.data?.url;
  if(!wsUrl)throw new Error("Deriv did not return an authenticated WebSocket URL");
  if(session.trader)session.trader.close();
  const trader=new DerivTrader(wsUrl);
  await trader.connect();
  session.accountId=String(accountId);
  session.trader=trader;
  attachContractMonitoring(session,trader);
  session.accountType=account.account_type||account.type||"unknown";
  return {accountId:session.accountId,accountType:session.accountType};
}

export function destroySession(req){
  const cookies=parseCookie(req.headers.cookie||"");
  const id=cookies[COOKIE];
  const session=id?sessions.get(id):null;
  if(session?.trader)detachContractMonitoring(session);
  if(session?.trader)session.trader.close();
  if(id)sessions.delete(id);
}
