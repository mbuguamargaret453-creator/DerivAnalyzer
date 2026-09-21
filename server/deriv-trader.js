import WebSocket from "ws";
export class DerivTrader{
  constructor(wsUrl){this.wsUrl=wsUrl;this.ws=null;this.req=0;this.pending=new Map();}
  connect(){return new Promise((resolve,reject)=>{this.ws=new WebSocket(this.wsUrl);this.ws.once("open",resolve);this.ws.once("error",reject);this.ws.on("message",raw=>this.#onMessage(JSON.parse(raw.toString())));});}
  #onMessage(data){const id=data.req_id;if(id&&this.pending.has(id)){const p=this.pending.get(id);this.pending.delete(id);if(data.error)p.reject(new Error(data.error.message||"Deriv API error"));else p.resolve(data);}}
  send(payload){const req_id=++this.req;return new Promise((resolve,reject)=>{this.pending.set(req_id,{resolve,reject});this.ws.send(JSON.stringify({...payload,req_id}));setTimeout(()=>{if(this.pending.has(req_id)){this.pending.delete(req_id);reject(new Error("Deriv request timeout"));}},15000);});}
  balance(){return this.send({balance:1,subscribe:1});}
  ticks(symbol){return this.send({ticks:symbol,subscribe:1});}
  proposal({amount,currency,contract_type,underlying_symbol,duration,duration_unit}){return this.send({proposal:1,amount,basis:"stake",currency,contract_type,underlying_symbol,duration,duration_unit,subscribe:1});}
  buy(proposalId,price){return this.send({buy:proposalId,price});}
  watchContract(contractId){return this.send({proposal_open_contract:1,contract_id:contractId,subscribe:1});}
}