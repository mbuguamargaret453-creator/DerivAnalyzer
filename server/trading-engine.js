export class TradingEngine {
  constructor({maxDailyLoss=10,profitTarget=10,maxTrades=50,maxConsecutiveLosses=3}={}){
    this.limits={maxDailyLoss,profitTarget,maxTrades,maxConsecutiveLosses};
    this.dayStartBalance=null;this.pnl=0;this.trades=0;this.consecutiveLosses=0;this.stopped=false;
    this.active=new Map();this.orderKeys=new Set();
  }
  start(balance){this.dayStartBalance=Number(balance);this.pnl=0;this.trades=0;this.consecutiveLosses=0;this.stopped=false;this.active.clear();this.orderKeys.clear();}
  canTrade(stake,contracts=1){
    if(this.stopped)return{ok:false,reason:"Trading stopped"};
    const total=Number(stake)*Number(contracts);
    if(!Number.isFinite(total)||total<=0)return{ok:false,reason:"Invalid stake"};
    if(this.trades>=this.limits.maxTrades)return{ok:false,reason:"Maximum trades reached"};
    if(this.pnl<=-Math.abs(this.limits.maxDailyLoss))return{ok:false,reason:"Maximum daily loss reached"};
    if(this.pnl>=Math.abs(this.limits.profitTarget))return{ok:false,reason:"Profit target reached"};
    if(this.consecutiveLosses>=this.limits.maxConsecutiveLosses)return{ok:false,reason:"Maximum consecutive losses reached"};
    return{ok:true};
  }
  beginOrder({direction,stake,contracts,signalId}){
    const guard=this.canTrade(stake,contracts);if(!guard.ok)return guard;
    const key=`${signalId||Date.now()}:${direction}:${stake}:${contracts}`;
    if(this.orderKeys.has(key))return{ok:false,reason:"Duplicate order blocked"};
    this.orderKeys.add(key);this.trades+=Number(contracts);
    return{ok:true,key};
  }
  addContract(id,meta={}){this.active.set(String(id),{...meta,id:String(id),startedAt:Date.now()});}
  settle(id,profit){
    this.active.delete(String(id));const p=Number(profit)||0;this.pnl+=p;
    if(p<0)this.consecutiveLosses++;else if(p>0)this.consecutiveLosses=0;
    if(this.pnl<=-Math.abs(this.limits.maxDailyLoss)||this.pnl>=Math.abs(this.limits.profitTarget)||this.consecutiveLosses>=this.limits.maxConsecutiveLosses)this.stopped=true;
    return{pnl:this.pnl,stopped:this.stopped,consecutiveLosses:this.consecutiveLosses};
  }
  stop(){this.stopped=true;return{stopped:true};}
  status(){return{pnl:this.pnl,trades:this.trades,stopped:this.stopped,consecutiveLosses:this.consecutiveLosses,activeContracts:[...this.active.values()]};}
}