import WebSocket from "ws";

export class DerivTrader {
  constructor(wsUrl){
    this.wsUrl=wsUrl; this.ws=null; this.req=0; this.pending=new Map(); this.subscriptions=new Map();
  }

  connect(){
    return new Promise((resolve,reject)=>{
      this.ws=new WebSocket(this.wsUrl);
      const fail=(err)=>reject(err instanceof Error?err:new Error(String(err)));
      this.ws.once("open",resolve);
      this.ws.once("error",fail);
      this.ws.on("message",raw=>{
        try{this.#onMessage(JSON.parse(raw.toString()));}catch{}
      });
      this.ws.on("close",()=>{for(const [,p] of this.pending)p.reject(new Error("Deriv WebSocket closed"));this.pending.clear();});
    });
  }

  #onMessage(data){
    const id=data.req_id;
    if(id&&this.pending.has(id)){
      const p=this.pending.get(id);
      if(data.msg_type==="tick"||data.msg_type==="proposal_open_contract"||data.msg_type==="balance") {
        p.resolve(data);
        return;
      }
      this.pending.delete(id);
      if(data.error)p.reject(new Error(data.error.message||"Deriv API error"));else p.resolve(data);
    }
  }

  send(payload,{timeout=15000}={}){
    if(!this.ws||this.ws.readyState!==WebSocket.OPEN)return Promise.reject(new Error("Deriv WebSocket not connected"));
    const req_id=++this.req;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(req_id);reject(new Error("Deriv request timeout"));},timeout);
      this.pending.set(req_id,{resolve:(v)=>{clearTimeout(timer);resolve(v);},reject:(e)=>{clearTimeout(timer);reject(e);}});
      this.ws.send(JSON.stringify({...payload,req_id}));
    });
  }

  balance(){return this.send({balance:1,subscribe:1});}
  ticks(symbol){return this.send({ticks:symbol,subscribe:1});}
  proposal(args){return this.send({proposal:1,amount:Number(args.amount),basis:"stake",currency:args.currency,contract_type:args.contract_type,underlying_symbol:args.underlying_symbol,duration:Number(args.duration),duration_unit:args.duration_unit,subscribe:1});}
  buy(proposalId,price){return this.send({buy:String(proposalId),price:Number(price)});}
  watchContract(contractId){return this.send({proposal_open_contract:1,contract_id:String(contractId),subscribe:1});}
}