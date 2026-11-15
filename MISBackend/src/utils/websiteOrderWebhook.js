const {createHmac,timingSafeEqual}=require('node:crypto');
function makeSignature(raw,secret){
  return createHmac('sha256',secret).update(raw).digest('hex');
}
function verifySignedBody(raw,signature,secret){
  if(!Buffer.isBuffer(raw)||!secret||!/^[a-f0-9]{64}$/i.test(String(signature||'')))
    return false;
  const a=Buffer.from(makeSignature(raw,secret),'hex');
  const b=Buffer.from(signature,'hex');
  return a.length===b.length&&timingSafeEqual(a,b);
}
const allowedEvents=new Set(['order.enquiry.created','order.payment.started',
  'order.payment.verified','order.updated','order.artwork.decision',
  'order.refund.processed','order.resync']);
const clean=(value,max)=>String(value||'').trim().slice(0,max);
function normalizePayload(payload){
  if(!payload||payload.source!=='sanjusk.in'||!allowedEvents.has(payload.event))
    throw new Error('Unsupported website order event.');
  const ref=clean(payload.order?.reference,45);
  const time=new Date(payload.occurredAt);
  if(!/^[a-f0-9]{24}$/i.test(ref)||!Number.isFinite(time.valueOf()))
    throw new Error('Invalid website order reference.');
  const order=payload.order||{};
  const quantity=Number(order.quantity),amountPaise=Number(order.amountPaise||0);
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>100000||
    !Number.isSafeInteger(amountPaise)||amountPaise<0||amountPaise>100000000)
    throw new Error('Invalid order quantity or amount.');
  const customer=order.customer||{},custom=order.customization||{};
  const phone=clean(customer.phone,15);
  if(!/^[6-9][0-9]{9}$/.test(phone))throw new Error('Invalid customer mobile.');
  return {
    externalOrderRef:ref,source:'sanjusk.in',title:clean(order.title,200),
    quantity,amountPaise,customer:{
      name:clean(customer.name,80),phone,address:clean(customer.address,500),
      instructions:clean(customer.instructions,500)
    },customization:{
      size:clean(custom.size,80),material:clean(custom.material,80),
      deadline:clean(custom.deadline,50),artworkNotes:clean(custom.artworkNotes,500)
    },workflowStatus:clean(order.workflowStatus,60),
    paymentStatus:clean(order.status,60),artworkStatus:clean(order.artworkStatus,60),
    lastEvent:payload.event,sourceEventAt:time
  };
}
module.exports={makeSignature,verifySignedBody,normalizePayload};
