import WebSocket from "ws";
import { EventEmitter } from "node:events";

export class DerivTrader extends EventEmitter {
  constructor(wsUrl){
    super();
    this.wsUrl=wsUrl; this.ws=null; this.req=0; this.pending=new Map();
  }

  connect(){
    return new Promise((resolve,reject)=>{
      this.ws=new WebSocket(this.wsUrl);
      let opened=false;
      const fail=(err)=>{
        const error=err instanceof Error?err:new Error(String(err));
        if(!opened) reject(error);
        this.emit("error",error);
      };
      this.ws.once("open",()=>{opened=true;resolve();});
      this.ws.once("error",fail);
      this.ws.on("message",raw=>{try{this.#onMessage(JSON.parse(raw.toString()));}catch(error){this.emit("error",error);}});
      this.ws.on("close",()=>{
        for(const [,p] of this.pending){clearTimeout(p.timer);p.reject(new Error("Deriv WebSocket closed"));}
        this.pending.clear(); this.emit("close");
      });
    });
  }

  #onMessage(data){
    this.emit(data.msg_type||"message",data);
    const id=data.req_id;
    if(!id||!this.pending.has(id)) return;
    const p=this.pending.get(id);
    if(data.subscription) return;
    this.pending.delete(id);
    clearTimeout(p.timer);
    if(data.error) p.reject(new Error(data.error.message||"Deriv API error"));
    else p.resolve(data);
  }

  send(payload,{timeout=15000}={}){
    if(!this.ws||this.ws.readyState!==WebSocket.OPEN) return Promise.reject(new Error("Deriv WebSocket not connected"));
    const req_id=++this.req;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(req_id);reject(new Error("Deriv request timeout"));},timeout);
      this.pending.set(req_id,{resolve,reject,timer});
      this.ws.send(JSON.stringify({...payload,req_id}));
    });
  }

  balance(){return this.send({balance:1,subscribe:1});}
  ticks(symbol){return this.send({ticks:symbol,subscribe:1});}
  proposal(args){
    return this.send({
      proposal:1,amount:Number(args.amount),basis:"stake",currency:String(args.currency||"USD"),
      contract_type:String(args.contract_type),underlying_symbol:String(args.underlying_symbol),
      duration:Number(args.duration),duration_unit:String(args.duration_unit),subscribe:1
    });
  }
  buy(proposalId,price){return this.send({buy:String(proposalId),price:Number(price)});}
  watchContract(contractId){return this.send({proposal_open_contract:1,contract_id:String(contractId),subscribe:1});}
  close(){if(this.ws)this.ws.close();}
}
