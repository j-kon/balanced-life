import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildApp} from '../src/app.js';
test('only the printed book and one-time 2027 access are offered; retired checkout cannot charge',async()=>{
 const app=await buildApp({databasePath:':memory:',environment:'test'});
 try {
 const config=(await app.inject('/api/v1/config')).json();
 assert.equal(config.settings.hardcoverPriceKobo,500000);
 assert.equal(config.settings.digitalEditionPriceKobo,350000);
 assert.deepEqual((await app.inject('/api/v1/plans')).json(),[]);
 const signup=await app.inject({method:'POST',url:'/api/v1/auth/register',headers:{'x-requested-with':'BalancedLife'},payload:{name:'Price Test',email:'prices@example.test',password:'Price-Test-2027!'}});
 assert.equal(signup.statusCode,200);
 const cookie=String(signup.headers['set-cookie']).split(';')[0];
 const checkout=await app.inject({method:'POST',url:'/api/v1/subscriptions/checkout',headers:{cookie,'x-requested-with':'BalancedLife'},payload:{planId:1,renewalMode:'automatic'}});
 assert.equal(checkout.statusCode,410);
 }finally{await app.close();}
});
