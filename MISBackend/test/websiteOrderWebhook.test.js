const {createHmac}=require('node:crypto');
const {
  makeSignature,verifySignedBody,normalizePayload
}=require('../src/utils/websiteOrderWebhook');

describe('SK Digital signed website order delivery',()=>{
  const secret='test-only-shared-secret';
  const event={
    event:'order.enquiry.created',source:'sanjusk.in',
    occurredAt:'2026-11-15T13:30:00.000Z',
    order:{
      reference:'abcdef0123456789abcdef01',title:'Custom Wedding Cards',
      quantity:100,amountPaise:0,status:'pending_quote',
      workflowStatus:'new_order',artworkStatus:'not_submitted',
      customer:{name:'Example Customer',phone:'9876543210',address:'Gondia, Maharashtra'},
      customization:{size:'A5',material:'Cardstock',artworkNotes:'Gold'}
    }
  };
  test('accepts an authentic raw JSON body',()=>{
    const raw=Buffer.from(JSON.stringify(event));
    const signature=makeSignature(raw,secret);
    expect(verifySignedBody(raw,signature,secret)).toBe(true);
    expect(signature).toBe(createHmac('sha256',secret).update(raw).digest('hex'));
  });
  test('rejects empty secret, tampered bytes and invalid signatures',()=>{
    const raw=Buffer.from(JSON.stringify(event));
    const signature=makeSignature(raw,secret);
    expect(verifySignedBody(raw,signature,'')).toBe(false);
    expect(verifySignedBody(Buffer.from(JSON.stringify({...event,event:'order.updated'})),
      signature,secret)).toBe(false);
    expect(verifySignedBody(raw,'0'.repeat(64),secret)).toBe(false);
    expect(verifySignedBody(raw,signature.slice(0,63),secret)).toBe(false);
    expect(verifySignedBody(JSON.stringify(event),signature,secret)).toBe(false);
  });
  test('normalizes valid order content and rejects invalid amounts and unknown events',()=>{
    const clean=normalizePayload(event);
    expect(clean.externalOrderRef).toBe(event.order.reference);
    expect(clean.customer.phone).toBe('9876543210');
    expect(clean.amountPaise).toBe(0);
    expect(clean.reviewStatus).toBeUndefined();
    expect(()=>normalizePayload({...event,event:'ledger.post'}))
      .toThrow(/Unsupported website order event/);
    expect(()=>normalizePayload({...event,order:{...event.order,amountPaise:-1}}))
      .toThrow(/Invalid order quantity or amount/);
    expect(()=>normalizePayload({...event,order:{...event.order,customer:{phone:'0123'}}}))
      .toThrow(/Invalid customer mobile/);
  });
});
