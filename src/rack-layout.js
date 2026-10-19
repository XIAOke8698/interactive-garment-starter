/** Coordinates within the rack's inner span; the selected suspension point stays put. */
export function rackPositions({count,width,garmentWidth,active=-1,profileHalfRatio=.08,frontHalfRatio=.43,minimumSpread=0}) {
  const pitch=width/count;
  const rest=Array.from({length:count},(_,i)=>(i+.5)*pitch);
  if(active<0||active>=count||count===1)return rest;
  const profileHalf=garmentWidth*profileHalfRatio;
  const gap=garmentWidth*(frontHalfRatio+profileHalfRatio)+14;
  const center=rest[active];
  const positions=[...rest];
  for(const direction of [-1,1]){
    const n=direction<0?active:count-active-1;if(!n)continue;
    const room=direction<0?center-profileHalf:width-profileHalf-center;
    const separation=Math.min(Math.max(gap,pitch+minimumSpread),room);
    const neighborPitch=n>1?Math.min(pitch,(room-separation)/(n-1)):pitch;
    for(let j=1;j<=n;j++)positions[active+direction*j]=center+direction*(separation+(j-1)*neighborPitch);
  }
  return positions;
}

/** Critically damped motion: preserve velocity when the target changes. */
export function slideStep(position,velocity,target,deltaMs,omega=15) {
  const dt=Math.min(deltaMs,50)/1000;
  const offset=position-target,term=velocity+omega*offset,decay=Math.exp(-omega*dt);
  const next=target+(offset+term*dt)*decay;
  const nextVelocity=(velocity-omega*term*dt)*decay;
  if(Math.abs(next-target)<.03&&Math.abs(nextVelocity)<.2)return {position:target,velocity:0};
  return {position:next,velocity:nextVelocity};
}

/** Different garment widths share one rail without shifting the selected pivot. */
export function collectionPositions({width,items,active=-1,gap=9,spread=18,margin=0,inset=0}) {
  const pitch=(width-2*inset)/items.length;
  const rest=items.map((_,i)=>inset+(i+.5)*pitch);
  if(active<0||items.length===1)return rest;
  const positions=[...rest],center=rest[active];
  for(const direction of [-1,1]){
    const indices=[];for(let i=active+direction;i>=0&&i<items.length;i+=direction)indices.push(i);
    if(!indices.length)continue;
    const distances=[];let previous=items[active].frontHalf;
    for(let j=0;j<indices.length;j++){
      const i=indices[j],half=items[i].profileHalf;
      const minimum=(j?distances[j-1]:0)+previous+half+gap;
      distances.push(Math.max(minimum,Math.abs(rest[i]-center)+spread*Math.exp(-j/3)));
      previous=half;
    }
    const last=indices.at(-1),room=(direction<0?center:width-center)+margin-items[last].profileHalf;
    distances[distances.length-1]=Math.min(distances.at(-1),room);
    for(let j=indices.length-2;j>=0;j--)distances[j]=Math.min(distances[j],distances[j+1]-items[indices[j]].profileHalf-items[indices[j+1]].profileHalf-gap);
    for(let j=0;j<indices.length;j++)positions[indices[j]]=center+direction*distances[j];
  }
  return positions;
}
