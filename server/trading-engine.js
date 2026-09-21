export class TradingEngine {
  constructor({maxDailyLoss=10,profitTarget=10,maxTrades=50,maxConsecutiveLosses=3}={}){
    this.limits={maxDailyLoss,profitTarget,maxTrades,maxConsecutiveLosses};
    this.dayStartBalance=null;this.pnl=0;this.trades=0;this.consecutiveLosses=0;
    this.stopped=false;this.active=new Map();this.reservations=new Map();
  }
  start(balance){
    const value=Number(balance);
    if(!Number.isFinite(value)||value<=0)throw new Error("Valid starting balance required");
    this.dayStartBalance=value;this.pnl=0;this.trades=0;this.consecutiveLosses=0;this.stopped=false;
    this.active.clear();this.reservations.clear();
  }
  canTrade(stake,contracts=1){
    const total=Number(stake)*Number(contracts);
    if(this.stopped)return{ok:false,reason:"Trading stopped"};
    if(!Number.isFinite(total)||total<=0)return{ok:false,reason:"Invalid stake"};
    if(!Number.isInteger(Number(contracts))||Number(contracts)<1||Number(contracts)>2)return{ok:false,reason:"Contracts must be 1 or 2"};
    if(this.trades+this.reservedCount()>=this.limits.maxTrades)return{ok:false,reason:"Maximum trades reached"};
    if(this.pnl<=-Math.abs(this.limits.maxDailyLoss))return{ok:false,reason:"Maximum daily loss reached"};
    if(this.pnl>=Math.abs(this.limits.profitTarget))return{ok:false,reason:"Profit target reached"};
    if(this.consecutiveLosses>=this.limits.maxConsecutiveLosses)return{ok:false,reason:"Maximum consecutive losses reached"};
    return{ok:true};
  }
  reservedCount(){return[...this.reservations.values()].reduce((sum,r)=>sum+r.contracts,0);}
  reserveOrder({direction,stake,contracts=1,signalId}){
    const guard=this.canTrade(stake,contracts);
    if(!guard.ok)return guard;
    if(!["UP","DOWN"].includes(direction))return{ok:false,reason:"Direction must be UP or DOWN"};
    const key=`${signalId||Date.now()}:${direction}:${stake}:${contracts}`;
    if(this.reservations.has(key))return{ok:false,reason:"Duplicate order blocked"};
    this.reservations.set(key,{key,direction,stake:Number(stake),contracts:Number(contracts),createdAt:Date.now()});
    return{ok:true,key};
  }
  beginOrder(args){return this.reserveOrder(args);}
  finalizeOrder(key,boughtContracts=0){
    const reservation=this.reservations.get(key);
    if(!reservation)return{ok:false,reason:"Order reservation not found"};
    this.reservations.delete(key);
    this.trades+=Math.max(0,Number(boughtContracts)||0);
    return{ok:true};
  }
  releaseOrder(key){this.reservations.delete(key);return{ok:true};}
  addContract(id,meta={}){this.active.set(String(id),{...meta,id:String(id),startedAt:Date.now()});}
  settle(id,profit){
    this.active.delete(String(id));
    const p=Number(profit)||0;this.pnl+=p;
    if(p<0)this.consecutiveLosses++;else if(p>0)this.consecutiveLosses=0;
    if(this.pnl<=-Math.abs(this.limits.maxDailyLoss)||this.pnl>=Math.abs(this.limits.profitTarget)||this.consecutiveLosses>=this.limits.maxConsecutiveLosses)this.stopped=true;
    return this.status();
  }
  stop(){this.stopped=true;return this.status();}
  status(){return{pnl:this.pnl,trades:this.trades,stopped:this.stopped,consecutiveLosses:this.consecutiveLosses,activeContracts:[...this.active.values()],reservedContracts:this.reservedCount()};}
}
export const tradingEngine=new TradingEngine({
  maxDailyLoss:Number(process.env.MAX_DAILY_LOSS)||10,
  profitTarget:Number(process.env.PROFIT_TARGET)||10,
  maxTrades:Number(process.env.MAX_TRADES)||50,
  maxConsecutiveLosses:Number(process.env.MAX_CONSECUTIVE_LOSSES)||3
});
