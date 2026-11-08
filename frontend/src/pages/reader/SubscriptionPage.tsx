import {useEffect,useState} from 'react';
import {Link,useLocation,useNavigate} from 'react-router-dom';
import {ArrowRight,CheckCircle2} from 'lucide-react';
import {useApp} from '../../context/AppContext';
import {useData} from '../../hooks/useData';
import {ErrorBox,Loading} from '../../components/Common';
import {api,money} from '../../api';
import type {SubscriptionDetails,PaymentRecord,DigitalEntitlementRecord,DigitalPurchaseRecord} from '../../types';
export function SubscriptionPage(){
 const {config,toast}=useApp();const location=useLocation(),navigate=useNavigate();
 const digital=useData<{active:boolean;entitlement:DigitalEntitlementRecord|null;purchases:DigitalPurchaseRecord[]}>('/me/digital-edition');
 const legacy=useData<{subscription:SubscriptionDetails|null;payments:PaymentRecord[]}>('/me/subscription');
 const [verificationError,setVerificationError]=useState('');
 const reference=new URLSearchParams(location.search).get('reference');
 useEffect(()=>{if(!reference)return;let live=true;api('/subscriptions/verify',{reference}).then(()=>{if(live){toast('Your earlier payment has been verified.');navigate('/subscription',{replace:true});window.location.reload();}}).catch(e=>{if(live)setVerificationError(e.message);});return()=>{live=false;};},[reference]);
 const active=digital.data?.active||legacy.data?.subscription?.active;
 return <>
 <div className="page-heading"><div><span className="eyebrow">Your Balanced Life account</span><h1>My online access</h1><p>One payment. Your full 2027 devotional edition.</p></div></div>
 <ErrorBox message={digital.error||legacy.error||verificationError}/>
 {!digital.data||!legacy.data?<Loading/>:<>
 <section className="panel membership-panel"><span className="pill">{active?'Access active':'Free account'}</span><h2>{digital.data.active?'2027 online reading access':legacy.data.subscription?.active?'Existing account access':'Begin your 2027 journey'}</h2>
 {digital.data.active?<><p><CheckCircle2 size={18}/> Your account can read all published 2027 devotionals, including readings added later. There is no monthly renewal.</p><Link className="button" to="/library">Open your library <ArrowRight size={17}/></Link></>:<>{legacy.data.subscription?.active&&<p>Your existing access remains valid until {new Date(legacy.data.subscription.expiresAt).toLocaleDateString('en-GB')}. Previous purchases are preserved.</p>}<p>Get the full 2027 edition for {money(config.settings.digitalEditionPriceKobo)}, paid once. The printed book and future editions are separate purchases.</p><Link className="button" to="/digital-edition">Get online access <ArrowRight size={17}/></Link></>}
 </section>
 <h2>Your payments</h2>
 {digital.data.purchases.length?<div className="table-wrap"><table><thead><tr><th>Date</th><th>Purchase</th><th>Amount</th><th>Status</th></tr></thead><tbody>{digital.data.purchases.map(p=><tr key={p.id}><td>{new Date(p.createdAt).toLocaleDateString('en-GB')}</td><td>2027 online reading</td><td>{money(p.amountKobo)}</td><td>{p.status}</td></tr>)}</tbody></table></div>:<p className="muted">Your online reading payments will appear here.</p>}
 {legacy.data.payments.length>0&&<details className="panel"><summary>Earlier payment history</summary><div className="table-wrap"><table><thead><tr><th>Plan</th><th>Amount</th><th>Status</th></tr></thead><tbody>{legacy.data.payments.map(p=><tr key={p.id}><td>{p.planName}</td><td>{money(p.amountKobo)}</td><td>{p.status}</td></tr>)}</tbody></table></div></details>}
 <Link className="text-link" to="/install">Add Balanced Life to your home screen <ArrowRight size={16}/></Link>
 </>}
 </>;
}
