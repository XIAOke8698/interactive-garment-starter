/** One continuous rail: preserve garment scale and reserve actual silhouette clearance. */
export function mobileRailPositions({width,items,focus,offset=0,gap=10}) {
  const positions=new Array(items.length),pitch=width*.27;
  positions[focus]=width/2+offset;
  for(const direction of [-1,1])for(let i=focus+direction;i>=0&&i<items.length;i+=direction){
    const previous=i-direction;
    positions[i]=positions[previous]+direction*Math.max(pitch,items[previous].half+items[i].half+gap);
  }
  return positions;
}

/** Settle the nearest suspension point; a short deliberate flick advances one item. */
export function mobileSwipeDestination({positions,width,focus,delta,velocity}) {
  let nearest=focus;
  for(let i=0;i<positions.length;i++)if(Math.abs(positions[i]-width/2)<Math.abs(positions[nearest]-width/2))nearest=i;
  if(nearest===focus&&Math.abs(delta)>22&&Math.abs(velocity)>.35)nearest=focus+(delta<0?1:-1);
  return Math.max(0,Math.min(positions.length-1,nearest));
}
