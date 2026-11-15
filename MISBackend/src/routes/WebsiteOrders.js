const express=require('express');
const {requireAuth}=require('../middleware/auth');
const {requireAdminOrOwner}=require('../middleware/authorize');
const WebsiteOrder=require('../repositories/websiteOrder');
const Orders=require('../repositories/order');
const {verifySignedBody,normalizePayload}=require('../utils/websiteOrderWebhook');

const router=express.Router();
// No session auth on the webhook itself: the HMAC over the ORIGINAL raw
// request body is the authentication. Fail closed until matching secrets exist.
router.post('/webhook',async(req,res)=>{
  const secret=process.env.MIS_WEB_ORDER_SECRET;
  if(!secret)return res.status(503).json({message:'Website order integration is disabled.'});
  if(!Buffer.isBuffer(req.rawBody)||req.rawBody.length>35000||
    !verifySignedBody(req.rawBody,req.get('x-sk-signature'),secret))
    return res.status(401).json({message:'Invalid website order signature.'});
  let event;
  try {event=normalizePayload(req.body);}
  catch(e){return res.status(400).json({message:e.message});}
  try{
    const old=await WebsiteOrder.findOne({externalOrderRef:event.externalOrderRef});
    if(old && new Date(old.sourceEventAt).getTime()>event.sourceEventAt.getTime())
      return res.status(200).json({accepted:true,stale:true});
    if(old){
      // Keep local triage and linked-order fields. Never mutate real MIS
      // accounting or order stages directly from an external webhook.
      await WebsiteOrder.updateOne({_id:old._id,sourceEventAt:{$lte:event.sourceEventAt}},
        {$set:event});
    }else{
      await WebsiteOrder.updateOne({externalOrderRef:event.externalOrderRef},
        {$setOnInsert:{...event,reviewStatus:'new'}},{upsert:true});
    }
    return res.status(200).json({accepted:true});
  }catch(e){
    // Another concurrent delivery may have inserted the same unique ref.
    if(e.code===11000)return res.status(200).json({accepted:true,duplicate:true});
    return res.status(503).json({message:'Website order could not be recorded; retry.'});
  }
});

router.use(requireAuth,requireAdminOrOwner);
router.get('/',async(req,res)=>{
  const page=Math.min(1000,Math.max(1,Number(req.query.page)||1)),
    limit=Math.min(100,Math.max(1,Number(req.query.limit)||30));
  const status=String(req.query.status||'');
  const filter=['new','reviewed','linked','dismissed'].includes(status)?
    {reviewStatus:status}:{};
  try{
    const [result,total]=await Promise.all([
      WebsiteOrder.find(filter).sort({createdAt:-1})
        .skip((page-1)*limit).limit(limit).lean(),
      WebsiteOrder.countDocuments(filter)
    ]);
    res.set('Cache-Control','no-store');
    res.json({result,total,page,limit,integrationConfigured:Boolean(process.env.MIS_WEB_ORDER_SECRET)});
  }catch{res.status(503).json({message:'Website order inbox unavailable.'});}
});

router.patch('/:id',async(req,res)=>{
  if(!/^[a-f\d]{24}$/i.test(String(req.params.id)))
    return res.status(400).json({message:'Invalid website order id.'});
  const action=String(req.body?.action||'');
  try{
    const order=await WebsiteOrder.findById(req.params.id);
    if(!order)return res.sendStatus(404);
    if(action==='review'){
      order.reviewStatus='reviewed';order.reviewedBy=String(req.user?.userName||'').slice(0,80);
      order.reviewedAt=new Date();
    }else if(action==='dismiss'){
      order.reviewStatus='dismissed';order.reviewedBy=String(req.user?.userName||'').slice(0,80);
      order.reviewedAt=new Date();
    }else if(action==='link'){
      const number=Number(req.body?.orderNumber);
      if(!Number.isSafeInteger(number)||number<1)
        return res.status(422).json({message:'Enter a valid MIS order number.'});
      const actual=await Orders.findOne({Order_Number:number}).select('Order_Number').lean();
      if(!actual)return res.status(422).json({message:'That MIS order number does not exist.'});
      order.linkedOrderNumber=number;order.reviewStatus='linked';
      order.reviewedBy=String(req.user?.userName||'').slice(0,80);
      order.reviewedAt=new Date();
    }else if(action==='note'){
      order.internalNote=String(req.body?.note||'').trim().slice(0,600);
    }else return res.status(400).json({message:'Unknown action.'});
    await order.save();
    res.json({result:order});
  }catch{res.status(503).json({message:'Could not update website order.'});}
});
module.exports=router;
