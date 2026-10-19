/** Eased, reversible playhead. Retargeting preserves position and velocity. */
export class GarmentController {
  constructor({frameCount=2,durationMs=950,returnDurationMs=durationMs,endpointWindow=0,onFrame=()=>{}}={}) {
    if(frameCount<2||durationMs<=0||returnDurationMs<=0)throw new RangeError('Invalid timeline');
    if(!Number.isFinite(endpointWindow)||endpointWindow<0||endpointWindow>.5)throw new RangeError('Invalid endpoint window');
    this.frameCount=frameCount;this.durationMs=durationMs;this.returnDurationMs=returnDurationMs;this.onFrame=onFrame;
    this.endpointWindow=endpointWindow;
    this.position=0;this.target=0;this.frame=0;this.velocity=0;this.segment=null;
  }
  setTarget(target,{immediate=false}={}) {
    if(target!==0&&target!==1)throw new RangeError('Only profile and front belong to hover');
    if(immediate){this.target=target;this.position=target;this.velocity=0;this.segment=null;this.render();return;}
    if(target===this.target)return;
    this.target=target;
    if(this.velocity*(target-this.position)<0){
      // A short braking phase avoids a hard velocity flip during a partial turn.
      const room=this.velocity>0?1-this.position:this.position;
      const duration=Math.min(32,2*room/Math.abs(this.velocity));
      this.segment={kind:'brake',start:this.position,velocity:this.velocity,duration,elapsed:0};
    }else this.tween();
  }
  tween(){
    const distance=Math.abs(this.target-this.position);
    if(distance<1e-9){this.position=this.target;this.velocity=0;this.segment=null;return;}
    const full=this.target===1?this.durationMs:this.returnDurationMs;
    let duration=Math.max(80,full*Math.sqrt(distance));
    // Bound the Hermite tangent so a same-direction retarget stays monotonic.
    if(this.velocity)duration=Math.min(duration,3*distance/Math.abs(this.velocity));
    this.segment={kind:'turn',start:this.position,velocity:this.velocity,duration,elapsed:0};
  }
  step(deltaMs) {
    if(!Number.isFinite(deltaMs)||deltaMs<0)throw new RangeError('Invalid delta');
    let remaining=Math.min(deltaMs,50);
    while(this.segment&&remaining>0){
      const s=this.segment,dt=Math.min(remaining,s.duration-s.elapsed);
      s.elapsed+=dt;remaining-=dt;
      const t=s.duration?s.elapsed/s.duration:1;
      if(s.kind==='brake'){
        this.position=s.start+s.velocity*s.duration*(t-t*t/2);
        this.velocity=s.velocity*(1-t);
      }else{
        const delta=this.target-s.start,tangent=s.velocity*s.duration;
        this.position=s.start+delta*(3*t*t-2*t*t*t)+tangent*(t*t*t-2*t*t+t);
        this.velocity=(delta*(6*t-6*t*t)+tangent*(3*t*t-4*t+1))/s.duration;
        // Local C2 corrections soften acceleration at rest, with no extra dwell
        // or change to the middle of the turn. Keep the incoming tangent intact.
        const edge=this.endpointWindow;
        if(edge){
          const taper=u=>u<edge?u*u*(1-u/edge)**3:0;
          const slope=u=>u<edge?u*(1-u/edge)**2*(2-5*u/edge):0;
          const start=-3*delta+2*tangent,end=3*delta-tangent;
          this.position+=start*taper(t)+end*taper(1-t);
          this.velocity+=(start*slope(t)-end*slope(1-t))/s.duration;
        }
      }
      this.position=Math.max(0,Math.min(1,this.position));
      if(s.elapsed>=s.duration){
        this.velocity=0;
        if(s.kind==='brake')this.tween();else{this.position=this.target;this.segment=null;}
      }
    }
    this.render();return Boolean(this.segment);
  }
  render() {
    const next=Math.round(this.position*(this.frameCount-1));
    if(next!==this.frame){this.frame=next;this.onFrame(next);}
  }
}
