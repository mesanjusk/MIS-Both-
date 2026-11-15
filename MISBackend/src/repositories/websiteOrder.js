const mongoose=require('mongoose');
const WebsiteOrderSchema=new mongoose.Schema({
  externalOrderRef:{type:String,required:true,unique:true,index:true},
  source:{type:String,default:'sanjusk.in',enum:['sanjusk.in']},
  title:{type:String,required:true},quantity:{type:Number,required:true},
  customer:{
    name:{type:String,default:''},phone:{type:String,default:''},
    address:{type:String,default:''},instructions:{type:String,default:''}
  },
  customization:{
    size:{type:String,default:''},material:{type:String,default:''},
    deadline:{type:String,default:''},artworkNotes:{type:String,default:''}
  },
  workflowStatus:{type:String,default:'new_order'},
  paymentStatus:{type:String,default:'pending_quote'},
  artworkStatus:{type:String,default:'not_submitted'},
  amountPaise:{type:Number,default:0,min:0},
  lastEvent:{type:String,default:'order.enquiry.created'},
  sourceEventAt:{type:Date,default:Date.now},
  reviewStatus:{type:String,enum:['new','reviewed','linked','dismissed'],default:'new',index:true},
  reviewedBy:{type:String,default:''},reviewedAt:Date,
  linkedOrderNumber:{type:Number,default:null},
  internalNote:{type:String,default:''}
},{timestamps:true});
WebsiteOrderSchema.index({reviewStatus:1,createdAt:-1});
module.exports=mongoose.models.WebsiteOrder||
  mongoose.model('WebsiteOrder',WebsiteOrderSchema);
