// One lane for all durable writes. A failed operation stays at the head until
// explicitly retried or discarded; later operations cannot overtake it.
export class SaveQueue {
  pending: {run:()=>Promise<void>;resolve:()=>void;reject:(e:unknown)=>void}[]=[];
  running=false;
  failed:unknown=null;
  private waiters:{resolve:()=>void;reject:(e:unknown)=>void}[]=[];
  changed:()=>void;
  constructor(changed:()=>void){this.changed=changed;}
  get busy(){return this.running || this.pending.length>0;}
  whenIdle():Promise<void>{
    if(this.failed)return Promise.reject(this.failed);
    if(!this.busy)return Promise.resolve();
    return new Promise((resolve,reject)=>this.waiters.push({resolve,reject}));
  }
  add(run:()=>Promise<void>):Promise<void>{
    return new Promise((resolve,reject)=>{this.pending.push({run,resolve,reject});this.changed();void this.drain();});
  }
  async drain(){
    if(this.running||this.failed)return;
    this.running=true;this.changed();
    while(this.pending.length){
      const item=this.pending[0];
      try{await item.run();this.pending.shift();item.resolve();}
      catch(e){this.failed=e;item.reject(e);break;}
    }
    this.running=false;this.changed();
    if(this.failed||!this.busy)for(const waiter of this.waiters.splice(0)){
      if(this.failed)waiter.reject(this.failed);else waiter.resolve();
    }
  }
  retry(){this.failed=null;void this.drain();}
  discardFailed(){if(!this.running&&this.failed){this.pending.shift();this.failed=null;void this.drain();}}
}
